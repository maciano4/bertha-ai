const FATAL = new Set(["out_of_credits", "invalid_api_key", "model_not_found"]);
let downUntil = 0;
let downReason = "";

export function openAIKey() {
  return (process.env.OPENAI_API_KEY || process.env.OpenAI_API_KEY || process.env.OPENAI_KEY || "").trim();
}

/** Current recommended realtime model. Override with OPENAI_REALTIME_MODEL (for example gpt-realtime). */
export function realtimeModel() {
  return (process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1").trim() || "gpt-realtime-2.1";
}

export function markRealtimeDown(kind: string) {
  if (!FATAL.has(kind)) return;
  downUntil = Date.now() + 15 * 60 * 1000;
  downReason = kind;
}

export function realtimeDownReason() {
  return Date.now() < downUntil ? downReason : "";
}

export function realtimeWsUrl(model = realtimeModel()) {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, "");
  const url = new URL(`${base}/realtime`);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  url.searchParams.set("model", model);
  return url.toString();
}
