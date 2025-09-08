import { useState, useCallback, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversation messages
  useQuery({
    queryKey: ["/api/conversations", conversationId, "messages"],
    enabled: !!conversationId,
    queryFn: async () => {
      if (!conversationId) return [];
      const response = await apiRequest("GET", `/api/conversations/${conversationId}/messages`);
      const data = await response.json();
      setMessages(data.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.createdAt)
      })));
      return data;
    }
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, settings }: { message: string; settings: ChatSettings }) => {
      const response = await apiRequest("POST", "/api/chat", {
        message,
        conversationId,
        language: settings.language,
        searchEnabled: settings.searchEnabled
      });
      return response.json();
    },
    onSuccess: (data) => {
      console.log('✅ CHAT API SUCCESS:', {
        response: data.response.slice(0, 50),
        searchUsed: data.searchUsed,
        timestamp: data.timestamp
      });
      
      // Add AI response to messages
      const aiMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(data.timestamp),
        metadata: {
          searchUsed: data.searchUsed,
          translationUsed: data.translationUsed,
          recognizedUser: data.recognizedUser
        }
      };
      
      console.log('🔄 UPDATING CHAT STATE:', {
        settingLoading: false,
        addingMessage: aiMessage.content.slice(0, 50)
      });
      
      // Update isLoading FIRST, then add message to ensure proper timing for speech synthesis
      setIsLoading(false);
      setMessages(prev => {
        const newMessages = [...prev, aiMessage];
        console.log('📝 MESSAGES ARRAY UPDATED:', {
          length: newMessages.length,
          lastMessage: newMessages[newMessages.length - 1]
        });
        return newMessages;
      });
      
      if (data.searchUsed) {
        addSystemMessage("Web search completed");
      }
      if (data.translationUsed) {
        addSystemMessage("Response translated");
      }
      if (data.recognizedUser) {
        addSystemMessage(`👋 Recognized voice: ${data.recognizedUser}`);
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive"
      });
    },
    onSettled: () => {
      // isLoading is now set in onSuccess for proper timing
      // Only set to false here if there was an error
      if (sendMessageMutation.isError) {
        setIsLoading(false);
      }
    }
  });

  const sendMessage = useCallback(async (content: string, settings: ChatSettings) => {
    if (!content.trim()) return;

    setIsLoading(true);

    // Add user message immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);

    // Send to API
    sendMessageMutation.mutate({ message: content.trim(), settings });
  }, [sendMessageMutation]);

  const addSystemMessage = useCallback((content: string) => {
    const systemMessage: Message = {
      id: Date.now().toString(),
      role: "system",
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, systemMessage]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    addSystemMessage,
    clearMessages,
    scrollToBottom,
    messagesEndRef
  };
}
