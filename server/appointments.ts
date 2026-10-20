import type { Express } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { pool } from "./db";
import { appointmentInput, type Appointment, type AppointmentInput } from "@shared/appointments";
import { describeTime, validTimeZone, zonedDateTime } from "./appointmentDates";
import { parseAppointmentCommand } from "./appointmentCommands";

// Additive schema setup: never alters or replaces existing calendar/reminder data.
export async function ensureAppointmentsTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bertha_appointments (
    id text PRIMARY KEY,
    owner_id text NOT NULL,
    title text NOT NULL,
    starts_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    time_zone text NOT NULL,
    location text,
    notes text,
    reminder_minutes integer NOT NULL DEFAULT 30 CHECK (reminder_minutes BETWEEN 0 AND 10080),
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
    reminder_delivered_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_at > starts_at)
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS bertha_appointments_owner_start ON bertha_appointments(owner_id, starts_at)");
}

const columns = `id, title, starts_at AS "startsAt", end_at AS "endAt",
  time_zone AS "timeZone", location, notes, reminder_minutes AS "reminderMinutes", status,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export async function listAppointments(ownerId: string): Promise<Appointment[]> {
  const result = await pool.query(`SELECT ${columns} FROM bertha_appointments WHERE owner_id = $1 ORDER BY starts_at`, [ownerId]);
  return JSON.parse(JSON.stringify(result.rows));
}

function validateTimes(data: AppointmentInput) {
  if (new Date(data.endAt) <= new Date(data.startsAt)) throw new Error("The end time must be after the start time.");
  if (new Date(data.startsAt).getTime() <= Date.now()) throw new Error("Please choose a future appointment date and time.");
}

export async function saveAppointment(ownerId: string, input: unknown, id?: string): Promise<Appointment | null> {
  const data = appointmentInput.parse(input);
  validateTimes(data);
  const values = [data.title, data.startsAt, data.endAt, data.timeZone, data.location || null, data.notes || null, data.reminderMinutes, ownerId];
  const result = id
    ? await pool.query(`UPDATE bertha_appointments SET title=$1, starts_at=$2, end_at=$3, time_zone=$4,
        location=$5, notes=$6, reminder_minutes=$7,
        reminder_delivered_at=CASE WHEN starts_at <> $2::timestamptz OR reminder_minutes <> $7 THEN NULL ELSE reminder_delivered_at END,
        updated_at=now() WHERE owner_id=$8 AND id=$9 AND status='scheduled' RETURNING ${columns}`, [...values, id])
    : await pool.query(`INSERT INTO bertha_appointments
        (title, starts_at, end_at, time_zone, location, notes, reminder_minutes, owner_id, id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${columns}`, [...values, randomUUID()]);
  return result.rows[0] ? JSON.parse(JSON.stringify(result.rows[0])) : null;
}

async function cancelAppointment(ownerId: string, id: string) {
  const result = await pool.query(`UPDATE bertha_appointments SET status='cancelled', updated_at=now()
    WHERE owner_id=$1 AND id=$2 AND status='scheduled' RETURNING ${columns}`, [ownerId, id]);
  return result.rows[0];
}

export function registerAppointmentRoutes(app: Express) {
  app.get("/api/appointments", async (req, res) => {
    try { res.json(await listAppointments(req.sessionID)); }
    catch (error) { console.error("Load appointments:", error); res.status(503).json({ error: "Appointments could not be loaded. Please try again." }); }
  });
  app.post("/api/appointments", async (req, res) => {
    try { res.status(201).json(await saveAppointment(req.sessionID, req.body)); }
    catch (error) { appointmentError(res, error); }
  });
  app.patch("/api/appointments/:id", async (req, res) => {
    try {
      const existing = (await listAppointments(req.sessionID)).find(item => item.id === req.params.id && item.status === "scheduled");
      if (!existing) return res.status(404).json({ error: "Appointment not found." });
      const changes = appointmentInput.partial().parse(req.body);
      const updated = await saveAppointment(req.sessionID, { ...existing, ...changes }, existing.id);
      if (!updated) return res.status(404).json({ error: "Appointment not found." });
      res.json(updated);
    } catch (error) { appointmentError(res, error); }
  });
  app.delete("/api/appointments/:id", async (req, res) => {
    try {
      const result = await cancelAppointment(req.sessionID, req.params.id);
      if (!result) return res.status(404).json({ error: "Appointment not found." });
      res.json({ ...result, status: "cancelled" });
    } catch (error) { appointmentError(res, error); }
  });
  // Poll without marking delivery; acknowledgement happens after the chat displays it.
  app.get("/api/appointments/reminders", async (req, res) => {
    try {
      const result = await pool.query(`SELECT ${columns} FROM bertha_appointments
        WHERE owner_id=$1 AND status='scheduled' AND reminder_delivered_at IS NULL
        AND starts_at - reminder_minutes * interval '1 minute' <= now() AND end_at > now()
        ORDER BY starts_at`, [req.sessionID]);
      res.json(result.rows.map(item => ({
        id: item.id,
        content: `Appointment reminder: ${item.title} is ${new Date(item.startsAt) <= new Date() ? "starting now or in progress" : "coming up"} — ${describeTime(item.startsAt, item.timeZone)}${item.location ? ` at ${item.location}` : ""}.`,
      })));
    } catch (error) { console.error("Appointment reminders:", error); res.status(503).json({ error: "Could not check appointment reminders." }); }
  });
  app.post("/api/appointments/:id/reminder-ack", async (req, res) => {
    try {
      const result = await pool.query(`UPDATE bertha_appointments SET reminder_delivered_at=now()
        WHERE id=$1 AND owner_id=$2 AND status='scheduled' AND reminder_delivered_at IS NULL RETURNING id`,
      [req.params.id, req.sessionID]);
      res.json({ acknowledged: result.rowCount === 1 });
    } catch (error) { appointmentError(res, error); }
  });
}

function appointmentError(res: import("express").Response, error: unknown) {
  if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(issue => issue.message).join(" ") });
  if (error instanceof Error && /^The end time|^Please choose/.test(error.message)) return res.status(400).json({ error: error.message });
  console.error("Appointment save:", error);
  return res.status(503).json({ error: "Your appointment could not be saved. Please try again." });
}

export async function handleAppointmentChat(message: string, ownerId: string, requestedZone: unknown): Promise<string | null> {
  // Leave the normal assistant and its existing reminder/planning paths untouched.
  if (!/\b(appointment|appointments|schedule|reschedule|book|booking|calendar|meeting|meetings|date|dates|dentist|doctor|cancel|move|change|edit)\b/i.test(message)) return null;
  const timeZone = validTimeZone(requestedZone);
  const all = await listAppointments(ownerId);
  const upcoming = all.filter(item => item.status === "scheduled" && new Date(item.endAt).getTime() > Date.now());
  if (/^(?:(?:please\s+)?(?:list|show|what|when|do i have)|upcoming)/i.test(message) &&
      /\b(appointments?|schedule|calendar|meetings?|dates?)\b/i.test(message)) {
    return upcoming.length
      ? `Here are your upcoming appointments:\n${upcoming.map(item => `• ${item.title} — ${describeTime(item.startsAt, item.timeZone)}${item.location ? `, ${item.location}` : ""}`).join("\n")}`
      : "You have no upcoming appointments. Tell me something like “set a dentist appointment next Tuesday at 3pm” to add one.";
  }
  const command = parseAppointmentCommand(message, upcoming, timeZone);
  if (command.action === "none") return null;
  if (command.action === "clarify") return command.question || "Which appointment, date, and time do you mean?";
  if (command.action === "list") return upcoming.length
    ? upcoming.map(item => `${item.title} — ${describeTime(item.startsAt, item.timeZone)}`).join("\n")
    : "You have no upcoming appointments.";
  const existing = upcoming.find(item => item.id === command.id);
  if ((command.action === "edit" || command.action === "cancel") && !existing) {
    return "I couldn't identify that appointment. Please give its name and date, or select it in Appointments. I haven't changed anything.";
  }
  if (command.action === "cancel" && existing) {
    const cancelled = await cancelAppointment(ownerId, existing.id);
    return cancelled ? `Cancelled ${existing.title} on ${describeTime(existing.startsAt, existing.timeZone)}. I won't remind you about it.` : "That appointment was already changed. Please check Appointments.";
  }
  const startsAt = command.localStart ? zonedDateTime(command.localStart, timeZone) : existing ? new Date(existing.startsAt) : null;
  if (!startsAt || !Number.isFinite(startsAt.getTime())) return "What date and time should I use? Please include am or pm. I haven't saved anything yet.";
  const duration = command.durationMinutes ?? (existing ? (new Date(existing.endAt).getTime() - new Date(existing.startsAt).getTime()) / 60000 : 60);
  const input = {
    title: command.title ?? existing?.title ?? "Appointment",
    startsAt: startsAt.toISOString(),
    endAt: new Date(startsAt.getTime() + duration * 60000).toISOString(),
    timeZone,
    location: command.location ?? existing?.location ?? null,
    notes: command.notes ?? existing?.notes ?? null,
    reminderMinutes: command.reminderMinutes ?? existing?.reminderMinutes ?? 30,
  };
  try {
    const saved = await saveAppointment(ownerId, input, existing?.id);
    if (!saved) return "That appointment is no longer available. Please check the Appointments view.";
    return `${existing ? "Updated" : "Saved"}: ${saved.title} — ${describeTime(saved.startsAt, saved.timeZone)}${saved.location ? ` at ${saved.location}` : ""}. I'll remind you in this chat ${saved.reminderMinutes} minutes before it starts while the app is open.`;
  } catch (error) {
    if (error instanceof Error && /^Please choose|^The end/.test(error.message)) return `${error.message} I haven't saved the appointment.`;
    throw error;
  }
}
