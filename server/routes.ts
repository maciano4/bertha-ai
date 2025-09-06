import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateChatResponse, translateText, analyzeImage } from "./openai";
import { voiceProfileStorage, analyzeVoiceInput, type VoiceProfile } from "./voiceProfiles";
import { ObjectStorageService } from "./objectStorage";
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

  // Chat endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, conversationId, language = "en", searchEnabled = true } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
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
