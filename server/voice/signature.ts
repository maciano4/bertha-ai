import type { Request } from "express";
import twilio from "twilio";
import { signedUrl } from "./urls";

/** On in production unless TWILIO_VALIDATE_SIGNATURE is explicitly false. */
export function shouldValidateTwilioSignature(): boolean {
  const flag = (process.env.TWILIO_VALIDATE_SIGNATURE || "").trim().toLowerCase();
  if (flag === "true" || flag === "1" || flag === "yes") return true;
  if (flag === "false" || flag === "0" || flag === "no") return false;
  return process.env.NODE_ENV === "production";
}

export function twilioSignatureValid(req: Request): boolean {
  if (!shouldValidateTwilioSignature()) return true;
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!token) return false;
  const signature = req.get("x-twilio-signature") || "";
  const params = req.body && typeof req.body === "object" ? req.body as Record<string, string> : {};
  try {
    return twilio.validateRequest(token, signature, signedUrl(req), params);
  } catch {
    return false;
  }
}
