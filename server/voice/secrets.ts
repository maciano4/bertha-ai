import { redactSecrets } from "../aiErrors";

const SECRET_ENV = ["TWILIO_AUTH_TOKEN", "TWILIO_ACCOUNT_SID", "OPENAI_API_KEY", "OpenAI_API_KEY", "OPENAI_KEY"];

/** Strip provider keys and any secret currently loaded in the environment. */
export function redactVoiceSecrets(text: string): string {
  let out = redactSecrets(text);
  for (const name of SECRET_ENV) {
    const value = process.env[name];
    if (value && value.length > 6) out = out.split(value).join("[redacted]");
  }
  return out;
}
