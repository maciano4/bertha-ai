import OpenAI from "openai";
import { performNLPAnalysis, type NLPAnalysis } from "./nlp";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "default_key"
});

export interface ChatResponse {
  content: string;
  reasoning?: string;
  searchUsed?: boolean;
  translationUsed?: boolean;
  nlpAnalysis?: NLPAnalysis;
}

export async function generateChatResponse(
  userInput: string,
  conversationHistory: Array<{ role: string; content: string }>,
  language: string = "en",
  searchResults?: string,
  includeNLP: boolean = true,
  recognizedUser?: string
): Promise<ChatResponse> {
  try {
    // Perform NLP analysis on the user's message
    let nlpAnalysis: NLPAnalysis | undefined;
    if (includeNLP) {
      nlpAnalysis = await performNLPAnalysis(userInput, conversationHistory);
      
      // Use detected language if not explicitly provided
      if (language === "en" && nlpAnalysis.language !== "en") {
        language = nlpAnalysis.language;
      }
    }

    let systemPrompt = `You are Bertha, an intelligent AI assistant. You are helpful, knowledgeable, and conversational. 
    Always provide thoughtful and detailed responses. If web search results are provided, incorporate them naturally into your response.
    
    Response language: ${language === "en" ? "English" : `Translate your response to language code: ${language}`}`;

    // Add voice recognition context
    if (recognizedUser) {
      systemPrompt += `\n\nIMPORTANT: The user speaking to you is ${recognizedUser}. Address them by name and personalize your responses. Show that you remember them and are happy to chat with them again.`;
    }

    // Enhance system prompt with NLP insights
    if (nlpAnalysis) {
      systemPrompt += `\n\nContext Analysis:
      - User Intent: ${nlpAnalysis.intent}
      - Conversation Topic: ${nlpAnalysis.context.currentTopic}
      - User Sentiment: ${nlpAnalysis.sentiment.sentiment} (${nlpAnalysis.sentiment.confidence.toFixed(2)} confidence)
      - Conversation Tone: ${nlpAnalysis.context.conversationTone}
      - Urgency Level: ${nlpAnalysis.context.urgency}
      - Key Topics: ${nlpAnalysis.keywords.join(", ")}
      
      Respond appropriately based on this analysis. ${nlpAnalysis.requiresAction ? "This message requires action or assistance." : ""}
      ${nlpAnalysis.sentiment.emotions.length > 0 ? `User emotions detected: ${nlpAnalysis.sentiment.emotions.join(", ")}` : ""}`;
    }

    if (searchResults) {
      systemPrompt += `\n\nWeb search results for context:\n${searchResults}`;
    }

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-6).map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.content
      })),
      { role: "user", content: userInput }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages,
      max_completion_tokens: 1000,
    });

    const content = response.choices[0].message.content || "I apologize, but I couldn't generate a response.";

    return {
      content,
      searchUsed: !!searchResults,
      translationUsed: language !== "en",
      nlpAnalysis
    };
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error("Failed to generate AI response. Please check your OpenAI API key configuration.");
  }
}

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  try {
    if (targetLanguage === "en") return text;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `Translate the following text to language code: ${targetLanguage}. Return only the translation, no additional text.`
        },
        {
          role: "user",
          content: text
        }
      ],
      max_completion_tokens: 500,
    });

    return response.choices[0].message.content || text;
  } catch (error) {
    console.error("Translation error:", error);
    return text; // Return original text if translation fails
  }
}

export async function analyzeImage(base64Image: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this image and describe what you see. Be detailed and helpful in your description."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_completion_tokens: 500,
    });

    return response.choices[0].message.content || "I couldn't analyze this image.";
  } catch (error) {
    console.error("Image analysis error:", error);
    throw new Error("Failed to analyze image");
  }
}
