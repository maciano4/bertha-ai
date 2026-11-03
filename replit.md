# Bertha AI Chat Application

## Overview

Bertha AI is an intelligent conversational assistant application built with a modern full-stack architecture. The system combines real-time chat capabilities with advanced features including voice interaction, camera integration, multi-language translation, and file upload functionality. The application provides an interactive dashboard-style interface where users can communicate with an AI assistant through multiple input modalities.

## User Preferences

Preferred communication style: Simple, everyday language.

## Stage 1 platform upgrade (branch `stage1-platform`)

### What's new
- **Accounts.** Email and password sign-up and login (bcrypt). Sessions are stored in Postgres (`bertha_sessions`) and the cookie is httpOnly. Every chat and appointment belongs to the signed-in user.
- **Permanent history.** Conversations and messages live in Postgres (`bertha_users`, `bertha_conversations`, `bertha_messages`). The chat page has a left sidebar of past chats with **New chat** and delete.
- **Accurate replies.**
  - Uses `OPENAI_MODEL` (default `gpt-4o-mini`).
  - The prompt includes the current date, time and time zone, plus about 20 messages of context and honesty rules (no made-up facts, no pretend web search).
  - Replies stream in, and errors are explained clearly.
- **Writing tasks.** Starter buttons for a text, an email, a post and a cover letter. Drafts get a Copy button. Bertha speaks only the short intro, not the whole draft.
- **Reminders and appointments typed or spoken in chat** are saved as real appointment rows.
- **Code changes.**
  - Server: `server/auth.ts`, `server/chatStore.ts`, `server/platformTables.ts` and `server/openai.ts`. The `/api/chat` flow is in `server/routes.ts`.
  - Client: `client/src/hooks/useAuth.tsx`, `client/src/pages/auth.tsx`, `client/src/components/chat/ConversationSidebar.tsx` and `client/src/lib/drafts.ts`.

### Secrets (Tools → Secrets)
- `DATABASE_URL`: Postgres. It's set automatically when the Replit database is added.
- `SESSION_SECRET`: **add this.** Any long random string keeps people signed in across restarts.
- `OPENAI_API_KEY`: your OpenAI key. `OpenAI_API_KEY` and `OPENAI_KEY` also work. The account needs credits.
- `OPENAI_MODEL` (optional): for example `gpt-4o`. The default is `gpt-4o-mini`.

### Deploying this branch on Replit
1. Get the code. Either use the **Git** pane to switch to or pull the `stage1-platform` branch, or run this in the Shell:
   `git fetch origin && git checkout stage1-platform && git pull`
2. Run `npm install`.
3. Run `npm run db:push`. This step is optional: the server creates its tables on start. If you run it, check the list before confirming, because it also offers older unused tables from `shared/schema.ts`.
4. Add the `SESSION_SECRET` secret, and make sure `OPENAI_API_KEY` is set.
5. Press **Run** (or redeploy), open the app and choose **Create an account**.

Note: chats from before this upgrade were held only in memory, so they don't carry over.

## System Architecture

### Frontend Architecture
The frontend is built using React with TypeScript, leveraging Vite for development tooling and build processes. The UI implements a component-based architecture using shadcn/ui components built on Radix UI primitives, styled with Tailwind CSS. The application uses Wouter for client-side routing and React Query (TanStack Query) for state management and API communication.

**Key Frontend Features:**
- Chat interface with message bubbles and conversation history
- Voice interaction capabilities using Web Speech API for both speech-to-text and text-to-speech
- Camera integration for visual context capture
- Real-time activity logging and settings management
- File upload functionality using Uppy with direct cloud storage integration
- Responsive design with mobile-first approach

### Backend Architecture
The server is implemented using Express.js with TypeScript, following a RESTful API design pattern. Users, sessions, conversations, messages and appointments are stored in Postgres (see "Stage 1 platform upgrade" above); voice profiles and some settings are still kept in memory.

**API Structure:**
- `/api/chat` - Main conversation endpoint handling message processing, web search, and AI response generation
- `/api/conversations` - CRUD operations for conversation management
- File upload endpoints integrated with Google Cloud Storage
- Translation and image analysis services

### AI Integration
The system integrates with OpenAI's GPT-5 model for natural language processing and conversation generation. The AI service handles multi-language support, web search result integration, and contextual response generation based on conversation history.

**ElevenLabs Voice Integration (Added October 2025):**
The application now supports custom voice synthesis using ElevenLabs API for high-quality text-to-speech:
- Backend service (`server/elevenLabsService.ts`) handles TTS generation and voice management
- API endpoints: `/api/elevenlabs/voices`, `/api/elevenlabs/tts`, `/api/elevenlabs/usage`
- Frontend VoiceSettings component allows users to select and test custom voices
- Voice parameters (stability, similarity boost) are persisted to localStorage
- Graceful fallback to browser TTS if ElevenLabs is unavailable
- Manual voice ID entry supported for free-tier API keys with limited permissions
- Integration maintains compatibility with existing wake word detection and speech features

**Mobile TTS Support (Added October 2025):**
The application now includes comprehensive mobile device support for text-to-speech functionality:
- **Mobile Detection**: Utility functions (`client/src/lib/mobileDetection.ts`) identify iOS, Android, and other mobile platforms
- **Audio Context Initialization**: Web Audio API context is initialized on user interaction for mobile browsers to bypass autoplay restrictions
- **Platform-Specific Handling**: 
  - iOS Safari receives 100ms delay before speech synthesis to avoid browser-specific issues
  - Android and iOS devices use mobile-optimized audio playback with `playsinline` attributes
  - Desktop browsers use standard audio playback without special handling
- **ElevenLabs Mobile Audio**: Audio elements are configured with mobile compatibility flags for seamless playback
- **Browser TTS Fallback**: Enhanced mobile compatibility with device-specific voice selection and timing adjustments
- **User Interaction Requirements**: Audio systems initialize automatically when users interact with the chat interface

### Data Storage Solutions
#### Personal dashboard and appointments
- `/dashboard` shows only the current browser session's conversations, searchable history, transcripts, and actual activity counts.
- `/appointments` provides a monthly calendar and create/edit/cancel appointment forms.
- Appointment records persist in the existing PostgreSQL database. Startup creates only the additive `bertha_appointments` table and its index; do not run a broad schema push just to add appointments.
- Browser ownership uses an HTTP-only session cookie with a PostgreSQL-backed session store (`bertha_sessions`). Appointment access survives server restarts in the same browser. There is no account sign-in or cross-device synchronization; clearing the session cookie loses access to that browser's records.
- Conversation/message storage remains in memory and resets when the server restarts. Do not promise durable conversation history.
- Appointment reminders are polled while chat is open, displayed as assistant messages (and spoken when voice is enabled), then acknowledged to avoid repeated delivery. No background push/email notifications are implied.

Currently implements an in-memory storage system with well-defined interfaces for:
- User management and authentication
- Conversation and message persistence
- User settings and preferences
- File metadata and access control

The storage layer is designed with database abstraction, making it straightforward to migrate to PostgreSQL using Drizzle ORM (configuration already present).

### File Storage and Management
Implements a sophisticated object storage system using Google Cloud Storage with custom ACL (Access Control List) policies. The system supports:
- Direct file uploads with presigned URLs
- Granular access control based on user groups and permissions
- Custom metadata management for file organization
- Integration with Uppy for enhanced upload experiences

## External Dependencies

### Core Services
- **OpenAI API**: Primary AI service for conversation generation and image analysis
- **ElevenLabs API**: High-quality voice synthesis and text-to-speech (added October 2025)
- **Google Cloud Storage**: Object storage for file uploads and management
- **Neon Database**: PostgreSQL database service (configured but not actively used)

### Frontend Libraries
- **Radix UI**: Accessible component primitives for the UI system
- **TanStack Query**: Server state management and API communication
- **Uppy**: Advanced file upload handling with drag-and-drop support
- **Wouter**: Lightweight client-side routing

### Development Tools
- **Vite**: Build tool and development server with HMR
- **Drizzle Kit**: Database schema management and migrations
- **Tailwind CSS**: Utility-first CSS framework
- **TypeScript**: Type safety across the entire application

### Browser APIs
- **Web Speech API**: Speech recognition and synthesis capabilities
- **MediaDevices API**: Camera access for visual context capture
- **Local Storage**: Client-side persistence for user preferences

The architecture supports easy scaling and feature extension, with clear separation of concerns between frontend presentation, backend logic, and external service integration.