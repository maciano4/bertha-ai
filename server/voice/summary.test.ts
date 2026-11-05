import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCallSummarySms, summarizeTranscriptLocally } from "./summary";
import { buildInstructions, AI_UNAVAILABLE_SAY } from "./persona";
import { mediaStreamUrl } from "./urls";
import { shouldValidateTwilioSignature } from "./signature";

test("SMS summary names the caller, the length, and the message", () => {
  const body = formatCallSummarySms({
    fromNumber: "+15551212000",
    forwardedFrom: null,
    durationSeconds: 65,
    summary: "Jane from the school wants a call back about pickup.",
    aiUnavailable: false,
    answeringEnabled: true,
  });
  assert.equal(body, "Missed call from +15551212000 (1m 5s). Jane from the school wants a call back about pickup.");
});

test("SMS says a forwarded missed call and that AI was unavailable", () => {
  const body = formatCallSummarySms({
    fromNumber: "+15551212000",
    forwardedFrom: "+15557650000",
    durationSeconds: 8,
    summary: null,
    aiUnavailable: true,
    answeringEnabled: true,
  });
  assert.match(body, /forwarded from \+15557650000/);
  assert.match(body, /A call was missed, but AI was unavailable/);
  assert.equal(body.includes(AI_UNAVAILABLE_SAY), false);
});

test("SMS when answering is off does not pretend a message was taken", () => {
  const body = formatCallSummarySms({
    fromNumber: "+15551212000",
    durationSeconds: 3,
    summary: "ignored",
    aiUnavailable: false,
    answeringEnabled: false,
  });
  assert.match(body, /Answering is turned off/);
  assert.equal(body.includes("ignored"), false);
});

test("SMS summaries stay within one short text", () => {
  const body = formatCallSummarySms({
    fromNumber: "+15551212000",
    durationSeconds: 12,
    summary: "word ".repeat(200),
    aiUnavailable: false,
    answeringEnabled: true,
  });
  assert.ok(body.length <= 480, String(body.length));
  assert.ok(body.endsWith("..."));
});

test("a local summary uses what the caller said", () => {
  const summary = summarizeTranscriptLocally("Bertha: Who's calling?\nCaller: It's Dana from the clinic.\nCaller: Please call about Thursday.");
  assert.match(summary, /Dana from the clinic/);
  assert.match(summary, /Thursday/);
  assert.equal(summarizeTranscriptLocally(""), "Bertha answered, but no message was captured.");
});

test("instructions refuse invented commitments and only use a configured availability note", () => {
  const blank = buildInstructions(null);
  assert.match(blank, /missed the call/i);
  assert.match(blank, /Never invent an appointment/);
  assert.match(blank, /Never promise/);
  const noted = buildInstructions("Free after 4pm.");
  assert.match(noted, /Free after 4pm/);
  assert.equal(noted.includes("Never invent an appointment"), false);
});

test("the media stream uses wss on a public https host", () => {
  assert.equal(mediaStreamUrl("https://bertha.example.com", "tok").startsWith("wss://bertha.example.com/api/voice/media-stream?token="), true);
  assert.equal(mediaStreamUrl("http://127.0.0.1:5000").startsWith("ws://127.0.0.1:5000/api/voice/media-stream"), true);
});

test("signature checks default on in production and can be turned off", () => {
  const previousNode = process.env.NODE_ENV;
  const previousFlag = process.env.TWILIO_VALIDATE_SIGNATURE;
  try {
    delete process.env.TWILIO_VALIDATE_SIGNATURE;
    process.env.NODE_ENV = "production";
    assert.equal(shouldValidateTwilioSignature(), true);
    process.env.TWILIO_VALIDATE_SIGNATURE = "false";
    assert.equal(shouldValidateTwilioSignature(), false);
    process.env.NODE_ENV = "development";
    delete process.env.TWILIO_VALIDATE_SIGNATURE;
    assert.equal(shouldValidateTwilioSignature(), false);
    process.env.TWILIO_VALIDATE_SIGNATURE = "true";
    assert.equal(shouldValidateTwilioSignature(), true);
  } finally {
    if (previousNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNode;
    if (previousFlag === undefined) delete process.env.TWILIO_VALIDATE_SIGNATURE;
    else process.env.TWILIO_VALIDATE_SIGNATURE = previousFlag;
  }
});
