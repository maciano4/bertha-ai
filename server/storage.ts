import { type User, type InsertUser, type Conversation, type InsertConversation, type Message, type InsertMessage, type UserSettings, type InsertUserSettings } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getUserConversations(userId: string): Promise<Conversation[]>;
  deleteConversation(id: string): Promise<void>;
  
  createMessage(message: InsertMessage): Promise<Message>;
  getConversationMessages(conversationId: string): Promise<Message[]>;
  deleteConversationMessages(conversationId: string): Promise<void>;
  
  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  createUserSettings(settings: InsertUserSettings & { userId: string }): Promise<UserSettings>;
  updateUserSettings(userId: string, settings: Partial<InsertUserSettings>): Promise<UserSettings>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private conversations: Map<string, Conversation>;
  private messages: Map<string, Message>;
  private userSettings: Map<string, UserSettings>;

  constructor() {
    this.users = new Map();
    this.conversations = new Map();
    this.messages = new Map();
    this.userSettings = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date();
    const conv: Conversation = { 
      ...conversation, 
      id, 
      createdAt: now, 
      updatedAt: now,
      userId: null 
    };
    this.conversations.set(id, conv);
    return conv;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async getUserConversations(userId: string): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).filter(
      (conv) => conv.userId === userId,
    );
  }

  async deleteConversation(id: string): Promise<void> {
    this.conversations.delete(id);
    // Also delete associated messages
    await this.deleteConversationMessages(id);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const msg: Message = { 
      ...message, 
      id, 
      createdAt: new Date(),
      metadata: message.metadata || null,
      conversationId: message.conversationId || null
    };
    this.messages.set(id, msg);
    return msg;
  }

  async getConversationMessages(conversationId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter((msg) => msg.conversationId === conversationId)
      .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
  }

  async deleteConversationMessages(conversationId: string): Promise<void> {
    const messagesToDelete = Array.from(this.messages.entries())
      .filter(([_, msg]) => msg.conversationId === conversationId)
      .map(([id, _]) => id);
    
    messagesToDelete.forEach(id => this.messages.delete(id));
  }

  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    return Array.from(this.userSettings.values()).find(
      (settings) => settings.userId === userId,
    );
  }

  async createUserSettings(settings: InsertUserSettings & { userId: string }): Promise<UserSettings> {
    const id = randomUUID();
    const now = new Date();
    const userSettings: UserSettings = { 
      ...settings, 
      id, 
      createdAt: now, 
      updatedAt: now,
      language: settings.language || "en",
      speechEnabled: settings.speechEnabled ?? false,
      searchEnabled: settings.searchEnabled ?? true,
      customBackground: settings.customBackground || null,
      voiceSpeed: settings.voiceSpeed || "1"
    };
    this.userSettings.set(id, userSettings);
    return userSettings;
  }

  async updateUserSettings(userId: string, settings: Partial<InsertUserSettings>): Promise<UserSettings> {
    const existing = await this.getUserSettings(userId);
    if (!existing) {
      return this.createUserSettings({ ...settings, userId } as InsertUserSettings & { userId: string });
    }
    
    const updated: UserSettings = { 
      ...existing, 
      ...settings, 
      updatedAt: new Date() 
    };
    this.userSettings.set(existing.id, updated);
    return updated;
  }
}

export const storage = new MemStorage();
