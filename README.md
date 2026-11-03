# Bertha AI

Bertha is a voice-first personal assistant with a warm grandmother persona. You can talk to her ("Hi Bertha"), type to her, have her save appointments and reminders, and have her write texts, emails, social posts and cover letters.

## What's new in Stage 1

- **Accounts.** You sign up with an email and password. Passwords are hashed with bcrypt. Sessions are kept in Postgres behind an httpOnly cookie, so you stay signed in for 90 days, even when the server restarts. Each person sees only their own chats and appointments.
- **Saved history.** Every chat is saved in Postgres. A sidebar lists your past chats, with **New chat** and delete buttons. Reloading the page reopens the chat you were in.
- **More accurate replies.**
  - The model comes from `OPENAI_MODEL` and defaults to `gpt-4o-mini`.
  - Each turn gets the current date, time and time zone, plus the last ~20 messages of the conversation.
  - The system prompt tells Bertha not to make up facts and to say when she can't check something live. Web search was fake, so it has been removed.
  - Replies stream in word by word.
  - Errors say plainly what went wrong: missing or invalid key, out of credits, rate limit, timeout.
- **Writing help.**
  - Four buttons start a request for you: *Write a text*, *Write an email*, *Write a post* and *Cover letter*.
  - Finished drafts appear in their own box with a **Copy draft** button. Other replies have a **Copy** button.
  - Bertha doesn't read a long draft aloud. She says she has written it below.
- **Appointments and reminders from chat** are saved as real database rows. Examples: "Set a dentist appointment next Tuesday at 3pm", "Remind me to call Mom tomorrow at 5pm", "Remind me in 20 minutes to check the oven". They show up on the Appointments page.
- **Voice still works the same way.** That includes the "Hi Bertha" wake word, continuous conversation, ElevenLabs voices and the browser speech fallback.

## Environment variables

| Name | Required | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. On Replit this is set automatically when the database is added. |
| `SESSION_SECRET` | yes in production | A long random string used to sign session cookies. If it's missing, a development fallback is used and a warning is printed. In production a random secret is generated on each boot, which signs everyone out on every restart. |
| `OPENAI_API_KEY` | yes for AI replies | Your OpenAI key. `OpenAI_API_KEY` and `OPENAI_KEY` are also accepted. |
| `OPENAI_MODEL` | no | The chat model. Defaults to `gpt-4o-mini`. Examples: `gpt-4o`, `gpt-4.1-mini`. |
| `OPENAI_VISION_MODEL` | no | The model for image analysis and translation. Defaults to `OPENAI_MODEL`. |
| `OPENAI_BASE_URL` | no | Points the SDK at a compatible endpoint (proxy, mock or Azure-style gateway). |
| `ELEVENLABS_API_KEY` | no | Turns on ElevenLabs voices. Without it, the browser's built-in voice is used. |
| `SESSION_STORE` | no | `memory` keeps sessions in memory instead of Postgres (local testing only). |
| `DB_DRIVER` | no | `neon` forces the Neon serverless driver. Otherwise it's picked automatically (Neon for `*.neon.tech`, `pg` for everything else). |
| `DB_POOL_MAX` | no | Maximum Postgres connections. Defaults to 10. |

## Running it

```bash
npm install
npm run dev        # development: http://localhost:5000
npm run check      # type check
npm run build && npm start   # production
```

The database tables (`bertha_users`, `bertha_conversations`, `bertha_messages`, `bertha_sessions`, `bertha_appointments`) are created automatically when the server starts, so no migration step is needed. Open the app, choose **Create an account**, and start chatting.

### About `npm run db:push`

You don't need to run it. `shared/schema.ts` still contains older, unused tables (households, shopping lists and so on), so `drizzle-kit push` would offer to create those as well. If you do run it, read the statements it lists before confirming.

## API overview (all under `/api`, all require sign-in except `/api/auth/*`)

- **Accounts.** `POST /auth/signup` with `{email, password, displayName?, timeZone?}`. Also `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` and `PATCH /auth/me`.
- **Conversations.** `GET /conversations` and `POST /conversations`, `GET/PATCH/DELETE /conversations/:id`, and `GET /conversations/:id/messages`.
- **Chat.** `POST /chat` with `{message, conversationId, timeZone?, stream?}`:
  - Without streaming it returns JSON `{response, ...}`.
  - With `stream: true` it returns NDJSON lines: `{"type":"delta","text":...}`, then either `{"type":"done","response":...}` or `{"type":"error","error":...,"code":...}`.
  - Errors are `{error, code}`, using codes such as `no_api_key`, `invalid_api_key`, `insufficient_quota`, `rate_limited` and `ai_timeout`.
- **Appointments.** `GET/POST /appointments`, `PATCH/DELETE /appointments/:id`, and `GET /appointments/reminders`.
