import { pool } from "./db";

// Additive, idempotent setup for the Stage 1 + Stage 2 tables. Mirrors shared/schema.ts exactly
// (names of constraints and indexes included) so `npm run db:push` sees no changes.
export async function ensurePlatformTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bertha_users (
    id text PRIMARY KEY,
    email text NOT NULL,
    password_hash text NOT NULL,
    display_name text,
    time_zone text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT bertha_users_email_unique UNIQUE (email)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bertha_conversations (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT bertha_conversations_user_id_bertha_users_id_fk
      FOREIGN KEY (user_id) REFERENCES bertha_users(id) ON DELETE CASCADE
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS bertha_conversations_user_updated
    ON bertha_conversations USING btree (user_id, updated_at)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bertha_messages (
    id text PRIMARY KEY,
    conversation_id text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT bertha_messages_conversation_id_bertha_conversations_id_fk
      FOREIGN KEY (conversation_id) REFERENCES bertha_conversations(id) ON DELETE CASCADE
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS bertha_messages_conversation_created
    ON bertha_messages USING btree (conversation_id, created_at)`);

  // ---- Stage 2: custom bots, plan groundwork, usage counters ----
  await pool.query(`ALTER TABLE bertha_users ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bertha_bots (
    id text PRIMARY KEY,
    owner_id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    instructions text NOT NULL DEFAULT '',
    greeting text NOT NULL DEFAULT '',
    avatar_emoji text NOT NULL DEFAULT '🤖',
    avatar_url text,
    voice_name text,
    voice_rate real NOT NULL DEFAULT 1,
    voice_pitch real NOT NULL DEFAULT 1,
    model text,
    visibility text NOT NULL DEFAULT 'private',
    slug text NOT NULL,
    show_instructions boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT bertha_bots_slug_unique UNIQUE (slug),
    CONSTRAINT bertha_bots_owner_id_bertha_users_id_fk
      FOREIGN KEY (owner_id) REFERENCES bertha_users(id) ON DELETE CASCADE
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS bertha_bots_owner_updated ON bertha_bots USING btree (owner_id, updated_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS bertha_bots_visibility_updated ON bertha_bots USING btree (visibility, updated_at)`);
  await pool.query(`ALTER TABLE bertha_conversations ADD COLUMN IF NOT EXISTS bot_id text`);
  const fk = await pool.query(`SELECT 1 FROM pg_constraint WHERE conname = 'bertha_conversations_bot_id_bertha_bots_id_fk'`);
  if (!fk.rowCount) {
    await pool.query(`ALTER TABLE bertha_conversations ADD CONSTRAINT bertha_conversations_bot_id_bertha_bots_id_fk
      FOREIGN KEY (bot_id) REFERENCES bertha_bots(id) ON DELETE CASCADE`).catch(error => {
      if (!/already exists/i.test(String(error?.message))) throw error; // another instance won the race
    });
  }
  await pool.query(`CREATE INDEX IF NOT EXISTS bertha_conversations_bot ON bertha_conversations USING btree (bot_id)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bertha_usage_daily (
    user_id text NOT NULL,
    day date NOT NULL,
    messages integer NOT NULL DEFAULT 0,
    ai_messages integer NOT NULL DEFAULT 0,
    CONSTRAINT bertha_usage_daily_pk PRIMARY KEY (user_id, day),
    CONSTRAINT bertha_usage_daily_user_id_bertha_users_id_fk
      FOREIGN KEY (user_id) REFERENCES bertha_users(id) ON DELETE CASCADE
  )`);
}
