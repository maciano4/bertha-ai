import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Intent categories for user messages
export enum UserIntent {
  QUESTION = "question",
  COMMAND = "command", 
  CONVERSATION = "conversation",
  REQUEST_INFO = "request_info",
  REQUEST_ACTION = "request_action",
  CREATIVE_TASK = "creative_task",
  PROBLEM_SOLVING = "problem_solving",
  GREETING = "greeting",
  GOODBYE = "goodbye"
}

// Entity types that can be extracted from text
export interface ExtractedEntity {
  type: "person" | "location" | "organization" | "date" | "time" | "number" | "email" | "phone" | "url";
  value: string;
  confidence: number;
}

// Sentiment analysis result
export interface SentimentAnalysis {
  sentiment: "positive" | "negative" | "neutral";
  confidence: number;
  emotions: string[];
}

// Conversation context information
export interface ConversationContext {
  currentTopic: string;
  userPreferences: Record<string, any>;
  conversationTone: "formal" | "casual" | "technical" | "friendly";
  urgency: "low" | "medium" | "high";
}

// Main NLP analysis result
export interface NLPAnalysis {
  intent: UserIntent;
  entities: ExtractedEntity[];
  sentiment: SentimentAnalysis;
  context: ConversationContext;
  language: string;
  keywords: string[];
  summary: string;
  requiresAction: boolean;
  suggestedResponses: string[];
}

// Intent recognition using GPT-5
export async function recognizeIntent(message: string): Promise<UserIntent> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `Analyze the user's message and determine their intent. Respond with only one of these exact values:
          - question: User is asking a question
          - command: User is giving a command or instruction  
          - conversation: User wants to have a casual conversation
          - request_info: User is requesting specific information
          - request_action: User wants something to be done
          - creative_task: User wants help with creative work
          - problem_solving: User needs help solving a problem
          - greeting: User is greeting or starting conversation
          - goodbye: User is ending the conversation`
        },
        {
          role: "user",
          content: message
        }
      ],
      max_completion_tokens: 50
    });

    const intentStr = response.choices[0].message.content?.trim().toLowerCase();
    return intentStr as UserIntent || UserIntent.CONVERSATION;
  } catch (error) {
    console.error("Intent recognition error:", error);
    return UserIntent.CONVERSATION;
  }
}

// Entity extraction using GPT-5
export async function extractEntities(message: string): Promise<ExtractedEntity[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `Extract entities from the text and return as JSON array. Each entity should have:
          - type: person, location, organization, date, time, number, email, phone, url
          - value: the extracted text
          - confidence: 0-1 confidence score
          
          Example: [{"type": "person", "value": "John Smith", "confidence": 0.9}]
          Return empty array [] if no entities found. Respond only with valid JSON.`
        },
        {
          role: "user",
          content: message
        }
      ],
      max_completion_tokens: 200,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || '{"entities": []}');
    return result.entities || [];
  } catch (error) {
    console.error("Entity extraction error:", error);
    return [];
  }
}

// Sentiment analysis using GPT-5
export async function analyzeSentiment(message: string): Promise<SentimentAnalysis> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `Analyze the sentiment and emotions in the text. Return JSON with:
          - sentiment: "positive", "negative", or "neutral"
          - confidence: confidence score 0-1
          - emotions: array of detected emotions like ["happy", "excited", "frustrated"]
          
          Example: {"sentiment": "positive", "confidence": 0.8, "emotions": ["happy", "excited"]}
          Respond only with valid JSON.`
        },
        {
          role: "user",
          content: message
        }
      ],
      max_completion_tokens: 100,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || '{"sentiment": "neutral", "confidence": 0.5, "emotions": []}');
    return {
      sentiment: result.sentiment || "neutral",
      confidence: result.confidence || 0.5,
      emotions: result.emotions || []
    };
  } catch (error) {
    console.error("Sentiment analysis error:", error);
    return { sentiment: "neutral", confidence: 0.5, emotions: [] };
  }
}

// Detect language automatically
export async function detectLanguage(message: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "Detect the language of the text and respond with only the ISO 639-1 language code (e.g., 'en', 'es', 'fr', 'de', 'zh', 'ja'). If uncertain, respond with 'en'."
        },
        {
          role: "user",
          content: message
        }
      ],
      max_completion_tokens: 10
    });

    return response.choices[0].message.content?.trim().toLowerCase() || "en";
  } catch (error) {
    console.error("Language detection error:", error);
    return "en";
  }
}

// Extract keywords from message
export async function extractKeywords(message: string): Promise<string[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `Extract 3-7 key words or phrases from the text that capture the main concepts and topics. 
          Return as JSON array of strings: ["keyword1", "keyword2", "keyword3"]
          Focus on nouns, important verbs, and significant concepts. Respond only with valid JSON.`
        },
        {
          role: "user",
          content: message
        }
      ],
      max_completion_tokens: 100,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || '{"keywords": []}');
    return result.keywords || [];
  } catch (error) {
    console.error("Keyword extraction error:", error);
    return [];
  }
}

// Analyze conversation context
export async function analyzeContext(
  currentMessage: string, 
  conversationHistory: Array<{ role: string; content: string }>
): Promise<ConversationContext> {
  try {
    const recentHistory = conversationHistory.slice(-6).map(msg => `${msg.role}: ${msg.content}`).join('\n');
    
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `Analyze the conversation context and return JSON with:
          - currentTopic: main topic being discussed
          - conversationTone: "formal", "casual", "technical", or "friendly"  
          - urgency: "low", "medium", or "high" based on user's needs
          - userPreferences: object with any preferences mentioned
          
          Example: {"currentTopic": "weather", "conversationTone": "casual", "urgency": "low", "userPreferences": {}}
          Respond only with valid JSON.`
        },
        {
          role: "user",
          content: `Recent conversation:\n${recentHistory}\n\nCurrent message: ${currentMessage}`
        }
      ],
      max_completion_tokens: 150,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      currentTopic: result.currentTopic || "general",
      userPreferences: result.userPreferences || {},
      conversationTone: result.conversationTone || "friendly",
      urgency: result.urgency || "low"
    };
  } catch (error) {
    console.error("Context analysis error:", error);
    return {
      currentTopic: "general",
      userPreferences: {},
      conversationTone: "friendly",
      urgency: "low"
    };
  }
}

// Generate conversation summary
export async function summarizeConversation(
  conversationHistory: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    if (conversationHistory.length < 4) return "Brief conversation started";
    
    const fullHistory = conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "Provide a concise 1-2 sentence summary of the key points discussed in this conversation. Focus on main topics and any important decisions or information shared."
        },
        {
          role: "user",
          content: fullHistory
        }
      ],
      max_completion_tokens: 100
    });

    return response.choices[0].message.content || "Conversation in progress";
  } catch (error) {
    console.error("Summarization error:", error);
    return "Conversation in progress";
  }
}

// Complete NLP analysis
export async function performNLPAnalysis(
  message: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<NLPAnalysis> {
  try {
    // Run multiple NLP analyses in parallel for efficiency
    const [intent, entities, sentiment, context, detectedLanguage, keywords] = await Promise.all([
      recognizeIntent(message),
      extractEntities(message),
      analyzeSentiment(message), 
      analyzeContext(message, conversationHistory),
      detectLanguage(message),
      extractKeywords(message)
    ]);

    // Generate summary for longer conversations
    const summary = conversationHistory.length > 3 
      ? await summarizeConversation(conversationHistory)
      : "New conversation started";

    // Determine if action is required
    const requiresAction = [
      UserIntent.COMMAND,
      UserIntent.REQUEST_ACTION,
      UserIntent.PROBLEM_SOLVING
    ].includes(intent) || context.urgency === "high";

    // Generate suggested responses based on intent and sentiment
    const suggestedResponses = generateSuggestedResponses(intent, sentiment, context);

    return {
      intent,
      entities,
      sentiment,
      context,
      language: detectedLanguage,
      keywords,
      summary,
      requiresAction,
      suggestedResponses
    };
  } catch (error) {
    console.error("NLP analysis error:", error);
    // Return basic analysis on error
    return {
      intent: UserIntent.CONVERSATION,
      entities: [],
      sentiment: { sentiment: "neutral", confidence: 0.5, emotions: [] },
      context: { currentTopic: "general", userPreferences: {}, conversationTone: "friendly", urgency: "low" },
      language: "en",
      keywords: [],
      summary: "Analysis unavailable",
      requiresAction: false,
      suggestedResponses: []
    };
  }
}

// Generate suggested response approaches
function generateSuggestedResponses(
  intent: UserIntent,
  sentiment: SentimentAnalysis,
  context: ConversationContext
): string[] {
  const suggestions: string[] = [];

  switch (intent) {
    case UserIntent.QUESTION:
      suggestions.push("Provide a detailed answer", "Ask for clarification if needed");
      break;
    case UserIntent.COMMAND:
      suggestions.push("Acknowledge the command", "Explain what will be done");
      break;
    case UserIntent.PROBLEM_SOLVING:
      suggestions.push("Break down the problem", "Offer step-by-step solution");
      break;
    case UserIntent.CREATIVE_TASK:
      suggestions.push("Encourage creativity", "Provide multiple options");
      break;
    case UserIntent.GREETING:
      suggestions.push("Respond warmly", "Ask how you can help");
      break;
  }

  // Adjust for sentiment
  if (sentiment.sentiment === "negative") {
    suggestions.push("Show empathy", "Offer reassurance");
  } else if (sentiment.sentiment === "positive") {
    suggestions.push("Match enthusiasm", "Build on positive energy");
  }

  // Adjust for urgency
  if (context.urgency === "high") {
    suggestions.push("Prioritize quick response", "Offer immediate help");
  }

  return suggestions.slice(0, 3); // Return top 3 suggestions
}