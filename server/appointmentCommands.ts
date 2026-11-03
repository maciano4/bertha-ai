import * as chrono from "chrono-node";
import type { Appointment } from "@shared/appointments";
import { localParts, zonedDateTime } from "./appointmentDates";
import { appointmentIntent, isReminderRequest } from "./intents";

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
  // Only clear requests ("set a dentist appointment...", "move my meeting...") reach the parser.
  const intent = appointmentIntent(message, upcoming.map(item => item.title));
  if (intent === "list") return { ...empty, action: "list" };
  if (intent !== "create" && intent !== "edit" && intent !== "cancel") return { ...empty };
  const isCancel = intent === "cancel";
  const isEdit = intent === "edit";

  const p = localParts(now, timeZone);
  const localReference = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
  // Parse a synthetic local clock so server timezone and DST cannot shift weekdays.
  const parsed = chrono.en.parse(message, { instant: localReference, timezone: 0 }, { forwardDate: true })[0];
  let target = (parsed ? message.slice(0, parsed.index) : message)
    .replace(/^\s*(?:(?:hey|hi|ok|okay)\s+)?(?:bertha[,\s]+)?/i, "")
    .replace(/^\s*(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?:(?:i\s+(?:want|need|would\s+like)\s+to|i'd\s+like\s+to|help\s+me|let's|lets)\s+)?(?:please\s+)?/i, "")
    .replace(/^\s*(?:set\s+up|push\s+back|bring\s+forward|call\s+off|put\s+in)\s+/i, "")
    .replace(/^\s*(?:please\s+)?(?:set|schedule|book|add|create|make|arrange|put|reschedule|move|change|edit|update|postpone|cancel|delete|remove|drop)\s+/i, "")
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

export type ReminderCommand =
  | { action: "none" }
  | { action: "clarify"; question: string }
  | { action: "create"; title: string; localStart: string };

// "Remind me to call Mom at 5pm", "remind me in 20 minutes to take my pills",
// "set a reminder for tomorrow at 9am to water the plants".
export function parseReminderCommand(message: string, timeZone: string, now = new Date()): ReminderCommand {
  const text = message.trim();
  if (!isReminderRequest(text)) return { action: "none" };
  if (/\b\d+\s*(?:minutes?|mins?|hours?|hrs?)\s+before\b/i.test(text)) return { action: "none" }; // appointment reminder syntax
  const p = localParts(now, timeZone);
  const localReference = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
  const parsed = chrono.en.parse(text, { instant: localReference, timezone: 0 }, { forwardDate: true })[0];
  const title = (parsed ? text.slice(0, parsed.index) + " " + text.slice(parsed.index + parsed.text.length) : text)
    .replace(/^(?:(?:hey\s+|hi\s+)?bertha[,\s]+)?(?:please\s+)?(?:can|could|would)?\s*(?:you\s+)?(?:please\s+)?/i, "")
    .replace(/^(?:remind\s+me|set\s+(?:a|an|me\s+a)\s+reminder|add\s+a\s+reminder|create\s+a\s+reminder)\s*/i, "")
    .replace(/^(?:for|at|on)\s+/i, "")
    .replace(/^(?:to|that|about)\s+/i, "")
    .replace(/\s+(?:at|on|for|by|in)\s*$/i, "")
    .replace(/[?.!]+$/, "").replace(/\s+/g, " ").trim()
    .replace(/^(?:to|that|about)\s+/i, "");
  if (!parsed) return { action: "clarify", question: `When should I remind you${title ? ` to ${title}` : ""}? For example, “remind me to call Mom tomorrow at 5pm”. I haven't saved anything yet.` };
  if (!title) return { action: "clarify", question: "What should I remind you about? For example, “remind me to take my pills at 8pm”." };
  const start = parsed.start;
  const relative = /\bin\s+\d+\s*(?:minutes?|mins?|hours?|hrs?)\b/i.test(parsed.text) || /\bin\s+(?:an?|one)\s+(?:hour|minute)\b/i.test(parsed.text);
  if (!relative && !start.isCertain("hour")) return { action: "clarify", question: `What time should I remind you to ${title}? Please include am or pm.` };
  if (!relative && start.get("hour")! <= 12 && !start.isCertain("meridiem") && !/\b(?:0\d:\d{2}|noon|midnight)\b/i.test(parsed.text)) {
    return { action: "clarify", question: `Is that am or pm? Please say it again, like “remind me to ${title} at 5pm”.` };
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  let localStart = `${start.get("year")}-${pad(start.get("month")!)}-${pad(start.get("day")!)}T${pad(start.get("hour")!)}:${pad(start.get("minute")!)}`;
  let instant = zonedDateTime(localStart, timeZone);
  const hasDay = start.isCertain("day") || start.isCertain("weekday") || /\b(today|tomorrow|tonight)\b/i.test(parsed.text);
  if (instant && instant.getTime() <= now.getTime() && !hasDay && !relative) {
    // "at 8am" when it's already 9am means tomorrow at 8am.
    const next = new Date(Date.UTC(start.get("year")!, start.get("month")! - 1, start.get("day")! + 1));
    localStart = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T${pad(start.get("hour")!)}:${pad(start.get("minute")!)}`;
    instant = zonedDateTime(localStart, timeZone);
  }
  if (!instant || instant.getTime() <= now.getTime()) return { action: "clarify", question: "That time has already passed. Please give me a future time for the reminder. I haven't saved anything yet." };
  return { action: "create", title: title.charAt(0).toUpperCase() + title.slice(1), localStart };
}
