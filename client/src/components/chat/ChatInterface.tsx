import { useState, useEffect, useCallback, useRef } from "react";
import { useChat } from "@/hooks/useChat";
import { useSpeech } from "@/hooks/useSpeech";
import { useWakeWordSpeech } from "@/hooks/useWakeWordSpeech";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import { NLPInsights } from "@/components/nlp/NLPInsights";
import { ReminderNotifications } from "../reminders/ReminderNotifications";
import { DailyPlanner } from "../planning/DailyPlanner";
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
  const { speak, stopSpeaking, isSpeaking, setWakeWordCallbacks, initializeSpeechSynthesis } = useSpeech();
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
    // Only create conversation if we don't have one
    if (!conversationId) {
      console.log('🆕 Creating new conversation for:', message.slice(0, 30));
      try {
        const response = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: message.slice(0, 50) + "..." })
        });
        const newConversation = await response.json();
        console.log('✅ New conversation created:', newConversation.id);
        onConversationStart(newConversation.id);
      } catch (error) {
        console.error("Failed to create conversation:", error);
      }
    } else {
      console.log('💬 Continuing existing conversation:', conversationId.slice(0, 8));
    }
    
    await sendMessage(message, settings);
  }, [conversationId, onConversationStart, sendMessage, settings]);

  // Speech interruption is now handled directly in wake word detection
  // No need to pause/resume wake word detection during speech

  // Handle AI response speech - look for LAST ASSISTANT message (ignore system messages)
  const lastSpokenMessageRef = useRef<string>('');
  useEffect(() => {
    console.log('🔍 SPEECH EFFECT TRIGGERED:', {
      speechEnabled: settings.speechEnabled,
      messagesLength: messages.length,
      isLoading,
      lastMessageRole: messages.length > 0 ? messages[messages.length - 1].role : 'none'
    });

    if (!settings.speechEnabled || !messages.length || isLoading) return;

    // Find the LAST ASSISTANT MESSAGE (ignore system messages that may come after)
    const lastAssistantMessage = [...messages].reverse().find(msg => msg.role === "assistant");
    
    console.log('🔍 Looking for last assistant message:', {
      found: !!lastAssistantMessage,
      content: lastAssistantMessage ? lastAssistantMessage.content.slice(0, 30) : 'none',
      isLoading,
      speechEnabled: settings.speechEnabled 
    });

    if (lastAssistantMessage) {
      // Store last message for repeat functionality
      (window as any).lastBerthaSpokenMessage = lastAssistantMessage.content;
      
      // Prevent duplicate speech synthesis for the same message
      const messageKey = `${lastAssistantMessage.content}-${messages.length}`;
      if (lastSpokenMessageRef.current !== messageKey) {
        lastSpokenMessageRef.current = messageKey;
        console.log('🎙️ SPEAKING ASSISTANT MESSAGE:', lastAssistantMessage.content.slice(0, 50) + '...');
        // Immediate speech synthesis with no delay
        speak(lastAssistantMessage.content);
      } else {
        console.log('⚠️ Skipping duplicate speech synthesis');
      }
    } else {
      console.log('❌ No assistant message found to speak');
    }
    
    // Listen for repeat events
    const handleRepeat = (event: any) => {
      console.log('🔄 Handling repeat request for:', event.detail.slice(0, 50) + '...');
      speak(event.detail);
    };
    
    window.addEventListener('berthaRepeat', handleRepeat);
    return () => window.removeEventListener('berthaRepeat', handleRepeat);
  }, [messages, settings.speechEnabled, speak, isLoading]);

  // Wake word listening management (run only once on mount)
  useEffect(() => {
    if (settings.wakeWordEnabled) {
      console.log('🎤 Starting wake word listening (initial setup)...');
      // Start wake word listening with stable message handling  
      startWakeWordListening((message: string) => {
        console.log('Wake word message received:', message);
        // Use the existing handleSendMessage which properly manages conversation creation
        handleSendMessage(message);
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

  // Initialize speech synthesis on first user interaction
  const handleUserInteraction = useCallback(() => {
    if (settings.speechEnabled && !(window as any).speechSynthesisInitialized) {
      initializeSpeechSynthesis();
    }
  }, [settings.speechEnabled, initializeSpeechSynthesis]);

  const toggleSpeech = () => {
    if (isSpeaking) {
      stopSpeaking();
    }
    const newSettings = { ...settings, speechEnabled: !settings.speechEnabled };
    setSettings(newSettings);
    localStorage.setItem("bertha-settings", JSON.stringify(newSettings));
    
    // Initialize speech synthesis when enabling speech
    if (newSettings.speechEnabled && !(window as any).speechSynthesisInitialized) {
      initializeSpeechSynthesis();
    }
  };

  return (
    <div className="flex-1 flex flex-col" onClick={handleUserInteraction}>
      {/* Reminder Notifications */}
      <ReminderNotifications />
      
      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="chat-area">
        {/* Daily Planner */}
        <DailyPlanner />
        
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
          
          {settings.speechEnabled && !(window as any).speechSynthesisInitialized && (
            <div className="text-xs text-muted-foreground px-2 py-1 bg-yellow-100 dark:bg-yellow-900 rounded-md">
              👆 Click anywhere to enable voice responses
            </div>
          )}
          
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
