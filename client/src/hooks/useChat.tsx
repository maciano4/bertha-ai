import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
  };
}

export interface ChatSettings {
  language: string;
  speechEnabled: boolean;
  searchEnabled: boolean;
}

const isLocalOnly = (id: string) => id.startsWith("local-") || id.startsWith("appointment-reminder-");

// Turns a failed /api/chat response into plain words for the fallback reply.
function describeChatError(error: unknown): { short: string; detail: string; ai: boolean } {
  const text = (error instanceof Error ? error.message : String(error)).slice(0, 240);
  if (/insufficient_quota|quota|billing|credit/i.test(text)) {
    return { ai: true, short: "the OpenAI account is out of credits", detail: `OpenAI says there are no credits left. Add credits, or put a new OPENAI_API_KEY in Replit Secrets. (${text})` };
  }
  if (/invalid_api_key|incorrect api key|OpenAI 401/i.test(text)) {
    return { ai: true, short: "the OpenAI API key is missing or invalid", detail: `Check OPENAI_API_KEY in Replit Secrets. (${text})` };
  }
  if (/AI service unavailable|OpenAI|AI response/i.test(text)) {
    return { ai: true, short: "the AI service returned an error", detail: text };
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(text)) {
    return { ai: false, short: "I could not reach the Bertha server", detail: "The server did not answer. Check that the Replit app is running." };
  }
  return { ai: false, short: "the server returned an error", detail: text };
}

export function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [latestReply, setLatestReply] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const cache = useQueryClient();
  const activeConversationRef = useRef(conversationId);
  const busyRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { activeConversationRef.current = conversationId; }, [conversationId]);

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
        const localOnly = current.filter(item => isLocalOnly(item.id) && !saved.some(message => message.id === item.id));
        return [...saved, ...localOnly].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      });
    }
  }, [history.data]);

  const addAssistantMessage = useCallback((content: string, id: string = crypto.randomUUID()) => {
    const reply: Message = { id, role: "assistant", content, timestamp: new Date() };
    setMessages(current => current.some(item => item.id === id) ? current : [...current, reply]);
    setLatestReply(reply);
  }, []);

  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, settings, targetId }: { message: string; settings: ChatSettings; targetId: string }) => {
      const response = await apiRequest("POST", "/api/chat", {
        message,
        conversationId: targetId,
        language: settings.language,
        searchEnabled: settings.searchEnabled,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      return response.json();
    },
    onSuccess: data => {
      addAssistantMessage(data.response);
      cache.invalidateQueries({ queryKey: ["/api/conversations"] });
      cache.invalidateQueries({ queryKey: ["appointments"] });
      cache.invalidateQueries({ queryKey: ["/api/appointments"] });
    },
  });

  const sendMessage = useCallback(async (content: string, settings: ChatSettings): Promise<string | null> => {
    if (!content.trim() || busyRef.current) return null;
    busyRef.current = true;
    setIsLoading(true);
    const userMessageId = crypto.randomUUID();
    setMessages(previous => [...previous, {
      id: userMessageId, role: "user", content: content.trim(), timestamp: new Date(),
    }]);
    try {
      let targetId = activeConversationRef.current;
      if (!targetId) {
        const response = await apiRequest("POST", "/api/conversations", { title: content.trim().slice(0, 80) });
        const conversation = await response.json();
        targetId = conversation.id as string;
        activeConversationRef.current = targetId;
      }
      await sendMessageMutation.mutateAsync({ message: content.trim(), settings, targetId });
      return targetId;
    } catch (error) {
      const reason = describeChatError(error);
      console.error("Chat request failed:", error);
      // The server did not save this exchange, so keep both bubbles locally.
      setMessages(previous => previous.map(item => item.id === userMessageId ? { ...item, id: `local-${userMessageId}` } : item));
      // Always answer, so a voice request never ends in silence.
      addAssistantMessage(
        reason.ai
          ? `I heard you, dear, but my AI service is unavailable right now (${reason.short}). I can still help with your appointments.`
          : `I heard you, dear, but I could not answer just now (${reason.short}). Please try again in a moment.`,
        `local-fallback-${userMessageId}`,
      );
      toast({ title: reason.ai ? "Bertha's AI service is unavailable" : "Message not sent", description: reason.detail, variant: "destructive", duration: 10000 });
      return activeConversationRef.current;
    } finally {
      busyRef.current = false;
      setIsLoading(false);
    }
  }, [addAssistantMessage, sendMessageMutation, toast]);

  const addSystemMessage = useCallback((content: string) => {
    setMessages(previous => [...previous, { id: crypto.randomUUID(), role: "system", content, timestamp: new Date() }]);
  }, []);
  const clearMessages = useCallback(() => { setMessages([]); setLatestReply(null); }, []);
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return {
    messages, latestReply, isLoading, sendMessage, addAssistantMessage,
    addSystemMessage, clearMessages, scrollToBottom, messagesEndRef,
    historyError: history.error,
  };
}
