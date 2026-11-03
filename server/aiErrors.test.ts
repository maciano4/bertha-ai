import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAIError, isRetryable, retryDelayMs, redactSecrets } from "./aiErrors";

const apiError = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  Object.assign(new Error(`${status} ${body.message}`), { status, error: body, code: body.code, type: body.type, headers: new Headers(headers) });

test("429 with an empty credit balance is out of credits, not a rate limit", () => {
  // What OpenAI actually returned on Replit.
  assert.equal(classifyAIError(apiError(429, { type: "insufficient_quota", code: "credit_balance_exhausted", message: "You have no credits remaining..." })), "out_of_credits");
  assert.equal(classifyAIError(apiError(429, { type: "insufficient_quota", code: "insufficient_quota", message: "You exceeded your current quota, please check your plan and billing details." })), "out_of_credits");
  assert.equal(classifyAIError(apiError(429, { type: "requests", code: "credit_balance_exhausted", message: "x" })), "out_of_credits");
  assert.equal(classifyAIError(apiError(429, { type: "", code: null, message: "You exceeded your current quota" })), "out_of_credits");
  // Body only (no SDK fields copied up).
  assert.equal(classifyAIError({ status: 429, error: { type: "insufficient_quota", code: "credit_balance_exhausted" } }), "out_of_credits");
  assert.equal(isRetryable("out_of_credits"), false);
});

test("real rate limits are retryable", () => {
  const kind = classifyAIError(apiError(429, { type: "requests", code: "rate_limit_exceeded", message: "Rate limit reached for gpt-4o-mini" }));
  assert.equal(kind, "rate_limited");
  assert.equal(isRetryable(kind), true);
  assert.equal(classifyAIError(apiError(429, { message: "Too many requests" })), "rate_limited");
});

test("other errors", () => {
  assert.equal(classifyAIError(apiError(401, { type: "invalid_request_error", code: "invalid_api_key", message: "Incorrect API key provided: sk-proj-****abcd" })), "invalid_api_key");
  assert.equal(classifyAIError(apiError(404, { code: "model_not_found", message: "The model does not exist" })), "model_not_found");
  assert.equal(classifyAIError(apiError(400, { code: "context_length_exceeded", message: "maximum context length is 128000 tokens" })), "context_too_long");
  assert.equal(classifyAIError(apiError(503, { message: "overloaded" })), "server_error");
  assert.equal(classifyAIError(Object.assign(new Error("Connection error."), { name: "APIConnectionError" })), "connection");
  assert.equal(classifyAIError(Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" })), "timeout");
  assert.equal(isRetryable("invalid_api_key"), false);
  assert.equal(isRetryable("server_error"), true);
});

test("retry delays honour retry-after and are capped", () => {
  assert.equal(retryDelayMs(apiError(429, {}, { "retry-after-ms": "1500" }), 0), 1500);
  assert.equal(retryDelayMs(apiError(429, {}, { "retry-after": "2" }), 0), 2000);
  assert.equal(retryDelayMs(apiError(429, {}, { "retry-after": "120" }), 0), 8000);
  const first = retryDelayMs(apiError(429, {}), 0), third = retryDelayMs(apiError(429, {}), 2);
  assert.ok(first >= 600 && first < 900, String(first));
  assert.ok(third >= 2400 && third < 2700, String(third));
});

test("keys never reach the logs", () => {
  const text = redactSecrets("Incorrect API key provided: sk-proj-abc123DEF456****wxyz. Bearer sk-or-v1-123456 gsk_ABCDEFGH12345");
  assert.ok(!/sk-proj-abc|sk-or-v1|gsk_ABC/.test(text), text);
});
