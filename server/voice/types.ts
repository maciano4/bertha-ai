export type SmsStatus = "pending" | "sending" | "sent" | "skipped" | "failed";

export interface CallRecord {
  id: string;
  callSid: string;
  ownerId: string | null;
  fromNumber: string;
  toNumber: string | null;
  forwardedFrom: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  transcript: string;
  summary: string | null;
  aiUnavailable: boolean;
  answeringEnabled: boolean;
  smsStatus: SmsStatus;
  smsError: string | null;
  fallbackPlayed: boolean;
}

export interface VoiceSettings {
  userId: string;
  answeringEnabled: boolean;
  greeting: string | null;
  availabilityNote: string | null;
}

export interface IncomingCallInput {
  callSid: string;
  fromNumber: string;
  toNumber: string | null;
  forwardedFrom: string | null;
  answeringEnabled: boolean;
  aiUnavailable: boolean;
  fallbackPlayed: boolean;
}

export interface SmsResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface VoiceRepository {
  ownerUserId(): Promise<string | null>;
  isOwner(userId: string): Promise<boolean>;
  getSettings(): Promise<VoiceSettings | null>;
  saveSettings(userId: string, patch: { answeringEnabled?: boolean; greeting?: string | null; availabilityNote?: string | null }): Promise<VoiceSettings>;
  recordIncoming(input: IncomingCallInput): Promise<CallRecord>;
  getBySid(callSid: string): Promise<CallRecord | null>;
  saveTranscript(callSid: string, transcript: string): Promise<void>;
  saveDuration(callSid: string, durationSeconds: number): Promise<void>;
  markInProgress(callSid: string): Promise<void>;
  markAiUnavailable(callSid: string): Promise<void>;
  markFallbackPlayed(callSid: string): Promise<void>;
  claimSms(callSid: string): Promise<CallRecord | null>;
  completeSms(callSid: string, fields: { summary: string; smsStatus: SmsStatus; smsError: string | null; durationSeconds: number | null; transcript: string; status: string }): Promise<void>;
  listForOwner(userId: string): Promise<CallRecord[]>;
}

export interface TokenStore {
  issue(callSid: string): string;
  lookup(token: string): string | null;
}

export interface VoiceDeps {
  repo: VoiceRepository;
  tokens: TokenStore;
  sendSms(body: string): Promise<SmsResult>;
  summarize(transcript: string): Promise<string | null>;
  realtimeAvailable(): boolean;
  realtimeDown(): string;
  markRealtimeDown(kind: string): void;
  transcriptGraceMs: number;
  attachStatusCallback(callSid: string, url: string): Promise<void>;
}
