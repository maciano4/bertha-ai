import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Express } from "express";
import { pool } from "./db";

declare module "express-session" {
  interface SessionData {
    personalAssistant: boolean;
  }
}

export function configurePersonalSession(app: Express) {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required for private chat history.");
  app.set("trust proxy", 1);
  const PgSession = connectPgSimple(session);
  app.use(session({
    name: "bertha.personal",
    secret: process.env.SESSION_SECRET,
    store: new PgSession({ pool: pool as any, tableName: "bertha_sessions", createTableIfMissing: true }),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", secure: "auto", maxAge: 365 * 24 * 60 * 60 * 1000 },
  }));
  app.use("/api", (req, res, next) => {
    req.session.personalAssistant = true;
    res.setHeader("Cache-Control", "no-store");
    next();
  });
}
