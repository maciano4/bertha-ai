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
      setMessages(history.data.map((message: any) => ({
        ...message, timestamp: new Date(message.createdAt),
      })));
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
    setMessages(previous => [...previous, {
      id: crypto.randomUUID(), role: "user", content: content.trim(), timestamp: new Date(),
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
      toast({ title: "Message not sent", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
      return activeConversationRef.current;
    } finally {
      busyRef.current = false;
      setIsLoading(false);
    }
  }, [sendMessageMutation, toast]);

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
