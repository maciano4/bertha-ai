import { test } from "node:test";
import assert from "node:assert/strict";
import { appointmentIntent, isReminderRequest, isRepeatRequest, answerTimeQuestion, timeQuestionKind, answerArithmetic } from "./intents";
import { parseAppointmentCommand, parseReminderCommand } from "./appointmentCommands";

const zone = "America/New_York";
const now = new Date("2026-11-03T17:57:00Z"); // 12:57 PM EST, Tuesday

// Messages that must go to the AI: no appointment, reminder, repeat, time or math handler.
const GENERAL = [
  "what did you say about the weather in Paris yesterday?", "what's up", "what's up?", "how are you",
  "what is the capital of France", "who wrote Things Fall Apart?", "tell me a story", "tell me a story about a lion",
  "what should I cook for dinner", "what's a good book to read", "can you recommend a good book", "I'm reading a book about dates",
  "what dates are best for planting tomatoes", "what's a good date idea", "plan a date night for us", "what date was the moon landing",
  "how do I change a flat tyre", "how do I cancel my Netflix subscription", "how to move to Canada", "change the subject please",
  "can you change your voice", "make me laugh", "make a cake recipe for tomorrow", "add milk to my shopping list",
  "add some salt", "set the mood", "set a good example", "delete this chat", "remove the first paragraph",
  "move on", "let's move on", "update me on the news", "edit my essay", "cancel that", "never mind",
  "explain how vaccines work", "what is the meaning of life", "my doctor said I should walk more, is that true?",
  "the dentist was painful today", "I had a meeting with my boss today and it went badly", "what should I say at my job interview",
  "tips for a job interview", "write an email to move my meeting", "draft a text to cancel my appointment with Sam",
  "remind me what you said", "remind me how to make jollof rice", "remind me who won the world cup", "what time does the store close",
  "what time is the match tonight", "time flies", "what a time to be alive", "what's the date of Easter next year",
  "what day is Christmas this year", "what is 2 plus 2 in binary", "what is love", "calculate my BMI",
  "I'm 5 foot 2", "my number is 555-1234", "1990", "repeat after me: I am strong", "say something nice",
  "what did you have for breakfast", "what do you say to that", "what can you do", "how old are you",
  "can you hear me?", "did you say something?", "what did I say?", "what was the name of that song",
];

test("general questions never reach appointment, reminder, repeat or time handlers", () => {
  for (const text of GENERAL) {
    assert.equal(appointmentIntent(text), "none", `appointment: ${text}`);
    assert.equal(isReminderRequest(text), false, `reminder: ${text}`);
    assert.equal(isRepeatRequest(text), false, `repeat: ${text}`);
    assert.equal(timeQuestionKind(text), null, `time: ${text}`);
    assert.equal(answerArithmetic(text), null, `math: ${text}`);
    assert.equal(parseAppointmentCommand(text, [], zone, now).action, "none", `parse: ${text}`);
    assert.equal(parseReminderCommand(text, zone, now).action, "none", `parse reminder: ${text}`);
  }
});

test("repeat requests are recognised", () => {
  for (const text of ["what did you say?", "What did you say", "what did you just say?", "sorry, what did you say?", "repeat that",
    "can you repeat that?", "could you repeat that please", "please repeat", "repeat", "say that again", "say it again please",
    "come again?", "pardon?", "pardon me", "I didn't hear you", "I didn't catch that", "Bertha, what did you say?",
    "what was that?", "repeat your last answer", "can you say that again?", "what did you say, Bertha?"]) {
    assert.equal(isRepeatRequest(text), true, text);
    assert.equal(appointmentIntent(text), "none", text);
  }
});

test("time and date questions get an exact local answer", () => {
  for (const text of ["What time is it now", "what time is it", "what time is it?", "What's the time?", "what is the time now",
    "Bertha, what time is it?", "hey bertha what time is it", "can you tell me what time it is", "tell me the time", "the time please",
    "do you know what time it is?", "what's the current time"]) {
    assert.equal(answerTimeQuestion(text, zone, now), "It's 12:57 PM (EST) on Tuesday, November 3, 2026.", text);
  }
  for (const text of ["what's the date?", "what is today's date", "what's today's date?", "what is the date today", "what date is it", "today's date"]) {
    assert.equal(answerTimeQuestion(text, zone, now), "Today is Tuesday, November 3, 2026.", text);
  }
  assert.equal(answerTimeQuestion("what day is it today?", zone, now), "Today is Tuesday, November 3, 2026.");
  assert.equal(answerTimeQuestion("what day of the week is it", zone, now), "Today is Tuesday, November 3, 2026.");
  assert.equal(answerTimeQuestion("what year is it", zone, now), "It's 2026.");
  assert.equal(answerTimeQuestion("what month is it?", zone, now), "It's November 2026.");
  // Uses the user's zone, not the server's.
  assert.equal(answerTimeQuestion("what time is it", "Africa/Douala", now), "It's 6:57 PM (GMT+1) on Tuesday, November 3, 2026.");
  assert.equal(answerTimeQuestion("what time is it", "Asia/Tokyo", now), "It's 2:57 AM (GMT+9) on Wednesday, November 4, 2026.");
  // Around midnight the date follows the zone too.
  assert.equal(answerTimeQuestion("what's the date", zone, new Date("2026-11-04T03:30:00Z")), "Today is Tuesday, November 3, 2026.");
  for (const text of ["what time is it in Tokyo", "what time is the match", "what time should I leave", "what date is Easter",
    "what day is my appointment", "what's the date of the election", "what year did the war end", "is it time to go?"]) {
    assert.equal(answerTimeQuestion(text, zone, now), null, text);
  }
});

test("simple arithmetic is exact", () => {
  assert.equal(answerArithmetic("what is 12 times 7"), "12 × 7 = 84");
  assert.equal(answerArithmetic("What's 15 + 27?"), "15 + 27 = 42");
  assert.equal(answerArithmetic("calculate (3+4)*2"), "(3 + 4) × 2 = 14");
  assert.equal(answerArithmetic("100 / 8"), "100 ÷ 8 = 12.5");
  assert.equal(answerArithmetic("what is 0.1 + 0.2"), "0.1 + 0.2 = 0.3");
  assert.equal(answerArithmetic("what's 20% of 85"), "20% of 85 is 17.");
  assert.equal(answerArithmetic("what is 2 to the power of 10"), "2 ^ 10 = 1,024");
  assert.equal(answerArithmetic("what is 1,250 minus 300"), "1250 - 300 = 950");
  assert.equal(answerArithmetic("what is 5 divided by 0"), "That can't be calculated (it divides by zero).");
  assert.equal(answerArithmetic("2+2="), "2 + 2 = 4");
  for (const text of ["what is 7", "2026", "what is 3 apples plus 2 oranges", "what is (2+3", "what's 1/2 of a cup in grams", "call 555-1234"]) {
    assert.equal(answerArithmetic(text), null, text);
  }
});

test("clear appointment requests are still recognised", () => {
  const titles = ["Dentist appointment"];
  const cases: Array<[string, string]> = [
    ["set a dentist appointment next Tuesday at 3pm", "create"], ["Bertha, set a dentist appointment next Tuesday at 3pm", "create"],
    ["can you book a doctor's appointment for Friday at 10am", "create"], ["schedule a meeting with Ana on Friday at 2pm", "create"],
    ["book the vet on Friday at 10am", "create"], ["add an appointment tomorrow at 9am", "create"], ["make an appointment", "create"],
    ["I need to book a haircut tomorrow at 4pm", "create"], ["schedule a call with John tomorrow at 3pm", "create"],
    ["reschedule my dentist appointment to next Wednesday at 4pm", "edit"], ["move my dentist appointment to 5pm", "edit"],
    ["move the dentist to 5pm", "edit"], ["postpone the dentist", "edit"],
    ["cancel my dentist appointment", "cancel"], ["please cancel the dentist", "cancel"], ["delete my meeting", "cancel"],
    ["what are my appointments", "list"], ["show my appointments", "list"], ["list my reminders", "list"],
    ["do I have any appointments this week?", "list"], ["what's on my calendar", "list"], ["when is my dentist appointment?", "list"],
    ["any appointments tomorrow?", "list"], ["remind me of my appointments", "list"], ["what's on my schedule today", "list"],
  ];
  for (const [text, expected] of cases) assert.equal(appointmentIntent(text, titles), expected, text);
});

test("reminder requests are still recognised", () => {
  for (const text of ["remind me to call Mom at 5pm", "remind me in 20 minutes to take my pills", "Bertha, remind me to water the plants tomorrow at 9am",
    "set a reminder for tomorrow at 9am to water the plants", "can you remind me to take my pills at 8pm", "please remind me about the meeting at 3pm"]) {
    assert.equal(isReminderRequest(text), true, text);
  }
  assert.equal(parseReminderCommand("remind me to call Mom at 5pm", zone, now).action, "create");
});
