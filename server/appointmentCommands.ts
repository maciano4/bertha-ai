import * as chrono from "chrono-node";
import type { Appointment } from "@shared/appointments";
import { localParts, zonedDateTime } from "./appointmentDates";

export interface AppointmentCommand {
  action: "create" | "list" | "edit" | "cancel" | "clarify" | "none";
  id: string | null;
  title: string | null;
  localStart: string | null;
  durationMinutes: number | null;
  location: string | null;
  notes: string | null;
  reminderMinutes: number | null;
  question: string | null;
}

const empty: AppointmentCommand = {
  action: "none", id: null, title: null, localStart: null, durationMinutes: null,
  location: null, notes: null, reminderMinutes: null, question: null,
};
const normalize = (value: string) => value.toLowerCase()
  .replace(/\b(please|my|the|an?|appointment|appointments|meeting|booking|date|with|for)\b/g, " ")
  .replace(/[^a-z0-9\u00c0-\u024f\s]/g, " ").replace(/\s+/g, " ").trim();

export function parseAppointmentCommand(message: string, upcoming: Appointment[], timeZone: string, now = new Date()): AppointmentCommand {
  const clarify = (question: string): AppointmentCommand => ({ ...empty, action: "clarify", question });
  const isCancel = /\b(cancel|delete|remove)\b/i.test(message);
  const isEdit = /\b(reschedule|move|change|edit|update|postpone)\b/i.test(message);
  const isCreate = /\b(set|schedule|book|add|create|make|arrange)\b/i.test(message);
  if (!isCancel && !isEdit && !isCreate) return { ...empty };

  const p = localParts(now, timeZone);
  const localReference = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
  // Parse a synthetic local clock so server timezone and DST cannot shift weekdays.
  const parsed = chrono.en.parse(message, { instant: localReference, timezone: 0 }, { forwardDate: true })[0];
  let target = (parsed ? message.slice(0, parsed.index) : message)
    .replace(/^\s*(?:please\s+)?(?:can|could|would)\s+you\s+/i, "")
    .replace(/^\s*(?:please\s+)?(?:set|schedule|book|add|create|make|arrange|reschedule|move|change|edit|update|postpone|cancel|delete|remove)\s+/i, "")
    .replace(/^\s*(?:an?|my|the)\s+/i, "")
    .replace(/\s+(?:to|on|at|for|from)\s*$/i, "").trim();
  let existing: Appointment | undefined;
  if (isCancel || isEdit) {
    const normalized = normalize(target);
    const matches = upcoming.filter(item => {
      const title = normalize(item.title);
      return normalized && (title === normalized || title.includes(normalized) || normalized.includes(title));
    });
    if (matches.length !== 1) {
      return clarify(matches.length > 1
        ? `I found more than one matching appointment: ${matches.map(item => `${item.title} (${new Date(item.startsAt).toLocaleDateString("en-US", { timeZone })})`).join("; ")}. Please select the exact appointment in the Appointments view so I don't change the wrong one.`
        : "Which appointment do you mean? Please include its name, or select it in the Appointments view. I haven't changed anything.");
    }
    existing = matches[0];
    if (isCancel) return { ...empty, action: "cancel", id: existing.id };
  }

  if (!parsed) return clarify("What date and time should I use? For example, “set a dentist appointment next Tuesday at 3pm”. I haven't saved any changes.");
  const start = parsed.start;
  if (!start.isCertain("hour")) return clarify("What time should I schedule it? Please include am or pm and repeat the appointment name and date.");
  if (start.get("hour")! <= 12 && !start.isCertain("meridiem") &&
      !/\b(?:0\d:\d{2}|noon|midnight)\b/i.test(parsed.text) &&
      !/\bin\s+\d+\s+(?:minutes?|hours?)\b/i.test(parsed.text)) {
    return clarify("Is that am or pm? Please repeat the appointment name, date, and time with am or pm.");
  }
  const hasDay = start.isCertain("day") || start.isCertain("weekday") ||
    /\b(today|tomorrow|tonight|in\s+\d+\s+(?:minutes?|hours?|days?))\b/i.test(parsed.text);
  if (!hasDay && !existing) return clarify("Which day should I use? Please include a date or weekday along with the time.");
  let year = start.get("year")!, month = start.get("month")!, day = start.get("day")!;
  if (!hasDay && existing) {
    const current = localParts(new Date(existing.startsAt), timeZone);
    year = current.year; month = current.month; day = current.day;
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  const localStart = `${year}-${pad(month)}-${pad(day)}T${pad(start.get("hour")!)}:${pad(start.get("minute")!)}`;
  const instant = zonedDateTime(localStart, timeZone);
  if (!instant || instant.getTime() <= now.getTime()) {
    return clarify("That time is in the past or doesn't exist in your time zone. Please give a future date and time. I haven't changed anything.");
  }
  const durationMatch = /\bfor\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/i.exec(message);
  const reminderMatch = /\bremind\s+me\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)\s+before\b/i.exec(message);
  const minutes = (match: RegExpExecArray) => Number(match[1]) * (/^h/i.test(match[2]) ? 60 : 1);
  // Remaining text can include a location, e.g. "tomorrow at 3pm at Main Street".
  const suffix = message.slice(parsed.index + parsed.text.length);
  const location = /\b(?:at|in)\s+(.+?)(?=\s+(?:for\s+\d|and\s+remind)|$)/i.exec(suffix)?.[1]?.trim() || null;
  target = target.replace(/\s+(?:for|on|at|to)$/i, "").trim();
  if (!existing && !target) return clarify("What should I call the appointment? Please repeat its name, date, and time.");
  return {
    ...empty,
    action: existing ? "edit" : "create",
    id: existing?.id ?? null,
    title: existing ? null : target.charAt(0).toUpperCase() + target.slice(1),
    localStart,
    durationMinutes: durationMatch ? minutes(durationMatch) : null,
    reminderMinutes: reminderMatch ? minutes(reminderMatch) : null,
    location,
  };
}
