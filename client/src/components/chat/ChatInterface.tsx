import { bargeInSupported, micAlreadyAllowed, startBargeIn } from "@/lib/bargeIn";
import { useState, useEffect, useCallback, useRef } from "react";
import { useChat } from "@/hooks/useChat";
import { useSpeech } from "@/hooks/useSpeech";
import { useWakeWordSpeech, setBotWakeName } from "@/hooks/useWakeWordSpeech";
import { BERTHA, type ChatBot } from "@/lib/bots";
import BotAvatar from "@/components/bots/BotAvatar";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import { NLPInsights } from "@/components/nlp/NLPInsights";
import { spokenText } from "@/lib/drafts";
import type { MessageMetadata } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Ear, EarOff, Mic, MicOff, ExternalLink, MessageSquareText, Mail, Megaphone, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

interface ChatInterfaceProps {
  conversationId: string | null;
  onConversationStart: (id: string) => void;
  /** Who answers. Defaults to Bertha. */
  bot?: ChatBot;
}

const WRITING_STARTERS = [
  { label: "Write a text", icon: MessageSquareText, text: "Write a short text message to [who] about " },
  { label: "Write an email", icon: Mail, text: "Write an email to [who] about " },
  { label: "Write a post", icon: Megaphone, text: "Write a social media post about " },
  { label: "Cover letter", icon: FileText, text: "Write a cover letter for the [job title] job at [company]. A bit about me: " },
];

export default function ChatInterface({ conversationId, onConversationStart, bot = BERTHA }: ChatInterfaceProps) {
  const isBertha = !bot.id;
  const botRef = useRef(bot);
  botRef.current = bot;
  // Custom bots speak with their own browser voice, rate and pitch; Bertha keeps her usual voice.
  const voiceFor = (current: ChatBot) => current.id ? { voiceName: current.voiceName, rate: current.voiceRate, pitch: current.voicePitch } : undefined;
  useEffect(() => {
    setBotWakeName(bot.id ? bot.name : null);
    return () => setBotWakeName(null);
  }, [bot.id, bot.name]);
  const [settings, setSettings] = useState({
    language: "en",
    speechEnabled: true, // Enable speech by default for Bertha
    searchEnabled: true,
    showNLPInsights: false,
    wakeWordEnabled: true
  });

  const { messages, latestReply, isLoading, isStreaming, sendMessage, stop, resolveFollowUp, addAssistantMessage, historyError, messagesEndRef, scrollToBottom } = useChat(conversationId, { id: bot.id, name: bot.name });
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | undefined>(undefined);
  const { speak, stopSpeaking, isSpeaking, setWakeWordCallbacks, initializeSpeechSynthesis, initializeAudioContext } = useSpeech();
  const {
    isWakeWordListening,
    status: wakeStatus,
    statusMessage: wakeStatusMessage,
    heardText,
    isConversationActive,
    inIframe,
    startWakeWordListening,
    stopWakeWordListening,
    enableMicrophone,
  } = useWakeWordSpeech();
  const { toast } = useToast();
  // Browsers only allow speech output after the page has been clicked or tapped once.
  const [hasInteracted, setHasInteracted] = useState(() => !!(navigator as any).userActivation?.hasBeenActive);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem("bertha-settings");
    if (savedSettings) {
      // Merge: the side panel saves settings without wakeWordEnabled, which used to turn it off.
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(current => ({ ...current, ...parsed, wakeWordEnabled: parsed.wakeWordEnabled !== false }));
      } catch {
        localStorage.removeItem("bertha-settings");
      }
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
  const handleSendMessage = useCallback(async (message: string, options: { voice?: boolean } = {}) => {
    stopSpeaking(); // a new message cuts her off, like a person would stop talking
    const id = await sendMessage(message, settings, options);
    if (id && id !== conversationId) onConversationStart(id);
  }, [conversationId, onConversationStart, sendMessage, settings, stopSpeaking]);
  const handleStop = useCallback(() => { stop(); stopSpeaking(); }, [stop, stopSpeaking]);
  const sendMessageRef = useRef(handleSendMessage);
  sendMessageRef.current = handleSendMessage;
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  // Something said while Bertha is still thinking waits here and is sent when she finishes (not thrown away).
  const queuedWhileLoadingRef = useRef("");
  useEffect(() => {
    if (!isLoading && queuedWhileLoadingRef.current) {
      const queued = queuedWhileLoadingRef.current;
      queuedWhileLoadingRef.current = "";
      sendMessageRef.current(queued);
    }
  }, [isLoading]);

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
      const spoken = spokenText(lastAssistantMessage.content);
      (window as any).lastBerthaSpokenMessage = spoken;
      
      // Prevent duplicate speech synthesis for the same message
      const messageKey = `${lastAssistantMessage.id}:${lastAssistantMessage.content}`;
      if (lastSpokenMessageRef.current !== messageKey) {
        lastSpokenMessageRef.current = messageKey;
        console.log('🎙️ Speaking new Bertha reply:', lastAssistantMessage.content.slice(0, 50) + '...');
        if (settings.speechEnabled) speak(spoken, 1, voiceFor(botRef.current));
      }
    }
    
    // Listen for repeat events
    const handleRepeat = (event: any) => {
      console.log('🔄 Handling repeat request for:', event.detail.slice(0, 50) + '...');
      if (settings.speechEnabled) speak(event.detail, 1, voiceFor(botRef.current));
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
        // Speaking while she answers interrupts her; the new words are answered instead.
        toast({ title: `${botRef.current.name} heard you`, description: `"${message.slice(0, 60)}${message.length > 60 ? "..." : ""}"`, duration: 2500 });
        // Use the existing handleSendMessage which properly manages conversation creation
        sendMessageRef.current(message, { voice: true });
      }, () => {
        // Only the wake word was said: answer right away (no AI needed) and wait for the request.
        addAssistantMessage(botRef.current.id ? "I'm listening. What can I do for you?" : "Yes, dear, I'm listening. What can I do for you?", `local-ack-${Date.now()}`);
      }, () => {
        // "Goodbye" / "that's all": leave conversation mode. (No wake phrase here, or her own voice would re-wake her.)
        queuedWhileLoadingRef.current = "";
        addAssistantMessage(botRef.current.id ? "Goodbye! I'll be right here when you need me." : "Goodbye, dear. I will be right here when you need me.", `local-bye-${Date.now()}`);
      });
    }
    
    // Cleanup only on settings change or unmount
    return () => {
      stopWakeWordListening(true);
    };
  }, [settings.wakeWordEnabled]); // Only depend on wake word setting

  // Initialize speech synthesis and audio context on first user interaction
  const handleUserInteraction = useCallback(() => {
    setHasInteracted(true);
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" onClick={handleUserInteraction}>
      {/* Chat Messages Area */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 [&>*]:mx-auto [&>*]:max-w-3xl" data-testid="chat-area">
        {historyError && <p role="alert" className="text-sm text-destructive">This conversation could not be loaded. It may have been deleted. Pick another chat on the left or start a new one.</p>}
        {appointmentReminders.error && <p role="status" className="text-sm text-destructive">Appointment reminders are temporarily unavailable. Bertha will retry automatically.</p>}
        {/* Welcome Message */}
        {messages.length === 0 && (
          <MessageBubble
            message={{
              id: "welcome",
              role: "assistant",
              content: !isBertha
                ? (bot.greeting || `Hi! I'm ${bot.name}. How can I help?`)
                : settings.wakeWordEnabled ? "Ah, hello there, my dear child! I am Bertha, your wise grandmother from the beautiful lands of Cameroon. Just say 'Bertha' followed by whatever is on your heart, and I will listen with all the love of a grandmother. You can also type or click the small microphone if you prefer. Now then, what brings you to visit with old Bertha today?" : "Hello, my precious child! I am Bertha, a loving grandmother from Cameroon who has seen many seasons and learned much along the way. I am here to listen, to share stories, to offer wisdom, and to care for you as a grandmother would. What is on your heart today, dear one?",
              timestamp: new Date()
            }}
            showAvatar
            assistant={bot}
          />
        )}

        {/* Chat Messages */}
        {messages.map((message, index) => (
          <div key={`${message.id}-${index}`} data-testid={message.id.startsWith("appointment-reminder-") ? message.id : undefined}>
            <MessageBubble
              message={message}
              showAvatar={message.role === "assistant"}
              assistant={bot}
              data-testid={`message-${message.role}-${message.id}`}
            />
            {!!message.metadata?.welcomeItems?.length && (
              <div className="ml-11 mt-2 space-y-2" data-testid="welcome-items">
                {message.metadata.welcomeItems.map(item => (
                  <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-sm" data-testid={`followup-${item.id}`}>
                    <span className="min-w-0 flex-1">{item.text}</span>
                    {(item.kind === "unfinished" || item.kind === "question") && message.metadata?.welcomeItems && (
                      <Button size="sm" variant="secondary" className="h-7" onClick={() => {
                        resolveFollowUp(item.id, "done");
                        if (item.kind === "unfinished" && item.conversationId) onConversationStart(item.conversationId); // reopen that chat
                        else handleSendMessage(item.summary || item.text);
                      }} data-testid={`followup-resume-${item.id}`}>{item.kind === "question" ? "Ask again" : "Continue"}</Button>
                    )}
                    <Button size="sm" variant="secondary" className="h-7" onClick={() => resolveFollowUp(item.id, "done")} data-testid={`followup-done-${item.id}`}>Done</Button>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => resolveFollowUp(item.id, "dismissed")} data-testid={`followup-dismiss-${item.id}`}>Not now</Button>
                  </div>
                ))}
              </div>
            )}
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
        {isLoading && !isStreaming && (
          <div className="message-bubble ai-message p-4 rounded-lg shadow-sm">
            <div className="flex items-start gap-3">
              <BotAvatar emoji={bot.avatarEmoji} url={bot.avatarUrl} name={bot.name} className="w-8 h-8 text-lg" />
              <div className="typing-indicator">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
            </div>
          </div>
        )}

        {isSpeaking && (
          <div className="sticky bottom-2 z-10 flex justify-center">
            <button type="button" onClick={e => { e.stopPropagation(); stopSpeaking(); }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm shadow-md backdrop-blur hover:bg-muted"
              aria-label={`Stop ${bot.name} speaking`} data-testid="button-stop-speaking">
              <span className="flex h-3 items-end gap-0.5" aria-hidden>
                <span className="w-0.5 animate-pulse bg-primary h-2" /><span className="w-0.5 animate-pulse bg-primary h-3 [animation-delay:150ms]" /><span className="w-0.5 animate-pulse bg-primary h-1.5 [animation-delay:300ms]" />
              </span>
              {bot.name} is speaking · tap to stop
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-border/70 bg-background/80 px-3 pt-3 backdrop-blur-xl sm:px-6" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        {/* Writing helpers: fill the box with a starter the user finishes */}
        <div className="no-scrollbar -mx-3 mb-2.5 flex max-w-4xl gap-2 overflow-x-auto px-3 sm:mx-auto sm:flex-wrap sm:overflow-visible sm:px-0" data-testid="writing-chips">
          {WRITING_STARTERS.map(({ label, icon: Icon, text }) => (
            <Button key={label} variant="outline" size="sm" className="h-8 shrink-0 rounded-full border-border bg-card/60 text-xs"
              onClick={() => setPrefill({ text, nonce: Date.now() })}
              data-testid={`chip-${label.toLowerCase().replace(/\s+/g, "-")}`}>
              <Icon className="w-4 h-4 mr-1" /> {label}
            </Button>
          ))}
        </div>
        <ChatInput 
          botName={bot.name}
          prefill={prefill}
          onSendMessage={handleSendMessage}
          onStop={handleStop}
          isLoading={isLoading}
          language={settings.language}
          speechEnabled={settings.speechEnabled}
          onToggleSpeech={toggleSpeech}
        />

        {/* Wake Word Status Indicator */}
        {settings.wakeWordEnabled && (
          <div className="text-center my-2 space-y-1" data-testid="wakeword-status" aria-live="polite">
            {wakeStatus === "listening" ? (
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm border ${isConversationActive ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800 text-green-700 dark:text-green-300" : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"}`}>
                <div className={`w-2 h-2 rounded-full animate-pulse ${isConversationActive ? "bg-green-500" : "bg-blue-500"}`} />
                <span>{isConversationActive
                  ? (isLoading ? `In conversation - ${bot.name} is thinking...` : isSpeaking ? `In conversation - ${bot.name} is speaking` : "In conversation - just talk (say \"goodbye\" to end)")
                  : isBertha ? 'Say "Hi Bertha"' : `Say "Hi ${bot.name}" or "Hi Bertha"`}</span>
              </div>
            ) : wakeStatus === "blocked" || wakeStatus === "unsupported" || wakeStatus === "error" ? (
              <div role="alert" className="mx-auto max-w-xl rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <MicOff className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{wakeStatusMessage || `${bot.name} can't hear you right now.`}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {wakeStatus !== "unsupported" && (
                    <Button size="sm" variant="secondary" onClick={() => { handleUserInteraction(); enableMicrophone(); }} data-testid="button-enable-mic">
                      <Mic className="mr-1 h-4 w-4" /> Enable microphone
                    </Button>
                  )}
                  {inIframe && (
                    <Button size="sm" variant="secondary" onClick={() => window.open(window.location.href, "_blank", "noopener")} data-testid="button-open-tab">
                      <ExternalLink className="mr-1 h-4 w-4" /> Open in new tab
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm border border-border text-muted-foreground">
                <span>Starting the microphone...</span>
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => { handleUserInteraction(); enableMicrophone(); }}>
                  <Mic className="mr-1 h-3 w-3" /> Enable microphone
                </Button>
              </div>
            )}
            {heardText && (
              <div className="text-xs text-muted-foreground" data-testid="text-heard">Heard: "{heardText}"</div>
            )}
          </div>
        )}
        {settings.speechEnabled && !hasInteracted && (
          <div className="text-center mb-2">
            <button type="button" className="text-xs px-2 py-1 rounded-md bg-yellow-100 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100" onClick={handleUserInteraction}>
              Click here once so {bot.name} can speak out loud (browsers block sound until you do)
            </button>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 mt-3 max-w-4xl mx-auto">
          <Button
            variant={wakeStatus === "listening" ? "default" : "secondary"}
            size="sm"
            onClick={() => {
              const newSettings = { ...settings, wakeWordEnabled: !settings.wakeWordEnabled };
              setSettings(newSettings);
              localStorage.setItem("bertha-settings", JSON.stringify(newSettings));
              window.dispatchEvent(new CustomEvent("bertha-settings-changed", { detail: newSettings }));
            }}
            data-testid="button-toggle-wakeword"
          >
            {settings.wakeWordEnabled ? (
              <>
                <Ear className="w-4 h-4 mr-1" />
                Wake Word: {wakeStatus === "listening" ? "On" : "On (not listening)"}
              </>
            ) : (
              <>
                <EarOff className="w-4 h-4 mr-1" />
                Wake Word: Off
              </>
            )}
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
