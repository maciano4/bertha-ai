import { classifyAIError } from "../aiErrors";

export type RealtimeProtocol = "ga" | "beta";

const END_CALL_TOOL = {
  type: "function",
  name: "end_call",
  description: "End the phone call after you have already said goodbye out loud.",
  parameters: {
    type: "object",
    properties: {
      reason: { type: "string", description: "message_taken, no_message, or caller_done" },
    },
    required: ["reason"],
  },
};

export function sessionUpdate(protocol: RealtimeProtocol, instructions: string) {
  if (protocol === "beta") {
    return {
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        instructions,
        voice: (process.env.OPENAI_REALTIME_VOICE || "alloy").trim() || "alloy",
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 650,
          create_response: true, interrupt_response: true,
        },
        tools: [END_CALL_TOOL],
        tool_choice: "auto",
      },
    };
  }
  return {
    type: "session.update",
    session: {
      type: "realtime",
      instructions,
      output_modalities: ["audio"],
      tool_choice: "auto",
      tools: [END_CALL_TOOL],
      audio: {
        input: {
          format: { type: "audio/pcmu" },
          transcription: { model: (process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe").trim() },
          turn_detection: {
            type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 650,
            create_response: true, interrupt_response: true,
          },
        },
        output: {
          format: { type: "audio/pcmu" },
          voice: (process.env.OPENAI_REALTIME_VOICE || "marin").trim() || "marin",
        },
      },
    },
  };
}

interface BridgeOptions {
  streamSid: string;
  instructions: string;
  greeting: string;
  sendToTwilio: (payload: unknown) => void;
  sendToOpenAI: (payload: unknown) => void;
  onTranscript: (transcript: string) => void;
  onUnavailable: (info: { spoke: boolean; kind: string }) => void;
  onHangup: () => void;
}

/**
 * Bridges one Twilio media stream and one OpenAI Realtime session.
 * Audio stays G.711 μ-law on both sides, so nothing is resampled.
 */
export class CallBridge {
  spoke = false;
  private ending = false;
  private hangupArmed = false;
  private greeted = false;
  private goodbyeSent = false;
  private audioPlaying = false;
  private closed = false;
  private triedBeta = false;
  private protocol: RealtimeProtocol = "ga";
  private lines: { role: "Caller" | "Bertha"; text: string }[] = [];
  private timers: NodeJS.Timeout[] = [];

  constructor(private opts: BridgeOptions) {}

  close() {
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  /** Nudge a long call to a close, then hang up. Timers are unref'd so tests can exit. */
  startMaxDuration() {
    this.later(150_000, () => {
      if (this.ending || this.closed) return;
      this.sendToOpenAI({
        type: "response.create",
        response: this.response("Wrap up in one short sentence, say goodbye, and call the end_call tool."),
      });
    });
    this.later(185_000, () => this.finish());
  }

  onTwilio(msg: any) {
    if (this.closed || !msg) return;
    if (msg.event === "media" && msg.media?.payload && msg.media.track !== "outbound") {
      if (this.hangupArmed) return;
      this.sendToOpenAI({ type: "input_audio_buffer.append", audio: msg.media.payload });
    }
    if (msg.event === "mark" && msg.mark?.name === "bertha-hangup") this.finish();
  }

  onOpenAI(event: any) {
    if (this.closed || !event || typeof event !== "object") return;
    const type = String(event.type || "");
    if (type === "session.created") this.sendToOpenAI(sessionUpdate(this.protocol, this.opts.instructions));
    if (type === "session.updated") this.greet();
    if (type === "error") this.onError(event);
    if (type === "input_audio_buffer.speech_started") {
      this.sendToTwilio({ event: "clear", streamSid: this.opts.streamSid });
    }
    if (type === "response.output_audio.delta" || type === "response.audio.delta") {
      const payload = event.delta || event.audio;
      if (typeof payload === "string" && payload) {
        this.spoke = true;
        this.audioPlaying = true;
        this.sendToTwilio({ event: "media", streamSid: this.opts.streamSid, media: { payload } });
      }
    }
    if (type === "response.output_audio.done" || type === "response.audio.done") {
      this.audioPlaying = false;
      if (this.ending) this.sendHangupMark();
    }
    if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
      this.addLine("Bertha", event.transcript);
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      this.addLine("Caller", event.transcript || event.item?.content?.find?.((part: any) => part?.transcript)?.transcript);
    }
    if (type === "response.done") this.onResponseDone(event);
  }

  private greet() {
    if (this.greeted || this.closed) return;
    this.greeted = true;
    this.sendToOpenAI({
      type: "response.create",
      response: this.response(`Greet the caller now, in a warm natural voice, with exactly this: ${this.opts.greeting} Then wait for them to speak.`),
    });
  }

  private response(instructions: string) {
    return this.protocol === "beta"
      ? { modalities: ["audio", "text"], instructions }
      : { output_modalities: ["audio"], instructions };
  }

  private onError(event: any) {
    if (this.ending) return;
    const kind = classifyAIError({
      status: event.error?.code === "insufficient_quota" ? 402 : undefined,
      type: event.error?.type,
      code: event.error?.code,
      message: event.error?.message,
      error: event.error,
    });
    const message = String(event.error?.message || "");
    if (!this.triedBeta && this.protocol === "ga" && !this.spoke && kind === "other" && /unknown|unrecognized|invalid/i.test(message)) {
      this.triedBeta = true;
      this.protocol = "beta";
      this.greeted = false;
      this.sendToOpenAI(sessionUpdate("beta", this.opts.instructions));
      return;
    }
    if (kind === "out_of_credits" || kind === "invalid_api_key" || kind === "model_not_found") {
      this.opts.onUnavailable({ spoke: this.spoke, kind });
    }
  }

  private onResponseDone(event: any) {
    const output = Array.isArray(event.response?.output) ? event.response.output : [];
    const fn = output.find((item: any) => item?.type === "function_call" && item?.name === "end_call");
    if (!fn) return;
    this.beginEnd(fn.call_id, output.some((item: any) => item?.type === "message") || this.spoke);
  }

  private beginEnd(callId?: string, hadSpeech = false) {
    if (this.ending || this.closed) return;
    this.ending = true;
    if (callId) {
      this.sendToOpenAI({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: "{\"ok\":true}" },
      });
    }
    if (!hadSpeech && !this.spoke && !this.goodbyeSent) {
      this.goodbyeSent = true;
      this.sendToOpenAI({ type: "response.create", response: this.response("Say one short goodbye and nothing else.") });
      return;
    }
    if (!this.audioPlaying) this.sendHangupMark();
  }

  private sendHangupMark() {
    if (this.hangupArmed || this.closed) return;
    this.hangupArmed = true;
    this.sendToTwilio({ event: "mark", streamSid: this.opts.streamSid, mark: { name: "bertha-hangup" } });
    this.later(8000, () => this.finish());
  }

  private finish() {
    if (this.closed) return;
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    this.opts.onHangup();
  }

  private addLine(role: "Caller" | "Bertha", text: unknown) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    this.lines.push({ role, text: clean });
    this.opts.onTranscript(this.lines.map(line => `${line.role}: ${line.text}`).join("\n"));
  }

  private later(ms: number, fn: () => void) {
    const timer = setTimeout(() => { if (!this.closed) fn(); }, ms);
    timer.unref?.();
    this.timers.push(timer);
  }

  private sendToTwilio(payload: unknown) {
    if (!this.closed) this.opts.sendToTwilio(payload);
  }

  private sendToOpenAI(payload: unknown) {
    if (!this.closed) this.opts.sendToOpenAI(payload);
  }
}
