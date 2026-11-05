import { randomUUID } from "crypto";
import type { CallRecord, IncomingCallInput, SmsStatus, VoiceRepository, VoiceSettings } from "./types";

export interface Sql {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

const CALL_COLUMNS = `id, call_sid, owner_id, from_number, to_number, forwarded_from, status, started_at, ended_at,
  duration_seconds, transcript, summary, ai_unavailable, answering_enabled, sms_status, sms_error, fallback_played`;

function asBool(value: unknown, fallback = false) {
  if (value === true || value === "t" || value === "true") return true;
  if (value === false || value === "f" || value === "false") return false;
  return fallback;
}

function asIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function mapCall(row: any): CallRecord {
  return {
    id: String(row.id),
    callSid: String(row.call_sid),
    ownerId: row.owner_id ? String(row.owner_id) : null,
    fromNumber: String(row.from_number || ""),
    toNumber: row.to_number ? String(row.to_number) : null,
    forwardedFrom: row.forwarded_from ? String(row.forwarded_from) : null,
    status: String(row.status || "ringing"),
    startedAt: asIso(row.started_at),
    endedAt: row.ended_at ? asIso(row.ended_at) : null,
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    transcript: String(row.transcript || ""),
    summary: row.summary ? String(row.summary) : null,
    aiUnavailable: asBool(row.ai_unavailable),
    answeringEnabled: asBool(row.answering_enabled, true),
    smsStatus: (row.sms_status || "pending") as SmsStatus,
    smsError: row.sms_error ? String(row.sms_error) : null,
    fallbackPlayed: asBool(row.fallback_played),
  };
}

function mapSettings(row: any): VoiceSettings {
  return {
    userId: String(row.user_id),
    answeringEnabled: asBool(row.answering_enabled, true),
    greeting: row.greeting ? String(row.greeting) : null,
    availabilityNote: row.availability_note ? String(row.availability_note) : null,
  };
}

export class PostgresVoiceRepository implements VoiceRepository {
  constructor(private sql: Sql) {}

  async ownerUserId() {
    const email = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
    if (email) {
      const result = await this.sql.query(`SELECT id FROM bertha_users WHERE lower(email) = $1 LIMIT 1`, [email]);
      return result.rows[0]?.id ? String(result.rows[0].id) : null;
    }
    const result = await this.sql.query(`SELECT id FROM bertha_users ORDER BY created_at ASC LIMIT 1`);
    return result.rows[0]?.id ? String(result.rows[0].id) : null;
  }

  async isOwner(userId: string) {
    const owner = await this.ownerUserId();
    return !!owner && owner === userId;
  }

  async getSettings() {
    const owner = await this.ownerUserId();
    if (!owner) return null;
    const result = await this.sql.query(
      `SELECT user_id, answering_enabled, greeting, availability_note FROM bertha_voice_settings WHERE user_id = $1`,
      [owner],
    );
    if (!result.rows[0]) return { userId: owner, answeringEnabled: true, greeting: null, availabilityNote: null };
    return mapSettings(result.rows[0]);
  }

  async saveSettings(userId: string, patch: { answeringEnabled?: boolean; greeting?: string | null; availabilityNote?: string | null }) {
    if (!await this.isOwner(userId)) throw new Error("not owner");
    const current = await this.getSettings();
    const answeringEnabled = patch.answeringEnabled ?? current?.answeringEnabled ?? true;
    const greeting = patch.greeting === undefined ? current?.greeting ?? null : patch.greeting;
    const availabilityNote = patch.availabilityNote === undefined ? current?.availabilityNote ?? null : patch.availabilityNote;
    const result = await this.sql.query(
      `INSERT INTO bertha_voice_settings (user_id, answering_enabled, greeting, availability_note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         answering_enabled = EXCLUDED.answering_enabled,
         greeting = EXCLUDED.greeting,
         availability_note = EXCLUDED.availability_note,
         updated_at = now()
       RETURNING user_id, answering_enabled, greeting, availability_note`,
      [userId, answeringEnabled, greeting, availabilityNote],
    );
    return mapSettings(result.rows[0]);
  }

  private async one(text: string, params: unknown[]) {
    const result = await this.sql.query(text, params);
    return result.rows[0] ? mapCall(result.rows[0]) : null;
  }

  async recordIncoming(input: IncomingCallInput) {
    const existing = await this.getBySid(input.callSid);
    if (existing) return existing;
    const ownerId = await this.ownerUserId();
    const created = await this.one(
      `INSERT INTO bertha_calls (
         id, call_sid, owner_id, from_number, to_number, forwarded_from,
         status, transcript, ai_unavailable, answering_enabled, sms_status, fallback_played
       ) VALUES ($1, $2, $3, $4, $5, $6, 'ringing', '', $7, $8, 'pending', $9)
       ON CONFLICT (call_sid) DO UPDATE SET updated_at = now()
       RETURNING ${CALL_COLUMNS}`,
      [randomUUID(), input.callSid, ownerId, input.fromNumber, input.toNumber, input.forwardedFrom,
        input.aiUnavailable, input.answeringEnabled, input.fallbackPlayed],
    );
    if (!created) throw new Error("Could not save the call");
    return created;
  }

  getBySid(callSid: string) {
    return this.one(`SELECT ${CALL_COLUMNS} FROM bertha_calls WHERE call_sid = $1`, [callSid]);
  }

  async saveTranscript(callSid: string, transcript: string) {
    await this.sql.query(`UPDATE bertha_calls SET transcript = $2, updated_at = now() WHERE call_sid = $1`, [callSid, transcript]);
  }

  async saveDuration(callSid: string, durationSeconds: number) {
    await this.sql.query(`UPDATE bertha_calls SET duration_seconds = $2, updated_at = now() WHERE call_sid = $1`, [callSid, durationSeconds]);
  }

  async markInProgress(callSid: string) {
    await this.sql.query(`UPDATE bertha_calls SET status = 'in-progress', updated_at = now() WHERE call_sid = $1 AND status = 'ringing'`, [callSid]);
  }

  async markAiUnavailable(callSid: string) {
    await this.sql.query(`UPDATE bertha_calls SET ai_unavailable = true, updated_at = now() WHERE call_sid = $1`, [callSid]);
  }

  async markFallbackPlayed(callSid: string) {
    await this.sql.query(`UPDATE bertha_calls SET fallback_played = true, updated_at = now() WHERE call_sid = $1`, [callSid]);
  }

  claimSms(callSid: string) {
    return this.one(
      `UPDATE bertha_calls SET sms_status = 'sending', updated_at = now()
       WHERE call_sid = $1 AND sms_status IN ('pending', 'failed')
       RETURNING ${CALL_COLUMNS}`,
      [callSid],
    );
  }

  async completeSms(callSid: string, fields: { summary: string; smsStatus: SmsStatus; smsError: string | null; durationSeconds: number | null; transcript: string; status: string }) {
    await this.sql.query(
      `UPDATE bertha_calls SET status = $2, ended_at = COALESCE(ended_at, now()), duration_seconds = $3,
         transcript = $4, summary = $5, sms_status = $6, sms_error = $7, updated_at = now()
       WHERE call_sid = $1`,
      [callSid, fields.status, fields.durationSeconds, fields.transcript, fields.summary, fields.smsStatus, fields.smsError],
    );
  }

  async listForOwner(userId: string) {
    if (!await this.isOwner(userId)) return [];
    await this.sql.query(`UPDATE bertha_calls SET owner_id = $1 WHERE owner_id IS NULL`, [userId]);
    const result = await this.sql.query(
      `SELECT ${CALL_COLUMNS} FROM bertha_calls WHERE owner_id = $1 ORDER BY started_at DESC LIMIT 50`,
      [userId],
    );
    return result.rows.map(mapCall);
  }
}

/** In-memory store for API tests. Production uses PostgresVoiceRepository. */
export class MemoryVoiceRepository implements VoiceRepository {
  private calls = new Map<string, CallRecord>();
  private settings = new Map<string, VoiceSettings>();

  constructor(public ownerId: string | null = "owner-1") {}

  async ownerUserId() { return this.ownerId; }
  async isOwner(userId: string) { return !!this.ownerId && this.ownerId === userId; }

  async getSettings() {
    if (!this.ownerId) return null;
    return this.settings.get(this.ownerId) || { userId: this.ownerId, answeringEnabled: true, greeting: null, availabilityNote: null };
  }

  async saveSettings(userId: string, patch: { answeringEnabled?: boolean; greeting?: string | null; availabilityNote?: string | null }) {
    if (!await this.isOwner(userId)) throw new Error("not owner");
    const current = await this.getSettings();
    const next: VoiceSettings = {
      userId,
      answeringEnabled: patch.answeringEnabled ?? current?.answeringEnabled ?? true,
      greeting: patch.greeting === undefined ? current?.greeting ?? null : patch.greeting,
      availabilityNote: patch.availabilityNote === undefined ? current?.availabilityNote ?? null : patch.availabilityNote,
    };
    this.settings.set(userId, next);
    return next;
  }

  async recordIncoming(input: IncomingCallInput) {
    const existing = this.calls.get(input.callSid);
    if (existing) return { ...existing };
    const call: CallRecord = {
      id: randomUUID(),
      callSid: input.callSid,
      ownerId: this.ownerId,
      fromNumber: input.fromNumber,
      toNumber: input.toNumber,
      forwardedFrom: input.forwardedFrom,
      status: "ringing",
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationSeconds: null,
      transcript: "",
      summary: null,
      aiUnavailable: input.aiUnavailable,
      answeringEnabled: input.answeringEnabled,
      smsStatus: "pending",
      smsError: null,
      fallbackPlayed: input.fallbackPlayed,
    };
    this.calls.set(call.callSid, call);
    return { ...call };
  }

  async getBySid(callSid: string) {
    const call = this.calls.get(callSid);
    return call ? { ...call } : null;
  }

  async saveTranscript(callSid: string, transcript: string) {
    const call = this.calls.get(callSid);
    if (call) call.transcript = transcript;
  }

  async saveDuration(callSid: string, durationSeconds: number) {
    const call = this.calls.get(callSid);
    if (call) call.durationSeconds = durationSeconds;
  }

  async markInProgress(callSid: string) {
    const call = this.calls.get(callSid);
    if (call && call.status === "ringing") call.status = "in-progress";
  }

  async markAiUnavailable(callSid: string) {
    const call = this.calls.get(callSid);
    if (call) call.aiUnavailable = true;
  }

  async markFallbackPlayed(callSid: string) {
    const call = this.calls.get(callSid);
    if (call) call.fallbackPlayed = true;
  }

  async claimSms(callSid: string) {
    const call = this.calls.get(callSid);
    if (!call || (call.smsStatus !== "pending" && call.smsStatus !== "failed")) return null;
    call.smsStatus = "sending";
    return { ...call };
  }

  async completeSms(callSid: string, fields: { summary: string; smsStatus: SmsStatus; smsError: string | null; durationSeconds: number | null; transcript: string; status: string }) {
    const call = this.calls.get(callSid);
    if (!call) return;
    call.status = fields.status;
    call.endedAt = call.endedAt || new Date().toISOString();
    call.durationSeconds = fields.durationSeconds;
    call.transcript = fields.transcript;
    call.summary = fields.summary;
    call.smsStatus = fields.smsStatus;
    call.smsError = fields.smsError;
  }

  async listForOwner(userId: string) {
    if (!await this.isOwner(userId)) return [];
    const calls = Array.from(this.calls.values());
    for (const call of calls) if (!call.ownerId) call.ownerId = userId;
    return calls
      .filter(call => call.ownerId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map(call => ({ ...call }));
  }
}
