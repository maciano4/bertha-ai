import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// Talk to a local Postgres when the environment doesn't already have one.
process.env.DATABASE_URL ||= "postgres://bertha:bertha@127.0.0.1:5432/bertha_test";
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET ||= "test-session-secret-long-enough";
delete process.env.SESSION_STORE;
delete process.env.SMTP_URL;
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_USERNAME;
delete process.env.SMTP_PASSWORD;
delete process.env.SMTP_PASS;
delete process.env.RESEND_API_KEY;
delete process.env.SENDGRID_API_KEY;

const NEUTRAL = "If an account exists for that email, we sent a link to reset your password. It expires in one hour.";

let base = "";
let server: Server;
let pool: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>; end?: () => Promise<void> };

before(async () => {
  const express = (await import("express")).default;
  pool = (await import("./db")).pool;
  const { configureSessions, registerAuthRoutes } = await import("./auth");
  const { registerPasswordResetRoutes } = await import("./passwordReset");
  const { ensurePlatformTables } = await import("./platformTables");
  const { ensureAppointmentsTable } = await import("./appointments");
  await ensurePlatformTables();
  await ensureAppointmentsTable();
  const app = express();
  app.use(express.json());
  configureSessions(app);
  registerAuthRoutes(app);
  registerPasswordResetRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  // These accounts exist only for the tests. Cascade removes their reset links.
  await pool?.query(`DELETE FROM bertha_users WHERE email LIKE 'reset-test-%@example.com'`).catch(() => {});
  await pool?.end?.();
});

function cookieHeader(response: Response) {
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return list.map(line => line.split(";")[0]).filter(part => part && !part.endsWith("=")).join("; ");
}

async function post(path: string, body: unknown, cookie = "") {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, cookie: cookieHeader(response) };
}

async function get(path: string, cookie = "") {
  const response = await fetch(`${base}${path}`, { headers: cookie ? { cookie } : {} });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function emailAddress() {
  return `reset-test-${randomBytes(6).toString("hex")}@example.com`;
}

async function signUp(password = "original-password") {
  const email = emailAddress();
  const signup = await post("/api/auth/signup", { email, password, displayName: "Reset Test" });
  assert.equal(signup.status, 201, JSON.stringify(signup.data));
  return { email, password, userId: signup.data.user.id as string, cookie: signup.cookie };
}

function tokenFrom(resetUrl: string) {
  const token = new URL(resetUrl).searchParams.get("token");
  assert.ok(token && token.length >= 20, resetUrl);
  return token;
}

test("request reset always returns the same message and only includes a link for a real account", async () => {
  const account = await signUp();
  const known = await post("/api/auth/forgot-password", { email: account.email });
  const unknown = await post("/api/auth/forgot-password", { email: emailAddress() });
  const malformed = await post("/api/auth/forgot-password", { email: "not-an-email" });

  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.equal(known.data.message, NEUTRAL);
  assert.equal(unknown.data.message, NEUTRAL);
  assert.equal("resetUrl" in unknown.data, false);
  assert.match(known.data.resetUrl, /^http:\/\/127\.0\.0\.1:\d+\/reset-password\?token=/);
  assert.equal(malformed.status, 400);
  assert.match(malformed.data.error, /valid email/i);
  tokenFrom(known.data.resetUrl);
});

test("an unknown reset token is rejected", async () => {
  const response = await post("/api/auth/reset-password", {
    token: randomBytes(32).toString("base64url"),
    password: "brand-new-password",
    confirmPassword: "brand-new-password",
  });
  assert.equal(response.status, 400);
  assert.match(response.data.error, /invalid|already been used/i);
});

test("an expired reset token does not change the password", async () => {
  const account = await signUp();
  const forgot = await post("/api/auth/forgot-password", { email: account.email });
  const token = tokenFrom(forgot.data.resetUrl);
  const hash = createHash("sha256").update(token).digest("hex");
  const updated = await pool.query(
    `UPDATE bertha_password_resets SET expires_at = now() - interval '1 minute' WHERE token_hash = $1`,
    [hash],
  );
  assert.equal(updated.rowCount, 1);

  const expired = await post("/api/auth/reset-password", {
    token,
    password: "brand-new-password",
    confirmPassword: "brand-new-password",
  });
  assert.equal(expired.status, 400);
  assert.match(expired.data.error, /expired/i);

  const login = await post("/api/auth/login", { email: account.email, password: account.password });
  assert.equal(login.status, 200, JSON.stringify(login.data));
});

test("a valid reset sets the new password, works once, and signs out old sessions", async () => {
  const account = await signUp();
  const meBefore = await get("/api/auth/me", account.cookie);
  assert.equal(meBefore.status, 200);

  const forgot = await post("/api/auth/forgot-password", { email: account.email });
  const token = tokenFrom(forgot.data.resetUrl);
  const mismatch = await post("/api/auth/reset-password", {
    token,
    password: "brand-new-password",
    confirmPassword: "not-the-same-password",
  });
  assert.equal(mismatch.status, 400);
  assert.match(mismatch.data.error, /don't match/i);

  const reset = await post("/api/auth/reset-password", {
    token,
    password: "brand-new-password",
    confirmPassword: "brand-new-password",
  }, account.cookie);
  assert.equal(reset.status, 200, JSON.stringify(reset.data));
  assert.equal(reset.data.ok, true);

  const sessions = await pool.query(`SELECT count(*)::int AS n FROM bertha_sessions WHERE sess->>'userId' = $1`, [account.userId]);
  assert.equal(sessions.rows[0].n, 0);
  const meAfter = await get("/api/auth/me", account.cookie);
  assert.equal(meAfter.status, 401);

  const oldPassword = await post("/api/auth/login", { email: account.email, password: account.password });
  assert.equal(oldPassword.status, 401);
  const newPassword = await post("/api/auth/login", { email: account.email, password: "brand-new-password" });
  assert.equal(newPassword.status, 200, JSON.stringify(newPassword.data));

  const again = await post("/api/auth/reset-password", {
    token,
    password: "another-password-2",
    confirmPassword: "another-password-2",
  });
  assert.equal(again.status, 400);
  assert.match(again.data.error, /invalid|already been used/i);
  const stillNew = await post("/api/auth/login", { email: account.email, password: "brand-new-password" });
  assert.equal(stillNew.status, 200);
});
