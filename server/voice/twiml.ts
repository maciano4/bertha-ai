import twilio from "twilio";
import { AI_UNAVAILABLE_SAY } from "./persona";

export function emptyTwiml() {
  return new twilio.twiml.VoiceResponse().toString();
}

export function sayTwiml(text: string) {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: "Polly.Joanna", language: "en-US" }, text);
  response.hangup();
  return response.toString();
}

export function unavailableTwiml() {
  return sayTwiml(AI_UNAVAILABLE_SAY);
}

export function connectTwiml(input: { actionUrl: string; streamUrl: string; statusUrl: string }) {
  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect({ action: input.actionUrl, method: "POST" });
  const stream = connect.stream({
    url: input.streamUrl,
    statusCallback: input.statusUrl,
    statusCallbackMethod: "POST",
  });
  const token = new URL(input.streamUrl).searchParams.get("token");
  if (token) stream.parameter({ name: "token", value: token });
  return response.toString();
}
