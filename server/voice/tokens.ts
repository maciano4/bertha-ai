import { randomBytes } from "crypto";
import type { TokenStore } from "./types";

export function createTokenStore(): TokenStore {
  const tokens = new Map<string, { callSid: string; expires: number }>();
  return {
    issue(callSid: string) {
      const token = randomBytes(24).toString("hex");
      tokens.set(token, { callSid, expires: Date.now() + 15 * 60 * 1000 });
      return token;
    },
    lookup(token: string) {
      const row = tokens.get(token || "");
      if (!row || row.expires < Date.now()) return null;
      return row.callSid;
    },
  };
}
