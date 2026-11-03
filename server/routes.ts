import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { isRepeatRequest, answerTimeQuestion, answerArithmetic } from "./intents";
import { generateChatResponse, streamChatResponse, translateText, analyzeImage, toAIError, AIError, CHAT_MODEL, modelFor, type ChatContext } from "./openai";
import { voiceProfileStorage, analyzeVoiceInput, type VoiceProfile } from "./voiceProfiles";
import { ObjectStorageService } from "./objectStorage";
import { WeatherService } from "./weatherService";
import { elevenLabsService } from "./elevenLabsService";
import { insertMessageSchema, insertUserSettingsSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import { registerAppointmentRoutes, handleAppointmentChat, handleReminderChat, listAppointments } from "./appointments";
import { describeTime, validTimeZone } from "./appointmentDates";
import { registerAuthRoutes, requireAuth } from "./auth";
import * as chats from "./chatStore";
import { registerBotRoutes, registerPublicBotRoutes, getChatBot, rememberSharedBot } from "./bots";
import { assertCanSendMessage, recordMessage, LimitError } from "./limits";

const WRITING_REQUEST = /^\s*(?:(?:hey\s+|hi\s+)?bertha[,\s]+)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:help\s+me\s+)?(?:write|draft|compose|rewrite|reword|proofread|polish|translate)\b/i;

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof AIError || error instanceof LimitError) return res.status(error.status).json({ error: error.message, code: error.code });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback, code: "server_error" });
}

export async function registerRoutes(app: Express): Promise<Server> {
  registerAuthRoutes(app);
  registerPublicBotRoutes(app); // share-link cards work signed out
  // Everything else under /api needs a signed-in account; data is scoped to req.user.id.
  app.use("/api", requireAuth);
  registerAppointmentRoutes(app);
  registerBotRoutes(app);
  // Voice profile endpoints
  app.post("/api/voice/profiles", async (req, res) => {
    try {
      const { name, samples, language = 'en-US' } = req.body;

      if (!name || !Array.isArray(samples) || samples.length < 3) {
        return res.status(400).json({ error: "Name and at least 3 voice samples required" });
      }

      // Create voice profile
      const profile = voiceProfileStorage.createProfile(name, language);
      
      // Add voice samples
      for (const sample of samples) {
        const characteristics = analyzeVoiceInput(sample, language);
        voiceProfileStorage.addVoiceSample(profile.id, sample, characteristics);
      }

      res.json({
        success: true,
        profileId: profile.id,
        name: profile.name,
        samplesCount: samples.length
      });
    } catch (error) {
      console.error("Voice profile creation error:", error);
      res.status(500).json({ error: "Failed to create voice profile" });
    }
  });

  app.get("/api/voice/profiles", async (req, res) => {
    try {
      const profiles = voiceProfileStorage.getAllProfiles().map(p => ({
        id: p.id,
        name: p.name,
        language: p.voiceCharacteristics.language,
        samplesCount: p.voiceSamples.length,
        usageCount: p.usageCount,
        lastUsed: p.lastUsed,
        profilePictureUrl: p.profilePictureUrl
      }));
      
      res.json({ profiles });
    } catch (error) {
      console.error("Voice profiles fetch error:", error);
      res.status(500).json({ error: "Failed to fetch voice profiles" });
    }
  });

  app.delete("/api/voice/profiles/:profileId", async (req, res) => {
    try {
      const { profileId } = req.params;
      const deleted = voiceProfileStorage.deleteProfile(profileId);
      
      if (deleted) {
        res.json({ success: true, message: "Voice profile deleted" });
      } else {
        res.status(404).json({ error: "Voice profile not found" });
      }
    } catch (error) {
      console.error("Voice profile deletion error:", error);
      res.status(500).json({ error: "Failed to delete voice profile" });
    }
  });

  app.get("/api/voice/stats", async (req, res) => {
    try {
      const stats = voiceProfileStorage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Voice stats error:", error);
      res.status(500).json({ error: "Failed to get voice stats" });
    }
  });

  // Profile picture upload endpoints
  app.post("/api/voice/profiles/:profileId/picture/upload", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Profile picture upload URL error:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.put("/api/voice/profiles/:profileId/picture", async (req, res) => {
    try {
      const { profileId } = req.params;
      const { profilePictureURL } = req.body;

      if (!profilePictureURL) {
        return res.status(400).json({ error: "profilePictureURL is required" });
      }

      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.normalizeObjectEntityPath(profilePictureURL);

      // Update voice profile with new picture
      const updated = voiceProfileStorage.updateProfilePicture(profileId, objectPath);
      
      if (!updated) {
        return res.status(404).json({ error: "Voice profile not found" });
      }

      res.json({ 
        success: true, 
        profileId,
        profilePictureUrl: objectPath 
      });
    } catch (error) {
      console.error("Profile picture update error:", error);
      res.status(500).json({ error: "Failed to update profile picture" });
    }
  });

  // The old global reminder/daily-plan system stored data without an owner, so one account
  // could see another's reminders. Reminders now live in each user's appointments
  // (see handleReminderChat); these endpoints stay so older clients don't error.
  app.get("/api/reminders/due", (_req, res) => res.json([]));
  app.get("/api/reminders/check", (_req, res) => res.json({ notifications: [] }));
  app.get("/api/plans/today", (_req, res) => res.json(null));
  app.get("/api/plans/:date", (_req, res) => res.json(null));

  // Weather endpoints
  const weatherService = new WeatherService();

  app.get("/api/weather/current/:location", async (req, res) => {
    try {
      const { location } = req.params;
      const weatherData = await weatherService.getWeatherByLocation(location);
      
      if (!weatherData.current) {
        return res.status(404).json({ error: "Location not found" });
      }

      res.json(weatherData);
    } catch (error) {
      console.error("Error getting weather:", error);
      res.status(500).json({ error: "Failed to get weather data" });
    }
  });

  app.get("/api/weather/forecast/:location", async (req, res) => {
    try {
      const { location } = req.params;
      const days = parseInt(req.query.days as string) || 5;
      
      const coordinates = await weatherService.getLocationCoordinates(location);
      if (!coordinates) {
        return res.status(404).json({ error: "Location not found" });
      }

      const forecast = await weatherService.getWeatherForecast(
        coordinates.latitude, 
        coordinates.longitude, 
        days
      );
      
      res.json({ 
        location: `${coordinates.name}, ${coordinates.country}`,
        forecast 
      });
    } catch (error) {
      console.error("Error getting weather forecast:", error);
      res.status(500).json({ error: "Failed to get weather forecast" });
    }
  });

  // ElevenLabs voice endpoints
  app.get("/api/elevenlabs/voices", async (req, res) => {
    try {
      if (!process.env.ELEVENLABS_API_KEY) {
        return res.status(503).json({ 
          error: "ElevenLabs is not configured. Please add ELEVENLABS_API_KEY to use custom voices." 
        });
      }

      const voices = await elevenLabsService.listVoices();
      res.json({ voices });
    } catch (error) {
      console.error("Error listing ElevenLabs voices:", error);
      res.status(500).json({ error: "Failed to fetch voices" });
    }
  });

  app.post("/api/elevenlabs/tts", async (req, res) => {
    try {
      if (!process.env.ELEVENLABS_API_KEY) {
        return res.status(503).json({ 
          error: "ElevenLabs is not configured. Please add ELEVENLABS_API_KEY to use custom voices." 
        });
      }

      const { text, voiceId, stability, similarityBoost, style } = req.body;

      if (!text || !voiceId) {
        return res.status(400).json({ error: "Text and voiceId are required" });
      }

      const audioBuffer = await elevenLabsService.textToSpeech({
        text,
        voiceId,
        stability,
        similarityBoost,
        style
      });

      // Set headers for audio response
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', audioBuffer.length);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      
      res.send(audioBuffer);
    } catch (error) {
      console.error("Error generating speech with ElevenLabs:", error);
      res.status(500).json({ error: "Failed to generate speech" });
    }
  });

  app.get("/api/elevenlabs/usage", async (req, res) => {
    try {
      if (!process.env.ELEVENLABS_API_KEY) {
        return res.status(503).json({ 
          error: "ElevenLabs is not configured. Please add ELEVENLABS_API_KEY to use custom voices." 
        });
      }

      const stats = await elevenLabsService.getUsageStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting ElevenLabs usage:", error);
      res.status(500).json({ error: "Failed to get usage statistics" });
    }
  });

  // Voice cloning endpoint
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit
  
  app.post("/api/elevenlabs/clone-voice", upload.array('audioFiles', 10), async (req, res) => {
    try {
      if (!process.env.ELEVENLABS_API_KEY) {
        return res.status(503).json({ 
          error: "ElevenLabs is not configured. Please add ELEVENLABS_API_KEY to use custom voices." 
        });
      }

      const { name, description } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!name) {
        return res.status(400).json({ error: "Voice name is required" });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "At least one audio file is required" });
      }

      if (files.length > 10) {
        return res.status(400).json({ error: "Maximum 10 audio files allowed" });
      }

      // Convert files to buffers
      const audioBuffers = files.map(file => file.buffer);

      const result = await elevenLabsService.createVoiceClone({
        name,
        description,
        files: audioBuffers,
        labels: { type: 'custom_clone' }
      });

      res.json({
        success: true,
        voiceId: result.voiceId,
        name: result.name,
        message: `Voice "${result.name}" cloned successfully! You can now use it for text-to-speech.`
      });
    } catch (error) {
      console.error("Error cloning voice:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to clone voice";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Delete custom voice endpoint
  app.delete("/api/elevenlabs/voices/:voiceId", async (req, res) => {
    try {
      if (!process.env.ELEVENLABS_API_KEY) {
        return res.status(503).json({ 
          error: "ElevenLabs is not configured." 
        });
      }

      const { voiceId } = req.params;
      await elevenLabsService.deleteVoice(voiceId);
      
      res.json({ success: true, message: "Voice deleted successfully" });
    } catch (error) {
      console.error("Error deleting voice:", error);
      res.status(500).json({ error: "Failed to delete voice" });
    }
  });

  // Chat endpoint. Order: repeat -> time/date -> arithmetic -> reminders -> appointments -> weather -> greeting -> AI.
  // Send {stream: true} to receive newline-delimited JSON: {"type":"delta","text"} ... {"type":"done",...}.
  app.post("/api/chat", async (req, res) => {
    const user = req.user!;
    const { message, conversationId, language = "en" } = req.body ?? {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }
    if (message.length > 8000) return res.status(400).json({ error: "That message is too long. Please keep it under 8,000 characters." });
    const timeZone = validTimeZone(req.body?.timeZone || user.timeZone);

    try {
      let conversation: chats.StoredConversation | null = null;
      if (conversationId) {
        conversation = await chats.getConversation(user.id, String(conversationId));
        if (!conversation) return res.status(404).json({ error: "Conversation not found." });
      }
      const convId = conversation?.id;
      // Which bot answers: the conversation's bot, else body.botId, else Bertha (null).
      const botId = conversation ? conversation.botId : (typeof req.body?.botId === "string" && req.body.botId ? req.body.botId : null);
      const bot = botId ? await getChatBot(botId, user.id) : null;
      if (botId && !bot) return res.status(403).json({ error: "This bot is no longer shared, so you can't chat with it. Your earlier messages are still here.", code: "bot_unavailable" });
      if (bot && !conversation) await rememberSharedBot(user.id, bot);
      await assertCanSendMessage(user.id);
      const quickReply = async (response: string, metadata: Record<string, unknown>) => {
        await chats.saveExchange(convId, message, response, metadata);
        await recordMessage(user.id, false).catch(error => console.error("usage count failed", error));
        return res.json({ response, searchUsed: false, translationUsed: false, conversationId: convId, timestamp: new Date().toISOString(), ...metadata });
      };

      // Local answers first: they are exact, instant and work even when the AI is down.
      if (isRepeatRequest(message)) {
        const fromClient = typeof req.body?.lastReply === "string" ? req.body.lastReply.trim().slice(0, 8000) : "";
        const saved = convId ? [...await chats.getMessages(convId, 40)].reverse().find(m => m.role === "assistant")?.content : undefined;
        const last = fromClient || saved;
        return quickReply(last || (bot ? "I haven't said anything in this chat yet." : "I haven't said anything yet, dear. What would you like to talk about?"), { isRepeat: true });
      }
      const timeAnswer = answerTimeQuestion(message, timeZone);
      if (timeAnswer) return quickReply(timeAnswer, { isLocalAnswer: "time" });
      const mathAnswer = answerArithmetic(message);
      if (mathAnswer) return quickReply(mathAnswer, { isLocalAnswer: "math" });

      const reminderReply = await handleReminderChat(message, user.id, timeZone);
      if (reminderReply !== null) return quickReply(reminderReply, { isReminderResponse: true, appointment: true });

      const appointmentReply = await handleAppointmentChat(message, user.id, timeZone);
      if (appointmentReply !== null) return quickReply(appointmentReply, { appointment: true });

      // Weather (live data from the weather service) unless this is a writing request.
      const isWeatherRequest = !WRITING_REQUEST.test(message) &&
        /\b(weather|forecast|temperature outside|is it (?:raining|snowing)|will it (?:rain|snow)|going to (?:rain|snow))\b|what's it like outside|how's the weather/i.test(message);
      if (isWeatherRequest) {
        try {
          let location = "New York";
          const locationPatterns = [
            /weather (?:in|for|at) ([^?.!]+)/i, /temperature in ([^?.!]+)/i, /forecast (?:for|in) ([^?.!]+)/i,
            /what's it like in ([^?.!]+)/i, /how's the weather in ([^?.!]+)/i, /\b(?:rain|snow|sunny|cloudy) in ([^?.!]+)/i,
          ];
          for (const pattern of locationPatterns) {
            const match = message.match(pattern);
            if (match?.[1]) { location = match[1].replace(/\b(today|tomorrow|now|right now|this week)\b/gi, "").trim() || location; break; }
          }
          const weatherData = await weatherService.getWeatherByLocation(location);
          if (weatherData.current) {
            return quickReply(weatherService.formatWeatherResponse(weatherData), { isWeatherResponse: true, location });
          }
          return quickReply(`I'm sorry, dear. I couldn't find weather information for "${location}". Could you try a different city name or check the spelling?`, { isWeatherResponse: true, error: "location_not_found" });
        } catch (error) {
          console.error("Error getting weather in chat:", error);
          // fall through to the AI, which will say it has no live weather
        }
      }

      const messages = convId ? await chats.getMessages(convId, 40) : [];
      const conversationHistory = messages.map(msg => ({ role: msg.role, content: msg.content }));

      let recognizedUser: string | null = null;
      const voiceMatch = voiceProfileStorage.findMatch(message, language);
      if (voiceMatch && voiceMatch.confidence > 0.6) {
        recognizedUser = voiceMatch.name;
        voiceProfileStorage.updateUsage(voiceMatch.profileId);
      }

      if (!bot && /^(hi|hello|hey|good morning|good afternoon|good evening)[\s,.!?]*(bertha)?[\s.!?]*$/i.test(message.trim())) {
        const quickResponses = ["Hello dear", "Hello, my child", "Hi there, dear", "Good to see you", "I'm well, thank you dear", "Hello my precious"];
        return quickReply(quickResponses[Math.floor(Math.random() * quickResponses.length)], { isQuickResponse: true });
      }

      const upcomingAppointments = (await listAppointments(user.id).catch(() => []))
        .filter(item => item.status === "scheduled" && new Date(item.endAt).getTime() > Date.now())
        .slice(0, 15)
        .map(item => `${item.title} — ${describeTime(item.startsAt, item.timeZone)}${item.location ? ` at ${item.location}` : ""}`);
      const ctx: ChatContext = {
        language, timeZone, userName: user.displayName, recognizedUser, upcomingAppointments,
        bot: bot ? { name: bot.name, instructions: bot.instructions, model: bot.model, showInstructions: bot.showInstructions } : null,
      };
      const metadata = { model: modelFor(ctx), translationUsed: language !== "en", ...(bot ? { botId: bot.id } : {}) };
      const sorry = bot ? "Sorry, I couldn't put an answer together. Please ask me again." : "I'm sorry, dear, I couldn't put an answer together. Please ask me again.";
      const countAI = () => recordMessage(user.id, true).catch(error => console.error("usage count failed", error));

      if (req.body?.stream !== true) {
        const ai = await generateChatResponse(message, conversationHistory, ctx);
        await chats.saveExchange(convId, message, ai.content, metadata);
        await countAI();
        return res.json({ response: ai.content, searchUsed: false, translationUsed: ai.translationUsed, recognizedUser, conversationId: convId, timestamp: new Date().toISOString() });
      }

      // Throws (bad key, no credits...) before any bytes are sent, so errors stay clean JSON.
      const stream = await streamChatResponse(message, conversationHistory, ctx);
      await countAI();
      res.status(200);
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      let full = "";
      let clientGone = false;
      res.on("close", () => { clientGone = !res.writableEnded; });
      try {
        for await (const text of stream) {
          full += text;
          if (!clientGone) res.write(JSON.stringify({ type: "delta", text }) + "\n");
        }
      } catch (error) {
        const aiError = toAIError(error);
        if (full.trim()) await chats.saveExchange(convId, message, full.trim(), { ...metadata, incomplete: true }).catch(() => {});
        if (!clientGone) res.end(JSON.stringify({ type: "error", error: aiError.message, code: aiError.code, partial: full }) + "\n");
        return;
      }
      const response = full.trim() || sorry;
      await chats.saveExchange(convId, message, response, metadata);
      if (!clientGone) res.end(JSON.stringify({ type: "done", response, searchUsed: false, translationUsed: metadata.translationUsed, recognizedUser, conversationId: convId, timestamp: new Date().toISOString() }) + "\n");
    } catch (error) {
      if (res.headersSent) { try { res.end(); } catch {} return; }
      return sendError(res, error, "Failed to process chat message");
    }
  });

  // Translate text endpoint
  app.post("/api/translate", async (req, res) => {
    try {
      const { text, targetLanguage } = req.body;

      if (!text || !targetLanguage) {
        return res.status(400).json({ error: "Text and target language are required" });
      }

      const translatedText = await translateText(text, targetLanguage);
      res.json({ translatedText });

    } catch (error) {
      sendError(res, toAIError(error), "Translation failed");
    }
  });

  // Analyze image endpoint
  app.post("/api/analyze-image", async (req, res) => {
    try {
      const { imageData } = req.body;

      if (!imageData) {
        return res.status(400).json({ error: "Image data is required" });
      }

      // Remove data URL prefix if present
      const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, "");
      
      const analysis = await analyzeImage(base64Data);
      res.json({ analysis });

    } catch (error) {
      sendError(res, toAIError(error), "Image analysis failed");
    }
  });

  app.get("/api/conversations", async (req, res) => {
    try {
      const all = await chats.listConversations(req.user!.id);
      const filter = typeof req.query.botId === "string" ? req.query.botId : undefined; // "bertha" = built-in bot
      res.json(filter === undefined ? all : all.filter((c: any) => (c.botId ?? "bertha") === filter));
    }
    catch (error) { sendError(res, error, "Could not load your conversations."); }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      const botId = typeof req.body?.botId === "string" && req.body.botId && req.body.botId !== "bertha" ? req.body.botId : null;
      const bot = botId ? await getChatBot(botId, req.user!.id) : null;
      if (botId && !bot) return res.status(404).json({ error: "That bot doesn't exist or isn't shared.", code: "bot_not_found" });
      if (bot) await rememberSharedBot(req.user!.id, bot);
      res.status(201).json(await chats.createConversation(req.user!.id, req.body?.title, botId));
    }
    catch (error) { sendError(res, error, "Failed to create conversation"); }
  });

  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const conversation = await chats.getConversation(req.user!.id, req.params.id);
      if (!conversation) return res.status(404).json({ error: "Conversation not found." });
      res.json(conversation);
    } catch (error) { sendError(res, error, "Failed to load conversation"); }
  });

  app.patch("/api/conversations/:id", async (req, res) => {
    try {
      const conversation = await chats.renameConversation(req.user!.id, req.params.id, req.body?.title);
      if (!conversation) return res.status(404).json({ error: "Conversation not found." });
      res.json(conversation);
    } catch (error) { sendError(res, error, "Failed to rename conversation"); }
  });

  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      const conversation = await chats.getConversation(req.user!.id, req.params.id);
      if (!conversation) return res.status(404).json({ error: "Conversation not found." });
      res.json(await chats.getMessages(conversation.id));
    } catch (error) { sendError(res, error, "Failed to get messages"); }
  });

  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      const deleted = await chats.deleteConversation(req.user!.id, req.params.id);
      if (!deleted) return res.status(404).json({ error: "Conversation not found." });
      res.json({ success: true });
    } catch (error) { sendError(res, error, "Failed to delete conversation"); }
  });

  // User settings endpoints
  app.get("/api/settings/:userId", async (req, res) => {
    try {
      const userId = req.user!.id; // settings belong to the signed-in account, not the URL
      let settings = await storage.getUserSettings(userId);
      
      if (!settings) {
        // Create default settings
        settings = await storage.createUserSettings({
          userId,
          language: "en",
          speechEnabled: false,
          searchEnabled: true,
          customBackground: null,
          voiceSpeed: "1"
        });
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Get settings error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  app.put("/api/settings/:userId", async (req, res) => {
    try {
      const userId = req.user!.id; // settings belong to the signed-in account, not the URL
      const settingsData = insertUserSettingsSchema.parse(req.body);
      
      const settings = await storage.updateUserSettings(userId, settingsData);
      res.json(settings);
    } catch (error) {
      console.error("Update settings error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid settings data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Object storage routes for background images
  app.get("/objects/:objectPath(*)", async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      return res.sendStatus(404);
    }
  });

  app.post("/api/objects/upload", async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.put("/api/background-images", async (req, res) => {
    try {
      const { backgroundImageURL } = req.body;
      const userId = req.user!.id;
      
      if (!backgroundImageURL) {
        return res.status(400).json({ error: "backgroundImageURL and userId are required" });
      }

      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.normalizeObjectEntityPath(backgroundImageURL);

      // Update user settings with new background
      await storage.updateUserSettings(userId, {
        customBackground: objectPath
      });

      res.json({ objectPath });
    } catch (error) {
      console.error("Error setting background image:", error);
      res.status(500).json({ error: "Failed to set background image" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
