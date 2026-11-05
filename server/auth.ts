import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import createMemoryStore from "memorystore";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "crypto";
import { z } from "zod";
import type { Express, Request, Response, NextFunction } from "express";
import { pool } from "./db";
import { validTimeZone } from "./appointmentDates";
import type { PublicUser } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    personalAssistant?: boolean;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

const BCRYPT_ROUNDS = 12;
const DEV_SECRET = "bertha-dev-only-session-secret-change-me";

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    console.warn("⚠️  SESSION_SECRET is missing or too short. Using a random secret, so everyone is signed out whenever the server restarts. Add a long random SESSION_SECRET in Replit Secrets.");
    return randomBytes(32).toString("hex");
  }
  console.warn("⚠️  SESSION_SECRET is not set. Using an insecure development secret. Add SESSION_SECRET in Replit Secrets before publishing.");
  return DEV_SECRET;
}

type SessionStore = {
  all?: (callback: (error: Error | null, sessions?: Record<string, { userId?: string }> | null) => void) => void;
  destroy: (sid: string | string[], callback?: (error?: Error | null) => void) => void;
};

let sessionStore: SessionStore | undefined;

export function configureSessions(app: Express) {
  app.set("trust proxy", 1);
  // Sessions live in Postgres so logins survive restarts. SESSION_STORE=memory is for local tests only.
  const useMemory = process.env.SESSION_STORE === "memory";
  const store = useMemory
    ? new (createMemoryStore(session))({ checkPeriod: 24 * 60 * 60 * 1000 })
    : new (connectPgSimple(session))({ pool: pool as any, tableName: "bertha_sessions", createTableIfMissing: true });
  sessionStore = store as SessionStore;
  app.use(session({
    name: "bertha.personal",
    secret: sessionSecret(),
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: "lax", secure: "auto", maxAge: 90 * 24 * 60 * 60 * 1000 },
  }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
}

const toPublic = (row: any): PublicUser => ({
  id: row.id, email: row.email, displayName: row.displayName ?? null, timeZone: row.timeZone ?? null,
});
const userColumns = `id, email, display_name AS "displayName", time_zone AS "timeZone"`;

async function findUserById(id: string) {
  const result = await pool.query(`SELECT ${userColumns} FROM bertha_users WHERE id = $1`, [id]);
  return result.rows[0] ? toPublic(result.rows[0]) : null;
}

// Small in-memory brute-force guard: 10 failed logins per email+IP per 15 minutes.
const failures = new Map<string, { count: number; until: number }>();
function tooManyAttempts(key: string) {
  const entry = failures.get(key);
  if (!entry) return false;
  if (entry.until < Date.now()) { failures.delete(key); return false; }
  return entry.count >= 10;
}
function recordFailure(key: string) {
  const entry = failures.get(key);
  const until = Date.now() + 15 * 60 * 1000;
  failures.set(key, { count: (entry && entry.until > Date.now() ? entry.count : 0) + 1, until });
}

const email = z.string().trim().toLowerCase().email("Please enter a valid email address.").max(254);
const signupInput = z.object({
  email,
  password: z.string().min(8, "Your password needs at least 8 characters.").max(200, "That password is too long."),
  displayName: z.string().trim().max(80).optional().nullable(),
  timeZone: z.string().max(80).optional().nullable(),
});
const loginInput = z.object({ email, password: z.string().min(1, "Please enter your password.").max(200) });

function regenerate(req: Request) {
  return new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
}
function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
}

// Appointments made before accounts existed were owned by the browser session id.
// Move them to the account that signs in from that browser, so nothing is lost.
async function claimSessionAppointments(oldSessionId: string, userId: string) {
  try {
    await pool.query(`UPDATE bertha_appointments SET owner_id = $1 WHERE owner_id = $2`, [userId, oldSessionId]);
  } catch (error) {
    console.error("Could not move pre-account appointments:", error);
  }
}

async function signIn(req: Request, userId: string) {
  const oldSessionId = req.sessionID;
  await regenerate(req); // new session id on login prevents session fixation
  req.session.userId = userId;
  await saveSession(req);
  await claimSessionAppointments(oldSessionId, userId);
}

const firstIssue = (error: z.ZodError) => error.issues[0]?.message || "Please check the form.";

// Drop every signed-in session for this account (password reset, so old cookies stop working).
export async function invalidateUserSessions(userId: string) {
  if (process.env.SESSION_STORE === "memory" && sessionStore?.all) {
    const sessions = await new Promise<Record<string, { userId?: string }>>((resolve, reject) => {
      sessionStore!.all!((error, found) => error ? reject(error) : resolve(found || {}));
    });
    const sids = Object.entries(sessions).filter(([, sess]) => sess?.userId === userId).map(([sid]) => sid);
    if (!sids.length) return;
    await new Promise<void>((resolve, reject) => {
      sessionStore!.destroy(sids, error => error ? reject(error) : resolve());
    });
    return;
  }
  try {
    await pool.query(`DELETE FROM bertha_sessions WHERE sess->>'userId' = $1`, [userId]);
  } catch (error: any) {
    if (error?.code !== "42P01") throw error; // session table is created on first login
  }
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/signup", async (req, res) => {
    const parsed = signupInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
    const { email, password, displayName } = parsed.data;
    try {
      const existing = await pool.query(`SELECT 1 FROM bertha_users WHERE email = $1`, [email]);
      if (existing.rowCount) return res.status(409).json({ error: "An account with that email already exists. Please log in instead." });
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const timeZone = parsed.data.timeZone ? validTimeZone(parsed.data.timeZone) : null;
      const result = await pool.query(
        `INSERT INTO bertha_users (id, email, password_hash, display_name, time_zone) VALUES ($1, $2, $3, $4, $5) RETURNING ${userColumns}`,
        [randomUUID(), email, hash, displayName || null, timeZone],
      );
      const user = toPublic(result.rows[0]);
      await signIn(req, user.id);
      res.status(201).json({ user });
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ error: "An account with that email already exists. Please log in instead." });
      console.error("Sign-up failed:", error);
      res.status(500).json({ error: "We couldn't create your account right now. Please try again." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
    const key = `${parsed.data.email}|${req.ip}`;
    if (tooManyAttempts(key)) return res.status(429).json({ error: "Too many failed attempts. Please wait 15 minutes and try again." });
    try {
      const result = await pool.query(`SELECT ${userColumns}, password_hash AS "passwordHash" FROM bertha_users WHERE email = $1`, [parsed.data.email]);
      const row = result.rows[0];
      // Compare against a dummy hash when the email is unknown so timing doesn't reveal which emails exist.
      const ok = await bcrypt.compare(parsed.data.password, row?.passwordHash || "$2b$12$OEZN.ycCcAwRSC9CxCtW4uWxxoj8jvwNwlqkY1gd9VrvJglKnHKzW");
      if (!row || !ok) {
        recordFailure(key);
        return res.status(401).json({ error: "That email and password don't match. Please try again." });
      }
      failures.delete(key);
      await signIn(req, row.id);
      res.json({ user: toPublic(row) });
    } catch (error) {
      console.error("Login failed:", error);
      res.status(500).json({ error: "We couldn't log you in right now. Please try again." });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("bertha.personal");
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not signed in." });
    try {
      const user = await findUserById(req.session.userId);
      if (!user) return res.status(401).json({ error: "Not signed in." });
      res.json({ user });
    } catch (error) {
      console.error("Load user failed:", error);
      res.status(503).json({ error: "Could not load your account. Please try again." });
    }
  });

  app.patch("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not signed in." });
    const parsed = z.object({ displayName: z.string().trim().max(80).nullable().optional(), timeZone: z.string().max(80).nullable().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
    const current = await findUserById(req.session.userId);
    if (!current) return res.status(401).json({ error: "Not signed in." });
    const displayName = parsed.data.displayName === undefined ? current.displayName : parsed.data.displayName || null;
    const timeZone = parsed.data.timeZone === undefined ? current.timeZone : parsed.data.timeZone ? validTimeZone(parsed.data.timeZone) : null;
    const result = await pool.query(`UPDATE bertha_users SET display_name = $2, time_zone = $3 WHERE id = $1 RETURNING ${userColumns}`, [current.id, displayName, timeZone]);
    res.json({ user: toPublic(result.rows[0]) });
  });
}

// Every /api route except /api/auth/* needs a signed-in user.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith("/auth/")) return next();
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: "Please log in to use Bertha.", code: "not_signed_in" });
  try {
    const user = await findUserById(userId);
    if (!user) return res.status(401).json({ error: "Please log in to use Bertha.", code: "not_signed_in" });
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth check failed:", error);
    res.status(503).json({ error: "Bertha's database is not reachable right now. Please try again." });
  }
}
