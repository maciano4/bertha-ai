import { randomBytes, randomUUID } from "crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { pool } from "./db";
import { AIError, CHAT_MODEL, draftBotInstructions } from "./openai";
import { assertCanCreateBot, LimitError, usageSummary } from "./limits";

// Custom bots. Owners see and edit everything. Everyone else (only for public or unlisted bots)
// gets the sanitized PublicBot card: no owner id or email, no model, and no instructions unless
// the owner turned on "show instructions".

export const VISIBILITIES = ["private", "unlisted", "public"] as const;
export type Visibility = typeof VISIBILITIES[number];

export interface OwnedBot {
  id: string; ownerId: string; name: string; description: string; instructions: string; greeting: string;
  avatarEmoji: string; avatarUrl: string | null; voiceName: string | null; voiceRate: number; voicePitch: number;
  model: string | null; visibility: Visibility; slug: string; showInstructions: boolean; createdAt: string; updatedAt: string;
}
export interface PublicBot {
  id: string; slug: string; name: string; description: string; greeting: string;
  avatarEmoji: string; avatarUrl: string | null; voiceName: string | null; voiceRate: number; voicePitch: number;
  visibility: Visibility; creatorName: string | null; instructions?: string; isOwner: boolean; chatCount?: number;
}

const columns = `b.id, b.owner_id AS "ownerId", b.name, b.description, b.instructions, b.greeting,
  b.avatar_emoji AS "avatarEmoji", b.avatar_url AS "avatarUrl", b.voice_name AS "voiceName",
  b.voice_rate AS "voiceRate", b.voice_pitch AS "voicePitch", b.model, b.visibility, b.slug,
  b.show_instructions AS "showInstructions", b.created_at AS "createdAt", b.updated_at AS "updatedAt"`;
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function toPublicBot(bot: OwnedBot & { creatorName?: string | null; chatCount?: number }, viewerId?: string | null): PublicBot {
  const isOwner = !!viewerId && viewerId === bot.ownerId;
  const card: PublicBot = {
    id: bot.id, slug: bot.slug, name: bot.name, description: bot.description, greeting: bot.greeting,
    avatarEmoji: bot.avatarEmoji, avatarUrl: bot.avatarUrl, voiceName: bot.voiceName,
    voiceRate: Number(bot.voiceRate), voicePitch: Number(bot.voicePitch), visibility: bot.visibility,
    creatorName: bot.creatorName ?? null, isOwner,
  };
  if (bot.showInstructions || isOwner) card.instructions = bot.instructions;
  if (typeof bot.chatCount === "number") card.chatCount = bot.chatCount;
  return card;
}

// ---------- validation ----------
export function allowedModels(): string[] {
  const fromEnv = (process.env.BERTHA_BOT_MODELS || "").split(",").map(m => m.trim()).filter(Boolean);
  const list = fromEnv.length ? fromEnv : ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"];
  return Array.from(new Set([CHAT_MODEL, ...list]));
}

const AVATAR_DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const avatarUrl = z.string().trim().max(200_000, "That picture is too large. Please use a smaller image.")
  .refine(value => !value || AVATAR_DATA_URL.test(value) || /^https:\/\/[^\s"'<>]+$/i.test(value) && value.length <= 1000,
    "The avatar must be an https:// image link or an uploaded picture.")
  .transform(value => value || null);

const botFields = {
  name: z.string().trim().min(1, "Please give your bot a name.").max(60, "Bot names can be up to 60 characters."),
  description: z.string().trim().max(300, "The description can be up to 300 characters."),
  instructions: z.string().trim().max(8000, "Instructions can be up to 8,000 characters."),
  greeting: z.string().trim().max(500, "The greeting can be up to 500 characters."),
  avatarEmoji: z.string().trim().max(16, "Please use a single emoji for the avatar.").transform(v => v || "🤖"),
  avatarUrl: avatarUrl.nullable(),
  voiceName: z.string().trim().max(200).nullable().transform(v => v || null),
  voiceRate: z.coerce.number().min(0.5).max(2),
  voicePitch: z.coerce.number().min(0).max(2),
  model: z.string().trim().max(60).nullable().transform(v => v || null)
    .refine(v => !v || allowedModels().includes(v), "That AI model isn't available. Pick one from the list or use the default."),
  visibility: z.enum(VISIBILITIES),
  showInstructions: z.boolean(),
};
export const createBotInput = z.object({
  ...botFields,
  description: botFields.description.default(""),
  instructions: botFields.instructions.default(""),
  greeting: botFields.greeting.default(""),
  avatarEmoji: botFields.avatarEmoji.default("🤖"),
  avatarUrl: botFields.avatarUrl.default(null),
  voiceName: botFields.voiceName.default(null),
  voiceRate: botFields.voiceRate.default(1),
  voicePitch: botFields.voicePitch.default(1),
  model: botFields.model.default(null),
  visibility: botFields.visibility.default("private"),
  showInstructions: botFields.showInstructions.default(false),
}).strict();
export const updateBotInput = z.object(botFields).partial().strict();

const firstIssue = (error: z.ZodError) => {
  const issue = error.issues[0];
  if (!issue) return "Please check the form.";
  if (issue.code === "unrecognized_keys") return "Unknown field in the request.";
  return issue.message;
};

// ---------- store ----------
export function makeSlug(name: string) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "bot";
  return `${base}-${randomBytes(4).toString("hex").slice(0, 6)}`;
}

export async function getBotById(id: string): Promise<(OwnedBot & { creatorName: string | null }) | null> {
  const result = await pool.query(
    `SELECT ${columns}, u.display_name AS "creatorName" FROM bertha_bots b JOIN bertha_users u ON u.id = b.owner_id WHERE b.id = $1`, [id]);
  return result.rows[0] ? plain(result.rows[0]) : null;
}

export async function getBotBySlug(slug: string) {
  const result = await pool.query(
    `SELECT ${columns}, u.display_name AS "creatorName" FROM bertha_bots b JOIN bertha_users u ON u.id = b.owner_id WHERE b.slug = $1`, [slug]);
  return result.rows[0] ? plain(result.rows[0]) as OwnedBot & { creatorName: string | null } : null;
}

/** A bot can be chatted with by its owner, or by anyone signed in when it is public or unlisted. */
export function canChatWith(bot: OwnedBot | null, userId: string) {
  return !!bot && (bot.ownerId === userId || bot.visibility !== "private");
}

/** Loads a bot for chatting, or null when it doesn't exist or the user may not use it. */
export async function getChatBot(botId: string, userId: string) {
  const bot = await getBotById(botId);
  return canChatWith(bot, userId) ? bot : null;
}

export async function listOwnBots(ownerId: string): Promise<(OwnedBot & { chatCount: number })[]> {
  const result = await pool.query(
    `SELECT ${columns}, (SELECT count(*)::int FROM bertha_conversations c WHERE c.bot_id = b.id) AS "chatCount"
     FROM bertha_bots b WHERE b.owner_id = $1 ORDER BY b.updated_at DESC LIMIT 500`, [ownerId]);
  return plain(result.rows);
}

export async function listPublicBots(query: string, limit = 60) {
  const q = query.trim().slice(0, 80);
  const result = await pool.query(
    `SELECT ${columns}, u.display_name AS "creatorName",
       (SELECT count(*)::int FROM bertha_conversations c WHERE c.bot_id = b.id) AS "chatCount"
     FROM bertha_bots b JOIN bertha_users u ON u.id = b.owner_id
     WHERE b.visibility = 'public' AND ($1 = '' OR b.name ILIKE '%' || $1 || '%' OR b.description ILIKE '%' || $1 || '%')
     ORDER BY "chatCount" DESC, b.updated_at DESC LIMIT $2`, [q.replace(/[%_\\]/g, ""), limit]);
  return plain(result.rows) as (OwnedBot & { creatorName: string | null; chatCount: number })[];
}

async function insertBot(ownerId: string, data: z.infer<typeof createBotInput>): Promise<OwnedBot> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await pool.query(
        `INSERT INTO bertha_bots AS b (id, owner_id, name, description, instructions, greeting, avatar_emoji, avatar_url,
           voice_name, voice_rate, voice_pitch, model, visibility, slug, show_instructions)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING ${columns}`,
        [randomUUID(), ownerId, data.name, data.description, data.instructions, data.greeting, data.avatarEmoji, data.avatarUrl,
          data.voiceName, data.voiceRate, data.voicePitch, data.model, data.visibility, makeSlug(data.name), data.showInstructions]);
      return plain(result.rows[0]);
    } catch (error: any) {
      if (error?.code === "23505" && attempt < 3) continue; // slug collision, try another
      throw error;
    }
  }
}

const updatable: Record<keyof z.infer<typeof updateBotInput>, string> = {
  name: "name", description: "description", instructions: "instructions", greeting: "greeting",
  avatarEmoji: "avatar_emoji", avatarUrl: "avatar_url", voiceName: "voice_name", voiceRate: "voice_rate",
  voicePitch: "voice_pitch", model: "model", visibility: "visibility", showInstructions: "show_instructions",
};

async function updateBot(ownerId: string, id: string, data: z.infer<typeof updateBotInput>): Promise<OwnedBot | null> {
  const sets: string[] = [];
  const values: unknown[] = [id, ownerId];
  for (const [key, column] of Object.entries(updatable)) {
    const value = (data as any)[key];
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  const result = await pool.query(
    `UPDATE bertha_bots AS b SET ${[...sets, "updated_at = now()"].join(", ")} WHERE b.id = $1 AND b.owner_id = $2 RETURNING ${columns}`, values);
  return result.rows[0] ? plain(result.rows[0]) : null;
}

// ---------- routes ----------
function fail(res: Response, error: unknown, fallback: string) {
  if (error instanceof AIError || error instanceof LimitError) return res.status(error.status).json({ error: error.message, code: error.code });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback, code: "server_error" });
}
const notFound = (res: Response) => res.status(404).json({ error: "That bot doesn't exist or isn't shared.", code: "bot_not_found" });
const param = (req: Request, name: string) => String(req.params[name] || "").slice(0, 120);

/** Routes that work without signing in. Register BEFORE requireAuth. */
export function registerPublicBotRoutes(app: Express) {
  // The share-link card (/b/:slug). Private bots only show for their owner.
  app.get("/api/public/bots/:slug", async (req, res) => {
    try {
      const bot = await getBotBySlug(param(req, "slug"));
      const viewerId = req.session?.userId ?? null;
      if (!bot || (bot.visibility === "private" && bot.ownerId !== viewerId)) return notFound(res);
      res.json(toPublicBot(bot, viewerId));
    } catch (error) { fail(res, error, "Could not load that bot."); }
  });
}

/** Signed-in routes. Register AFTER requireAuth. */
export function registerBotRoutes(app: Express) {
  app.get("/api/bots", async (req, res) => {
    try { res.json(await listOwnBots(req.user!.id)); }
    catch (error) { fail(res, error, "Could not load your bots."); }
  });

  app.get("/api/bots/options", async (req, res) => {
    try { res.json({ models: allowedModels(), defaultModel: CHAT_MODEL, usage: await usageSummary(req.user!.id) }); }
    catch (error) { fail(res, error, "Could not load bot options."); }
  });

  app.get("/api/usage", async (req, res) => {
    try { res.json(await usageSummary(req.user!.id)); }
    catch (error) { fail(res, error, "Could not load usage."); }
  });

  app.get("/api/bots/explore", async (req, res) => {
    try {
      const bots = await listPublicBots(typeof req.query.q === "string" ? req.query.q : "");
      res.json(bots.map(bot => toPublicBot(bot, req.user!.id)));
    } catch (error) { fail(res, error, "Could not load public bots."); }
  });

  app.post("/api/bots/draft-instructions", async (req, res) => {
    const parsed = z.object({
      name: z.string().trim().max(60).default(""),
      description: z.string().trim().min(3, "Describe your bot in a few words first.").max(1000, "Please keep the description under 1,000 characters."),
      current: z.string().max(8000).optional(),
    }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error), code: "invalid_input" });
    try { res.json({ instructions: await draftBotInstructions(parsed.data) }); }
    catch (error) { fail(res, error, "Could not write instructions."); }
  });

  // Owners get the full bot; others get the public card for public/unlisted bots; private = 404.
  app.get("/api/bots/:id", async (req, res) => {
    try {
      const bot = await getBotById(param(req, "id"));
      if (!bot || !canChatWith(bot, req.user!.id)) return notFound(res);
      if (bot.ownerId === req.user!.id) return res.json({ ...bot, isOwner: true });
      res.json(toPublicBot(bot, req.user!.id));
    } catch (error) { fail(res, error, "Could not load that bot."); }
  });

  app.post("/api/bots", async (req, res) => {
    const parsed = createBotInput.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error), code: "invalid_input" });
    try {
      await assertCanCreateBot(req.user!.id);
      res.status(201).json(await insertBot(req.user!.id, parsed.data));
    } catch (error) { fail(res, error, "Could not create the bot."); }
  });

  const ownerOnly = async (req: Request, res: Response) => {
    const bot = await getBotById(param(req, "id"));
    if (!bot || !canChatWith(bot, req.user!.id)) { notFound(res); return null; }
    if (bot.ownerId !== req.user!.id) { res.status(403).json({ error: "Only the bot's creator can change it.", code: "not_owner" }); return null; }
    return bot;
  };

  app.patch("/api/bots/:id", async (req, res) => {
    const parsed = updateBotInput.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error), code: "invalid_input" });
    try {
      if (!await ownerOnly(req, res)) return;
      const bot = await updateBot(req.user!.id, param(req, "id"), parsed.data);
      if (!bot) return notFound(res);
      res.json(bot);
    } catch (error) { fail(res, error, "Could not save the bot."); }
  });

  app.delete("/api/bots/:id", async (req, res) => {
    try {
      if (!await ownerOnly(req, res)) return;
      await pool.query(`DELETE FROM bertha_bots WHERE id = $1 AND owner_id = $2`, [param(req, "id"), req.user!.id]);
      res.json({ success: true });
    } catch (error) { fail(res, error, "Could not delete the bot."); }
  });

  app.post("/api/bots/:id/duplicate", async (req, res) => {
    try {
      const bot = await ownerOnly(req, res);
      if (!bot) return;
      await assertCanCreateBot(req.user!.id);
      const copy = await insertBot(req.user!.id, {
        name: `${bot.name} (copy)`.slice(0, 60), description: bot.description, instructions: bot.instructions, greeting: bot.greeting,
        avatarEmoji: bot.avatarEmoji, avatarUrl: bot.avatarUrl, voiceName: bot.voiceName, voiceRate: Number(bot.voiceRate),
        voicePitch: Number(bot.voicePitch), model: bot.model, visibility: "private", showInstructions: bot.showInstructions,
      });
      res.status(201).json(copy);
    } catch (error) { fail(res, error, "Could not duplicate the bot."); }
  });

  // Makes a new share link; the old /b/<slug> link stops working.
  app.post("/api/bots/:id/new-link", async (req, res) => {
    try {
      const bot = await ownerOnly(req, res);
      if (!bot) return;
      const result = await pool.query(
        `UPDATE bertha_bots AS b SET slug = $3, updated_at = now() WHERE b.id = $1 AND b.owner_id = $2 RETURNING ${columns}`,
        [bot.id, req.user!.id, makeSlug(bot.name)]);
      res.json(plain(result.rows[0]));
    } catch (error) { fail(res, error, "Could not make a new link."); }
  });
}
