import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import ws from "ws";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. In Replit, open the Database tool to create a PostgreSQL database.",
  );
}

const url = process.env.DATABASE_URL;

// Neon's serverless driver talks to Neon over WebSockets. Any other Postgres
// (Replit's built-in database, a local server, Supabase, etc.) uses the standard
// `pg` driver. Force one with DB_DRIVER=neon or DB_DRIVER=pg.
function useNeonDriver() {
  if (process.env.DB_DRIVER === "neon") return true;
  if (process.env.DB_DRIVER === "pg") return false;
  try { return new URL(url).hostname.endsWith(".neon.tech"); } catch { return false; }
}

type QueryablePool = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
};

let poolInstance: QueryablePool;
let dbInstance: ReturnType<typeof drizzlePg<typeof schema>>;

if (useNeonDriver()) {
  neonConfig.webSocketConstructor = ws;
  const neonPool = new NeonPool({ connectionString: url });
  poolInstance = neonPool as unknown as QueryablePool;
  dbInstance = drizzleNeon({ client: neonPool, schema }) as unknown as typeof dbInstance;
} else {
  const pgPool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX || 10) });
  pgPool.on("error", error => console.error("Postgres pool error:", error.message));
  poolInstance = pgPool as unknown as QueryablePool;
  dbInstance = drizzlePg({ client: pgPool, schema });
}

export const pool = poolInstance;
export const db = dbInstance;
