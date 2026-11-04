// Pure, offline extraction of durable facts and open loops from what the user says.
// Runs on every message (no AI needed, so it works with no credits). The AI extractor in
// memory.ts adds richer results when an AI provider is available.
import { localParts, zonedDateTime } from "./appointmentDates";

export type MemoryKind = "fact" | "preference" | "person" | "project";
export interface ExtractedMemory { kind: MemoryKind; content: string }
export interface ExtractedTask { summary: string; dueAt: string | null }
export interface Extraction { memories: ExtractedMemory[]; tasks: ExtractedTask[]; completed: string[] }

const clean = (text: string) => text.replace(/\s+/g, " ").replace(/^[\s,;:-]+|[\s,;:.!?-]+$/g, "").trim();
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
// Second-person view of a first-person phrase ("my car" -> "their car") for memory notes.
const third = (text: string) => text.replace(/\bmy\b/gi, "their").replace(/\bI'm\b/g, "they're").replace(/\bI am\b/g, "they are").replace(/\bI\b/g, "they").replace(/\bme\b/gi, "them").replace(/\bmyself\b/gi, "themselves");
const second = (text: string) => text.replace(/\bmy\b/gi, "your").replace(/\bI'm\b/g, "you're").replace(/\bI am\b/g, "you are").replace(/\bI\b/g, "you").replace(/\bme\b/gi, "you").replace(/\bmyself\b/gi, "yourself");

const RELATIONS = "wife|husband|son|daughter|mother|mom|mum|mama|father|dad|papa|sister|brother|grandson|granddaughter|grandchild|niece|nephew|aunt|uncle|cousin|friend|best friend|boss|partner|fiancée?|girlfriend|boyfriend|neighbou?r|doctor|dog|cat|pastor";
const NAME = "([A-Z][a-zA-Z'-]{1,20}(?: [A-Z][a-zA-Z'-]{1,20})?)";

// Splits into sentences and drops questions ("should I...?") so we only learn from statements.
function statements(message: string) {
  return message.split(/(?<=[.!?\n])\s+/).map(s => s.trim()).filter(s => s && !/\?\s*$/.test(s));
}

function dueFrom(text: string, timeZone: string, now: Date): string | null {
  const p = localParts(now, timeZone);
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + dayOffset));
    const local = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00`;
    return zonedDateTime(local, timeZone)?.toISOString() ?? null;
  };
  if (/\btonight\b|\bthis evening\b/i.test(text)) return at(0, Math.max(19, p.hour + 1));
  if (/\bthis afternoon\b/i.test(text)) return at(0, Math.max(15, p.hour + 1));
  if (/\b(later today|today)\b/i.test(text)) return at(0, Math.min(21, p.hour + 3));
  if (/\btomorrow morning\b/i.test(text)) return at(1, 9);
  if (/\btomorrow\b/i.test(text)) return at(1, 10);
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const m = /\b(?:on |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(text);
  if (m) {
    const today = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    let diff = (days.indexOf(m[1].toLowerCase()) - today + 7) % 7 || 7;
    if (/next /i.test(m[0]) && diff < 7) diff += 0;
    return at(diff, 10);
  }
  if (/\bthis weekend\b/i.test(text)) {
    const today = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    return at(((6 - today + 7) % 7) || 0, 10);
  }
  return null;
}

const TASK = /\b(?:I need to|I have to|I've got to|I got to|I gotta|I must|I should|I'll|I will|I'm going to|I am going to|I'm gonna|I plan to|I'm planning to|I am planning to|I want to|I'd like to|I promised to|I still have to|I still need to|I haven't (?:yet )?(?:finished|done))\s+([^.!?\n]{3,120})/i;
// Things people say they'll do that are not tasks worth following up on.
const NOT_TASK = /^(?:be (?:fine|ok|okay|right back|back|good|there)|try|see|think about it|let you know|tell you|ask you|talk to you|ttyl|go now|say|know|have (?:a|the|some|that|this)|take (?:that|it)|get (?:it|that)|check (?:it|that)|do (?:it|that|this|so)|need (?:that|it)|keep that in mind|remember (?:that|it)|sleep|eat|stop|leave it|pass|wait|hope|explain|bertha|you)\b/i;

export function extractHeuristic(message: string, timeZone = "America/New_York", now = new Date()): Extraction {
  const memories: ExtractedMemory[] = [];
  const tasks: ExtractedTask[] = [];
  const completed: string[] = [];
  const add = (kind: MemoryKind, content: string) => { const c = clean(content); if (c.length >= 6 && c.length <= 160) memories.push({ kind, content: cap(c) }); };
  if (message.length > 2000) return { memories, tasks, completed };

  for (const s of statements(message)) {
    let m: RegExpExecArray | null;
    if ((m = new RegExp(`\\b[Mm]y name is ${NAME}`).exec(s)) || (m = new RegExp(`\\b(?:call me|I go by) ${NAME}`).exec(s))) add("fact", `Their name is ${m[1]}`);
    const rel = new RegExp(`\\b[Mm]y (${RELATIONS})(?:'s name is| is called| is named| named| called|,| is)\\s+${NAME}\\b`).exec(s)
      || new RegExp(`\\b${NAME},? (?:is )?my (${RELATIONS})\\b`).exec(s);
    if (rel) {
      const [relation, name] = /^[A-Z]/.test(rel[1]) && !new RegExp(`^(${RELATIONS})$`, "i").test(rel[1]) ? [rel[2], rel[1]] : [rel[1], rel[2]];
      if (/^[A-Z]/.test(name)) add("person", `Their ${relation.toLowerCase()} is ${name}`);
    }
    if ((m = /\bI(?:'m| am) allergic to ([^.!?,;]{2,50})/i.exec(s))) add("fact", `Allergic to ${m[1]}`);
    if ((m = /\bI(?:'m| am) (?:diabetic|vegetarian|vegan|pregnant|retired|a widow(?:er)?|left-handed)\b/i.exec(s))) add("fact", cap(third(m[0])));
    if ((m = /\bI (?:live|stay) in ([A-Z][^.!?,;]{1,40})/.exec(s)) || (m = /\bI(?:'m| am) from ([A-Z][^.!?,;]{1,40})/.exec(s))) add("fact", `${/from/.test(m[0]) ? "Is from" : "Lives in"} ${m[1]}`);
    if ((m = /\bI work (?:as an?|as|at|for|in) ([^.!?,;]{2,60})/i.exec(s)) || (m = /\bI(?:'m| am) an? (nurse|teacher|doctor|engineer|developer|student|lawyer|pastor|farmer|driver|accountant|chef|cook|writer|designer|manager|retiree)\b/i.exec(s))) add("fact", cap(third(m[0])));
    if ((m = /\bmy (?:birthday|bday) is (?:on )?([^.!?,;]{3,30})/i.exec(s))) add("fact", `Birthday is ${m[1]}`);
    if ((m = /\bI (?:really |absolutely |truly )?(love|like|enjoy|adore|prefer|hate|dislike|can't stand|cannot stand)\s+([^.!?,;]{3,70})/i.exec(s))) {
      const what = m[2];
      const verbs: Record<string, string> = { love: "Loves", like: "Likes", enjoy: "Enjoys", adore: "Adores", prefer: "Prefers", hate: "Hates", dislike: "Dislikes" };
      if (!/^(to know|it when|that|this|it|you|when you|how you|your|the way you)\b/i.test(what)) add("preference", `${verbs[m[1].toLowerCase()] ?? "Can't stand"} ${third(what)}`);
    }
    if ((m = /\bI(?:'m| am) (?:currently )?(working on|building|writing|planning|learning|studying|training for|preparing for|organi[sz]ing|saving (?:up )?for|renovating|starting)\s+([^.!?;]{3,90})/i.exec(s))) {
      add("project", `Is ${m[1].toLowerCase()} ${third(m[2])}`);
    }
    if ((m = TASK.exec(s)) && !/\bremind me\b/i.test(s) && !/\b(?:do|should|can|could|would|will|shall) I\b/i.test(s.slice(0, m.index + 12))) {
      const what = clean(m[1]);
      if (!NOT_TASK.test(what) && what.split(" ").length >= 2 && !/^(be|feel|get) (happy|sad|tired|sick|better|well)/i.test(what)) {
        tasks.push({ summary: cap(second(what)).slice(0, 140), dueAt: dueFrom(s, timeZone, now) });
      }
    }
    if ((m = /\bI (?:just |finally |already )?(?:finished|completed|did|done|sent|called|paid|booked|submitted|fixed|bought|cleaned|posted|mailed|emailed|texted|rang|visited|took|picked up|dropped off|returned|renewed|ordered|wrote|made|got)\s+([^.!?;]{3,90})/i.exec(s)) || (m = /\b(?:done|finished) with ([^.!?;]{3,90})/i.exec(s))) {
      completed.push(clean(m[0]));
    }
  }
  return { memories, tasks, completed };
}

const STOP = new Set("the a an to my your of for and or in on at with this that it is be i you me up do".split(" "));
export const keywords = (text: string) => new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, "")));
// True when a "finished X" statement plausibly closes an open task.
export function closesTask(statement: string, taskSummary: string) {
  const a = keywords(statement), b = keywords(taskSummary);
  if (!b.size) return false;
  const hits = Array.from(b).filter(w => a.has(w)).length;
  return hits >= Math.min(2, b.size);
}

// "the dentist appointment" -> short, natural title for a conversation, without AI.
export function heuristicTitle(message: string) {
  let t = message.replace(/\s+/g, " ").trim()
    .replace(/^(hi|hey|hello|good (morning|afternoon|evening))[\s,!.]*(bertha)?[\s,!.]*/i, "")
    .replace(/^(bertha[,\s]+)?(can|could|would|will) you (please )?/i, "")
    .replace(/^(please|i want you to|i need you to|i'd like you to|help me( to)?)\s+/i, "")
    .replace(/[?!.]+$/, "");
  if (!t) t = message.trim();
  const words = t.split(" ");
  t = words.slice(0, 8).join(" ") + (words.length > 8 ? "…" : "");
  return cap(t).slice(0, 60) || "New chat";
}
