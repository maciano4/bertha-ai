import type { IncomingMessage } from "http";
import type { Server } from "http";
import WebSocket, { WebSocketServer } from "ws";
import { classifyAIError } from "../aiErrors";
import { CallBridge } from "./bridge";
import { openAIKey, realtimeModel, realtimeWsUrl } from "./config";
import { finalizeCall } from "./finalize";
import { buildInstructions, DEFAULT_GREETING } from "./persona";
import { redactVoiceSecrets } from "./secrets";
import type { VoiceDeps } from "./types";

/**
 * Twilio media streams arrive as a WebSocket upgrade, not an Express route.
 * Installed after Vite so the dev-server socket keeps every other path.
 */
export function attachMediaStream(server: Server, deps: VoiceDeps) {
  const wss = new WebSocketServer({ noServer: true });
  const prior = [...server.listeners("upgrade")] as Array<(...args: unknown[]) => void>;
  server.removeAllListeners("upgrade");
  server.on("upgrade", (req, socket, head) => {
    let path = "";
    try { path = new URL(req.url || "/", "http://localhost").pathname; } catch { path = ""; }
    if (path === "/api/voice/media-stream") {
      wss.handleUpgrade(req, socket, head, ws => { void handleConnection(ws, req, deps); });
      return;
    }
    for (const listener of prior) listener.call(server, req, socket, head);
  });
}

async function handleConnection(ws: WebSocket, req: IncomingMessage, deps: VoiceDeps) {
  const token = new URL(req.url || "/", "http://localhost").searchParams.get("token") || "";
  const callSid = deps.tokens.lookup(token);
  if (!callSid) {
    ws.close(1008, "unauthorized");
    return;
  }

  let bridge: CallBridge | null = null;
  let openai: WebSocket | null = null;
  let transcript = "";
  let settled = false;
  const pending: string[] = [];
  let flushTimer: NodeJS.Timeout | null = null;

  const flushTranscript = async () => {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (transcript) await deps.repo.saveTranscript(callSid, transcript);
  };

  const shutdown = async (unavailable?: { spoke: boolean; kind: string }) => {
    if (settled) return;
    settled = true;
    bridge?.close();
    try { openai?.close(); } catch { /* already closed */ }
    try { if (ws.readyState === WebSocket.OPEN) ws.close(); } catch { /* already closed */ }
    try {
      await flushTranscript();
      if (unavailable && !unavailable.spoke) {
        await deps.repo.markAiUnavailable(callSid);
        deps.markRealtimeDown(unavailable.kind);
      }
      await finalizeCall(deps, callSid, { streamClosed: true });
    } catch (error) {
      console.error("voice: stream shutdown failed:", redactVoiceSecrets(error instanceof Error ? error.message : "error"));
    }
  };

  const openRealtime = () => {
    const key = openAIKey();
    if (!key) {
      void shutdown({ spoke: false, kind: "invalid_api_key" });
      return;
    }
    openai = new WebSocket(realtimeWsUrl(realtimeModel()), { headers: { Authorization: `Bearer ${key}` } });
    openai.on("open", () => {
      if (!bridge) return;
      for (const payload of pending.splice(0)) bridge.onTwilio({ event: "media", media: { payload, track: "inbound" } });
    });
    openai.on("message", raw => {
      if (!bridge || settled) return;
      try { bridge.onOpenAI(JSON.parse(raw.toString())); } catch { /* ignore a bad frame */ }
    });
    openai.on("unexpected-response", (_request, response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8").slice(0, 500);
        let parsed: any = {};
        try { parsed = JSON.parse(body); } catch { parsed = { message: body }; }
        const kind = classifyAIError({
          status: response.statusCode,
          message: parsed.error?.message || parsed.message || body,
          type: parsed.error?.type,
          code: parsed.error?.code,
          error: parsed.error || parsed,
        });
        console.error("voice: realtime connection failed:", kind);
        void shutdown({ spoke: bridge?.spoke ?? false, kind });
      });
    });
    openai.on("error", error => {
      console.error("voice: realtime socket error:", redactVoiceSecrets(error.message));
      if (!settled) void shutdown({ spoke: bridge?.spoke ?? false, kind: "connection" });
    });
    openai.on("close", () => {
      if (!settled) void shutdown(bridge?.spoke ? undefined : { spoke: false, kind: "connection" });
    });
  };

  ws.on("message", raw => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.event === "start") {
      const streamSid = String(msg.start?.streamSid || msg.streamSid || "");
      const startedCall = String(msg.start?.callSid || "");
      if (startedCall && startedCall !== callSid) {
        void shutdown();
        return;
      }
      void deps.repo.markInProgress(callSid);
      void deps.repo.getSettings().then(settings => {
        if (settled) return;
        bridge = new CallBridge({
          streamSid,
          instructions: buildInstructions(settings?.availabilityNote ?? null),
          greeting: settings?.greeting?.trim() || DEFAULT_GREETING,
          sendToTwilio: payload => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload)); },
          sendToOpenAI: payload => { if (openai?.readyState === WebSocket.OPEN) openai.send(JSON.stringify(payload)); },
          onTranscript: text => {
            transcript = text;
            if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; void deps.repo.saveTranscript(callSid, transcript); }, 1000);
          },
          onUnavailable: info => { void shutdown(info); },
          onHangup: () => { void shutdown(); },
        });
        bridge.startMaxDuration();
        openRealtime();
      }).catch(error => {
        console.error("voice: could not start the call:", redactVoiceSecrets(error instanceof Error ? error.message : "error"));
        void shutdown({ spoke: false, kind: "connection" });
      });
      return;
    }
    if (msg.event === "media" && msg.media?.payload && !bridge) {
      pending.push(msg.media.payload);
      if (pending.length > 200) pending.shift();
      return;
    }
    if (bridge && (msg.event === "media" || msg.event === "mark")) bridge.onTwilio(msg);
    if (msg.event === "stop") void shutdown();
  });
  ws.on("close", () => { void shutdown(); });
  ws.on("error", () => { void shutdown(); });
}
