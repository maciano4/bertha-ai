import type { Request } from "express";

function safeHost(value: string | undefined): string | null {
  const host = value?.split(",")[0]?.trim() || "";
  if (!/^[A-Za-z0-9.-]+(?::\d+)?$/.test(host)) return null;
  return host;
}

/** Public origin Twilio used, so signatures and the media-stream URL share one host. */
export function requestOrigin(req: Request): string {
  const configured = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (configured && /^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(configured)) return configured;
  const host = safeHost(req.get("x-forwarded-host")) || safeHost(req.get("host")) || "localhost";
  const forwarded = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : (req.protocol === "http" ? "http" : "https");
  return `${proto}://${host}`;
}

export function signedUrl(req: Request): string {
  return `${requestOrigin(req)}${req.originalUrl}`;
}

export function mediaStreamUrl(origin: string, token?: string): string {
  const url = new URL("/api/voice/media-stream", origin.endsWith("/") ? origin : `${origin}/`);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  if (token) url.searchParams.set("token", token);
  return url.toString();
}
