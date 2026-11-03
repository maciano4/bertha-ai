// Shared client types and helpers for custom bots.
/** private = only the owner; link = anyone signed in who has the /b/<slug> link. */
export type Visibility = "private" | "link";

/** What every viewer may see about a bot (the share card). */
export interface PublicBot {
  id: string;
  slug: string;
  name: string;
  description: string;
  greeting: string;
  avatarEmoji: string;
  avatarUrl: string | null;
  voiceName: string | null;
  voiceRate: number;
  voicePitch: number;
  visibility: Visibility;
  creatorName?: string | null;
  instructions?: string;
  isOwner: boolean;
  chatCount?: number;
}

/** The full bot, only returned to its owner. */
export interface OwnedBot extends PublicBot {
  ownerId: string;
  instructions: string;
  model: string | null;
  showInstructions: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BotForm = {
  name: string;
  description: string;
  instructions: string;
  greeting: string;
  avatarEmoji: string;
  avatarUrl: string | null;
  voiceName: string | null;
  voiceRate: number;
  voicePitch: number;
  model: string | null;
  visibility: Visibility;
  showInstructions: boolean;
};

/** Who is answering in the chat. Bertha is the built-in default (id null). */
export interface ChatBot {
  id: string | null;
  name: string;
  greeting: string;
  avatarEmoji: string;
  avatarUrl: string | null;
  voiceName: string | null;
  voiceRate: number;
  voicePitch: number;
}

export const BERTHA_AVATAR = "/icons/icon-192.png";
export const BERTHA: ChatBot = {
  id: null, name: "Bertha", greeting: "", avatarEmoji: "", avatarUrl: BERTHA_AVATAR,
  voiceName: null, voiceRate: 1, voicePitch: 1,
};

export const toChatBot = (bot: PublicBot | OwnedBot): ChatBot => ({
  id: bot.id, name: bot.name, greeting: bot.greeting, avatarEmoji: bot.avatarEmoji || "🤖",
  avatarUrl: bot.avatarUrl, voiceName: bot.voiceName, voiceRate: Number(bot.voiceRate) || 1, voicePitch: Number(bot.voicePitch ?? 1),
});

export const shareUrl = (slug: string) => `${window.location.origin}/b/${slug}`;

export const LIMITS = { name: 60, description: 300, instructions: 8000, greeting: 500 };

export const EMPTY_BOT: BotForm = {
  name: "", description: "", instructions: "", greeting: "", avatarEmoji: "🤖", avatarUrl: null,
  voiceName: null, voiceRate: 1, voicePitch: 1, model: null, visibility: "private", showInstructions: false,
};

export const TEMPLATES: Array<{ key: string; label: string; bot: Partial<BotForm> }> = [
  {
    key: "tutor", label: "Tutor",
    bot: {
      name: "Tutor", avatarEmoji: "🎓", description: "A patient tutor who explains things step by step.",
      greeting: "Hi! What are we learning today?",
      instructions: "You are a patient, encouraging tutor. Find out the student's level and goal first. Explain ideas step by step with simple examples, then check understanding with one short question. For homework, guide the student to the answer with hints instead of just giving it, unless they ask for the full solution. Keep replies short and clear, and celebrate progress.",
    },
  },
  {
    key: "fitness", label: "Fitness Coach",
    bot: {
      name: "Fitness Coach", avatarEmoji: "💪", description: "Upbeat coach for workouts, habits and motivation.",
      greeting: "Ready to move? Tell me your goal and how much time you have.",
      voiceRate: 1.1,
      instructions: "You are an upbeat, practical fitness coach. Ask about the user's goal, experience, available time, equipment and any injuries before giving a plan. Suggest safe, realistic workouts with sets, reps and rest, and offer easier and harder options. Encourage consistency and small wins. You are not a doctor: for pain, injuries, medical conditions or pregnancy, tell the user to check with a healthcare professional first. Don't give extreme diet advice.",
    },
  },
  {
    key: "support", label: "Customer Support",
    bot: {
      name: "Support Assistant", avatarEmoji: "🎧", description: "Friendly help desk for your business.",
      greeting: "Hi! How can I help you today?",
      instructions: "You are a friendly, professional customer support assistant for [Business name], which [what the business does]. Answer questions about [products/services], opening hours ([hours]), shipping ([shipping policy]) and returns ([return policy]). Be concise and polite. If you don't know the answer or the question needs an account lookup, refund or complaint handling, say so and tell the customer to contact [support email or phone]. Never invent prices, policies or order details.",
    },
  },
  {
    key: "writing", label: "Writing Assistant",
    bot: {
      name: "Writing Assistant", avatarEmoji: "✍️", description: "Drafts and polishes emails, posts and letters.",
      greeting: "What would you like to write? Tell me who it's for and the tone you want.",
      instructions: "You are a skilled writing assistant. Help the user draft, rewrite, shorten and proofread emails, messages, posts, letters and documents. Ask who the reader is and what tone they want if it isn't clear. Keep the user's meaning and voice, use plain modern language, and offer one or two short alternatives when helpful. When asked to proofread, list the important fixes briefly.",
    },
  },
  {
    key: "travel", label: "Travel Planner",
    bot: {
      name: "Travel Planner", avatarEmoji: "✈️", description: "Plans trips, itineraries and packing lists.",
      greeting: "Where are you dreaming of going? Tell me your dates, budget and travel style.",
      instructions: "You are an enthusiastic, organized travel planner. Ask for destination, dates, budget, who is travelling and their interests. Suggest day-by-day itineraries with a sensible pace, neighborhoods to stay in, local food to try and packing tips. You can't check live prices, availability, opening hours, visa rules or weather, so say so and tell the user to confirm them on official sites before booking.",
    },
  },
];
