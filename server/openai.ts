import OpenAI from "openai";
import { performNLPAnalysis, type NLPAnalysis } from "./nlp";

// Using GPT-3.5-turbo for faster responses. GPT-4o only needed for images/complex tasks
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OpenAI_API_KEY || process.env.OPENAI_KEY || "default_key"
});

export interface ChatResponse {
  content: string;
  reasoning?: string;
  searchUsed?: boolean;
  translationUsed?: boolean;
  nlpAnalysis?: NLPAnalysis;
}

// Function to get real-time information in Eastern Time
function getRealTimeInfo(): string {
  const now = new Date();
  // Use Eastern Time zone for Bertha
  const timeString = now.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true,
    timeZone: 'America/New_York'
  });
  const dateString = now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'America/New_York'
  });
  
  return `Current real-time information (Eastern Time):
- Current time: ${timeString}
- Current date: ${dateString}
- Day of week: ${now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })}
- Month: ${now.toLocaleDateString('en-US', { month: 'long', timeZone: 'America/New_York' })}
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
    // The NLP analysis makes 6-7 separate gpt-4o calls before Bertha even starts to answer. That made
    // every turn take many seconds, which breaks a spoken back-and-forth, and a one-word reply could be
    // mis-detected as another language and flip her into translating. It is now off unless BERTHA_NLP=1.
    let nlpAnalysis: NLPAnalysis | undefined;
    if (includeNLP && process.env.BERTHA_NLP === "1") {
      nlpAnalysis = await performNLPAnalysis(userInput, conversationHistory);
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
    
    RESPONSE LENGTH RULES:
    - For GREETINGS (hi, hello, how are you): Keep EXTREMELY SHORT (maximum 5-8 words). Examples: "Hello dear", "I'm well, thanks", "Good morning"
    - For STORIES/EXPLANATIONS/ADVICE (tell me a story, explain theory, give advice): Be DETAILED and THOROUGH like a wise grandmother sharing knowledge. Use 3-4 sentences minimum.
    - For TIME/DATE questions: Keep short like "It's 3 PM now" or "It's Sunday, dear"
    - NEVER use emojis in ANY response.
    
    CONVERSATION RULES:
    - This is one continuous, spoken conversation. The earlier messages are what you and the user already said, so remember them.
    - Understand short follow-ups ("and tomorrow?", "why?", "tell me more", "yes", "what about him?") from what was just discussed.
    - Do not greet again or reintroduce yourself after the first message. Pick up where you left off.
    - If a reply would be long, finish your last sentence cleanly and invite the user to ask for more.

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
      ...conversationHistory.filter(msg => msg.role === "user" || msg.role === "assistant").slice(-20).map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.content
      })),
      { role: "user", content: userInput }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
      max_completion_tokens: 300,
      temperature: 0.7,
      top_p: 0.9
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
    // Pass the provider's status and code (e.g. 429 insufficient_quota) on so the app can say why.
    const status = (error as any)?.status;
    const code = (error as any)?.code || (error as any)?.error?.code || (error as any)?.type;
    const detail = [status, code].filter(Boolean).join(" ");
    throw new Error(`AI service unavailable (OpenAI${detail ? ` ${detail}` : ""}). ${status === 401 ? "Check the OPENAI_API_KEY secret." : status === 429 && code === "insufficient_quota" ? "The OpenAI account is out of credits." : "Please try again later."}`);
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
