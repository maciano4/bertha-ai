import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Send, Image, Volume2, VolumeX } from "lucide-react";
import { useSpeech } from "@/hooks/useSpeech";
import { useCamera } from "@/hooks/useCamera";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  language: string;
  speechEnabled?: boolean;
  onToggleSpeech?: () => void;
}

export default function ChatInput({
  onSendMessage,
  isLoading,
  language,
  speechEnabled = true,
  onToggleSpeech,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [charCount, setCharCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { startListening, stopListening, isListening } = useSpeech();
  const { captureFrame, isActive: isCameraActive } = useCamera();
  const { toast } = useToast();

  const maxChars = 1000;

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
    if (!trimmed || isLoading) return;

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
          onSendMessage(textToSend);
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
        className={isListening ? "speech-pulse" : ""}
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
          placeholder="Type your message to Bertha..."
          className="resize-none min-h-[3rem] max-h-32 pr-16"
          rows={1}
          data-testid="input-message"
        />
        <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
          <span data-testid="text-charcount">{charCount}</span>/{maxChars}
        </div>
      </div>

      {/* Send Button */}
      <Button
        onClick={handleSend}
        disabled={!message.trim() || isLoading}
        data-testid="button-send"
      >
        <Send className="h-5 w-5" />
      </Button>
    </div>
  );
}
