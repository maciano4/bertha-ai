import { test } from "node:test";
import assert from "node:assert/strict";
import { CallBridge } from "./bridge";
import { buildInstructions } from "./persona";

function bridge(hooks: { onUnavailable?: (info: { spoke: boolean; kind: string }) => void; onHangup?: () => void; onTranscript?: (text: string) => void } = {}) {
  const openai: any[] = [];
  const twilio: any[] = [];
  const session = new CallBridge({
    streamSid: "MZ1",
    instructions: buildInstructions(null),
    greeting: "Hi, this is Bertha.",
    sendToOpenAI: payload => openai.push(payload),
    sendToTwilio: payload => twilio.push(payload),
    onTranscript: hooks.onTranscript || (() => {}),
    onUnavailable: hooks.onUnavailable || (() => {}),
    onHangup: hooks.onHangup || (() => {}),
  });
  return { session, openai, twilio };
}

test("a realtime session asks for μ-law audio and forwards both directions", () => {
  const { session, openai, twilio } = bridge();
  session.onOpenAI({ type: "session.created" });
  assert.equal(openai[0].type, "session.update");
  assert.equal(openai[0].session.audio.input.format.type, "audio/pcmu");
  assert.equal(openai[0].session.audio.output.format.type, "audio/pcmu");
  assert.match(openai[0].session.instructions, /Never invent an appointment/);
  session.onOpenAI({ type: "session.updated" });
  assert.equal(openai[1].type, "response.create");
  assert.match(openai[1].response.instructions, /Hi, this is Bertha/);

  session.onTwilio({ event: "media", media: { track: "inbound", payload: "caller-audio" } });
  assert.deepEqual(openai.at(-1), { type: "input_audio_buffer.append", audio: "caller-audio" });

  session.onOpenAI({ type: "response.output_audio.delta", delta: "bertha-audio" });
  assert.equal(twilio.at(-1).event, "media");
  assert.equal(twilio.at(-1).streamSid, "MZ1");
  assert.equal(twilio.at(-1).media.payload, "bertha-audio");

  session.onOpenAI({ type: "input_audio_buffer.speech_started" });
  assert.deepEqual(twilio.at(-1), { event: "clear", streamSid: "MZ1" });
  session.close();
});

test("an empty credit balance ends the call before Bertha speaks", () => {
  let info: { spoke: boolean; kind: string } | null = null;
  const { session } = bridge({ onUnavailable: value => { info = value; } });
  session.onOpenAI({ type: "error", error: { type: "insufficient_quota", code: "credit_balance_exhausted", message: "You have no credits remaining" } });
  assert.equal(info?.kind, "out_of_credits");
  assert.equal(info?.spoke, false);
  session.close();
});

test("transcript lines and a goodbye hang up after the audio finishes", () => {
  let transcript = "";
  let hungUp = false;
  const { session, twilio } = bridge({
    onTranscript: text => { transcript = text; },
    onHangup: () => { hungUp = true; },
  });
  session.onOpenAI({ type: "conversation.item.input_audio_transcription.completed", transcript: "It's Dana from the clinic." });
  session.onOpenAI({ type: "response.output_audio.delta", delta: "aaa" });
  session.onOpenAI({ type: "response.output_audio_transcript.done", transcript: "I'll let Chris know." });
  assert.match(transcript, /Caller: It's Dana from the clinic\./);
  assert.match(transcript, /Bertha: I'll let Chris know\./);
  session.onOpenAI({
    type: "response.done",
    response: { output: [{ type: "message" }, { type: "function_call", name: "end_call", call_id: "call_1" }] },
  });
  session.onOpenAI({ type: "response.output_audio.done" });
  assert.equal(twilio.at(-1).mark.name, "bertha-hangup");
  session.onTwilio({ event: "mark", mark: { name: "bertha-hangup" } });
  assert.equal(hungUp, true);
});
