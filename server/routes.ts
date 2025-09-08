import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateChatResponse, translateText, analyzeImage } from "./openai";
import { voiceProfileStorage, analyzeVoiceInput, type VoiceProfile } from "./voiceProfiles";
import { ObjectStorageService } from "./objectStorage";
import { reminderService } from "./reminderService";
import { WeatherService } from "./weatherService";
import { insertMessageSchema, insertUserSettingsSchema } from "@shared/schema";
import { z } from "zod";

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
        lastUsed: p.lastUsed
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

  // Chat endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, conversationId, language = "en", searchEnabled = true } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
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

      // Perform web search if enabled and query seems to benefit from it
      let searchResults = "";
      if (searchEnabled && (message.includes("?") || message.includes("what") || message.includes("how"))) {
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

      // Generate AI response with NLP analysis
      const aiResponse = await generateChatResponse(
        message,
        conversationHistory,
        language,
        searchResults,
        true, // Enable NLP analysis
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

  // Create conversation
  app.post("/api/conversations", async (req, res) => {
    try {
      const { title } = req.body;
      
      const conversation = await storage.createConversation({
        title: title || "New Conversation"
      });
      
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
