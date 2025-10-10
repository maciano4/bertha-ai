# Bertha AI Chat Application

## Overview

Bertha AI is an intelligent conversational assistant application built with a modern full-stack architecture. The system combines real-time chat capabilities with advanced features including voice interaction, camera integration, web search, multi-language translation, and file upload functionality. The application provides an interactive dashboard-style interface where users can communicate with an AI assistant through multiple input modalities.

## User Preferences

Preferred communication style: Simple, everyday language.

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
The server is implemented using Express.js with TypeScript, following a RESTful API design pattern. The application uses an in-memory storage system as the default implementation with interfaces designed for easy migration to persistent database solutions.

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