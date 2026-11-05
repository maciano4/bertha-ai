import type { Express, Request, Response } from "express";
import { z } from "zod";
import { ANSWERING_OFF_SAY } from "./persona";
import { finalizeCall } from "./finalize";
import { twilioSignatureValid } from "./signature";
import { connectTwiml, emptyTwiml, sayTwiml, unavailableTwiml } from "./twiml";
import { mediaStreamUrl, requestOrigin } from "./urls";
import { redactVoiceSecrets } from "./secrets";
import type { VoiceDeps } from "./types";

function field(body: unknown, name: string) {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>)[name];
  return typeof value === "string" ? value.trim() : "";
}

function xml(res: Response, body: string) {
  res.type("text/xml").send(body);
}

function denied(req: Request, res: Response) {
  if (twilioSignatureValid(req)) return false;
  res.status(403).type("text/plain").send("Forbidden");
  return true;
}

const settingsPatch = z.object({
  answeringEnabled: z.boolean().optional(),
  greeting: z.string().max(300).optional(),
  availabilityNote: z.string().max(500).optional(),
});

export function registerVoiceWebhooks(app: Express, deps: VoiceDeps) {
  app.post("/api/voice/incoming", (req, res) => { void handleIncoming(req, res, deps); });
  app.post("/api/voice/stream-ended", (req, res) => { void handleStreamEnded(req, res, deps); });
  app.post("/api/voice/stream-status", (req, res) => { void handleStreamStatus(req, res, deps); });
  app.post("/api/voice/status", (req, res) => { void handleStatus(req, res, deps); });
}

export function registerVoiceOwnerRoutes(app: Express, deps: VoiceDeps) {
  app.get("/api/voice/settings", async (req, res) => {
    const userId = req.user?.id || "";
    if (!userId) return res.status(401).json({ error: "Please log in." });
    if (!await deps.repo.isOwner(userId)) return res.json({ isOwner: false });
    const settings = await deps.repo.getSettings();
    const origin = requestOrigin(req);
    res.json({
      isOwner: true,
      phoneNumber: (process.env.TWILIO_PHONE_NUMBER || "").trim() || null,
      answeringEnabled: settings?.answeringEnabled ?? true,
      greeting: settings?.greeting || "",
      availabilityNote: settings?.availabilityNote || "",
      webhookUrl: `${origin}/api/voice/incoming`,
      statusUrl: `${origin}/api/voice/status`,
      mediaStreamUrl: mediaStreamUrl(origin),
    });
  });

  app.patch("/api/voice/settings", async (req, res) => {
    const userId = req.user?.id || "";
    if (!userId) return res.status(401).json({ error: "Please log in." });
    if (!await deps.repo.isOwner(userId)) return res.status(403).json({ error: "Only the owner can change call answering." });
    const parsed = settingsPatch.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the call settings and try again." });
    const blank = (value: string | undefined) => value === undefined ? undefined : value.trim() || null;
    try {
      const saved = await deps.repo.saveSettings(userId, {
        answeringEnabled: parsed.data.answeringEnabled,
        greeting: blank(parsed.data.greeting),
        availabilityNote: blank(parsed.data.availabilityNote),
      });
      res.json({
        isOwner: true,
        answeringEnabled: saved.answeringEnabled,
        greeting: saved.greeting || "",
        availabilityNote: saved.availabilityNote || "",
      });
    } catch (error) {
      console.error("voice: settings failed:", redactVoiceSecrets(error instanceof Error ? error.message : "error"));
      res.status(500).json({ error: "Could not save call settings." });
    }
  });

  app.get("/api/voice/calls", async (req, res) => {
    const userId = req.user?.id || "";
    if (!userId) return res.status(401).json({ error: "Please log in." });
    if (!await deps.repo.isOwner(userId)) return res.status(403).json({ error: "Only the owner can see missed calls." });
    const calls = await deps.repo.listForOwner(userId);
    res.json({ calls });
  });
}

async function handleIncoming(req: Request, res: Response, deps: VoiceDeps) {
  if (denied(req, res)) return;
  try {
    const callSid = field(req.body, "CallSid");
    if (!callSid) return res.status(400).type("text/plain").send("Missing CallSid");
    const from = field(req.body, "From") || "unknown";
    const settings = await deps.repo.getSettings();
    const answering = settings ? settings.answeringEnabled : true;
    const aiUp = answering && deps.realtimeAvailable() && !deps.realtimeDown();
    await deps.repo.recordIncoming({
      callSid,
      fromNumber: from,
      toNumber: field(req.body, "To") || null,
      forwardedFrom: field(req.body, "ForwardedFrom") || null,
      answeringEnabled: answering,
      aiUnavailable: answering && !aiUp,
      fallbackPlayed: !aiUp,
    });
    const origin = requestOrigin(req);
    if (!answering) {
      xml(res, sayTwiml(ANSWERING_OFF_SAY));
      return;
    }
    if (!aiUp) {
      xml(res, unavailableTwiml());
      return;
    }
    const token = deps.tokens.issue(callSid);
    xml(res, connectTwiml({
      actionUrl: `${origin}/api/voice/stream-ended`,
      streamUrl: mediaStreamUrl(origin, token),
      statusUrl: `${origin}/api/voice/stream-status`,
    }));
    void deps.attachStatusCallback(callSid, `${origin}/api/voice/status`);
    console.log(`voice: answering ${callSid}`);
  } catch (error) {
    console.error("voice: incoming failed:", redactVoiceSecrets(error instanceof Error ? error.message : "error"));
    if (!res.headersSent) xml(res, unavailableTwiml());
  }
}

async function handleStreamEnded(req: Request, res: Response, deps: VoiceDeps) {
  if (denied(req, res)) return;
  try {
    const callSid = field(req.body, "CallSid");
    const call = callSid ? await deps.repo.getBySid(callSid) : null;
    if (call?.aiUnavailable && !call.fallbackPlayed) {
      await deps.repo.markFallbackPlayed(callSid);
      xml(res, unavailableTwiml());
      return;
    }
    xml(res, emptyTwiml());
  } catch (error) {
    console.error("voice: stream end failed:", redactVoiceSecrets(error instanceof Error ? error.message : "error"));
    if (!res.headersSent) xml(res, emptyTwiml());
  }
}

async function handleStreamStatus(req: Request, res: Response, deps: VoiceDeps) {
  if (denied(req, res)) return;
  const callSid = field(req.body, "CallSid");
  const event = field(req.body, "StreamEvent");
  try {
    if (callSid && event === "stream-error") {
      const call = await deps.repo.getBySid(callSid);
      if (call && !call.transcript) await deps.repo.markAiUnavailable(callSid);
    }
    if (callSid && (event === "stream-stopped" || event === "stream-error")) {
      await finalizeCall(deps, callSid, { streamClosed: true });
    }
  } catch (error) {
    console.error("voice: stream status failed:", redactVoiceSecrets(error instanceof Error ? error.message : "error"));
  }
  if (!res.headersSent) res.sendStatus(204);
}

async function handleStatus(req: Request, res: Response, deps: VoiceDeps) {
  if (denied(req, res)) return;
  const callSid = field(req.body, "CallSid");
  const status = field(req.body, "CallStatus").toLowerCase();
  const terminal = status === "completed" || status === "busy" || status === "failed" || status === "no-answer" || status === "canceled";
  try {
    if (callSid && terminal) {
      const duration = Number(field(req.body, "CallDuration"));
      await finalizeCall(deps, callSid, { durationSeconds: Number.isFinite(duration) && field(req.body, "CallDuration") ? duration : null });
    }
  } catch (error) {
    console.error("voice: call status failed:", redactVoiceSecrets(error instanceof Error ? error.message : "error"));
  }
  if (!res.headersSent) res.sendStatus(204);
}
