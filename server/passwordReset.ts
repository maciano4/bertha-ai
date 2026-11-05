import { createHash, randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Express, Request } from "express";
import { pool } from "./db";
import { invalidateUserSessions } from "./auth";
import { emailProvider, passwordResetEmail, sendMail } from "./mail";

const BCRYPT_ROUNDS = 12;
const RESET_TTL = "1 hour";
export const RESET_REQUEST_MESSAGE = "If an account exists for that email, we sent a link to reset your password. It expires in one hour.";
const INVALID_RESET = "This reset link is invalid or has already been used. Request a new one.";
const EXPIRED_RESET = "This reset link has expired. Request a new one.";

const email = z.string().trim().toLowerCase().email("Please enter a valid email address.").max(254);
const forgotInput = z.object({ email });
const resetInput = z.object({
  token: z.string().trim().min(20, INVALID_RESET).max(500, INVALID_RESET),
  password: z.string().min(8, "Your password needs at least 8 characters.").max(200, "That password is too long."),
  confirmPassword: z.string().min(1, "Please confirm your new password."),
}).refine(value => value.password === value.confirmPassword, { message: "Those passwords don't match." });

const firstIssue = (error: z.ZodError) => error.issues[0]?.message || "Please check the form.";

export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newResetToken() {
  return randomBytes(32).toString("base64url");
}

function publicBaseUrl(req: Request) {
  const configured = process.env.APP_URL || process.env.PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, "");
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
  const host = req.get("x-forwarded-host") || req.get("host");
  return `${proto}://${host}`;
}

// A few requests per email, so a script can't flood someone's inbox. Over the limit we still
// answer with the same message and simply don't send another link.
const recentRequests = new Map<string, { count: number; until: number }>();
function overRequestLimit(emailAddress: string) {
  const now = Date.now();
  const entry = recentRequests.get(emailAddress);
  if (!entry || entry.until < now) {
    recentRequests.set(emailAddress, { count: 1, until: now + 15 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 5;
}

type QueryResult = { rows: any[]; rowCount: number | null };
type Query = (text: string, params?: unknown[]) => Promise<QueryResult>;

async function withTransaction<T>(fn: (query: Query) => Promise<T>): Promise<T> {
  const client = await (pool as unknown as { connect: () => Promise<{ query: Query; release: () => void }> }).connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client.query.bind(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* the original error is the one to report */ }
    throw error;
  } finally {
    client.release();
  }
}

function logResetLink(emailAddress: string, resetUrl: string) {
  console.log([
    "",
    "========== Bertha password reset ==========",
    "No reset email was sent (no working email provider).",
    `Account: ${emailAddress}`,
    `Reset URL: ${resetUrl}`,
    "Set SMTP_URL, SMTP_HOST, RESEND_API_KEY, or SENDGRID_API_KEY to send this by email.",
    "===========================================",
    "",
  ].join("\n"));
}

export function registerPasswordResetRoutes(app: Express) {
  app.post("/api/auth/forgot-password", async (req, res) => {
    const parsed = forgotInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
    const emailAddress = parsed.data.email;
    const neutral = { message: RESET_REQUEST_MESSAGE };
    if (overRequestLimit(emailAddress)) return res.json(neutral);
    try {
      const existing = await pool.query(`SELECT id FROM bertha_users WHERE email = $1`, [emailAddress]);
      const userId = existing.rows[0]?.id as string | undefined;
      if (!userId) return res.json(neutral);

      const token = newResetToken();
      const tokenHash = hashResetToken(token);
      await withTransaction(async query => {
        await query(`UPDATE bertha_password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
        await query(
          `INSERT INTO bertha_password_resets (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + $4::interval)`,
          [randomUUID(), userId, tokenHash, RESET_TTL],
        );
      });
      await pool.query(`DELETE FROM bertha_password_resets WHERE expires_at < now() - interval '1 day'`).catch(() => {});

      const resetUrl = `${publicBaseUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;
      let sent = false;
      if (emailProvider()) {
        try {
          const mail = passwordResetEmail(resetUrl);
          await sendMail({ to: emailAddress, ...mail });
          sent = true;
        } catch (error) {
          console.error("[bertha] Could not send the password reset email:", error instanceof Error ? error.message : error);
        }
      }

      const dev = process.env.NODE_ENV !== "production";
      if (!sent && dev) {
        logResetLink(emailAddress, resetUrl);
        return res.json({ ...neutral, resetUrl });
      }
      if (!sent) {
        console.error("[bertha] Password reset requested but no email was sent. Set SMTP_URL, SMTP_HOST, RESEND_API_KEY, or SENDGRID_API_KEY.");
      }
      res.json(neutral);
    } catch (error) {
      console.error("Password reset request failed:", error);
      res.status(500).json({ error: "We couldn't start a password reset right now. Please try again." });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const parsed = resetInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
    try {
      const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);
      const result = await withTransaction(async query => {
        const found = await query(
          `SELECT user_id AS "userId", used_at AS "usedAt", (expires_at <= now()) AS expired
           FROM bertha_password_resets WHERE token_hash = $1 FOR UPDATE`,
          [hashResetToken(parsed.data.token)],
        );
        const row = found.rows[0];
        if (!row || row.usedAt) return { ok: false as const, error: INVALID_RESET };
        if (row.expired) return { ok: false as const, error: EXPIRED_RESET };
        const updated = await query(`UPDATE bertha_users SET password_hash = $2 WHERE id = $1`, [row.userId, passwordHash]);
        if (!updated.rowCount) return { ok: false as const, error: INVALID_RESET };
        await query(`UPDATE bertha_password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [row.userId]);
        return { ok: true as const, userId: row.userId as string };
      });
      if (!result.ok) return res.status(400).json({ error: result.error });

      const currentUserId = req.session?.userId;
      try {
        await invalidateUserSessions(result.userId);
      } catch (error) {
        console.error("Could not sign out old sessions after password reset:", error);
      }
      if (req.session && currentUserId === result.userId) {
        await new Promise<void>(resolve => req.session.destroy(() => resolve()));
        res.clearCookie("bertha.personal", { path: "/" });
      }
      res.json({ ok: true, message: "Your password was updated. Please log in." });
    } catch (error) {
      console.error("Password reset failed:", error);
      res.status(500).json({ error: "We couldn't update your password right now. Please try again." });
    }
  });
}
