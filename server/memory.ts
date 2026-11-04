// Durable per-user memory and follow-ups ("open loops"), so Bertha remembers earlier chats and
// gently brings back unfinished things. Tables are created at server start (no db:push needed).
import { randomUUID } from "crypto";
import type { Express } from "express";
import { pool } from "./db";
import { completeJSON } from "./openai";
import { classifyAIError } from "./aiErrors";
import { extractHeuristic, closesTask, keywords, type MemoryKind } from "./memoryExtract";
import { localParts, validTimeZone } from "./appointmentDates";
import { listAppointments } from "./appointments";

export async function ensureMemoryTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bertha_memories (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES bertha_users(id) ON DELETE CASCADE,
    kind text NOT NULL DEFAULT 'fact',
    content text NOT NULL,
    source text NOT NULL DEFAULT 'auto',
    conversation_id text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS bertha_memories_user_content ON bertha_memories (user_id, lower(content))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bertha_followups (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES bertha_users(id) ON DELETE CASCADE,
    bot_id text,
    conversation_id text,
    kind text NOT NULL,
    summary text NOT NULL,
    ref text,
    due_at timestamp with time zone,
    status text NOT NULL DEFAULT 'open',
    notified_at timestamp with time zone,
    mentioned_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS bertha_followups_user_status ON bertha_followups (user_id, status, created_at)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS bertha_followups_user_ref ON bertha_followups (user_id, ref)`);
}

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const memoryCols = `id, kind, content, source, conversation_id AS "conversationId", created_at AS "createdAt", updated_at AS "updatedAt"`;
const followCols = `id, bot_id AS "botId", conversation_id AS "conversationId", kind, summary, ref, due_at AS "dueAt", status, created_at AS "createdAt", updated_at AS "updatedAt"`;
export interface Memory { id: string; kind: MemoryKind; content: string; source: string; conversationId: string | null; createdAt: string; updatedAt: string }
export interface FollowUp { id: string; botId: string | null; conversationId: string | null; kind: "task" | "question" | "unfinished" | "appointment"; summary: string; ref: string | null; dueAt: string | null; status: string; createdAt: string; updatedAt: string }
const KINDS: MemoryKind[] = ["fact", "preference", "person", "project"];
const MAX_MEMORIES = 200;

export async function listMemories(userId: string): Promise<Memory[]> {
  return plain((await pool.query(`SELECT ${memoryCols} FROM bertha_memories WHERE user_id = $1 ORDER BY updated_at DESC LIMIT ${MAX_MEMORIES}`, [userId])).rows);
}

export async function addMemory(userId: string, kind: string, content: string, source = "auto", conversationId: string | null = null) {
  const text = content.replace(/\s+/g, " ").trim().slice(0, 200);
  if (text.length < 3) return null;
  const k = (KINDS as string[]).includes(kind) ? kind : "fact";
  // Same subject, new value ("Lives in Douala" -> "Lives in Yaoundé"): replace the old note.
  const head = /^(Their name is|Lives in|Is from|Birthday is|Their (\w+(?: \w+)?) is)\b/.exec(text)?.[0];
  if (head) await pool.query(`DELETE FROM bertha_memories WHERE user_id = $1 AND content ILIKE $2 AND lower(content) <> lower($3)`, [userId, `${head} %`, text]);
  const r = await pool.query(
    `INSERT INTO bertha_memories (id, user_id, kind, content, source, conversation_id) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, lower(content)) DO UPDATE SET updated_at = now() RETURNING ${memoryCols}`,
    [randomUUID(), userId, k, text, source, conversationId]);
  await pool.query(`DELETE FROM bertha_memories WHERE user_id = $1 AND id NOT IN (SELECT id FROM bertha_memories WHERE user_id = $1 ORDER BY updated_at DESC LIMIT ${MAX_MEMORIES})`, [userId]);
  return plain(r.rows[0]) as Memory;
}

export async function addFollowUp(userId: string, f: { botId?: string | null; conversationId?: string | null; kind: FollowUp["kind"]; summary: string; ref?: string | null; dueAt?: string | null }) {
  const summary = f.summary.replace(/\s+/g, " ").trim().slice(0, 200);
  if (summary.length < 3) return null;
  // Skip near-duplicates of something already open.
  const open = await listFollowUps(userId, { status: "open" });
  const words = keywords(summary);
  if (!f.ref && open.some(o => o.summary.toLowerCase() === summary.toLowerCase() || (words.size >= 2 && closesTask(o.summary, summary) && closesTask(summary, o.summary)))) return null;
  const r = await pool.query(
    `INSERT INTO bertha_followups (id, user_id, bot_id, conversation_id, kind, summary, ref, due_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id, ref) DO NOTHING RETURNING ${followCols}`,
    [randomUUID(), userId, f.botId ?? null, f.conversationId ?? null, f.kind, summary, f.ref ?? null, f.dueAt ?? null]);
  return r.rows[0] ? plain(r.rows[0]) as FollowUp : null;
}

export async function listFollowUps(userId: string, opts: { status?: string; botId?: string | null | undefined } = {}): Promise<FollowUp[]> {
  const params: unknown[] = [userId, opts.status ?? "open"];
  let where = `user_id = $1 AND status = $2`;
  if (opts.botId !== undefined) { params.push(opts.botId); where += ` AND bot_id IS NOT DISTINCT FROM $3`; }
  return plain((await pool.query(`SELECT ${followCols} FROM bertha_followups WHERE ${where} ORDER BY COALESCE(due_at, created_at) ASC LIMIT 50`, params)).rows);
}

export async function setFollowUpStatus(userId: string, id: string, status: "open" | "done" | "dismissed") {
  const r = await pool.query(`UPDATE bertha_followups SET status = $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING ${followCols}`, [id, userId, status]);
  return r.rows[0] ? plain(r.rows[0]) as FollowUp : null;
}

// ---- learning from a turn ----
let aiMemoryDisabledUntil = 0;

// Called after each saved exchange, never awaited by the reply path. Heuristics always run;
// the AI extractor runs when a provider is available and isn't out of credits.
export async function learnFromTurn(input: { userId: string; botId: string | null; conversationId: string | null | undefined; userText: string; reply?: string; timeZone: string; aiAvailable: boolean }) {
  const { userId, botId, userText } = input;
  const conversationId = input.conversationId ?? null;
  try {
    const found = extractHeuristic(userText, input.timeZone);
    for (const m of found.memories) await addMemory(userId, m.kind, m.content, "auto", conversationId);
    const open = await listFollowUps(userId);
    for (const done of found.completed) for (const o of open) if (o.kind === "task" && closesTask(done, o.summary)) await setFollowUpStatus(userId, o.id, "done");
    for (const t of found.tasks) await addFollowUp(userId, { botId, conversationId, kind: "task", summary: t.summary, dueAt: t.dueAt });
    // The user answered or moved on, so earlier "unfinished" markers for this chat are resolved.
    if (conversationId) await pool.query(`UPDATE bertha_followups SET status = 'done', updated_at = now() WHERE user_id = $1 AND conversation_id = $2 AND kind IN ('unfinished','question') AND status = 'open' AND created_at < now() - interval '2 seconds'`, [userId, conversationId]);
  } catch (error) { console.error("[memory] heuristic step failed:", (error as Error).message); }

  if (!input.aiAvailable || process.env.BERTHA_MEMORY_AI === "0" || Date.now() < aiMemoryDisabledUntil || userText.trim().length < 12 || !input.reply) return;
  try {
    const [memories, open] = await Promise.all([listMemories(userId), listFollowUps(userId)]);
    const result = await completeJSON<{ memories?: Array<{ kind: string; content: string }>; tasks?: Array<{ summary: string }>; done?: string[] }>("memory",
      `You maintain a personal assistant's long-term memory about ONE user. From the latest exchange, extract only durable things worth remembering in future chats: facts about the user (name, family, home, work, health notes they shared), preferences, people in their life, ongoing projects/plans. Also extract tasks the user said THEY will do or must do that are not finished yet, and which existing open tasks are now done.
Rules: short third-person notes (max 15 words), e.g. "Daughter Ama lives in Paris". Nothing trivial, no one-off questions, nothing already known. Do not invent. Return JSON: {"memories":[{"kind":"fact|preference|person|project","content":"..."}],"tasks":[{"summary":"imperative, max 12 words"}],"done":["id of finished open task"]}. Use empty arrays when nothing applies.`,
      `Known memories:\n${memories.slice(0, 60).map(m => `- ${m.content}`).join("\n") || "(none)"}\n\nOpen tasks:\n${open.filter(o => o.kind === "task").map(o => `- [${o.id}] ${o.summary}`).join("\n") || "(none)"}\n\nUser said: ${userText.slice(0, 2000)}\nAssistant replied: ${(input.reply || "").slice(0, 1500)}`);
    for (const m of (result.memories || []).slice(0, 5)) if (m?.content) await addMemory(userId, m.kind, m.content, "ai", conversationId);
    for (const t of (result.tasks || []).slice(0, 3)) if (t?.summary) await addFollowUp(userId, { botId, conversationId, kind: "task", summary: t.summary });
    for (const id of result.done || []) if (open.some(o => o.id === id)) await setFollowUpStatus(userId, id, "done");
  } catch (error) {
    const kind = classifyAIError(error);
    // Don't hammer an empty/broken account from the background; chat will report it.
    if (kind === "out_of_credits" || kind === "invalid_api_key") aiMemoryDisabledUntil = Date.now() + 10 * 60_000;
    console.error(`[memory] AI extraction skipped (${kind})`);
  }
}

// A question the AI couldn't answer (no credits, outage): keep it so Bertha can come back to it.
export async function rememberUnanswered(userId: string, botId: string | null, conversationId: string | null | undefined, question: string) {
  if (!/\?\s*$|^(what|why|how|when|where|who|which|can|could|should|would|is|are|do|does|tell me|explain|write|help)\b/i.test(question.trim())) return;
  const q = question.replace(/\s+/g, " ").trim();
  await addFollowUp(userId, { botId, conversationId: conversationId ?? null, kind: "question", summary: q.length > 120 ? q.slice(0, 117) + "…" : q }).catch(() => {});
}

// ---- welcome / open loops ----
function whenPhrase(iso: string, timeZone: string, now = new Date()) {
  const t = new Date(iso);
  const a = localParts(t, timeZone), b = localParts(now, timeZone);
  const dayDiff = Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000);
  const mins = (now.getTime() - t.getTime()) / 60000;
  if (dayDiff === 0) return mins < 90 ? "A little while ago" : a.hour >= 17 ? "Earlier this evening" : "Earlier today";
  if (dayDiff === 1) return a.hour >= 18 ? "Last night" : "Yesterday";
  if (dayDiff < 7) return `On ${t.toLocaleDateString("en-US", { weekday: "long", timeZone })}`;
  return "A while back";
}

// Notices conversations that stopped mid-topic (no reply, an interrupted/failed reply, or
// Bertha's question left hanging) and stores them as follow-ups the user can dismiss.
async function syncUnfinishedConversations(userId: string) {
  const rows = (await pool.query(`
    SELECT c.id, c.title, c.bot_id AS "botId", m.role, m.content, m.metadata, m.created_at AS "at"
    FROM bertha_conversations c
    JOIN LATERAL (SELECT role, content, metadata, created_at FROM bertha_messages WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) m ON true
    WHERE c.user_id = $1 AND m.created_at > now() - interval '7 days' AND m.created_at < now() - ($2::int * interval '1 second')
    ORDER BY m.created_at DESC LIMIT 10`, [userId, Number(process.env.BERTHA_UNFINISHED_AFTER_SEC || 1200)])).rows;
  for (const r of rows) {
    const meta = r.metadata || {};
    const cutOff = r.role === "user" || meta.interrupted || meta.incomplete;
    const askedBack = r.role === "assistant" && /\?\s*$/.test(String(r.content).trim()) && !meta.appointment && !meta.isQuickResponse && !meta.isLocalAnswer && !meta.isRepeat && !meta.welcome;
    if (!cutOff && !askedBack) continue;
    await addFollowUp(userId, { botId: r.botId, conversationId: r.id, kind: "unfinished", summary: r.title, ref: `conv:${r.id}:${new Date(r.at).getTime()}` });
  }
}

async function syncAppointments(userId: string) {
  const soon = (await listAppointments(userId).catch(() => [])).filter(a => a.status === "scheduled" && new Date(a.startsAt).getTime() > Date.now() && new Date(a.startsAt).getTime() < Date.now() + 36 * 3600_000);
  for (const a of soon) await addFollowUp(userId, { botId: null, kind: "appointment", summary: a.title, ref: `appt:${a.id}:${a.startsAt}`, dueAt: a.startsAt });
  // Past appointments are no longer "coming up".
  await pool.query(`UPDATE bertha_followups SET status = 'done', updated_at = now() WHERE user_id = $1 AND kind = 'appointment' AND status = 'open' AND due_at < now()`, [userId]);
}

export function describeItem(f: FollowUp, timeZone: string, bertha: boolean) {
  const when = whenPhrase(f.createdAt, timeZone);
  const s = f.summary.replace(/[.!?…]+$/, "");
  switch (f.kind) {
    case "task": return `${when} you mentioned you needed to ${s.charAt(0).toLowerCase() + s.slice(1)}. Did you get to it?`;
    case "question": return `${when} you asked me "${s}" and I couldn't answer then. Want me to try again?`;
    case "unfinished": return `${when} we were in the middle of "${s}". Shall we pick that back up?`;
    case "appointment": {
      const at = f.dueAt ? new Date(f.dueAt).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone }) : "soon";
      return `Don't forget ${bertha ? "your" : "your"} ${s} on ${at}.`;
    }
  }
}

export async function buildWelcome(user: { id: string; displayName?: string | null }, botId: string | null, botName: string | null, tz: unknown) {
  const timeZone = validTimeZone(tz);
  await syncUnfinishedConversations(user.id).catch(e => console.error("[memory] unfinished sync failed", e.message));
  if (!botId) await syncAppointments(user.id).catch(e => console.error("[memory] appointment sync failed", e.message));
  const all = await listFollowUps(user.id, { botId });
  // Due/appointments first, then newest open loops. At most two, so it never feels like nagging.
  const ranked = all
    .filter(f => f.kind !== "appointment" || !botId)
    .sort((a, b) => (a.kind === "appointment" ? 0 : 1) - (b.kind === "appointment" ? 0 : 1) || +new Date(b.createdAt) - +new Date(a.createdAt));
  const items = ranked.slice(0, 2);
  if (items.length) await pool.query(`UPDATE bertha_followups SET mentioned_at = now() WHERE id = ANY($1)`, [items.map(i => i.id)]);
  const hour = localParts(new Date(), timeZone).hour;
  const part = hour < 5 ? "Hello" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = (user.displayName || "").trim().split(/\s+/)[0];
  const bertha = !botId;
  const hello = bertha
    ? `${part}${name ? `, ${name}` : ", my dear"}! ${items.length ? "" : ["How has your day been?", "What's on your mind today?", "It's good to hear from you. How are you?"][hour % 3]}`.trim()
    : `${part}${name ? `, ${name}` : ""}! ${items.length ? "" : `How can I help today?`}`.trim();
  const lines = items.map(f => describeItem(f, timeZone, bertha));
  const greeting = [hello, ...lines].join(" ");
  return { greeting, hello, items: items.map((f, i) => ({ ...f, text: lines[i] })), openCount: ranked.length };
}

// Short notes for the system prompt.
export async function promptContext(userId: string, botId: string | null) {
  const [memories, open] = await Promise.all([listMemories(userId), listFollowUps(userId, { botId })]);
  return {
    memories: memories.slice(0, 40).map(m => m.content),
    openLoops: open.filter(f => f.kind !== "appointment").slice(0, 5).map(f => f.kind === "task" ? `The user planned to: ${f.summary}` : f.kind === "question" ? `Unanswered earlier question: ${f.summary}` : `Unfinished earlier chat: "${f.summary}"`),
  };
}

export function registerMemoryRoutes(app: Express) {
  app.get("/api/memories", async (req, res) => {
    try { res.json(await listMemories(req.user!.id)); } catch (e) { res.status(500).json({ error: "Could not load memories." }); }
  });
  app.post("/api/memories", async (req, res) => {
    const content = typeof req.body?.content === "string" ? req.body.content : "";
    if (content.trim().length < 3 || content.length > 200) return res.status(400).json({ error: "Write the memory in 3-200 characters." });
    try { res.status(201).json(await addMemory(req.user!.id, String(req.body?.kind || "fact"), content, "user")); } catch { res.status(500).json({ error: "Could not save that." }); }
  });
  app.delete("/api/memories/:id", async (req, res) => {
    const r = await pool.query(`DELETE FROM bertha_memories WHERE id = $1 AND user_id = $2`, [req.params.id, req.user!.id]);
    r.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: "Memory not found." });
  });
  app.delete("/api/memories", async (req, res) => {
    await pool.query(`DELETE FROM bertha_memories WHERE user_id = $1`, [req.user!.id]);
    res.json({ ok: true });
  });

  app.get("/api/followups", async (req, res) => {
    const botId = typeof req.query.botId === "string" ? (req.query.botId === "bertha" ? null : req.query.botId) : undefined;
    res.json(await listFollowUps(req.user!.id, { botId }));
  });
  app.patch("/api/followups/:id", async (req, res) => {
    const status = req.body?.status;
    if (!["open", "done", "dismissed"].includes(status)) return res.status(400).json({ error: "status must be open, done or dismissed" });
    const f = await setFollowUpStatus(req.user!.id, req.params.id, status);
    f ? res.json(f) : res.status(404).json({ error: "Not found." });
  });
  // Items now due that haven't been notified yet (the client polls this for in-app notifications).
  app.get("/api/followups/due", async (req, res) => {
    const userId = req.user!.id;
    await syncAppointments(userId).catch(() => {});
    const rows = (await pool.query(`UPDATE bertha_followups SET notified_at = now() WHERE user_id = $1 AND status = 'open' AND notified_at IS NULL AND due_at IS NOT NULL AND due_at <= now() + interval '15 minutes' AND due_at > now() - interval '12 hours' RETURNING ${followCols}`, [userId])).rows;
    res.json(plain(rows));
  });
  app.get("/api/welcome", async (req, res) => {
    try {
      const botId = typeof req.query.botId === "string" && req.query.botId && req.query.botId !== "bertha" ? req.query.botId : null;
      res.json(await buildWelcome(req.user!, botId, null, req.query.timeZone || req.user!.timeZone));
    } catch (e) { console.error("welcome failed", e); res.status(500).json({ error: "Could not load the welcome." }); }
  });
}
