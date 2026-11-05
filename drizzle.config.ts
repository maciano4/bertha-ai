import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Only manage the Stage 1 platform tables. Without this filter a push could offer to
  // DROP tables that are not in schema.ts (bertha_sessions, bertha_appointments).
  // The server also creates these tables on startup, so a push is optional.
  tablesFilter: ["bertha_users", "bertha_conversations", "bertha_messages","bertha_bots","bertha_usage_daily","bertha_bot_shares","bertha_voice_settings","bertha_calls"],
});
