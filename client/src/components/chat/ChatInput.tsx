import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Send, Image, Volume2, VolumeX, Square } from "lucide-react";
import { useSpeech } from "@/hooks/useSpeech";
import { useCamera } from "@/hooks/useCamera";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ChatInputProps {
  onSendMessage: (message: string, options?: { voice?: boolean }) => void;
  isLoading: boolean;
  /** Stops the reply being written. Typing a new message while it writes also interrupts it. */
  onStop?: () => void;
  language: string;
  speechEnabled?: boolean;
  onToggleSpeech?: () => void;
  /** Text to place in the box (e.g. from a writing chip); a new nonce re-applies it. */
  prefill?: { text: string; nonce: number };
  /** Name of whoever answers (Bertha or a custom bot), for the placeholder. */
  botName?: string;
}

export default function ChatInput({
  botName = "Bertha",
  onSendMessage,
  isLoading,
  onStop,
  language,
  speechEnabled = true,
  onToggleSpeech,
  prefill,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [charCount, setCharCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { startListening, stopListening, isListening } = useSpeech();
  const { captureFrame, isActive: isCameraActive } = useCamera();
  const { toast } = useToast();

  const maxChars = 6000; // room to paste a job description for a cover letter

  useEffect(() => {
    if (!prefill) return;
    setMessage(prefill.text);
    setCharCount(prefill.text.length);
    requestAnimationFrame(() => {
      const box = textareaRef.current;
      if (!box) return;
      box.focus();
      // Select the first [placeholder] so typing replaces it.
      const start = prefill.text.indexOf("[");
      const end = prefill.text.indexOf("]", start);
      if (start >= 0 && end > start) box.setSelectionRange(start, end + 1);
      else box.setSelectionRange(prefill.text.length, prefill.text.length);
    });
  }, [prefill?.nonce]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
    }
  }, [message]);

  const handleInputChange = (value: string) => {
    if (value.length <= maxChars) {
      setMessage(value);
      setCharCount(value.length);
    }
  };

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return; // while a reply is being written, this interrupts it

    onSendMessage(trimmed);
    setMessage("");
    setCharCount(0);
    
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceInput = () => {
    if (isListening) {
      stopListening();
    } else {
      const languageMap: Record<string, string> = {
        en: "en-US",
        es: "es-ES",
        fr: "fr-FR",
        de: "de-DE",
        ja: "ja-JP",
        zh: "zh-CN"
      };

      // Store the accumulated speech text to send
      let accumulatedText = "";

      // Auto-send callback for when speech recognition detects silence
      const handleAutoSend = () => {
        console.log('Auto-send triggered, accumulated text:', accumulatedText);
        // Use the accumulated text from speech recognition, not the state
        const textToSend = accumulatedText.trim();
        if (textToSend) {
          console.log('Sending message:', textToSend);
          onSendMessage(textToSend, { voice: true });
          setMessage("");
          setCharCount(0);
          accumulatedText = ""; // Clear accumulated text
          
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
          }
        } else {
          console.log('No message to send');
        }
      };

      startListening(
        (transcript) => {
          const cleanTranscript = transcript.trim();
          if (cleanTranscript) {
            // Update the accumulated text for auto-send
            accumulatedText = accumulatedText + (accumulatedText ? ' ' : '') + cleanTranscript;
            
            // Update the UI state
            setMessage(prev => prev + (prev ? ' ' : '') + cleanTranscript);
            setCharCount(prev => prev + cleanTranscript.length + (prev ? 1 : 0));
            
            console.log('Updated accumulated text:', accumulatedText);
          }
        }, 
        languageMap[language] || "en-US",
        speechEnabled, // Enable auto-send when speech is enabled
        handleAutoSend, // Callback for auto-sending
        1000 // 1 second of silence before auto-send
      );
    }
  };

  const handleImageCapture = async () => {
    if (!isCameraActive) {
      toast({
        title: "Camera Not Active",
        description: "Please enable camera in the camera panel first",
        variant: "destructive"
      });
      return;
    }

    const imageData = captureFrame();
    if (!imageData) {
      toast({
        title: "Capture Failed",
        description: "Failed to capture image from camera",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/analyze-image", {
        imageData
      });
      const result = await response.json();
      
      const analysisMessage = `I can see in this image: ${result.analysis}`;
      onSendMessage(analysisMessage);
      
      toast({
        title: "Image Analyzed",
        description: "Camera image has been analyzed and sent to Bertha",
      });
    } catch (error) {
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze the captured image",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="flex min-w-0 flex-wrap items-end gap-2 max-w-4xl mx-auto sm:flex-nowrap sm:gap-3">
      {/* Voice Input Button */}
      <Button
        variant={isListening ? "default" : "secondary"}
        size="icon"
        onClick={handleVoiceInput}
        className={isListening ? "relative speech-pulse" : "relative"}
        data-testid="button-voice"
        title={speechEnabled ? "Click to speak - will auto-send when you stop talking" : "Click to speak"}
      >
        <Mic className="h-5 w-5" />
        {speechEnabled && !isListening && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        )}
      </Button>

      {/* Camera Capture Button */}
      <Button
        variant="secondary"
        size="icon"
        onClick={handleImageCapture}
        disabled={!isCameraActive}
        data-testid="button-camera"
      >
        <Image className="h-5 w-5" />
      </Button>

      {/* Bertha voice output toggle */}
      {onToggleSpeech && (
        <Button
          variant={speechEnabled ? "secondary" : "outline"}
          size="icon"
          onClick={onToggleSpeech}
          aria-label={speechEnabled ? "Mute Bertha's voice" : "Turn on Bertha's voice"}
          title={speechEnabled ? "Mute Bertha's voice" : "Turn on Bertha's voice"}
          data-testid="button-toggle-speech"
        >
          {speechEnabled ? (
            <Volume2 className="h-5 w-5" />
          ) : (
            <VolumeX className="h-5 w-5" />
          )}
        </Button>
      )}

      {/* Text Input */}
      <div className="relative order-first w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Type your message to ${botName}...`}
          className="resize-none min-h-[3rem] max-h-32 pr-16"
          rows={1}
          data-testid="input-message"
        />
        <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
          <span data-testid="text-charcount">{charCount}</span>/{maxChars}
        </div>
      </div>

      {/* Stop (while answering) and Send. Sending while answering interrupts, like talking over someone. */}
      {isLoading && onStop && (
        <Button variant="destructive" onClick={onStop} aria-label={`Stop ${botName}`} title={`Stop ${botName}`} data-testid="button-stop">
          <Square className="h-4 w-4 fill-current" />
        </Button>
      )}
      {(!isLoading || message.trim() || !onStop) && (
        <Button
          onClick={handleSend}
          disabled={!message.trim()}
          aria-label={isLoading ? "Interrupt and send" : "Send"}
          data-testid="button-send"
        >
          <Send className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
