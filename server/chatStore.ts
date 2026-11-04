import { randomUUID } from "crypto";
import { pool } from "./db";

// Permanent, per-user conversation history (Postgres). Every read and write is scoped
// by user id, so knowing a conversation id is never enough to see someone else's chat.

export interface StoredConversation {
  id: string;
  userId: string;
  title: string;
  botId: string | null; // null = Bertha
  createdAt: string;
  updatedAt: string;
}
export interface StoredMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const conversationColumns = `id, user_id AS "userId", title, bot_id AS "botId", created_at AS "createdAt", updated_at AS "updatedAt"`;
const messageColumns = `id, conversation_id AS "conversationId", role, content, metadata, created_at AS "createdAt"`;
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function cleanTitle(title: unknown) {
  const text = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  return (text || "New conversation").slice(0, 80);
}

// The caller must check that the user may chat with botId (see getChatBot in bots.ts).
export async function createConversation(userId: string, title: unknown, botId: string | null = null): Promise<StoredConversation> {
  const result = await pool.query(
    `INSERT INTO bertha_conversations (id, user_id, title, bot_id) VALUES ($1, $2, $3, $4) RETURNING ${conversationColumns}`,
    [randomUUID(), userId, cleanTitle(title), botId],
  );
  return plain(result.rows[0]);
}

export async function getConversation(userId: string, id: string): Promise<StoredConversation | null> {
  const result = await pool.query(
    `SELECT ${conversationColumns} FROM bertha_conversations WHERE id = $1 AND user_id = $2`, [id, userId],
  );
  return result.rows[0] ? plain(result.rows[0]) : null;
}

export async function listConversations(userId: string) {
  const result = await pool.query(`
    SELECT c.id, c.user_id AS "userId", c.title, c.bot_id AS "botId", c.created_at AS "createdAt", c.updated_at AS "updatedAt",
      b.name AS "botName", b.avatar_emoji AS "botAvatarEmoji", b.avatar_url AS "botAvatarUrl",
      COALESCE(s.count, 0)::int AS "messageCount",
      COALESCE(s.last_content, '') AS "lastMessage",
      COALESCE(s.last_at, c.updated_at) AS "lastActivityAt"
    FROM bertha_conversations c
    LEFT JOIN LATERAL (
      SELECT count(*) AS count,
        (SELECT content FROM bertha_messages m2 WHERE m2.conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_content,
        max(created_at) AS last_at
      FROM bertha_messages m WHERE m.conversation_id = c.id
    ) s ON true
    LEFT JOIN bertha_bots b ON b.id = c.bot_id
    WHERE c.user_id = $1
    ORDER BY COALESCE(s.last_at, c.updated_at) DESC
    LIMIT 200`, [userId]);
  return plain(result.rows);
}

// Finds chats whose title or any message contains the words (case-insensitive), newest first,
// with a short snippet around the first match.
export async function searchConversations(userId: string, q: string) {
  const like = `%${q.replace(/[\\%_]/g, ch => "\\" + ch)}%`;
  const result = await pool.query(`
    SELECT c.id, c.user_id AS "userId", c.title, c.bot_id AS "botId", c.created_at AS "createdAt", c.updated_at AS "updatedAt",
      b.name AS "botName", b.avatar_emoji AS "botAvatarEmoji", b.avatar_url AS "botAvatarUrl",
      (SELECT count(*) FROM bertha_messages m WHERE m.conversation_id = c.id)::int AS "messageCount",
      COALESCE(hit.content, '') AS "lastMessage",
      COALESCE((SELECT max(created_at) FROM bertha_messages m WHERE m.conversation_id = c.id), c.updated_at) AS "lastActivityAt"
    FROM bertha_conversations c
    LEFT JOIN LATERAL (SELECT content FROM bertha_messages m WHERE m.conversation_id = c.id AND m.content ILIKE $2 ORDER BY created_at DESC LIMIT 1) hit ON true
    LEFT JOIN bertha_bots b ON b.id = c.bot_id
    WHERE c.user_id = $1 AND (c.title ILIKE $2 OR hit.content IS NOT NULL)
    ORDER BY "lastActivityAt" DESC LIMIT 50`, [userId, like]);
  return plain(result.rows).map((row: any) => {
    const text: string = row.lastMessage || "";
    const at = text.toLowerCase().indexOf(q.toLowerCase());
    return { ...row, snippet: at < 0 ? text.slice(0, 90) : (at > 30 ? "…" : "") + text.slice(Math.max(0, at - 30), at + q.length + 60) };
  });
}

export async function renameConversation(userId: string, id: string, title: unknown) {
  const result = await pool.query(
    `UPDATE bertha_conversations SET title = $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING ${conversationColumns}`,
    [id, userId, cleanTitle(title)],
  );
  return result.rows[0] ? plain(result.rows[0]) as StoredConversation : null;
}

export async function deleteConversation(userId: string, id: string) {
  const result = await pool.query(`DELETE FROM bertha_conversations WHERE id = $1 AND user_id = $2`, [id, userId]);
  return (result.rowCount ?? 0) > 0;
}

// Caller must have checked ownership with getConversation first.
export async function getMessages(conversationId: string, limit = 500): Promise<StoredMessage[]> {
  const result = await pool.query(
    `SELECT * FROM (SELECT ${messageColumns} FROM bertha_messages WHERE conversation_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2) recent ORDER BY "createdAt" ASC`,
    [conversationId, limit],
  );
  return plain(result.rows);
}

export async function addMessage(conversationId: string, role: StoredMessage["role"], content: string, metadata: Record<string, unknown> | null = null, at?: Date): Promise<StoredMessage> {
  const result = await pool.query(
    `INSERT INTO bertha_messages (id, conversation_id, role, content, metadata, created_at) VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now())) RETURNING ${messageColumns}`,
    [randomUUID(), conversationId, role, content, metadata ? JSON.stringify(metadata) : null, at ? at.toISOString() : null],
  );
  await pool.query(`UPDATE bertha_conversations SET updated_at = now() WHERE id = $1`, [conversationId]);
  return plain(result.rows[0]);
}

// Saves one user turn and Bertha's answer, a few milliseconds apart so their order is stable.
// `at` back-dates the pair to when the user sent it, so an interrupted reply saved late still
// sorts before the message that interrupted it.
export async function saveExchange(conversationId: string | null | undefined, userText: string, reply: string, metadata: Record<string, unknown> | null = null, at?: Date) {
  if (!conversationId) return;
  await addMessage(conversationId, "user", userText, null, at);
  await addMessage(conversationId, "assistant", reply, metadata, at ? new Date(at.getTime() + 1) : undefined);
}
