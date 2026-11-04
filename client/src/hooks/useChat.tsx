import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, notifyIfUnauthorized } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  metadata?: {
    searchUsed?: boolean;
    translationUsed?: boolean;
    searchResults?: string;
    recognizedUser?: string;
    interrupted?: boolean;
    welcome?: boolean;
    welcomeItems?: WelcomeItem[];
    welcomeText?: string;
  };
}

export interface WelcomeItem { id: string; kind: string; text: string; summary?: string; conversationId?: string | null }

export interface SendOptions { voice?: boolean }

export interface ChatSettings {
  language: string;
  speechEnabled: boolean;
  searchEnabled: boolean;
}

const isLocalOnly = (id: string) => id.startsWith("local-") || id.startsWith("appointment-reminder-");
const WELCOME_ID = "local-welcome";
const isAbort = (error: unknown) => (error as any)?.name === "AbortError";

class ChatError extends Error {
  constructor(message: string, public code?: string, public status?: number) { super(message); }
  partial?: { id: string; text: string };
}

// Turns a failed /api/chat response into plain words for the fallback reply.
function describeChatError(error: unknown): { short: string; detail: string; ai: boolean; code?: string } {
  const text = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  const code = error instanceof ChatError ? error.code : undefined;
  if (code === "bot_unavailable" || code === "bot_not_found") return { ai: false, code, short: "this bot is no longer shared", detail: text };
  if (code === "limit_reached") return { ai: false, code, short: "you've reached today's message limit", detail: text };
  if (code === "insufficient_quota" || /insufficient_quota|out of credits/i.test(text)) {
    return { ai: true, code, short: "my AI account is out of credits", detail: text };
  }
  if (code === "no_api_key") return { ai: true, code, short: "my AI key isn't set up", detail: text };
  if (code === "invalid_api_key" || /invalid_api_key|incorrect api key/i.test(text)) return { ai: true, code, short: "my AI key was rejected", detail: text };
  if (code === "rate_limited") return { ai: true, code, short: "the AI service is getting too many requests", detail: text };
  if (code === "context_too_long") return { ai: true, code, short: "this chat has grown too long; please start a new chat", detail: text };
  if (code === "model_not_found") return { ai: true, code, short: "the AI model isn't available", detail: text };
  if (code === "ai_timeout") return { ai: true, code, short: "the AI took too long to answer", detail: text };
  if (code && /^ai_/.test(code)) return { ai: true, code, short: "the AI service isn't responding", detail: text };
  if (code === "not_signed_in") return { ai: false, short: "you have been signed out", detail: "Please log in again." };
  if (/Failed to fetch|NetworkError|Load failed/i.test(text)) {
    return { ai: false, short: "I could not reach the Bertha server", detail: "The server did not answer. Check your connection and that the Replit app is running." };
  }
  return { ai: false, short: "the server returned an error", detail: text };
}

async function readError(response: Response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return new ChatError(data.error || data.message || `Request failed (${response.status})`, data.code, response.status);
  } catch {
    return new ChatError(text || `Request failed (${response.status})`, undefined, response.status);
  }
}

// botId: the custom bot new conversations are started with (null = Bertha).
export function useChat(conversationId: string | null, bot: { id: string | null; name: string } = { id: null, name: "Bertha" }) {
  const isBertha = !bot.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [latestReply, setLatestReply] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const cache = useQueryClient();
  const activeConversationRef = useRef(conversationId);
  const busyRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [streamingId, setStreamingId] = useState<string | null>(null);

  // Switching conversations (sidebar, "New chat") clears the screen. When sendMessage
  // creates the conversation itself, the ref already matches and nothing is cleared.
  useEffect(() => {
    if (activeConversationRef.current !== conversationId) {
      activeConversationRef.current = conversationId;
      setMessages([]);
      setLatestReply(null);
    }
  }, [conversationId]);

  // A new, empty chat opens with a friendly greeting that mentions 1-2 unfinished things.
  const [welcomeNonce, setWelcomeNonce] = useState(0);
  useEffect(() => {
    if (conversationId) return;
    let cancelled = false;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(`/api/welcome?timeZone=${encodeURIComponent(timeZone)}${bot.id ? `&botId=${encodeURIComponent(bot.id)}` : ""}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.greeting || activeConversationRef.current) return;
        const items: WelcomeItem[] = data.items || [];
        if (bot.id && !items.length) return; // custom bots keep their own greeting
        const content = items.length ? (data.hello || data.greeting) : data.greeting;
        setMessages(current => current.length && !(current.length === 1 && current[0].id === WELCOME_ID) ? current
          : [{ id: WELCOME_ID, role: "assistant", content, timestamp: new Date(), metadata: { welcome: true, welcomeItems: items, welcomeText: data.greeting } }]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [conversationId, bot.id, welcomeNonce]);

  // Done / Not now on a welcome item: update the server and drop the chips for it.
  const resolveFollowUp = useCallback(async (itemId: string, status: "done" | "dismissed") => {
    setMessages(current => current.map(m => m.metadata?.welcomeItems
      ? { ...m, metadata: { ...m.metadata, welcomeItems: m.metadata.welcomeItems.filter(i => i.id !== itemId) } } : m));
    try { await apiRequest("PATCH", `/api/followups/${itemId}`, { status }); } catch { /* chips are a convenience */ }
    cache.invalidateQueries({ queryKey: ["/api/followups"] });
  }, [cache]);

  const history = useQuery({
    queryKey: ["/api/conversations", conversationId, "messages"],
    enabled: !!conversationId,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/conversations/${conversationId}/messages`);
      return response.json();
    },
  });
  useEffect(() => {
    if (history.data && !busyRef.current) {
      const saved: Message[] = history.data.map((message: any) => ({
        ...message, timestamp: new Date(message.createdAt),
      }));
      // Keep messages that only exist in this browser (fallback replies, reminders).
      setMessages(current => {
        const savedWelcome = saved.some(message => (message.metadata as any)?.welcome);
        const localOnly = current.filter(item => isLocalOnly(item.id) && !saved.some(message => message.id === item.id) && !(item.id === WELCOME_ID && (savedWelcome || saved.length)));
        return [...saved, ...localOnly].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      });
    }
  }, [history.data]);

  const addAssistantMessage = useCallback((content: string, id: string = crypto.randomUUID()) => {
    const reply: Message = { id, role: "assistant", content, timestamp: new Date() };
    setMessages(current => current.some(item => item.id === id) ? current : [...current, reply]);
    setLatestReply(reply);
  }, []);

  const finishReply = useCallback((reply: Message) => {
    setMessages(current => current.some(item => item.id === reply.id)
      ? current.map(item => item.id === reply.id ? reply : item)
      : [...current, reply]);
    setLatestReply(reply); // speech happens once, on the finished reply
  }, []);

  // Streams the reply when the server sends NDJSON; plain JSON replies (appointments,
  // reminders, weather, greetings) arrive in one piece.
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const abortRef = useRef<AbortController | null>(null);
  const partialRef = useRef<{ id: string; text: string } | null>(null);
  const inflightRef = useRef<Promise<unknown> | null>(null);

  const postChat = useCallback(async (message: string, settings: ChatSettings, targetId: string, extra: Record<string, unknown>, signal: AbortSignal) => {
    // What the user last saw from the assistant (including local fallback replies), for "what did you say?".
    const lastReply = [...messagesRef.current].reverse().find(item => item.role === "assistant" && item.content.trim())?.content.slice(0, 8000);
    const response = await fetch("/api/chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        conversationId: targetId,
        language: settings.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        stream: true,
        ...(lastReply ? { lastReply } : {}),
        ...extra,
      }),
      signal,
    });
    notifyIfUnauthorized(response);
    if (!response.ok) throw await readError(response);
    const id = crypto.randomUUID();
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("ndjson") || !response.body) {
      const data = await response.json();
      finishReply({ id, role: "assistant", content: data.response, timestamp: new Date(), metadata: { translationUsed: data.translationUsed, recognizedUser: data.recognizedUser || undefined } });
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let started = false;
    const show = (content: string) => setMessages(current => current.some(item => item.id === id)
      ? current.map(item => item.id === id ? { ...item, content } : item)
      : [...current, { id, role: "assistant", content, timestamp: new Date() }]);
    while (true) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = done ? "" : lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "delta") {
          text += event.text;
          partialRef.current = { id, text };
          if (!started) { started = true; setStreamingId(id); }
          show(text);
        } else if (event.type === "done") {
          finishReply({ id, role: "assistant", content: event.response, timestamp: new Date(), metadata: { translationUsed: event.translationUsed, recognizedUser: event.recognizedUser || undefined } });
          return;
        } else if (event.type === "error") {
          const failure = new ChatError(event.error, event.code);
          if (text.trim()) failure.partial = { id, text: text.trim() };
          throw failure;
        }
      }
      if (done) break;
    }
    if (text.trim()) finishReply({ id, role: "assistant", content: text, timestamp: new Date() });
    else throw new ChatError("The answer was interrupted. Please try again.");
  }, [finishReply]);

  // Stops the reply being written right now. The server cancels the AI call and keeps what was said.
  const stop = useCallback(() => {
    if (!abortRef.current) return false;
    abortRef.current.abort();
    return true;
  }, []);

  const sendMessage = useCallback(async (content: string, settings: ChatSettings, options: SendOptions = {}): Promise<string | null> => {
    if (!content.trim()) return null;
    // Talking over Bertha works like with a person: she stops and listens to the new message.
    let interrupted = false;
    if (busyRef.current) {
      interrupted = stop();
      if (inflightRef.current) await inflightRef.current.catch(() => {});
      if (busyRef.current) return null;
    }
    busyRef.current = true;
    let release: () => void = () => {};
    inflightRef.current = new Promise<void>(resolve => { release = resolve; });
    const controller = new AbortController();
    abortRef.current = controller;
    partialRef.current = null;
    const welcome = messagesRef.current.find(m => m.id === WELCOME_ID);
    setIsLoading(true);
    const userMessageId = crypto.randomUUID();
    setMessages(previous => [...previous, {
      id: userMessageId, role: "user", content: content.trim(), timestamp: new Date(),
    }]);
    try {
      let targetId = activeConversationRef.current;
      if (!targetId) {
        const response = await apiRequest("POST", "/api/conversations", { title: content.trim().slice(0, 80), botId: bot.id });
        const conversation = await response.json();
        targetId = conversation.id as string;
        activeConversationRef.current = targetId;
        // The server names the chat after the first exchange; refresh the sidebar when it has.
        setTimeout(() => cache.invalidateQueries({ queryKey: ["/api/conversations"] }), 4000);
      }
      const extra: Record<string, unknown> = {};
      if (interrupted) extra.interrupted = true;
      if (options.voice) extra.voice = true;
      if (welcome && messagesRef.current.filter(m => m.role !== "system" && m.id !== WELCOME_ID).length <= 1) extra.greeting = welcome.metadata?.welcomeText || welcome.content;
      await postChat(content.trim(), settings, targetId, extra, controller.signal);
      cache.invalidateQueries({ queryKey: ["/api/conversations"] });
      cache.invalidateQueries({ queryKey: ["appointments"] });
      cache.invalidateQueries({ queryKey: ["/api/appointments"] });
      cache.invalidateQueries({ queryKey: ["appointment-reminders"] });
      return targetId;
    } catch (error) {
      if (controller.signal.aborted || isAbort(error)) {
        // Interrupted: keep what was already said, marked as cut off, and say nothing more.
        const partial = partialRef.current as { id: string; text: string } | null;
        if (partial?.text.trim()) {
          finishReply({ id: partial.id, role: "assistant", content: `${partial.text.trimEnd()} …`, timestamp: new Date(), metadata: { interrupted: true } });
        }
        cache.invalidateQueries({ queryKey: ["/api/conversations"] });
        return activeConversationRef.current;
      }
      const reason = describeChatError(error);
      console.error("Chat request failed:", error);
      // The server did not save this exchange, so keep both bubbles locally.
      setMessages(previous => previous.map(item => item.id === userMessageId ? { ...item, id: `local-${userMessageId}` } : item));
      const partial = error instanceof ChatError ? error.partial : undefined;
      if (partial) setMessages(previous => previous.filter(item => item.id !== partial.id));
      // Always answer, so a voice request never ends in silence.
      addAssistantMessage(
        partial
          ? `${partial.text}\n\n(My answer was cut off: ${reason.short}. Please ask again.)`
          : reason.code === "bot_unavailable" || reason.code === "bot_not_found"
          ? `${bot.name} isn't available any more: its creator stopped sharing it or deleted it. You can still read this chat, or pick another bot.`
          : reason.ai
          ? `Sorry${isBertha ? ", dear" : ""}, I can't answer that right now: ${reason.short}. I can still tell you the time and date, do simple sums, and save appointments and reminders.`
          : `Sorry${isBertha ? ", dear" : ""}, I couldn't answer just now: ${reason.short}. Please try again in a moment.`,
        `local-fallback-${userMessageId}`,
      );
      toast({ title: reason.code === "insufficient_quota" ? `${bot.name}'s AI is out of credits` : reason.ai ? `${bot.name}'s AI service is unavailable` : "Message not sent", description: reason.detail, variant: "destructive", duration: 10000 });
      return activeConversationRef.current;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      busyRef.current = false;
      setIsLoading(false);
      setStreamingId(null);
      release();
    }
  }, [addAssistantMessage, finishReply, postChat, stop, toast, cache, bot.id, bot.name, isBertha]);

  const addSystemMessage = useCallback((content: string) => {
    setMessages(previous => [...previous, { id: crypto.randomUUID(), role: "system", content, timestamp: new Date() }]);
  }, []);
  const clearMessages = useCallback(() => { setMessages([]); setLatestReply(null); setWelcomeNonce(n => n + 1); }, []);
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return {
    messages, latestReply, isLoading, isStreaming: !!streamingId, sendMessage, stop, resolveFollowUp, addAssistantMessage,
    addSystemMessage, clearMessages, scrollToBottom, messagesEndRef,
    historyError: history.error,
  };
}
