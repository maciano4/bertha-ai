---
name: Scheduling independence
description: Reliability requirement behind local natural-language scheduling and explicit clarification.
---

Keep common appointment creation, lookup, rescheduling, and cancellation independent of the general AI chat provider's availability. Ask for clarification instead of inventing dates, missing am/pm, or choosing between multiple appointment matches.

**Why:** Live verification found that provider quota exhaustion prevented an otherwise straightforward appointment from being saved. A personal assistant's calendar actions should not stop working merely because general chat generation is unavailable.

**How to apply:** Extend local scheduling interpretation and its regression tests for new commands. Do not replace it with an AI-only path or claim an appointment was saved before database writes succeed.
