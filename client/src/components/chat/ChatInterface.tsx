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
import { Ear, EarOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

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

  const { messages, latestReply, isLoading, sendMessage, addAssistantMessage, historyError, messagesEndRef, scrollToBottom } = useChat(conversationId);
  const { speak, stopSpeaking, isSpeaking, setWakeWordCallbacks, initializeSpeechSynthesis, initializeAudioContext } = useSpeech();
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

  // Keep the sidebar settings panel and the compact composer control in sync.
  useEffect(() => {
    const handleSettingsChange = (event: Event) => {
      const updatedSettings = (event as CustomEvent<Partial<typeof settings>>).detail;
      if (updatedSettings) {
        setSettings(currentSettings => ({ ...currentSettings, ...updatedSettings }));
      }
    };

    window.addEventListener("bertha-settings-changed", handleSettingsChange);
    return () => window.removeEventListener("bertha-settings-changed", handleSettingsChange);
  }, []);

  // Create conversation when first message is sent (stable callback to prevent wake word restarts)
  const handleSendMessage = useCallback(async (message: string) => {
    const id = await sendMessage(message, settings);
    if (id && id !== conversationId) onConversationStart(id);
  }, [conversationId, onConversationStart, sendMessage, settings]);
  const sendMessageRef = useRef(handleSendMessage);
  sendMessageRef.current = handleSendMessage;

  const displayedRemindersRef = useRef(new Set<string>());
  const appointmentReminders = useQuery<{ id: string; content: string }[]>({
    queryKey: ["appointment-reminders"],
    queryFn: async () => {
      const response = await fetch("/api/appointments/reminders", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Appointment reminders are temporarily unavailable.");
      return response.json();
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    for (const reminder of appointmentReminders.data || []) {
      if (!displayedRemindersRef.current.has(reminder.id)) {
        displayedRemindersRef.current.add(reminder.id);
        addAssistantMessage(reminder.content, `appointment-reminder-${reminder.id}`);
      }
      fetch(`/api/appointments/${reminder.id}/reminder-ack`, { method: "POST", credentials: "same-origin" })
        .catch(error => console.error("Reminder acknowledgement failed:", error));
    }
  }, [appointmentReminders.data, addAssistantMessage]);

  // Speech interruption is now handled directly in wake word detection
  // No need to pause/resume wake word detection during speech

  // Handle AI response speech - only assistant messages are eligible.
  const lastSpokenMessageRef = useRef<string>('');
  useEffect(() => {
    if (!latestReply) return;

    // System messages can be appended after an assistant response, so find
    // the latest assistant message rather than checking only the last item.
    const lastAssistantMessage = latestReply;

    if (lastAssistantMessage) {
      // Store last message for repeat functionality
      (window as any).lastBerthaSpokenMessage = lastAssistantMessage.content;
      
      // Prevent duplicate speech synthesis for the same message
      const messageKey = `${lastAssistantMessage.id}:${lastAssistantMessage.content}`;
      if (lastSpokenMessageRef.current !== messageKey) {
        lastSpokenMessageRef.current = messageKey;
        console.log('🎙️ Speaking new Bertha reply:', lastAssistantMessage.content.slice(0, 50) + '...');
        if (settings.speechEnabled) speak(lastAssistantMessage.content);
      }
    }
    
    // Listen for repeat events
    const handleRepeat = (event: any) => {
      console.log('🔄 Handling repeat request for:', event.detail.slice(0, 50) + '...');
      if (settings.speechEnabled) speak(event.detail);
    };
    
    window.addEventListener('berthaRepeat', handleRepeat);
    return () => window.removeEventListener('berthaRepeat', handleRepeat);
  }, [latestReply, settings.speechEnabled, speak]);

  // Wake word listening management (run only once on mount)
  useEffect(() => {
    if (settings.wakeWordEnabled) {
      console.log('🎤 Starting wake word listening (initial setup)...');
      // Start wake word listening with stable message handling  
      startWakeWordListening((message: string) => {
        console.log('Wake word message received:', message);
        // Use the existing handleSendMessage which properly manages conversation creation
        sendMessageRef.current(message);
      });
    }
    
    // Cleanup only on settings change or unmount
    return () => {
      stopWakeWordListening(true);
    };
  }, [settings.wakeWordEnabled]); // Only depend on wake word setting

  // Initialize speech synthesis and audio context on first user interaction
  const handleUserInteraction = useCallback(() => {
    if (settings.speechEnabled) {
      if (!(window as any).speechSynthesisInitialized) {
        initializeSpeechSynthesis();
      }
      // Initialize audio context for mobile devices
      initializeAudioContext();
    }
  }, [settings.speechEnabled, initializeSpeechSynthesis, initializeAudioContext]);

  const toggleSpeech = () => {
    stopSpeaking();
    const newSettings = { ...settings, speechEnabled: !settings.speechEnabled };
    setSettings(newSettings);
    localStorage.setItem("bertha-settings", JSON.stringify(newSettings));
    window.dispatchEvent(new CustomEvent("bertha-settings-changed", { detail: newSettings }));
    
    // Initialize speech synthesis and audio context when enabling speech
    if (newSettings.speechEnabled) {
      if (!(window as any).speechSynthesisInitialized) {
        initializeSpeechSynthesis();
      }
      // Initialize audio context for mobile devices
      initializeAudioContext();
    }
  };

  useEffect(() => {
    if (!settings.speechEnabled) stopSpeaking();
  }, [settings.speechEnabled, stopSpeaking]);

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  return (
    <div className="flex-1 min-w-0 flex flex-col" onClick={handleUserInteraction}>
      {/* Reminder Notifications */}
      <ReminderNotifications />
      
      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="chat-area">
        {historyError && <p role="alert" className="text-sm text-destructive">This conversation could not be loaded. It may belong to another browser session or have expired after a server restart.</p>}
        {appointmentReminders.error && <p role="status" className="text-sm text-destructive">Appointment reminders are temporarily unavailable. Bertha will retry automatically.</p>}
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
          <div key={`${message.id}-${index}`} data-testid={message.id.startsWith("appointment-reminder-") ? message.id : undefined}>
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
          onToggleSpeech={toggleSpeech}
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
