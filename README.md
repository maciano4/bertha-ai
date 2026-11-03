# Bertha AI

Bertha is a voice-first personal assistant with a warm grandmother persona. You can talk to her ("Hi Bertha"), type to her, have her save appointments and reminders, and have her write texts, emails, social posts and cover letters.

## What's new in Stage 2-app: Bertha looks and runs like an app

- **One app screen.** The whole app is a single full-screen, dark view with no page scrolling. On the left is a sidebar: **+ New bot** at the top, then **Bertha** (always first), then **your bots**, then **Shared with me**. Each row shows the bot's picture and name. Click a bot to open its latest chat. Use the arrow to see its chats, start a **New chat**, or delete a chat. The old dashboard and separate chat list are gone.
- **Chat header.** It shows the bot's name, **New chat**, **Share**, and a **gear** that opens the bot's settings (owner only). With Bertha you also get **Appointments** and **Voice & Language settings**.
- **Sidebar footer.** It has **Install app**, **Appointments**, and an account menu with today's usage, **Manage bots** (`/bots`), **Settings** and **Log out**.
- **Phones.** The sidebar becomes a slide-out drawer. Tap the menu button to open it; tap outside it, press Escape or pick a chat to close it. The layout respects the iPhone notch and home bar.
- **Explore is removed.** There is no `/explore` page and no explore API, and `/explore` now redirects to the chat. A bot is either **Private** or **Anyone with the link**. Bots that used to be "Unlisted" or "Public" become "Anyone with the link" automatically, and their links keep working.
- **Share dialog.** Copy the link, switch link sharing on or off, or make a new link (the old one stops working).
  - Opening `/b/<slug>` while signed in opens the bot straight away and adds it to **Shared with me**.
  - People who aren't signed in see the bot's card and a sign-up prompt. After they sign up, the bot opens.
  - People a bot was shared with can **Remove from sidebar** in the same dialog.
  - If the creator turns sharing off or deletes the bot, it drops out of Shared with me. Chats you already had with it stay in the sidebar, marked "off", so you can still read them.
- **Installable (PWA).**
  - The app has a web manifest (`client/public/manifest.webmanifest`), icons including a maskable one and an apple-touch-icon, and a service worker (`client/public/sw.js`).
  - The service worker caches **only the app shell** (the page, JS/CSS, icons and the manifest). It never caches `/api`, sign-in or uploaded files, and it only runs in production builds.
  - **Install app** uses the browser's install prompt where there is one (Chrome, Edge, Android). On iPhone or iPad it shows the Safari steps: Share → Add to Home Screen.
- **Unchanged:** voice, "Hi Bertha" (and "Hi <bot name>"), continuous conversation, the browser-voice fallback, writing tools, appointments and reminders, sign-in, usage limits, and owner-only bot editing.
- **Database:** a new `bertha_bot_shares` table (the list behind "Shared with me") is created automatically on server start, together with the visibility migration. No `db:push` is needed.

## What's new in Stage 2: build and share your own bots

- **My Bots** (`/bots`). Create, edit, duplicate and delete your own assistants. Each bot has a name, a short description, instructions (its role and personality), a greeting, an emoji or picture, a browser voice (voice, speed, pitch), an optional AI model, and a sharing setting.
  - Start from a template: **Tutor**, **Fitness Coach**, **Customer Support**, **Writing Assistant** or **Travel Planner**, or start from scratch.
  - **AI: help me write instructions** drafts (or improves) the instructions from the name and description. If the OpenAI account is out of credits you get a plain message saying so.
  - A **live preview** shows the bot's card and greeting as you type. **Test voice** speaks the greeting with the chosen voice.
- **Chat with any bot.** Every conversation belongs to one bot (Bertha is the default). The chat list has a **bot switcher** and a filter (this bot / all chats). Bot instructions are added on top of the honesty, date and safety rules, which they can't override. Writing tools, appointments and reminders work with every bot. Voice replies use the bot's voice settings. "Hi Bertha" always works, and you can also say "Hi <bot name>" (a greeting word is needed so the name alone doesn't wake it).
- **Sharing.** Each bot is **Private** (only you) or **Anyone with the link**. The link is `/b/<slug>`. (Stage 2 also had Unlisted, Public and an Explore page; Stage 2-app replaced them; see above.)
  - People who aren't signed in see the bot's card and greeting, plus a sign-up / log-in prompt.
  - Signed-in people chat with the bot in their own private conversations. The creator can't read them.
  - A share link only lets people chat. Only the creator can change the bot. Instructions stay hidden unless the creator turns on **Show instructions**. **New link** replaces the old link.
- **Usage tracking (groundwork for paid plans).** Bot count and messages per day (UTC) are tracked per user (`bertha_usage_daily`). Limits are **not enforced** unless `BERTHA_ENFORCE_LIMITS=true`. `server/limits.ts` has the hooks for Stripe plans in Stage 3.
- New tables `bertha_bots` and `bertha_usage_daily`, a `bot_id` column on `bertha_conversations` and a `plan` column on `bertha_users` are created automatically on server start. No `db:push` is needed.

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
| `BERTHA_BOT_MODELS` | no | Comma-separated list of models a bot may pick, for example `gpt-4o-mini,gpt-4o`. Defaults to `gpt-4o-mini, gpt-4o, gpt-4.1-mini, gpt-4.1` plus `OPENAI_MODEL`. This stops bots from choosing models you don't want to pay for. |
| `OPENAI_BOT_BUILDER_MODEL` | no | The model behind "AI: help me write instructions". Defaults to `OPENAI_MODEL`. |
| `BERTHA_ENFORCE_LIMITS` | no | `true` turns on the free-plan limits below. Off by default. |
| `BERTHA_FREE_MAX_BOTS` | no | Bots per user when limits are on. Defaults to 50. |
| `BERTHA_FREE_DAILY_MESSAGES` | no | Messages per user per UTC day when limits are on. Defaults to 1000. |

## Running it

```bash
npm install
npm run dev        # development: http://localhost:5000
npm run check      # type check
npm run build && npm start   # production
```

The database tables (`bertha_users`, `bertha_conversations`, `bertha_messages`, `bertha_sessions`, `bertha_appointments`, `bertha_bots`, `bertha_usage_daily`) are created automatically when the server starts, so no migration step is needed. Open the app, choose **Create an account**, and start chatting.

### About `npm run db:push`

You don't need to run it. `shared/schema.ts` still contains older, unused tables (households, shopping lists and so on), so `drizzle-kit push` would offer to create those as well. If you do run it, read the statements it lists before confirming.

## API overview (all under `/api`, all require sign-in except `/api/auth/*` and `/api/public/*`)

- **Accounts.** `POST /auth/signup` with `{email, password, displayName?, timeZone?}`. Also `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` and `PATCH /auth/me`.
- **Conversations.** `GET /conversations` and `POST /conversations`, `GET/PATCH/DELETE /conversations/:id`, and `GET /conversations/:id/messages`.
- **Chat.** `POST /chat` with `{message, conversationId, timeZone?, stream?}`:
  - Without streaming it returns JSON `{response, ...}`.
  - With `stream: true` it returns NDJSON lines: `{"type":"delta","text":...}`, then either `{"type":"done","response":...}` or `{"type":"error","error":...,"code":...}`.
  - Errors are `{error, code}`, using codes such as `no_api_key`, `invalid_api_key`, `insufficient_quota`, `rate_limited` and `ai_timeout`.
- **Appointments.** `GET/POST /appointments`, `PATCH/DELETE /appointments/:id`, and `GET /appointments/reminders`.
- **Bots.** `GET /bots` (yours), `POST /bots`, `GET /bots/:id` (the full bot for its owner; only the public card for others; 404 if private), `PATCH /bots/:id` and `DELETE /bots/:id` (owner only, `403 not_owner` otherwise), `POST /bots/:id/duplicate`, `POST /bots/:id/new-link`, `GET /bots/shared` (bots shared with you), `POST /bots/shared` with `{slug}` (add one from its link), `DELETE /bots/shared/:id` (remove it from your sidebar), `GET /bots/options` (allowed models and usage), `POST /bots/draft-instructions` with `{name, description, current?}`, and `GET /usage`.
  - Limits: name up to 60 characters, description 300, instructions 8000, greeting 500. Pictures must be `https://` links or small uploaded images.
- **Shared card (no sign-in needed).** `GET /public/bots/:slug` returns the card for bots shared by link. It never includes the owner's email, the model or (unless allowed) the instructions.
- **Chatting with a bot.** `POST /conversations` with `{title, botId}`, then `POST /chat` as usual. The bot comes from the conversation. `GET /conversations?botId=<id|bertha>` filters the list. A bot that has been made private or deleted returns `403 bot_unavailable`. With limits on, `429 limit_reached`.
