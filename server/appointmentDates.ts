// Resolve conversational dates against the user's calendar, not the server's UTC day.
export function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const value = (name: string) => Number(parts.find(part => part.type === name)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}

export function zonedDateTime(local: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desired;
  for (let i = 0; i < 4; i++) {
    const p = localParts(new Date(candidate), timeZone);
    const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - candidate;
    candidate = desired - offset;
  }
  const p = localParts(new Date(candidate), timeZone);
  // Reject invalid dates and nonexistent wall-clock times at DST transitions.
  return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute
    ? new Date(candidate) : null;
}

export function validTimeZone(input: unknown): string {
  if (typeof input !== "string") return "America/New_York";
  try { new Intl.DateTimeFormat("en", { timeZone: input }); return input; }
  catch { return "America/New_York"; }
}

export function describeTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "long", year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}
