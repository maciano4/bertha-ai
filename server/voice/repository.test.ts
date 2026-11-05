import { test } from "node:test";
import assert from "node:assert/strict";
import { PostgresVoiceRepository, type Sql } from "./repository";

test("recording a call inserts a row keyed by the Twilio call sid", async () => {
  const queries: { text: string; params: unknown[] }[] = [];
  const sql: Sql = {
    async query(text, params = []) {
      queries.push({ text, params });
      if (text.includes("FROM bertha_calls WHERE call_sid")) return { rows: [], rowCount: 0 };
      if (text.includes("FROM bertha_users")) return { rows: [{ id: "user-1" }], rowCount: 1 };
      if (text.includes("INSERT INTO bertha_calls")) {
        return {
          rows: [{
            id: params[0], call_sid: params[1], owner_id: params[2], from_number: params[3], to_number: params[4],
            forwarded_from: params[5], status: "ringing", started_at: "2026-11-05T15:00:00.000Z", ended_at: null,
            duration_seconds: null, transcript: "", summary: null, ai_unavailable: params[6], answering_enabled: params[7],
            sms_status: "pending", sms_error: null, fallback_played: params[8],
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const repo = new PostgresVoiceRepository(sql);
  const call = await repo.recordIncoming({
    callSid: "CA123",
    fromNumber: "+15551212000",
    toNumber: "+15557650000",
    forwardedFrom: null,
    answeringEnabled: true,
    aiUnavailable: false,
    fallbackPlayed: false,
  });
  const insert = queries.find(query => query.text.includes("INSERT INTO bertha_calls"));
  assert.ok(insert, "expected an insert");
  assert.match(insert!.text, /call_sid/);
  assert.equal(insert!.params[1], "CA123");
  assert.equal(insert!.params[3], "+15551212000");
  assert.equal(call.callSid, "CA123");
  assert.equal(call.fromNumber, "+15551212000");
  assert.equal(call.ownerId, "user-1");
  assert.equal(call.smsStatus, "pending");
});
