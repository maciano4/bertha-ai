import { formatCallSummarySms, summarizeTranscriptLocally } from "./summary";
import { redactVoiceSecrets } from "./secrets";
import type { CallRecord, SmsStatus, VoiceDeps } from "./types";

function elapsed(call: CallRecord): number | null {
  const start = Date.parse(call.startedAt);
  if (!Number.isFinite(start)) return null;
  return Math.max(0, Math.round((Date.now() - start) / 1000));
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Save the ending state and text Chris once. Safe if Twilio retries the webhook. */
export async function finalizeCall(deps: VoiceDeps, callSid: string, update: { durationSeconds?: number | null; streamClosed?: boolean } = {}) {
  const existing = await deps.repo.getBySid(callSid);
  if (!existing) return;
  if (update.durationSeconds != null) await deps.repo.saveDuration(callSid, update.durationSeconds);
  if (existing.smsStatus === "sent") return;

  const grace = update.streamClosed && existing.answeringEnabled && !existing.aiUnavailable ? deps.transcriptGraceMs : 0;
  if (grace > 0) await wait(grace);

  const current = await deps.repo.getBySid(callSid);
  if (!current || current.smsStatus === "sent" || current.smsStatus === "sending") return;
  const claimed = await deps.repo.claimSms(callSid);
  if (!claimed) return;

  const duration = update.durationSeconds ?? claimed.durationSeconds ?? elapsed(claimed);
  let summary: string;
  if (!claimed.answeringEnabled) summary = "Answering was turned off.";
  else if (claimed.aiUnavailable) summary = "AI was unavailable, so no message was taken.";
  else {
    const ai = claimed.transcript.trim() ? await deps.summarize(claimed.transcript).catch(() => null) : null;
    summary = ai || summarizeTranscriptLocally(claimed.transcript);
  }
  const body = formatCallSummarySms({
    fromNumber: claimed.fromNumber,
    forwardedFrom: claimed.forwardedFrom,
    durationSeconds: duration,
    summary,
    aiUnavailable: claimed.aiUnavailable,
    answeringEnabled: claimed.answeringEnabled,
  });

  let smsStatus: SmsStatus = "sent";
  let smsError: string | null = null;
  try {
    const result = await deps.sendSms(body);
    if (!result.ok) {
      smsStatus = result.skipped ? "skipped" : "failed";
      smsError = result.error ? redactVoiceSecrets(result.error).slice(0, 180) : null;
    }
  } catch (error) {
    smsStatus = "failed";
    smsError = redactVoiceSecrets(error instanceof Error ? error.message : "Could not send the text").slice(0, 180);
  }
  await deps.repo.completeSms(callSid, {
    summary,
    smsStatus,
    smsError,
    durationSeconds: duration,
    transcript: claimed.transcript,
    status: "completed",
  });
}
