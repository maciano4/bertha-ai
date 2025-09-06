import { useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export function useWakeWordSpeech() {
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const onMessageDetectedRef = useRef<((message: string) => void) | null>(null);
  const { toast } = useToast();

  const startWakeWordListening = useCallback((onMessageDetected: (message: string) => void) => {
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
    
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    
    onMessageDetectedRef.current = onMessageDetected;

    recognition.onstart = () => {
      setIsWakeWordListening(true);
      console.log('Wake word detection started - say "Bertha [your message]"');
    };

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const transcript = result[0].transcript.toLowerCase().trim();
          console.log('Wake word detection heard:', transcript);
          
          // Check if "bertha" is at the beginning of the transcript
          if (transcript.startsWith('bertha')) {
            console.log('Wake word "Bertha" detected at start!');
            
            // Extract the message that comes after "bertha"
            const message = transcript.substring(6).trim(); // 6 = length of 'bertha'
            
            if (message && message.length > 1) {
              console.log('Extracted message after Bertha:', message);
              
              // Show confirmation
              toast({
                title: "Message Received!",
                description: `📤 "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}"`,
                duration: 2000
              });
              
              // Send the message
              if (onMessageDetectedRef.current) {
                onMessageDetectedRef.current(message);
              }
            } else {
              console.log('No message found after Bertha');
              toast({
                title: "Try Again",
                description: "Say 'Bertha' followed by your message",
                duration: 2000
              });
            }
          } else if (transcript.includes('bertha')) {
            // If "bertha" is mentioned but not at the start
            const berthaIndex = transcript.indexOf('bertha');
            const beforeBertha = transcript.substring(0, berthaIndex).trim();
            const afterBertha = transcript.substring(berthaIndex + 6).trim();
            
            if (afterBertha && afterBertha.length > 1) {
              console.log('Found Bertha in middle, message:', afterBertha);
              
              toast({
                title: "Message Received!",
                description: `📤 "${afterBertha.slice(0, 50)}${afterBertha.length > 50 ? '...' : ''}"`,
                duration: 2000
              });
              
              if (onMessageDetectedRef.current) {
                onMessageDetectedRef.current(afterBertha);
              }
            }
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      // Ignore common errors and restart
      if (event.error !== 'aborted' && event.error !== 'no-speech' && event.error !== 'audio-capture') {
        console.log('Wake word recognition error:', event.error);
      }
      
      // Auto-restart wake word detection after brief delay
      if (!recognition._stopped) {
        setTimeout(() => {
          try {
            if (recognitionRef.current) {
              recognition.start();
            }
          } catch (error) {
            console.log('Wake word recognition restart handled');
          }
        }, 1000);
      }
    };

    recognition.onend = () => {
      // Auto-restart unless explicitly stopped
      if (!recognition._stopped) {
        setTimeout(() => {
          try {
            if (recognitionRef.current) {
              recognition.start();
            }
          } catch (error) {
            console.log('Wake word recognition restart handled');
          }
        }, 100);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [toast]);

  const stopWakeWordListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current._stopped = true;
      recognitionRef.current.stop();
      setIsWakeWordListening(false);
      console.log('Wake word detection stopped');
    }
    onMessageDetectedRef.current = null;
  }, []);

  return {
    isWakeWordListening,
    startWakeWordListening,
    stopWakeWordListening
  };
}