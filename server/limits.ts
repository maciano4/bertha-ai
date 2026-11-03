import { pool } from "./db";

// Plan limits: groundwork for paid plans (Stage 3 / Stripe).
// Today every account is on "free" and limits are NOT enforced unless BERTHA_ENFORCE_LIMITS=true.
// Stage 3 hook: set bertha_users.plan from a Stripe webhook and add the paid plans below.

export type PlanId = "free" | string;
export interface PlanLimits { maxBots: number; dailyMessages: number }

const envInt = (name: string, fallback: number) => {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export function planLimits(plan: PlanId): PlanLimits {
  // Stage 3: return different numbers for "plus" / "pro" here (or read them from Stripe price metadata).
  switch (plan) {
    default:
      return {
        maxBots: envInt("BERTHA_FREE_MAX_BOTS", 50),
        dailyMessages: envInt("BERTHA_FREE_DAILY_MESSAGES", 1000),
      };
  }
}

export const limitsEnforced = () => /^(1|true|yes)$/i.test(process.env.BERTHA_ENFORCE_LIMITS || "");

export class LimitError extends Error {
  status = 429;
  code = "limit_reached";
}

export async function getPlan(userId: string): Promise<PlanId> {
  const result = await pool.query(`SELECT plan FROM bertha_users WHERE id = $1`, [userId]);
  return result.rows[0]?.plan || "free";
}

export async function countBots(userId: string): Promise<number> {
  const result = await pool.query(`SELECT count(*)::int AS n FROM bertha_bots WHERE owner_id = $1`, [userId]);
  return result.rows[0]?.n ?? 0;
}

// The usage "day" is the UTC calendar day, so every server instance agrees.
export async function messagesToday(userId: string): Promise<{ messages: number; aiMessages: number }> {
  const result = await pool.query(
    `SELECT messages, ai_messages AS "aiMessages" FROM bertha_usage_daily WHERE user_id = $1 AND day = (now() AT TIME ZONE 'UTC')::date`, [userId]);
  return result.rows[0] ?? { messages: 0, aiMessages: 0 };
}

export async function recordMessage(userId: string, usedAI: boolean) {
  await pool.query(
    `INSERT INTO bertha_usage_daily (user_id, day, messages, ai_messages) VALUES ($1, (now() AT TIME ZONE 'UTC')::date, 1, $2)
     ON CONFLICT (user_id, day) DO UPDATE SET messages = bertha_usage_daily.messages + 1, ai_messages = bertha_usage_daily.ai_messages + $2`,
    [userId, usedAI ? 1 : 0],
  );
}

export async function assertCanCreateBot(userId: string) {
  if (!limitsEnforced()) return;
  const limits = planLimits(await getPlan(userId));
  if (await countBots(userId) >= limits.maxBots) {
    throw new LimitError(`You've reached your plan's limit of ${limits.maxBots} bots. Delete one or upgrade your plan to make more.`);
  }
}

export async function assertCanSendMessage(userId: string) {
  if (!limitsEnforced()) return;
  const limits = planLimits(await getPlan(userId));
  if ((await messagesToday(userId)).messages >= limits.dailyMessages) {
    throw new LimitError(`You've used all ${limits.dailyMessages} messages for today. Your limit resets at midnight UTC, or you can upgrade your plan.`);
  }
}

export async function usageSummary(userId: string) {
  const plan = await getPlan(userId);
  const limits = planLimits(plan);
  const [bots, today] = await Promise.all([countBots(userId), messagesToday(userId)]);
  return {
    plan,
    enforced: limitsEnforced(),
    bots: { used: bots, limit: limits.maxBots },
    messagesToday: { used: today.messages, ai: today.aiMessages, limit: limits.dailyMessages },
  };
}
