// Classifies errors from OpenAI (or an OpenAI-compatible provider) without any SDK state,
// so it can be unit-tested. OpenAI uses HTTP 429 for BOTH rate limits and an empty
// credit balance; the body's type/code tells them apart.

export type AIErrorKind =
  | "out_of_credits" | "rate_limited" | "invalid_api_key" | "model_not_found"
  | "context_too_long" | "timeout" | "connection" | "server_error" | "other";

export interface ErrorDetails { status?: number; type: string; code: string; message: string }

export function errorDetails(error: unknown): ErrorDetails {
  const e = error as any;
  const body = e?.error && typeof e.error === "object" ? e.error : {};
  const status = typeof e?.status === "number" ? e.status : undefined;
  return {
    status,
    type: String(e?.type || body.type || ""),
    code: String(e?.code || body.code || ""),
    message: String(body.message || e?.message || ""),
  };
}

const CREDITS = /insufficient_quota|credit_balance_exhausted|billing_hard_limit|billing_not_active|exceeded your current quota|no credits remaining|credit balance is too low|insufficient (?:credits|balance)|payment required/i;

export function classifyAIError(error: unknown): AIErrorKind {
  const d = errorDetails(error);
  const all = `${d.type} ${d.code} ${d.message}`;
  const name = (error as any)?.name || "";
  if (CREDITS.test(all) || d.status === 402) return "out_of_credits";
  if (d.status === 401 || /invalid_api_key|incorrect api key|invalid authentication/i.test(all)) return "invalid_api_key";
  if (d.status === 429 || /rate_limit/i.test(all)) return "rate_limited";
  if (d.status === 404 || /model_not_found|does not exist or you do not have access/i.test(all)) return "model_not_found";
  if (d.status === 400 && /context_length|maximum context/i.test(all)) return "context_too_long";
  if (name === "APIConnectionTimeoutError" || /timed? ?out/i.test(d.message)) return "timeout";
  if (name === "APIConnectionError" || /ECONNREFUSED|ENOTFOUND|ECONNRESET|fetch failed|socket hang up/i.test(d.message)) return "connection";
  if (d.status !== undefined && d.status >= 500) return "server_error";
  return "other";
}

// Rate limits, 5xx and dropped connections are worth retrying; empty credits, bad keys are not.
export const isRetryable = (kind: AIErrorKind) => kind === "rate_limited" || kind === "server_error" || kind === "connection";

// Wait before attempt `attempt + 1` (attempt starts at 0). Honours retry-after-ms / retry-after.
export function retryDelayMs(error: unknown, attempt: number, maxMs = 8000): number {
  const headers = (error as any)?.headers;
  const get = (name: string): string | null => {
    if (!headers) return null;
    if (typeof headers.get === "function") return headers.get(name);
    return headers[name] ?? null;
  };
  const ms = Number(get("retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) return Math.min(ms, maxMs);
  const after = get("retry-after");
  if (after) {
    const seconds = Number(after);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxMs);
    const date = Date.parse(after);
    if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), maxMs);
  }
  const base = 600 * 2 ** attempt; // 0.6s, 1.2s, 2.4s
  return Math.min(base + Math.floor(Math.random() * 250), maxMs);
}

// Never let a key reach the logs, even a partly masked one from the provider's message.
export const redactSecrets = (text: string) => text
  .replace(/\b(?:sk|rk|gsk|pk)[-_][A-Za-z0-9_*\-]{6,}/g, "[redacted]")
  .replace(/\bsk-or-[A-Za-z0-9_*\-]+/g, "[redacted]")
  .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]");

export function logAIError(where: string, provider: string, error: unknown, extra = "") {
  const d = errorDetails(error);
  console.error(redactSecrets(`[ai] ${where} via ${provider} failed: status=${d.status ?? "none"} type=${d.type || "-"} code=${d.code || "-"} message="${d.message.slice(0, 240)}"${extra ? ` ${extra}` : ""}`));
}
