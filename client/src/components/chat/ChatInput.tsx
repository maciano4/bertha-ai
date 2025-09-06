import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Send, Image } from "lucide-react";
import { useSpeech } from "@/hooks/useSpeech";
import { useCamera } from "@/hooks/useCamera";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  language: string;
  speechEnabled?: boolean;
}

export default function ChatInput({ onSendMessage, isLoading, language, speechEnabled = false }: ChatInputProps) {
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

      // Auto-send callback for when speech recognition detects silence
      const handleAutoSend = () => {
        const currentMessage = message.trim();
        if (currentMessage) {
          onSendMessage(currentMessage);
          setMessage("");
          setCharCount(0);
          
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
          }
        }
      };

      startListening(
        (transcript) => {
          const cleanTranscript = transcript.trim();
          if (cleanTranscript) {
            setMessage(prev => prev + (prev ? ' ' : '') + cleanTranscript);
            setCharCount(prev => prev + cleanTranscript.length + (prev ? 1 : 0));
          }
        }, 
        languageMap[language] || "en-US",
        speechEnabled, // Enable auto-send when speech is enabled
        handleAutoSend, // Callback for auto-sending
        3000 // 3 seconds of silence before auto-send (increased for better UX)
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
    <div className="flex items-end gap-3 max-w-4xl mx-auto">
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

      {/* Text Input */}
      <div className="flex-1 relative">
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
