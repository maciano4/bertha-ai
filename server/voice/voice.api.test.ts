import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "http";
import twilio from "twilio";
import { AI_UNAVAILABLE_SAY } from "./persona";
import { formatCallSummarySms } from "./summary";
import { registerVoiceOwnerRoutes, registerVoiceWebhooks } from "./http";
import { MemoryVoiceRepository } from "./repository";
import { createTokenStore } from "./tokens";
import type { VoiceDeps } from "./types";

function deps(overrides: Partial<VoiceDeps> = {}): VoiceDeps & { repo: MemoryVoiceRepository; sent: string[] } {
  const sent: string[] = [];
  const repo = new MemoryVoiceRepository("owner-1");
  return {
    repo,
    sent,
    tokens: createTokenStore(),
    sendSms: async body => { sent.push(body); return { ok: true }; },
    summarize: async () => "Jane called about pickup.",
    realtimeAvailable: () => true,
    realtimeDown: () => "",
    markRealtimeDown: () => {},
    transcriptGraceMs: 0,
    attachStatusCallback: async () => {},
    ...overrides,
  };
}

async function listen(app: express.Express) {
  const server = await new Promise<Server>(resolve => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function form(body: Record<string, string>) {
  return new URLSearchParams(body).toString();
}

test("incoming call returns Connect TwiML aimed at the wss media stream and stores the call", async () => {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  const voice = deps();
  registerVoiceWebhooks(app, voice);
  const { server, origin } = await listen(app);
  try {
    process.env.TWILIO_VALIDATE_SIGNATURE = "false";
    const response = await fetch(`${origin}/api/voice/incoming`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-proto": "https", "x-forwarded-host": "bertha.example.com" },
      body: form({ CallSid: "CA123", From: "+15551212000", To: "+15557650000", CallStatus: "ringing" }),
    });
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /xml/);
    assert.match(xml, /<Response>/);
    assert.match(xml, /<Connect\b/);
    assert.match(xml, /<Stream\b/);
    assert.match(xml, /wss:\/\/bertha\.example\.com\/api\/voice\/media-stream\?token=/);
    assert.match(xml, /\/api\/voice\/stream-ended/);
    const calls = await voice.repo.listForOwner("owner-1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].callSid, "CA123");
    assert.equal(calls[0].fromNumber, "+15551212000");
    assert.equal(calls[0].aiUnavailable, false);
  } finally {
    await close(server);
  }
});

test("a bad Twilio signature is rejected and no call is stored", async () => {
  const previousToken = process.env.TWILIO_AUTH_TOKEN;
  const previousFlag = process.env.TWILIO_VALIDATE_SIGNATURE;
  process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
  process.env.TWILIO_VALIDATE_SIGNATURE = "true";
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  const voice = deps();
  registerVoiceWebhooks(app, voice);
  const { server, origin } = await listen(app);
  try {
    const response = await fetch(`${origin}/api/voice/incoming`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "not-a-valid-signature" },
      body: form({ CallSid: "CA999", From: "+15551212000", To: "+15557650000", CallStatus: "ringing" }),
    });
    assert.equal(response.status, 403);
    assert.equal((await voice.repo.listForOwner("owner-1")).length, 0);
  } finally {
    await close(server);
    if (previousToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = previousToken;
    if (previousFlag === undefined) delete process.env.TWILIO_VALIDATE_SIGNATURE;
    else process.env.TWILIO_VALIDATE_SIGNATURE = previousFlag;
  }
});

test("a valid signature is accepted", async () => {
  const previousToken = process.env.TWILIO_AUTH_TOKEN;
  const previousFlag = process.env.TWILIO_VALIDATE_SIGNATURE;
  const token = "test-auth-token";
  process.env.TWILIO_AUTH_TOKEN = token;
  process.env.TWILIO_VALIDATE_SIGNATURE = "true";
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  const voice = deps();
  registerVoiceWebhooks(app, voice);
  const { server, origin } = await listen(app);
  try {
    const params = { CallSid: "CA555", From: "+15551212000", To: "+15557650000", CallStatus: "ringing" };
    const url = `${origin}/api/voice/incoming`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": twilio.getExpectedTwilioSignature(token, url, params),
      },
      body: form(params),
    });
    assert.equal(response.status, 200);
    assert.equal((await voice.repo.listForOwner("owner-1"))[0]?.callSid, "CA555");
  } finally {
    await close(server);
    if (previousToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = previousToken;
    if (previousFlag === undefined) delete process.env.TWILIO_VALIDATE_SIGNATURE;
    else process.env.TWILIO_VALIDATE_SIGNATURE = previousFlag;
  }
});

test("without OpenAI the caller hears the fallback and Chris gets an AI-unavailable text", async () => {
  process.env.TWILIO_VALIDATE_SIGNATURE = "false";
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  const voice = deps({ realtimeAvailable: () => false });
  registerVoiceWebhooks(app, voice);
  const { server, origin } = await listen(app);
  try {
    const incoming = await fetch(`${origin}/api/voice/incoming`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ CallSid: "CA777", From: "+15551212000", To: "+15557650000", CallStatus: "ringing" }),
    });
    const xml = await incoming.text();
    assert.match(xml, new RegExp(AI_UNAVAILABLE_SAY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(/<Connect\b/.test(xml), false);
    assert.equal((await voice.repo.getBySid("CA777"))?.aiUnavailable, true);

    const status = await fetch(`${origin}/api/voice/status`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ CallSid: "CA777", CallStatus: "completed", CallDuration: "12", From: "+15551212000" }),
    });
    assert.equal(status.status, 204);
    assert.equal(voice.sent.length, 1);
    assert.equal(voice.sent[0], formatCallSummarySms({
      fromNumber: "+15551212000",
      forwardedFrom: null,
      durationSeconds: 12,
      summary: "AI was unavailable, so no message was taken.",
      aiUnavailable: true,
      answeringEnabled: true,
    }));
    const saved = await voice.repo.getBySid("CA777");
    assert.equal(saved?.status, "completed");
    assert.equal(saved?.smsStatus, "sent");
    assert.equal(saved?.durationSeconds, 12);
  } finally {
    await close(server);
  }
});

test("a completed call texts Chris the transcript summary", async () => {
  process.env.TWILIO_VALIDATE_SIGNATURE = "false";
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  const voice = deps();
  registerVoiceWebhooks(app, voice);
  const { server, origin } = await listen(app);
  try {
    await fetch(`${origin}/api/voice/incoming`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ CallSid: "CA888", From: "+15551212000", To: "+15557650000", CallStatus: "ringing", ForwardedFrom: "+15550001111" }),
    });
    await voice.repo.saveTranscript("CA888", "Caller: It's Dana from the clinic.\nBertha: I'll tell Chris.");
    const status = await fetch(`${origin}/api/voice/status`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ CallSid: "CA888", CallStatus: "completed", CallDuration: "40" }),
    });
    assert.equal(status.status, 204);
    assert.equal(voice.sent[0], formatCallSummarySms({
      fromNumber: "+15551212000",
      forwardedFrom: "+15550001111",
      durationSeconds: 40,
      summary: "Jane called about pickup.",
      aiUnavailable: false,
      answeringEnabled: true,
    }));
    assert.match(voice.sent[0], /forwarded from \+15550001111/);
    assert.match(voice.sent[0], /Jane called about pickup/);
  } finally {
    await close(server);
  }
});

test("the signed-in owner can read the call and someone else cannot", async () => {
  const app = express();
  app.use(express.json());
  const voice = deps();
  await voice.repo.recordIncoming({
    callSid: "CA321", fromNumber: "+15551212000", toNumber: "+15557650000", forwardedFrom: null,
    answeringEnabled: true, aiUnavailable: false, fallbackPlayed: false,
  });
  app.use((req, _res, next) => {
    (req as express.Request).user = { id: req.header("x-user") || "", email: "c@example.com", displayName: "Chris", timeZone: null };
    next();
  });
  registerVoiceOwnerRoutes(app, voice);
  const { server, origin } = await listen(app);
  try {
    const owner = await fetch(`${origin}/api/voice/calls`, { headers: { "x-user": "owner-1" } });
    const body = await owner.json() as { calls: { callSid: string }[] };
    assert.equal(owner.status, 200);
    assert.equal(body.calls[0].callSid, "CA321");
    const other = await fetch(`${origin}/api/voice/calls`, { headers: { "x-user": "someone-else" } });
    assert.equal(other.status, 403);
    const settings = await fetch(`${origin}/api/voice/settings`, { headers: { "x-user": "someone-else" } });
    assert.equal(((await settings.json()) as { isOwner: boolean }).isOwner, false);
  } finally {
    await close(server);
  }
});
