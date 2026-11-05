import { pool } from "../db";

// Kept identical to bertha_voice_settings and bertha_calls in shared/schema.ts.
export async function ensureVoiceTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bertha_voice_settings (
    user_id text PRIMARY KEY,
    answering_enabled boolean NOT NULL DEFAULT true,
    greeting text,
    availability_note text,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT bertha_voice_settings_user_id_bertha_users_id_fk
      FOREIGN KEY (user_id) REFERENCES bertha_users(id) ON DELETE CASCADE
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bertha_calls (
    id text PRIMARY KEY,
    call_sid text NOT NULL,
    owner_id text,
    from_number text NOT NULL,
    to_number text,
    forwarded_from text,
    status text NOT NULL DEFAULT 'ringing',
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    ended_at timestamp with time zone,
    duration_seconds integer,
    transcript text NOT NULL DEFAULT '',
    summary text,
    ai_unavailable boolean NOT NULL DEFAULT false,
    answering_enabled boolean NOT NULL DEFAULT true,
    sms_status text NOT NULL DEFAULT 'pending',
    sms_error text,
    fallback_played boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT bertha_calls_call_sid_unique UNIQUE (call_sid),
    CONSTRAINT bertha_calls_owner_id_bertha_users_id_fk
      FOREIGN KEY (owner_id) REFERENCES bertha_users(id) ON DELETE SET NULL
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS bertha_calls_owner_started ON bertha_calls USING btree (owner_id, started_at)`);
}
