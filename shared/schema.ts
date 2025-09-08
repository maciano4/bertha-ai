import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id),
  role: text("role").notNull(), // 'user', 'assistant', 'system'
  content: text("content").notNull(),
  metadata: jsonb("metadata"), // for storing additional data like search results, translations
  createdAt: timestamp("created_at").defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  language: text("language").notNull().default("en"),
  speechEnabled: boolean("speech_enabled").default(false),
  searchEnabled: boolean("search_enabled").default(true),
  customBackground: text("custom_background"),
  voiceSpeed: text("voice_speed").default("1"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reminders = pgTable("reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  message: text("message").notNull(),
  remindAt: timestamp("remind_at").notNull(),
  completed: boolean("completed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dailyPlans = pgTable("daily_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: text("date").notNull(), // YYYY-MM-DD format
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const planActivities = pgTable("plan_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => dailyPlans.id),
  activity: text("activity").notNull(),
  time: text("time"), // HH:MM format, optional
  completed: boolean("completed").default(false).notNull(),
  remindAt: timestamp("remind_at"), // Optional reminder time
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertConversationSchema = createInsertSchema(conversations).pick({
  title: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversationId: true,
  role: true,
  content: true,
  metadata: true,
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).pick({
  language: true,
  speechEnabled: true,
  searchEnabled: true,
  customBackground: true,
  voiceSpeed: true,
});

export const insertReminderSchema = createInsertSchema(reminders).pick({
  message: true,
  remindAt: true,
  completed: true,
});

export const insertDailyPlanSchema = createInsertSchema(dailyPlans).pick({
  date: true,
  title: true,
  description: true,
});

export const insertPlanActivitySchema = createInsertSchema(planActivities).pick({
  planId: true,
  activity: true,
  time: true,
  completed: true,
  remindAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type Reminder = typeof reminders.$inferSelect;
export type InsertDailyPlan = z.infer<typeof insertDailyPlanSchema>;
export type DailyPlan = typeof dailyPlans.$inferSelect;
export type InsertPlanActivity = z.infer<typeof insertPlanActivitySchema>;
export type PlanActivity = typeof planActivities.$inferSelect;

// NLP Analysis types
export interface NLPAnalysis {
  intent: string;
  entities: Array<{ type: string; value: string; confidence: number }>;
  sentiment: {
    sentiment: string;
    confidence: number;
    emotions: string[];
  };
  context: {
    currentTopic: string;
    conversationTone: string;
    urgency: string;
  };
  language: string;
  keywords: string[];
  summary: string;
  requiresAction: boolean;
}

// Extended message metadata interface
export interface MessageMetadata {
  searchUsed?: boolean;
  translationUsed?: boolean;
  searchResults?: string;
  nlpAnalysis?: NLPAnalysis;
  intent?: string;
  sentiment?: any;
  entities?: any[];
  keywords?: string[];
}
