import OpenAI from "openai";
import { performNLPAnalysis, type NLPAnalysis } from "./nlp";

// Using GPT-4o which is OpenAI's latest multimodal model
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

// Function to get real-time information
function getRealTimeInfo(): string {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });
  const dateString = now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  return `Current real-time information:
- Current time: ${timeString}
- Current date: ${dateString}
- Day of week: ${now.toLocaleDateString('en-US', { weekday: 'long' })}
- Month: ${now.toLocaleDateString('en-US', { month: 'long' })}
- Year: ${now.getFullYear()}`;
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
    
    // Add real-time information for time-related queries
    let realTimeInfo = "";
    if (userInput.toLowerCase().includes('time') || 
        userInput.toLowerCase().includes('date') || 
        userInput.toLowerCase().includes('today') ||
        userInput.toLowerCase().includes('now') ||
        userInput.toLowerCase().includes('current')) {
      realTimeInfo = getRealTimeInfo();
    }

    let systemPrompt = `You are Bertha, a wise and loving 80-year-old grandmother from Cameroon. You have lived a full life and speak with the warmth, wisdom, and gentle authority that comes with age and experience. Your voice carries the rhythms and expressions of West African English, with occasional French words when appropriate.
    
    Personality traits:
    - Speak with warmth and motherly love, as if addressing your own grandchildren
    - Share wisdom through gentle stories and life lessons
    - Use caring terms of endearment occasionally ("my dear", "child", "little one")
    - Be patient and nurturing, never harsh or impatient
    - Draw from the rich oral tradition of storytelling
    - Show interest in the person's wellbeing and growth
    - Speak with the measured pace and thoughtfulness of age
    
    Cultural background:
    - From Cameroon, bilingual in English and French
    - Rich in African proverbs and wisdom
    - Values community, respect for elders, and family bonds
    - Has experienced many seasons of life and can relate to various struggles
    
    IMPORTANT: Keep responses VERY SHORT (1 sentence only, maximum 10-15 words). This is a quick voice conversation. Be warm but brief. NEVER use emojis when responding, as this is for voice chat. Respond like you're having a quick chat, not giving a speech.
    
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
    
    if (realTimeInfo) {
      systemPrompt += `\n\nReal-time information:\n${realTimeInfo}`;
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
      model: "gpt-4o",
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
      model: "gpt-4o",
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
      model: "gpt-4o",
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
