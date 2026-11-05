import { pool } from "../db";
import { markRealtimeDown, openAIKey, realtimeDownReason } from "./config";
import { PostgresVoiceRepository } from "./repository";
import { redactVoiceSecrets } from "./secrets";
import { attachCallStatusCallback, sendTwilioSms } from "./sms";
import { createTokenStore } from "./tokens";
import type { VoiceDeps } from "./types";

async function summarizeCall(transcript: string): Promise<string | null> {
  const text = transcript.trim();
  if (!text || !openAIKey()) return null;
  try {
    const { completeJSON } = await import("../openai");
    const result = await completeJSON<{ summary?: string }>(
      "call summary",
      'Summarize this missed-call phone conversation for Chris. Return JSON {"summary":"..."}. One or two short sentences. Include the caller\'s name and what they want when they said it. Do not invent anything.',
      text.slice(0, 6000),
      180,
    );
    const summary = String(result.summary || "").replace(/\s+/g, " ").trim();
    return summary || null;
  } catch (error) {
    console.error("voice: summary failed:", redactVoiceSecrets(error instanceof Error ? error.message : "error").slice(0, 200));
    return null;
  }
}

export function createVoiceDeps(): VoiceDeps {
  return {
    repo: new PostgresVoiceRepository(pool),
    tokens: createTokenStore(),
    sendSms: sendTwilioSms,
    summarize: summarizeCall,
    realtimeAvailable: () => Boolean(openAIKey()),
    realtimeDown: () => realtimeDownReason(),
    markRealtimeDown,
    transcriptGraceMs: 1200,
    attachStatusCallback: attachCallStatusCallback,
  };
}

let cached: VoiceDeps | null = null;
export function getVoiceDeps() {
  if (!cached) cached = createVoiceDeps();
  return cached;
}
