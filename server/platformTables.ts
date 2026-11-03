import { pool } from "./db";

// Additive, idempotent setup for the Stage 1 tables. Mirrors shared/schema.ts exactly
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
}
