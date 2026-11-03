// Decides which messages the app answers itself (no AI call). Every pattern here is
// deliberately narrow: when in doubt, return "none" and let the AI answer.

// Optional lead-in: "hey Bertha,", "please", "can you", "I'd like to", "help me"...
const LEAD = String.raw`^\s*(?:(?:hey|hi|ok|okay)\s+)?(?:bertha[,\s]+)?(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:(?:i\s+(?:want|need|would\s+like|'d\s+like)\s+to|i'd\s+like\s+to|help\s+me|let's|lets)\s+)?(?:please\s+)?`;
const TAIL = String.raw`(?:[\s,]+(?:please|bertha|dear|now|right\s+now|today))*[\s?.!]*$`;
const clean = (message: string) => message.trim().replace(/[’‘]/g, "'").replace(/\s+/g, " ");

// "what did you say?", "repeat that", "say that again", "pardon?"
const REPEAT = new RegExp(String.raw`^\s*(?:(?:hey|hi)\s+)?(?:bertha[,\s]+)?(?:sorry[,\s]+|what[,?\s]+|huh[,?\s]+)?(?:what\s+did\s+you\s+(?:just\s+)?say|what\s+was\s+that|(?:can|could|would)\s+you\s+(?:please\s+)?(?:repeat|say)\s+(?:that|it|this)(?:\s+again)?|(?:can|could|would)\s+you\s+(?:please\s+)?repeat(?:\s+yourself)?|(?:please\s+)?repeat(?:\s+(?:that|it|yourself|your\s+last\s+(?:answer|message|reply)|the\s+last\s+(?:answer|message|reply|thing\s+you\s+said)))?(?:\s+again)?|(?:please\s+)?say\s+(?:that|it)\s+again|come\s+again|pardon(?:\s+me)?|i\s+(?:didn't|did\s+not|couldn't|could\s+not)\s+(?:hear|catch)\s+(?:that|you|what\s+you\s+said))${TAIL}`, "i");
export const isRepeatRequest = (message: string) => REPEAT.test(clean(message));

type TimeKind = "time" | "date" | "day" | "month" | "year";
const TIME_PATTERNS: Array<[TimeKind, RegExp]> = [
  ["time", new RegExp(String.raw`${LEAD}(?:tell\s+me\s+)?(?:what(?:'s|\s+is)\s+the\s+(?:current\s+)?time|what\s+time\s+is\s+it|what\s+time\s+it\s+is|(?:do\s+you\s+)?(?:know\s+)?what\s+time\s+it\s+is|the\s+time|current\s+time|time\s+(?:check|please))${TAIL}`, "i")],
  ["date", new RegExp(String.raw`${LEAD}(?:tell\s+me\s+)?(?:what(?:'s|\s+is)\s+(?:the\s+(?:current\s+)?date|today's\s+date|the\s+date\s+today|today)|what\s+date\s+is\s+it|what\s+(?:is\s+)?the\s+date\s+(?:is\s+it|today)|today's\s+date|the\s+date)${TAIL}`, "i")],
  ["day", new RegExp(String.raw`${LEAD}(?:tell\s+me\s+)?(?:what\s+day\s+(?:of\s+the\s+week\s+)?is\s+(?:it|today)|what(?:'s|\s+is)\s+the\s+day|which\s+day\s+is\s+(?:it|today)|what\s+day\s+it\s+is)${TAIL}`, "i")],
  ["month", new RegExp(String.raw`${LEAD}(?:what\s+month\s+is\s+it|what(?:'s|\s+is)\s+the\s+(?:current\s+)?month)${TAIL}`, "i")],
  ["year", new RegExp(String.raw`${LEAD}(?:what\s+year\s+is\s+it|what(?:'s|\s+is)\s+the\s+(?:current\s+)?year)${TAIL}`, "i")],
];

export function timeQuestionKind(message: string): TimeKind | null {
  const text = clean(message);
  if (text.length > 80) return null;
  for (const [kind, pattern] of TIME_PATTERNS) if (pattern.test(text)) return kind;
  return null;
}

// Exact answer from the server clock in the user's time zone. Null = not a time/date question.
export function answerTimeQuestion(message: string, timeZone: string, now = new Date()): string | null {
  const kind = timeQuestionKind(message);
  if (!kind) return null;
  const fmt = (options: Intl.DateTimeFormatOptions) => now.toLocaleString("en-US", { timeZone, ...options });
  const time = fmt({ hour: "numeric", minute: "2-digit", hour12: true });
  const zoneName = fmt({ timeZoneName: "short" }).split(" ").pop();
  const date = fmt({ weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (kind === "time") return `It's ${time} (${zoneName}) on ${date}.`;
  if (kind === "date") return `Today is ${date}.`;
  if (kind === "day") return `Today is ${fmt({ weekday: "long" })}, ${fmt({ month: "long", day: "numeric", year: "numeric" })}.`;
  if (kind === "month") return `It's ${fmt({ month: "long", year: "numeric" })}.`;
  return `It's ${fmt({ year: "numeric" })}.`;
}

// Simple arithmetic: "what is 12 times 7", "15 + 27", "calculate (3+4)*2", "what's 20% of 85".
export function answerArithmetic(message: string): string | null {
  let text = clean(message).toLowerCase();
  const lead = /^(?:(?:hey|hi)\s+)?(?:bertha[,\s]+)?(?:please\s+)?(?:(?:can|could)\s+you\s+(?:please\s+)?)?(?:tell\s+me\s+)?(?:what(?:'s|\s+is)|how\s+much\s+is|calculate|compute|work\s+out)\s+/;
  const hadLead = lead.test(text);
  text = text.replace(lead, "").replace(/[?!.\s]+$/, "").replace(/=\s*$/, "").trim();
  const percent = /^(-?\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(-?\d+(?:\.\d+)?)$/.exec(text);
  if (percent) return `${percent[1]}% of ${percent[2]} is ${format((Number(percent[1]) / 100) * Number(percent[2]))}.`;
  const expression = text
    .replace(/\bmultiplied\s+by\b|\btimes\b|×|\bx\b/g, "*")
    .replace(/\bdivided\s+by\b|÷|\bover\b/g, "/")
    .replace(/\bplus\b/g, "+").replace(/\bminus\b/g, "-")
    .replace(/\bto\s+the\s+power\s+of\b/g, "^").replace(/\bsquared\b/g, "^2").replace(/\bcubed\b/g, "^3")
    .replace(/,(?=\d{3}\b)/g, "").replace(/\s+/g, "");
  if (!/^[\d.+\-*/^()]+$/.test(expression) || !/\d[^\d.]*[+\-*/^][^\d.]*[\d(]|[\d)]\^/.test(expression)) return null;
  if (!hadLead && !/^[\d(-]/.test(expression)) return null;
  const value = evaluate(expression);
  if (value === null) return null;
  if (!Number.isFinite(value)) return "That can't be calculated (it divides by zero).";
  return `${prettyExpression(expression)} = ${format(value)}`;
}

const prettyExpression = (expression: string) => expression.replace(/([+\-*/^])/g, " $1 ").replace(/\*/g, "×").replace(/\//g, "÷").replace(/\(\s+-\s+/g, "(-").replace(/^\s*-\s+/, "-").replace(/\s+/g, " ").trim();
function format(value: number) {
  const rounded = Math.round(value * 1e10) / 1e10;
  return Math.abs(rounded) >= 1e15 ? rounded.toExponential(6) : rounded.toLocaleString("en-US", { maximumFractionDigits: 10 });
}

// Small recursive-descent evaluator: + - * / ^ and parentheses. No eval().
function evaluate(source: string): number | null {
  let pos = 0;
  const peek = () => source[pos];
  const number = (): number | null => {
    const match = /^\d+(?:\.\d+)?|^\.\d+/.exec(source.slice(pos));
    if (!match) return null;
    pos += match[0].length;
    return Number(match[0]);
  };
  const primary = (): number | null => {
    if (peek() === "-") { pos++; const v = primary(); return v === null ? null : -v; }
    if (peek() === "+") { pos++; return primary(); }
    if (peek() === "(") {
      pos++;
      const v = sum();
      if (v === null || peek() !== ")") return null;
      pos++;
      return v;
    }
    return number();
  };
  const power = (): number | null => {
    const base = primary();
    if (base === null) return null;
    if (peek() === "^") { pos++; const exp = power(); return exp === null || Math.abs(exp) > 1000 ? null : Math.pow(base, exp); }
    return base;
  };
  const product = (): number | null => {
    let v = power();
    while (v !== null && (peek() === "*" || peek() === "/")) {
      const op = source[pos++];
      const right = power();
      if (right === null) return null;
      v = op === "*" ? v * right : v / right;
    }
    return v;
  };
  const sum = (): number | null => {
    let v = product();
    while (v !== null && (peek() === "+" || peek() === "-")) {
      const op = source[pos++];
      const right = product();
      if (right === null) return null;
      v = op === "+" ? v + right : v - right;
    }
    return v;
  };
  if (source.length > 120) return null;
  const result = sum();
  return result !== null && pos === source.length ? result : null;
}

// ---- Appointments and reminders ----

const NOUN = String.raw`appointments?|appt|meetings?|visits?|check-?ups?|consultations?|sessions?|interviews?|reservations?|lessons?|classes|class|haircuts?|events?|calls?|conferences?|surgery|therapy|treatments?`;
const LIST_NOUN = String.raw`appointments?|appts|meetings?|reminders?|schedule|calendar|agenda|plans`;
const PROVIDER = String.raw`dentist|doctor|doctor's|dr\.?|gp|physio|physiotherapist|therapist|vet|optician|eye\s+doctor|hairdresser|barber|nurse|clinic|hospital|surgeon|specialist|chiropractor|dermatologist`;

// "set a dentist appointment next Tuesday at 3pm", "book a doctor's visit tomorrow at 9am",
// "schedule a meeting with Ana on Friday at 2pm", "add an appointment ...".
const CREATE = new RegExp(String.raw`${LEAD}(?:set\s+up|set|schedule|book|add|create|make|arrange|put(?:\s+in)?)\s+(?:me\s+)?(?:(?:an?|my|the|new|another)\s+)*(?:[\w'.-]+\s+){0,4}?(?:${NOUN})\b`, "i");
const CREATE_STRONG = new RegExp(String.raw`${LEAD}(?:set\s+up|schedule|book|arrange)\s+(?:me\s+)?(?:(?:an?|my|the|new|another)\s+)*(?:[\w'.-]+\s+){0,4}?(?:${NOUN})\b`, "i");
const CREATE_CALL = new RegExp(String.raw`${LEAD}(?:set\s+up|schedule|book|arrange)\s+(?:an?\s+|my\s+|the\s+)?(?:[\w'.-]+\s+){0,2}?(?:call|video\s+call|phone\s+call|zoom)\b`, "i");
// A date or time somewhere in the message ("tomorrow", "on Friday", "at 3pm", "next week").
const TIME_CUE = /\b(?:today|tonight|tomorrow|(?:next|this)\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|the\s+\d{1,2}(?:st|nd|rd|th)?)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}|\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|at\s+\d{1,2}(?::\d{2})?|noon|midnight|in\s+\d+\s+(?:minutes?|hours?|days?))\b/i;
// "schedule the dentist tomorrow at 3pm" / "book the vet on Friday at 10am" (needs a time; checked later)
const CREATE_PROVIDER = new RegExp(String.raw`${LEAD}(?:schedule|book)\s+(?:(?:an?|my|the)\s+)?(?:${PROVIDER})\b`, "i");
const EDIT = new RegExp(String.raw`${LEAD}(?:reschedule|postpone|move|change|edit|update|push\s+back|bring\s+forward)\s+(?:my|the|our|an?|that)\b`, "i");
const RESCHEDULE = new RegExp(String.raw`${LEAD}(?:reschedule|postpone)\b`, "i");
const CANCEL = new RegExp(String.raw`${LEAD}(?:cancel|delete|remove|call\s+off|drop)\s+(?:my|the|our|an?|that)\b`, "i");
const HAS_NOUN = new RegExp(String.raw`\b(?:${NOUN})\b`, "i");

// "what are my appointments", "show my schedule", "do I have any appointments this week",
// "what's on my calendar", "when is my dentist appointment", "any meetings tomorrow?".
const LIST = [
  new RegExp(String.raw`${LEAD}(?:list|show|read|give|tell)\s+(?:me\s+)?(?:all\s+)?(?:of\s+)?(?:my|the|our|any|upcoming)\s+(?:upcoming\s+|next\s+|saved\s+|scheduled\s+)?(?:${LIST_NOUN})\b`, "i"),
  new RegExp(String.raw`${LEAD}what(?:'s|\s+is|\s+are|\s+do\s+i\s+have)\s+(?:on\s+)?(?:my|our)\s+(?:upcoming\s+|next\s+)?(?:${LIST_NOUN}|(?:${PROVIDER})\s+(?:${NOUN}))\b`, "i"),
  new RegExp(String.raw`${LEAD}(?:do|have)\s+i\s+(?:have|got)\s+(?:any|an?|my)\s+(?:upcoming\s+)?(?:(?:${PROVIDER})\s+)?(?:${NOUN}|reminders?|plans)\b`, "i"),
  new RegExp(String.raw`${LEAD}when(?:'s|\s+is|\s+are)\s+my\s+(?:next\s+)?(?:[\w'.-]+\s+){0,3}?(?:${NOUN}|reminders?)\b`, "i"),
  new RegExp(String.raw`^\s*(?:any|upcoming|my)\s+(?:upcoming\s+)?(?:${LIST_NOUN})\b[^?]{0,30}\??\s*$`, "i"),
  new RegExp(String.raw`${LEAD}remind\s+me\s+(?:of|about)\s+(?:my|all\s+my)\s+(?:upcoming\s+)?(?:${LIST_NOUN})\b`, "i"),
  new RegExp(String.raw`${LEAD}what(?:'s|\s+is)\s+(?:coming\s+up|on\s+(?:the\s+)?(?:agenda|calendar|schedule))\b`, "i"),
];

export type AppointmentIntent = "create" | "edit" | "cancel" | "list" | "none";

// upcomingTitles lets "move the dentist to 5pm" match a saved title without the word "appointment".
export function appointmentIntent(message: string, upcomingTitles: string[] = []): AppointmentIntent {
  const text = clean(message);
  if (!text || text.length > 300 || isRepeatRequest(text) || timeQuestionKind(text)) return "none";
  if (/^\s*(?:(?:hey|hi)\s+)?(?:bertha[,\s]+)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:help\s+me\s+)?(?:write|draft|compose|rewrite|reword|proofread|polish|translate|explain|summari[sz]e)\b/i.test(text)) return "none";
  if (/\b(?:how\s+(?:do|can|should)\s+i|how\s+to|what\s+should\s+i\s+say|tips?\s+(?:for|on)|ideas?\s+for)\b/i.test(text)) return "none";
  if (LIST.some(pattern => pattern.test(text))) return "list";
  const mentionsSaved = (value: string) => {
    const lower = value.toLowerCase();
    return upcomingTitles.some(title => {
      const words = title.toLowerCase().replace(/\b(appointment|meeting|reminder)\b/g, "").match(/[a-z0-9\u00c0-\u024f]{3,}/g) || [];
      return words.some(word => new RegExp(String.raw`\b${word}\b`).test(lower));
    });
  };
  if (CANCEL.test(text) && (HAS_NOUN.test(text) || mentionsSaved(text))) return "cancel";
  if (RESCHEDULE.test(text) || (EDIT.test(text) && (HAS_NOUN.test(text) || mentionsSaved(text)))) return "edit";
  if (CREATE_STRONG.test(text) || CREATE_PROVIDER.test(text) || CREATE_CALL.test(text)) return "create";
  if (CREATE.test(text) && (/\b(?:appointments?|appt)\b/i.test(text) || TIME_CUE.test(text))) return "create";
  return "none";
}

// Reminder creation: "remind me to call Mom at 5pm", "set a reminder for 9am to water the plants".
// "remind me what you said" / "remind me how to..." are questions for the AI.
export function isReminderRequest(message: string): boolean {
  const text = clean(message);
  if (!new RegExp(String.raw`${LEAD}(?:remind\s+me\b|set\s+(?:a|an|me\s+a)\s+reminder\b|add\s+a\s+reminder\b|create\s+a\s+reminder\b)`, "i").test(text)) return false;
  if (/\bremind\s+me\s+(?:what|how|who|why|where|which|whether|if|of\s+what|about\s+what|again\s+what)\b/i.test(text)) return false;
  if (/\bremind\s+me\s+(?:of|about)\s+(?:my|all\s+my)\s+(?:upcoming\s+)?(?:appointments?|meetings?|reminders?|schedule|calendar)\b/i.test(text)) return false;
  return true;
}
