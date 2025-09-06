import { useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export function useSpeech() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const wakeWordRecognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onAutoSendRef = useRef<(() => void) | null>(null);
  const onWakeWordDetectedRef = useRef<(() => void) | null>(null);
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
    
    recognition.continuous = true; // Always use continuous mode for better reliability
    recognition.interimResults = true; // Enable interim results for better UX
    recognition.lang = language;
    recognition.maxAlternatives = 1;
    
    // Store auto-send callback for later use
    if (autoSend && onAutoSend) {
      onAutoSendRef.current = onAutoSend;
    }

    recognition.onstart = () => {
      setIsListening(true);
    };

    let hasSpokenText = false;
    
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      // Handle both interim and final results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        
        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      // Update the input with final results
      if (finalTranscript.trim()) {
        onResult(finalTranscript);
        hasSpokenText = true;
        
        console.log('Final speech result:', finalTranscript);
      }
      
      // If auto-send is enabled and we have spoken text, start/reset silence timer
      if (autoSend && onAutoSendRef.current && hasSpokenText) {
        // Clear existing timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        
        console.log('Starting silence timer for auto-send...');
        
        // Set new timer for silence detection
        silenceTimerRef.current = setTimeout(() => {
          try {
            console.log('Silence detected - auto-sending message');
            // Stop listening and auto-send
            if (recognitionRef.current) {
              recognitionRef.current._stopRequested = true;
              recognitionRef.current.stop();
            }
            if (onAutoSendRef.current) {
              onAutoSendRef.current();
              onAutoSendRef.current = null;
            }
          } catch (error) {
            console.error('Auto-send error:', error);
          }
        }, silenceTimeout);
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      
      // Clear any pending timers
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      
      // Don't show error for 'aborted' - this is normal when stopping manually
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        toast({
          title: "Speech Recognition Error",
          description: `Error: ${event.error}. Please try again.`,
          variant: "destructive"
        });
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      setIsListening(false);
      
      // If we haven't manually stopped and we're in auto-send mode with spoken text,
      // trigger auto-send immediately
      if (!recognition._stopRequested && autoSend && onAutoSendRef.current && hasSpokenText) {
        console.log('Speech ended naturally - triggering auto-send');
        setTimeout(() => {
          if (onAutoSendRef.current) {
            onAutoSendRef.current();
            onAutoSendRef.current = null;
          }
        }, 100);
      }
      
      // Clear any pending silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      
      // Reset auto-send callback on end if not already cleared
      if (!recognition._stopRequested) {
        onAutoSendRef.current = null;
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

  // Wake word detection for hands-free activation
  const startWakeWordListening = useCallback((onWakeWordDetected: () => void) => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: "Not Supported",
        description: "Speech recognition is not supported in this browser",
        variant: "destructive"
      });
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const wakeWordRecognition = new SpeechRecognition();
    
    wakeWordRecognition.continuous = true;
    wakeWordRecognition.interimResults = false;
    wakeWordRecognition.lang = 'en-US';
    wakeWordRecognition.maxAlternatives = 1;
    
    // Store wake word callback
    onWakeWordDetectedRef.current = onWakeWordDetected;

    wakeWordRecognition.onstart = () => {
      setIsWakeWordListening(true);
      console.log('Wake word detection started - say "Bertha" to activate');
    };

    wakeWordRecognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const transcript = result[0].transcript.toLowerCase().trim();
          console.log('Wake word detection heard:', transcript);
          
          // Check if "bertha" is mentioned in the transcript
          if (transcript.includes('bertha')) {
            console.log('Wake word "Bertha" detected!');
            // Stop wake word listening temporarily
            wakeWordRecognition.stop();
            
            // Trigger wake word callback
            if (onWakeWordDetectedRef.current) {
              onWakeWordDetectedRef.current();
            }
            
            // Restart wake word listening after a short delay
            setTimeout(() => {
              if (wakeWordRecognitionRef.current && !wakeWordRecognition._stopped) {
                try {
                  wakeWordRecognition.start();
                } catch (error) {
                  console.log('Wake word recognition restart handled');
                }
              }
            }, 3000); // Wait 3 seconds before resuming wake word detection
            
            return;
          }
        }
      }
    };

    wakeWordRecognition.onerror = (event: any) => {
      // Ignore common errors and restart
      if (event.error !== 'aborted' && event.error !== 'no-speech' && event.error !== 'audio-capture') {
        console.log('Wake word recognition error:', event.error);
      }
      
      // Auto-restart wake word detection after brief delay
      if (!wakeWordRecognition._stopped) {
        setTimeout(() => {
          try {
            if (wakeWordRecognitionRef.current) {
              wakeWordRecognition.start();
            }
          } catch (error) {
            console.log('Wake word recognition restart handled');
          }
        }, 1000);
      }
    };

    wakeWordRecognition.onend = () => {
      // Auto-restart unless explicitly stopped
      if (!wakeWordRecognition._stopped) {
        setTimeout(() => {
          try {
            if (wakeWordRecognitionRef.current) {
              wakeWordRecognition.start();
            }
          } catch (error) {
            console.log('Wake word recognition restart handled');
          }
        }, 100);
      }
    };

    wakeWordRecognitionRef.current = wakeWordRecognition;
    wakeWordRecognition.start();
  }, [toast]);

  const stopWakeWordListening = useCallback(() => {
    if (wakeWordRecognitionRef.current) {
      wakeWordRecognitionRef.current._stopped = true;
      wakeWordRecognitionRef.current.stop();
      setIsWakeWordListening(false);
      console.log('Wake word detection stopped');
    }
    onWakeWordDetectedRef.current = null;
  }, []);

  return {
    isListening,
    isSpeaking,
    isWakeWordListening,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    startWakeWordListening,
    stopWakeWordListening
  };
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
