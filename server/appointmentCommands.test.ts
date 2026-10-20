import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAppointmentCommand } from "./appointmentCommands";
import { zonedDateTime } from "./appointmentDates";
import type { Appointment } from "@shared/appointments";

const now = new Date("2026-10-20T12:00:00Z");
const zone = "America/New_York";
const sample: Appointment = {
  id: "dentist-test", title: "Dentist appointment", startsAt: "2026-10-27T19:00:00.000Z",
  endAt: "2026-10-27T20:00:00.000Z", timeZone: zone,
  reminderMinutes: 30, location: null, notes: null, status: "scheduled",
  createdAt: now.toISOString(), updatedAt: now.toISOString(),
};

test("schedules next Tuesday at 3pm using the local weekday", () => {
  const result = parseAppointmentCommand("set a dentist appointment next Tuesday at 3pm", [], zone, now);
  assert.equal(result.action, "create");
  assert.equal(result.localStart, "2026-10-27T15:00");
  assert.equal(zonedDateTime(result.localStart!, zone)?.toISOString(), "2026-10-27T19:00:00.000Z");
});
test("reschedules the named appointment", () => {
  const result = parseAppointmentCommand("reschedule my dentist appointment to next Wednesday at 4pm", [sample], zone, now);
  assert.equal(result.action, "edit");
  assert.equal(result.id, sample.id);
  assert.equal(result.localStart, "2026-10-28T16:00");
});
test("cancel requires a unique appointment match", () => {
  assert.equal(parseAppointmentCommand("cancel my dentist appointment", [sample], zone, now).action, "cancel");
  assert.equal(parseAppointmentCommand("cancel my dentist appointment", [sample, { ...sample, id: "other" }], zone, now).action, "clarify");
});
test("ambiguous or missing dates and times never save", () => {
  for (const text of ["set a dentist appointment tomorrow", "set a dentist appointment at 3pm", "set a dentist appointment tomorrow at 3"]) {
    assert.equal(parseAppointmentCommand(text, [], zone, now).action, "clarify", text);
  }
});
test("past times are rejected", () => {
  assert.equal(parseAppointmentCommand("set a dentist appointment yesterday at 3pm", [], zone, now).action, "clarify");
});
test("changing only a time preserves the existing appointment date", () => {
  const result = parseAppointmentCommand("move my dentist appointment to 5pm", [sample], zone, now);
  assert.equal(result.localStart, "2026-10-27T17:00");
});
test("DST conversion rejects nonexistent times and handles winter offsets", () => {
  assert.equal(zonedDateTime("2027-03-14T02:30", zone), null);
  assert.equal(zonedDateTime("2026-11-10T15:00", zone)?.toISOString(), "2026-11-10T20:00:00.000Z");
});
test("explicit duration and reminder offsets are parsed", () => {
  const result = parseAppointmentCommand("set a dentist appointment tomorrow at 3pm for 30 minutes and remind me 15 minutes before", [], zone, now);
  assert.equal(result.action, "create");
  assert.equal(result.durationMinutes, 30);
  assert.equal(result.reminderMinutes, 15);
});
