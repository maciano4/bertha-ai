const SMS_MAX = 480;

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes <= 0) return `${total}s`;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export function summarizeTranscriptLocally(transcript: string): string {
  const lines = transcript.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const caller = lines
    .filter(line => /^caller:/i.test(line))
    .map(line => line.replace(/^caller:\s*/i, "").trim())
    .filter(Boolean);
  const source = caller.length
    ? caller.join(" ")
    : lines.map(line => line.replace(/^(caller|bertha):\s*/i, "").trim()).filter(Boolean).join(" ");
  if (!source) return "Bertha answered, but no message was captured.";
  const clean = source.replace(/\s+/g, " ").trim();
  return clean.length > 280 ? `${clean.slice(0, 277)}...` : clean;
}

/** The text Chris receives after a missed call. Pure: no Twilio or database. */
export function formatCallSummarySms(input: {
  fromNumber: string;
  forwardedFrom?: string | null;
  durationSeconds: number | null;
  summary: string | null;
  aiUnavailable: boolean;
  answeringEnabled: boolean;
}): string {
  const who = (input.fromNumber || "unknown").replace(/\s+/g, " ").trim();
  const forwarded = input.forwardedFrom?.replace(/\s+/g, " ").trim();
  const via = forwarded ? ` (forwarded from ${forwarded})` : "";
  const duration = input.durationSeconds != null && Number.isFinite(input.durationSeconds)
    ? ` (${formatDuration(input.durationSeconds)})`
    : "";
  const lead = `Missed call from ${who}${via}${duration}.`;
  let rest: string;
  if (!input.answeringEnabled) rest = "Answering is turned off, so Bertha didn't pick up.";
  else if (input.aiUnavailable) rest = "A call was missed, but AI was unavailable.";
  else rest = (input.summary || "No message was left.").replace(/\s+/g, " ").trim();
  const body = `${lead} ${rest}`;
  return body.length > SMS_MAX ? `${body.slice(0, SMS_MAX - 3)}...` : body;
}
