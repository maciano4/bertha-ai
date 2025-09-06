import { useState, useEffect, useCallback, useRef } from "react";
import { useChat } from "@/hooks/useChat";
import { useSpeech } from "@/hooks/useSpeech";
import { useWakeWordSpeech } from "@/hooks/useWakeWordSpeech";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import { NLPInsights } from "@/components/nlp/NLPInsights";
import type { MessageMetadata } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Ear, EarOff } from "lucide-react";

interface ChatInterfaceProps {
  conversationId: string | null;
  onConversationStart: (id: string) => void;
}

export default function ChatInterface({ conversationId, onConversationStart }: ChatInterfaceProps) {
  const [settings, setSettings] = useState({
    language: "en",
    speechEnabled: true, // Enable speech by default for Bertha
    searchEnabled: true,
    showNLPInsights: false,
    wakeWordEnabled: true
  });

  const { messages, isLoading, sendMessage, messagesEndRef, scrollToBottom } = useChat(conversationId);
  const { speak, stopSpeaking, isSpeaking, setWakeWordCallbacks } = useSpeech();
  const { 
    isWakeWordListening, 
    startWakeWordListening, 
    stopWakeWordListening, 
    pauseWakeWordDetection, 
    resumeWakeWordDetection 
  } = useWakeWordSpeech();

  // Auto-scroll when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem("bertha-settings");
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  // Create conversation when first message is sent (stable callback to prevent wake word restarts)
  const handleSendMessage = useCallback(async (message: string) => {
    if (!conversationId) {
      // Create new conversation
      try {
        const response = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: message.slice(0, 50) + "..." })
        });
        const newConversation = await response.json();
        onConversationStart(newConversation.id);
      } catch (error) {
        console.error("Failed to create conversation:", error);
      }
    }
    
    await sendMessage(message, settings);
  }, [conversationId, onConversationStart, sendMessage, settings]);

  // Connect speech synthesis to wake word detection pause/resume
  useEffect(() => {
    setWakeWordCallbacks(pauseWakeWordDetection, resumeWakeWordDetection);
  }, [setWakeWordCallbacks, pauseWakeWordDetection, resumeWakeWordDetection]);

  // Handle AI response speech with deduplication
  const lastSpokenMessageRef = useRef<string>('');
  useEffect(() => {
    if (!settings.speechEnabled || !messages.length || isLoading) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === "assistant") {
      // Prevent duplicate speech synthesis for the same message
      const messageKey = `${lastMessage.content}-${messages.length}`;
      if (lastSpokenMessageRef.current !== messageKey) {
        lastSpokenMessageRef.current = messageKey;
        console.log('🎙️ Starting speech synthesis for:', lastMessage.content.slice(0, 50) + '...');
        // Small delay to ensure message is fully processed
        setTimeout(() => {
          speak(lastMessage.content);
        }, 100);
      }
    }
  }, [messages, settings.speechEnabled, speak, isLoading]);

  // Wake word listening management (run only once on mount)
  useEffect(() => {
    if (settings.wakeWordEnabled) {
      console.log('🎤 Starting wake word listening (initial setup)...');
      // Start wake word listening with stable message handling
      startWakeWordListening((message: string) => {
        console.log('Wake word message received:', message);
        // Create conversation if needed and send message
        (async () => {
          if (!conversationId) {
            try {
              const response = await fetch("/api/conversations", {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: message.slice(0, 50) + "..." })
              });
              const newConversation = await response.json();
              onConversationStart(newConversation.id);
            } catch (error) {
              console.error("Failed to create conversation:", error);
            }
          }
          
          // Send message directly to avoid re-render issues
          await sendMessage(message, settings);
        })();
      });
    }
    
    // Cleanup only on settings change or unmount
    return () => {
      if (isWakeWordListening) {
        console.log('🧹 Settings changed - stopping wake word listening');
        stopWakeWordListening(true); // Clear conversation mode on settings change
      }
    };
  }, [settings.wakeWordEnabled]); // Only depend on wake word setting

  // Separate cleanup effect that only runs on unmount
  useEffect(() => {
    return () => {
      if (isWakeWordListening) {
        console.log('🧹 Cleanup on unmount: stopping wake word listening');
        stopWakeWordListening();
      }
    };
  }, []); // Empty dependency array - only runs on mount/unmount

  const toggleSpeech = () => {
    if (isSpeaking) {
      stopSpeaking();
    }
    const newSettings = { ...settings, speechEnabled: !settings.speechEnabled };
    setSettings(newSettings);
    localStorage.setItem("bertha-settings", JSON.stringify(newSettings));
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="chat-area">
        {/* Welcome Message */}
        {messages.length === 0 && (
          <MessageBubble
            message={{
              id: "welcome",
              role: "assistant",
              content: settings.wakeWordEnabled ? "Ah, hello there, my dear child! I am Bertha, your wise grandmother from the beautiful lands of Cameroon. Just say 'Bertha' followed by whatever is on your heart, and I will listen with all the love of a grandmother. You can also type or click the small microphone if you prefer. Now then, what brings you to visit with old Bertha today?" : "Hello, my precious child! I am Bertha, a loving grandmother from Cameroon who has seen many seasons and learned much along the way. I am here to listen, to share stories, to offer wisdom, and to care for you as a grandmother would. What is on your heart today, dear one?",
              timestamp: new Date()
            }}
            showAvatar
          />
        )}

        {/* Chat Messages */}
        {messages.map((message, index) => (
          <div key={`${message.id}-${index}`}>
            <MessageBubble
              message={message}
              showAvatar={message.role === "assistant"}
              data-testid={`message-${message.role}-${message.id}`}
            />
            {/* Show NLP insights for user messages if available */}
            {message.role === "user" && (message.metadata as MessageMetadata)?.nlpAnalysis && settings.showNLPInsights && (
              <div className="ml-4 mt-2">
                <NLPInsights 
                  analysis={(message.metadata as MessageMetadata).nlpAnalysis!} 
                  className="max-w-sm"
                />
              </div>
            )}
          </div>
        ))}

        {/* Typing Indicator */}
        {isLoading && (
          <div className="message-bubble ai-message p-4 rounded-lg shadow-sm">
            <div className="flex items-start gap-3">
              <img 
                src="https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=40&h=40&fit=crop" 
                alt="Bertha AI" 
                className="w-8 h-8 rounded-full object-cover"
              />
              <div className="typing-indicator">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="blur-backdrop border-t border-border p-4">
        <ChatInput 
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          language={settings.language}
          speechEnabled={settings.speechEnabled}
        />

        {/* Wake Word Status Indicator */}
        {isWakeWordListening && (
          <div className="text-center mb-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-full text-sm text-blue-700 dark:text-blue-300">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span>Listening for "Bertha"...</span>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 mt-3 max-w-4xl mx-auto">
          <Button
            variant={isWakeWordListening ? "default" : "secondary"}
            size="sm"
            onClick={() => {
              const newSettings = { ...settings, wakeWordEnabled: !settings.wakeWordEnabled };
              setSettings(newSettings);
              localStorage.setItem("bertha-settings", JSON.stringify(newSettings));
            }}
            data-testid="button-toggle-wakeword"
          >
            {settings.wakeWordEnabled ? (
              <>
                <Ear className="w-4 h-4 mr-1" />
                Wake Word: On
              </>
            ) : (
              <>
                <EarOff className="w-4 h-4 mr-1" />
                Wake Word: Off
              </>
            )}
          </Button>
          
          <Button
            variant="secondary"
            size="sm"
            onClick={toggleSpeech}
            data-testid="button-toggle-speech"
          >
            {settings.speechEnabled ? (
              <>
                <Volume2 className="w-4 h-4 mr-1" />
                Speech On
              </>
            ) : (
              <>
                <VolumeX className="w-4 h-4 mr-1" />
                Speech Off
              </>
            )}
          </Button>
          
          <Button variant="secondary" size="sm" data-testid="button-web-search">
            <i className="fas fa-search mr-1"></i>
            Web Search: {settings.searchEnabled ? "On" : "Off"}
          </Button>
          
          <Button variant="secondary" size="sm" data-testid="button-language">
            <i className="fas fa-language mr-1"></i>
            Language: {settings.language.toUpperCase()}
          </Button>
        </div>
      </div>
    </div>
  );
}
