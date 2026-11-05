import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean, index, integer, real, date, primaryKey } from "drizzle-orm/pg-core";
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

// Household management
export const households = pgTable("households", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const householdMembers = pgTable("household_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").notNull().references(() => households.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("member"), // 'admin', 'member'
  joinedAt: timestamp("joined_at").defaultNow(),
});

// Calendar integrations
export const calendarConnections = pgTable("calendar_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(), // 'google', 'outlook', 'icloud'
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  calendarId: text("calendar_id"), // Provider's calendar ID
  metadata: jsonb("metadata"), // Provider-specific data
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const calendarEvents = pgTable("calendar_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id").references(() => calendarConnections.id),
  householdId: varchar("household_id").references(() => households.id),
  externalId: text("external_id"), // ID from provider
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  allDay: boolean("all_day").default(false),
  recurrence: text("recurrence"), // RRULE format
  attendees: jsonb("attendees"), // Array of {email, name, status}
  reminders: jsonb("reminders"), // Array of reminder times
  metadata: jsonb("metadata"), // Provider-specific data
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Email integration
export const emailAccounts = pgTable("email_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(), // 'gmail', 'outlook'
  email: text("email").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  lastSyncAt: timestamp("last_sync_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailMessages = pgTable("email_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => emailAccounts.id),
  externalId: text("external_id").notNull(), // Provider's message ID
  subject: text("subject"),
  from: text("from").notNull(),
  to: text("to").notNull(),
  body: text("body"),
  hasAttachments: boolean("has_attachments").default(false),
  receivedAt: timestamp("received_at").notNull(),
  extractedData: jsonb("extracted_data"), // Events, tasks, shopping items found
  createdAt: timestamp("created_at").defaultNow(),
});

// Document storage and processing
export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // 'pdf', 'image'
  fileUrl: text("file_url").notNull(), // Cloud storage URL
  extractedText: text("extracted_text"), // OCR/parsed text
  metadata: jsonb("metadata"), // Document-specific data
  createdAt: timestamp("created_at").defaultNow(),
});

// Shopping lists
export const shoppingLists = pgTable("shopping_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").notNull().references(() => households.id),
  name: text("name").notNull(),
  store: text("store"), // Target store
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const shoppingItems = pgTable("shopping_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listId: varchar("list_id").notNull().references(() => shoppingLists.id),
  name: text("name").notNull(),
  quantity: text("quantity"),
  category: text("category"), // 'produce', 'dairy', 'meat', etc.
  priority: text("priority").default("normal"), // 'high', 'normal', 'low'
  checked: boolean("checked").default(false),
  addedBy: varchar("added_by").references(() => users.id),
  instacartProductId: text("instacart_product_id"), // Instacart product ID
  createdAt: timestamp("created_at").defaultNow(),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'reminder', 'calendar', 'email', 'shopping'
  title: text("title").notNull(),
  message: text("message").notNull(),
  priority: text("priority").default("normal"), // 'high', 'normal', 'low'
  read: boolean("read").default(false),
  deliveryMethod: text("delivery_method"), // 'push', 'email', 'sms'
  scheduledFor: timestamp("scheduled_for"),
  sentAt: timestamp("sent_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});


// ---------------------------------------------------------------------------
// Stage 1 platform tables (accounts + permanent chat history).
// These are created automatically at startup (server/platformTables.ts) and are
// the only tables `npm run db:push` manages (see tablesFilter in drizzle.config.ts),
// so a push can never touch the existing bertha_sessions / bertha_appointments data.
// Keep these definitions and the startup SQL identical.
// ---------------------------------------------------------------------------
export const berthaUsers = pgTable("bertha_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique("bertha_users_email_unique"),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  timeZone: text("time_zone"),
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One-time password reset links. Only a hash of the token is stored.
export const berthaPasswordResets = pgTable("bertha_password_resets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => berthaUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique("bertha_password_resets_token_hash_unique"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("bertha_password_resets_user").on(table.userId),
]);

// Custom bots ("Bertha" herself is the built-in default and has no row).
export const berthaBots = pgTable("bertha_bots", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => berthaUsers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  greeting: text("greeting").notNull().default(""),
  avatarEmoji: text("avatar_emoji").notNull().default("🤖"),
  avatarUrl: text("avatar_url"),
  voiceName: text("voice_name"),
  voiceRate: real("voice_rate").notNull().default(1),
  voicePitch: real("voice_pitch").notNull().default(1),
  model: text("model"),
  visibility: text("visibility").notNull().default("private"), // "private" | "link"
  slug: text("slug").notNull().unique("bertha_bots_slug_unique"),
  showInstructions: boolean("show_instructions").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("bertha_bots_owner_updated").on(table.ownerId, table.updatedAt),
]);

// Bots someone opened from a share link: their "Shared with me" list.
export const berthaBotShares = pgTable("bertha_bot_shares", {
  userId: text("user_id").notNull().references(() => berthaUsers.id, { onDelete: "cascade" }),
  botId: text("bot_id").notNull().references(() => berthaBots.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.userId, table.botId], name: "bertha_bot_shares_pk" })]);

// Per-user daily counters: groundwork for plan limits (Stage 3 / Stripe).
export const berthaUsageDaily = pgTable("bertha_usage_daily", {
  userId: text("user_id").notNull().references(() => berthaUsers.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  messages: integer("messages").notNull().default(0),
  aiMessages: integer("ai_messages").notNull().default(0),
}, table => [primaryKey({ columns: [table.userId, table.day], name: "bertha_usage_daily_pk" })]);

export const berthaConversations = pgTable("bertha_conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => berthaUsers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  // null = the built-in Bertha bot
  botId: text("bot_id").references(() => berthaBots.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("bertha_conversations_user_updated").on(table.userId, table.updatedAt),
  index("bertha_conversations_bot").on(table.botId),
]);

export const berthaMessages = pgTable("bertha_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => berthaConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("bertha_messages_conversation_created").on(table.conversationId, table.createdAt)]);

export type BerthaUser = typeof berthaUsers.$inferSelect;
export type PublicUser = { id: string; email: string; displayName: string | null; timeZone: string | null };

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

export const insertHouseholdSchema = createInsertSchema(households).pick({
  name: true,
});

export const insertHouseholdMemberSchema = createInsertSchema(householdMembers).pick({
  householdId: true,
  userId: true,
  role: true,
});

export const insertCalendarConnectionSchema = createInsertSchema(calendarConnections).pick({
  provider: true,
  accessToken: true,
  refreshToken: true,
  expiresAt: true,
  calendarId: true,
  metadata: true,
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).pick({
  connectionId: true,
  householdId: true,
  externalId: true,
  title: true,
  description: true,
  location: true,
  startTime: true,
  endTime: true,
  allDay: true,
  recurrence: true,
  attendees: true,
  reminders: true,
  metadata: true,
});

export const insertEmailAccountSchema = createInsertSchema(emailAccounts).pick({
  provider: true,
  email: true,
  accessToken: true,
  refreshToken: true,
  expiresAt: true,
  metadata: true,
});

export const insertEmailMessageSchema = createInsertSchema(emailMessages).pick({
  accountId: true,
  externalId: true,
  subject: true,
  from: true,
  to: true,
  body: true,
  hasAttachments: true,
  receivedAt: true,
  extractedData: true,
});

export const insertDocumentSchema = createInsertSchema(documents).pick({
  householdId: true,
  fileName: true,
  fileType: true,
  fileUrl: true,
  extractedText: true,
  metadata: true,
});

export const insertShoppingListSchema = createInsertSchema(shoppingLists).pick({
  householdId: true,
  name: true,
  store: true,
});

export const insertShoppingItemSchema = createInsertSchema(shoppingItems).pick({
  listId: true,
  name: true,
  quantity: true,
  category: true,
  priority: true,
  checked: true,
  instacartProductId: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).pick({
  type: true,
  title: true,
  message: true,
  priority: true,
  read: true,
  deliveryMethod: true,
  scheduledFor: true,
  metadata: true,
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
export type InsertHousehold = z.infer<typeof insertHouseholdSchema>;
export type Household = typeof households.$inferSelect;
export type InsertHouseholdMember = z.infer<typeof insertHouseholdMemberSchema>;
export type HouseholdMember = typeof householdMembers.$inferSelect;
export type InsertCalendarConnection = z.infer<typeof insertCalendarConnectionSchema>;
export type CalendarConnection = typeof calendarConnections.$inferSelect;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertEmailAccount = z.infer<typeof insertEmailAccountSchema>;
export type EmailAccount = typeof emailAccounts.$inferSelect;
export type InsertEmailMessage = z.infer<typeof insertEmailMessageSchema>;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertShoppingList = z.infer<typeof insertShoppingListSchema>;
export type ShoppingList = typeof shoppingLists.$inferSelect;
export type InsertShoppingItem = z.infer<typeof insertShoppingItemSchema>;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

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
