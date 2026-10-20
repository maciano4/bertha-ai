import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateChatResponse, translateText, analyzeImage } from "./openai";
import { voiceProfileStorage, analyzeVoiceInput, type VoiceProfile } from "./voiceProfiles";
import { ObjectStorageService } from "./objectStorage";
import { reminderService } from "./reminderService";
import { WeatherService } from "./weatherService";
import { elevenLabsService } from "./elevenLabsService";
import { insertMessageSchema, insertUserSettingsSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import { registerAppointmentRoutes, handleAppointmentChat } from "./appointments";

// Simple web search using Google (fallback implementation)
async function performWebSearch(query: string): Promise<string> {
  try {
    // In a real implementation, you would use Google Search API
    // For now, return a placeholder that indicates search was attempted
    return `Web search performed for: "${query}". To enable full web search functionality, configure Google Search API.`;
  } catch (error) {
    console.error("Web search error:", error);
    return "Web search unavailable.";
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  registerAppointmentRoutes(app);
  // Conversation identifiers alone must never grant access to another visitor's history.
  app.use("/api", async (req, res, next) => {
    const pathId = /^\/conversations\/([^/]+)/.exec(req.path)?.[1];
    const id = pathId || (req.path === "/chat" ? req.body?.conversationId : null);
    if (id) {
      const conversation = await storage.getConversation(id);
      if (!conversation || conversation.userId !== req.sessionID) {
        return res.status(404).json({ error: "Conversation not found in this browser session." });
      }
    }
    next();
  });
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

  // Reminder and planning endpoints
  app.get("/api/reminders/due", async (req, res) => {
    try {
      const dueReminders = await reminderService.getDueReminders();
      res.json(dueReminders);
    } catch (error) {
      console.error("Error getting due reminders:", error);
      res.status(500).json({ error: "Failed to get due reminders" });
    }
  });

  app.get("/api/reminders/check", async (req, res) => {
    try {
      const notifications = await reminderService.checkAndNotifyDueReminders();
      res.json({ notifications });
    } catch (error) {
      console.error("Error checking reminders:", error);
      res.status(500).json({ error: "Failed to check reminders" });
    }
  });

  app.get("/api/plans/today", async (req, res) => {
    try {
      const todaysPlan = await reminderService.getTodaysPlan();
      res.json(todaysPlan);
    } catch (error) {
      console.error("Error getting today's plan:", error);
      res.status(500).json({ error: "Failed to get today's plan" });
    }
  });

  app.get("/api/plans/:date", async (req, res) => {
    try {
      const { date } = req.params;
      
      // Validate date format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
      }

      const plan = await reminderService.getPlanForDate(date);
      res.json(plan);
    } catch (error) {
      console.error(`Error getting plan for ${req.params.date}:`, error);
      res.status(500).json({ error: "Failed to get plan for specified date" });
    }
  });

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

  // Chat endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, conversationId, language = "en", searchEnabled = true } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      const appointmentReply = await handleAppointmentChat(message, req.sessionID, req.body.timeZone);
      if (appointmentReply !== null) {
        if (conversationId) {
          await storage.createMessage({ conversationId, role: "user", content: message, metadata: null });
          await storage.createMessage({ conversationId, role: "assistant", content: appointmentReply, metadata: { appointment: true } });
        }
        return res.json({ response: appointmentReply, searchUsed: false, translationUsed: false, timestamp: new Date().toISOString() });
      }

      // Check for reminder or planning requests first
      const reminderParseResult = await reminderService.parseReminderCommand(message);
      
      if (reminderParseResult.hasReminder || reminderParseResult.hasPlanningRequest) {
        const reminderResponse = await reminderService.processReminderRequest(message);
        
        // Save user message and reminder response
        if (conversationId) {
          await storage.createMessage({
            conversationId,
            role: "user",
            content: message,
            metadata: null
          });

          await storage.createMessage({
            conversationId,
            role: "assistant",
            content: reminderResponse,
            metadata: {
              isReminderResponse: true,
              reminderType: reminderParseResult.hasPlanningRequest ? 'planning' : 'reminder'
            }
          });
        }

        return res.json({
          response: reminderResponse,
          searchUsed: false,
          translationUsed: false,
          isReminderResponse: true
        });
      }

      // Check for weather requests
      const weatherPatterns = [
        /weather/i,
        /temperature/i,
        /rain/i,
        /snow/i,
        /forecast/i,
        /sunny/i,
        /cloudy/i,
        /humid/i,
        /wind/i,
        /what's it like/i,
        /how's the weather/i,
        /weather like/i
      ];

      const isWeatherRequest = weatherPatterns.some(pattern => pattern.test(message));
      
      if (isWeatherRequest) {
        try {
          // Extract location from message or use default
          let location = "New York"; // Default location (US Eastern time)
          
          // Try to extract location from common patterns
          const locationPatterns = [
            /weather in ([^?]+)/i,
            /weather for ([^?]+)/i,
            /weather at ([^?]+)/i,
            /temperature in ([^?]+)/i,
            /forecast for ([^?]+)/i,
            /forecast in ([^?]+)/i,
            /what's it like in ([^?]+)/i,
            /how's the weather in ([^?]+)/i
          ];

          for (const pattern of locationPatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
              location = match[1].trim().replace(/\?$/, '');
              break;
            }
          }

          // Get weather data
          const weatherData = await weatherService.getWeatherByLocation(location);
          
          if (weatherData.current) {
            const weatherResponse = weatherService.formatWeatherResponse(weatherData);
            
            // Save user message and weather response
            if (conversationId) {
              await storage.createMessage({
                conversationId,
                role: "user",
                content: message,
                metadata: null
              });

              await storage.createMessage({
                conversationId,
                role: "assistant",
                content: weatherResponse,
                metadata: {
                  isWeatherResponse: true,
                  location: location
                }
              });
            }

            return res.json({
              response: weatherResponse,
              searchUsed: false,
              translationUsed: false,
              isWeatherResponse: true,
              location: location
            });
          } else {
            // If weather data not found, provide a helpful message
            const errorResponse = `I'm sorry, dear. I couldn't find weather information for "${location}". Could you try a different city name or check the spelling?`;
            
            if (conversationId) {
              await storage.createMessage({
                conversationId,
                role: "user",
                content: message,
                metadata: null
              });

              await storage.createMessage({
                conversationId,
                role: "assistant",
                content: errorResponse,
                metadata: {
                  isWeatherResponse: true,
                  error: "location_not_found"
                }
              });
            }

            return res.json({
              response: errorResponse,
              searchUsed: false,
              translationUsed: false,
              isWeatherResponse: true,
              error: "location_not_found"
            });
          }
        } catch (error) {
          console.error("Error getting weather in chat:", error);
          // Fall through to regular AI response if weather fails
        }
      }

      // Get conversation history
      const messages = conversationId 
        ? await storage.getConversationMessages(conversationId)
        : [];

      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Check for simple greetings to optimize performance
      const simpleGreetings = /^(hi|hello|hey|good morning|good afternoon|good evening|how are you|what's up)$/i;
      const isSimpleGreeting = simpleGreetings.test(message.trim());
      
      // Skip web search for simple greetings to speed up response
      let searchResults = "";
      if (!isSimpleGreeting && searchEnabled && (message.includes("?") || message.includes("what") || message.includes("how"))) {
        searchResults = await performWebSearch(message);
      }

      // Check for voice recognition if message contains speech
      let recognizedUser: string | null = null;
      const voiceMatch = voiceProfileStorage.findMatch(message, language);
      if (voiceMatch && voiceMatch.confidence > 0.6) {
        recognizedUser = voiceMatch.name;
        voiceProfileStorage.updateUsage(voiceMatch.profileId);
      }

      // Check if user is asking to repeat the last response
      const repeatPatterns = [
        /can you repeat/i,
        /repeat that/i,
        /say that again/i,
        /what did you say/i,
        /repeat please/i,
        /repeat last/i
      ];
      
      const isRepeatRequest = repeatPatterns.some(pattern => pattern.test(message.trim()));
      
      if (isRepeatRequest && messages.length > 0) {
        // Find the last assistant message
        const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
        
        if (lastAssistantMessage) {
          console.log('🔄 Repeat request detected - returning last assistant message:', lastAssistantMessage.content.slice(0, 50));
          
          // Save user message
          if (conversationId) {
            await storage.createMessage({
              conversationId,
              role: "user",
              content: message,
              metadata: null
            });

            // Save the repeated assistant message
            await storage.createMessage({
              conversationId,
              role: "assistant",
              content: lastAssistantMessage.content,
              metadata: {
                isRepeat: true
              }
            });
          }

          return res.json({
            response: lastAssistantMessage.content,
            searchUsed: false,
            translationUsed: false,
            isRepeat: true
          });
        }
      }

      // For simple greetings, provide instant responses to achieve 1-second target
      if (isSimpleGreeting) {
        const quickResponses = [
          "Hello dear",
          "Hello, my child",
          "Hi there, dear",
          "Good to see you",
          "I'm well, thank you dear",
          "Hello my precious"
        ];
        
        const quickResponse = quickResponses[Math.floor(Math.random() * quickResponses.length)];
        
        // Save messages quickly
        if (conversationId) {
          await storage.createMessage({
            conversationId,
            role: "user",
            content: message,
            metadata: null
          });

          await storage.createMessage({
            conversationId,
            role: "assistant",
            content: quickResponse,
            metadata: { isQuickResponse: true }
          });
        }

        return res.json({
          response: quickResponse,
          searchUsed: false,
          translationUsed: false,
          isQuickResponse: true,
          timestamp: new Date().toISOString()
        });
      }

      // For complex messages, use full AI response
      const aiResponse = await generateChatResponse(
        message,
        conversationHistory,
        language,
        searchResults,
        true, // Enable NLP analysis for complex messages
        recognizedUser || undefined // Pass recognized user
      );

      // Save user message if conversation exists
      if (conversationId) {
        await storage.createMessage({
          conversationId,
          role: "user",
          content: message,
          metadata: aiResponse.nlpAnalysis ? {
            intent: aiResponse.nlpAnalysis.intent,
            sentiment: aiResponse.nlpAnalysis.sentiment,
            entities: aiResponse.nlpAnalysis.entities,
            keywords: aiResponse.nlpAnalysis.keywords
          } : null
        });

        // Save AI response
        await storage.createMessage({
          conversationId,
          role: "assistant",
          content: aiResponse.content,
          metadata: {
            searchUsed: aiResponse.searchUsed,
            translationUsed: aiResponse.translationUsed,
            searchResults: searchResults || undefined,
            nlpAnalysis: aiResponse.nlpAnalysis
          }
        });
      }


      res.json({
        response: aiResponse.content,
        searchUsed: aiResponse.searchUsed,
        translationUsed: aiResponse.translationUsed,
        recognizedUser,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process chat message" 
      });
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
      console.error("Translation error:", error);
      res.status(500).json({ error: "Translation failed" });
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
      console.error("Image analysis error:", error);
      res.status(500).json({ error: "Image analysis failed" });
    }
  });

  app.get("/api/conversations", async (req, res) => {
    try {
      const conversations = await storage.getUserConversations(req.sessionID);
      const result = await Promise.all(conversations.map(async conversation => {
        const messages = await storage.getConversationMessages(conversation.id);
        return {
          ...conversation,
          messageCount: messages.length,
          lastMessage: messages.at(-1)?.content || "",
          lastActivityAt: messages.at(-1)?.createdAt || conversation.updatedAt,
        };
      }));
      res.json(result.sort((a, b) => new Date(b.lastActivityAt!).getTime() - new Date(a.lastActivityAt!).getTime()));
    } catch {
      res.status(500).json({ error: "Could not load your conversations." });
    }
  });

  // Create conversation
  app.post("/api/conversations", async (req, res) => {
    try {
      const { title } = req.body;
      
      const conversation = await storage.createConversation({
        title: title || "New Conversation"
      }, req.sessionID);
      
      res.json(conversation);
    } catch (error) {
      console.error("Create conversation error:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Get conversation messages
  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      const { id } = req.params;
      const messages = await storage.getConversationMessages(id);
      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ error: "Failed to get messages" });
    }
  });

  // Delete conversation
  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteConversation(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete conversation error:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // User settings endpoints
  app.get("/api/settings/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
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
      const { userId } = req.params;
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
      const { backgroundImageURL, userId } = req.body;
      
      if (!backgroundImageURL || !userId) {
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
