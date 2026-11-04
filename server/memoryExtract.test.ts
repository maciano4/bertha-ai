import { test } from "node:test";
import assert from "node:assert/strict";
import { extractHeuristic, closesTask, heuristicTitle } from "./memoryExtract";
import { createVad, rms } from "../client/src/lib/bargeIn";

const now = new Date("2026-11-04T15:00:00Z"); // Wed 10:00 New York

test("learns names, people, allergies and likes", () => {
  const r = extractHeuristic("My name is Chris. My granddaughter is Ama and I'm allergic to peanuts. I love jollof rice.", "America/New_York", now);
  const all = r.memories.map((m: any) => m.content ?? m).join(" | ");
  assert.match(all, /Their name is Chris/);
  assert.match(all, /granddaughter is Ama/);
  assert.match(all, /allergic to peanuts/i);
  assert.match(all, /jollof rice/i);
});

test("tasks get a second-person summary and a due date", () => {
  const r = extractHeuristic("I need to call the pharmacy tomorrow.", "America/New_York", now);
  assert.equal(r.tasks.length, 1);
  assert.match(r.tasks[0].summary, /call the pharmacy/i);
  assert.ok(r.tasks[0].dueAt && new Date(r.tasks[0].dueAt) > now);
});

test("questions and requests are not tasks or memories", () => {
  const r = extractHeuristic("Should I need to bring an umbrella? Remind me to call mum at 5pm.", "America/New_York", now);
  assert.equal(r.tasks.length, 0);
});

test("completion statements close matching tasks", () => {
  const r = extractHeuristic("I posted the letter to Kwame this morning", "America/New_York", now);
  assert.ok(r.completed.length >= 1);
  assert.ok(closesTask(r.completed[0], "Post the letter to Kwame"));
  assert.ok(!closesTask(r.completed[0], "Call the pharmacy"));
});

test("titles drop greetings and filler", () => {
  const t = heuristicTitle("Hi Bertha, can you help me write a cover letter for a nursing job in Accra please");
  assert.ok(!/^hi/i.test(t));
  assert.match(t, /cover letter/i);
  assert.ok(t.split(/\s+/).length <= 8);
});

test("barge-in VAD: fires on sustained speech, not on clicks or quiet echo", () => {
  const vad = createVad({ holdMs: 180, graceMs: 300 });
  let t = 0; let fired = false;
  for (; t < 300; t += 30) vad(0.01, t);          // calibration on residual echo
  for (let i = 0; i < 3; i++, t += 30) fired ||= vad(0.3, t); // 60ms click
  for (let i = 0; i < 5; i++, t += 30) fired ||= vad(0.01, t);
  assert.equal(fired, false);
  for (let i = 0; i < 10; i++, t += 30) fired ||= vad(0.2, t); // sustained talking
  assert.equal(fired, true);
  assert.ok(Math.abs(rms(new Float32Array([0.5, -0.5])) - 0.5) < 1e-6);
});
