import { useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export function useSpeech() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onAutoSendRef = useRef<(() => void) | null>(null);
  const { toast } = useToast();

  // Text-to-Speech
  const speak = useCallback((text: string, rate: number = 1) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => {
        setIsSpeaking(false);
        toast({
          title: "Speech Error",
          description: "Failed to speak the text",
          variant: "destructive"
        });
      };
      
      window.speechSynthesis.speak(utterance);
    } else {
      toast({
        title: "Not Supported",
        description: "Text-to-speech is not supported in this browser",
        variant: "destructive"
      });
    }
  }, [toast]);

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  // Speech-to-Text with auto-send capability
  const startListening = useCallback((
    onResult: (text: string) => void, 
    language: string = 'en-US',
    autoSend: boolean = false,
    onAutoSend?: () => void,
    silenceTimeout: number = 2000
  ) => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: "Not Supported",
        description: "Speech recognition is not supported in this browser",
        variant: "destructive"
      });
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = autoSend; // Enable continuous mode for auto-send
    recognition.interimResults = autoSend; // Enable interim results for better UX
    recognition.lang = language;
    
    // Store auto-send callback for later use
    if (autoSend && onAutoSend) {
      onAutoSendRef.current = onAutoSend;
    }

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let transcript = '';
      
      // Handle both interim and final results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          transcript += result[0].transcript;
        }
      }
      
      if (transcript) {
        onResult(transcript);
        
        // If auto-send is enabled, start silence detection
        if (autoSend && onAutoSendRef.current) {
          // Clear existing timer
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          
          // Set new timer for silence detection
          silenceTimerRef.current = setTimeout(() => {
            // Stop listening and auto-send
            recognition.stop();
            onAutoSendRef.current?.();
            onAutoSendRef.current = null;
          }, silenceTimeout);
        }
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      toast({
        title: "Speech Recognition Error",
        description: `Error: ${event.error}`,
        variant: "destructive"
      });
    };

    recognition.onend = () => {
      setIsListening(false);
      
      // Clear any pending silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      
      // Don't auto-restart if we're in auto-send mode and stopping intentionally
      if (autoSend && recognition.continuous && !recognition._stopRequested) {
        // Restart recognition for continuous listening
        setTimeout(() => {
          if (recognitionRef.current === recognition && !recognition._stopRequested) {
            recognition.start();
          }
        }, 100);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [toast]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      // Mark as intentional stop to prevent restart
      recognitionRef.current._stopRequested = true;
      recognitionRef.current.stop();
      setIsListening(false);
    }
    
    // Clear any pending silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    // Clear auto-send callback
    onAutoSendRef.current = null;
  }, []);

  return {
    isListening,
    isSpeaking,
    speak,
    stopSpeaking,
    startListening,
    stopListening
  };
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
