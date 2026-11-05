import type { SmsResult } from "./types";
import { redactVoiceSecrets } from "./secrets";

const E164 = /^\+[1-9]\d{7,14}$/;

function smsConfig() {
  return {
    accountSid: (process.env.TWILIO_ACCOUNT_SID || "").trim(),
    token: (process.env.TWILIO_AUTH_TOKEN || "").trim(),
    from: (process.env.TWILIO_PHONE_NUMBER || "").trim(),
    to: (process.env.OWNER_PHONE || "").trim(),
  };
}

export async function sendTwilioSms(body: string): Promise<SmsResult> {
  const { accountSid, token, from, to } = smsConfig();
  if (!accountSid || !token || !from || !to) {
    console.error("voice: SMS skipped because Twilio or OWNER_PHONE is not configured");
    return { ok: false, skipped: true, error: "Twilio SMS is not configured" };
  }
  if (!E164.test(from) || !E164.test(to)) {
    console.error("voice: SMS skipped because a phone number is not E.164");
    return { ok: false, skipped: true, error: "Phone numbers must be E.164" };
  }
  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, token);
    await client.messages.create({ from, to, body });
    console.log("voice: missed-call summary texted");
    return { ok: true };
  } catch (error) {
    const message = redactVoiceSecrets(error instanceof Error ? error.message : "send failed").slice(0, 180);
    console.error("voice: SMS failed:", message);
    return { ok: false, error: message };
  }
}

/** Ask Twilio to POST call status to us. Failures are logged and do not affect the call. */
export async function attachCallStatusCallback(callSid: string, url: string) {
  const { accountSid, token } = smsConfig();
  if (!accountSid || !token || !callSid || !url.startsWith("https://")) return;
  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, token);
    await client.calls(callSid).update({ statusCallback: url, statusCallbackMethod: "POST" });
  } catch (error) {
    console.error("voice: status callback was not updated:", redactVoiceSecrets(error instanceof Error ? error.message : "error").slice(0, 200));
  }
}
