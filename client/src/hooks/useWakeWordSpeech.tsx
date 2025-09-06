import { useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export function useWakeWordSpeech() {
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const onMessageDetectedRef = useRef<((message: string) => void) | null>(null);
  const conversationModeRef = useRef<boolean>(false);
  const conversationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
          
          // Check if "bertha" is mentioned OR we're in conversation mode
          // Only process transcripts with meaningful content (more than 2 characters)
          if (transcript.length > 2 && (transcript.includes('bertha') || conversationModeRef.current)) {
            let messageToSend = '';
            let isNewConversation = transcript.includes('bertha');
            
            if (isNewConversation) {
              console.log('Wake word "Bertha" detected!');
              
              // Find the index of "bertha" in the transcript
              const berthaIndex = transcript.indexOf('bertha');
              const afterBertha = transcript.substring(berthaIndex + 6).trim(); // 6 = length of 'bertha'
              
              if (afterBertha && afterBertha.length > 1) {
                console.log('Extracted message after Bertha:', afterBertha);
                messageToSend = afterBertha;
              } else {
                // If no message after bertha, use the whole transcript except "bertha"
                const cleanTranscript = transcript.replace(/bertha/g, '').trim();
                if (cleanTranscript && cleanTranscript.length > 1) {
                  console.log('Using full transcript without Bertha word:', cleanTranscript);
                  messageToSend = cleanTranscript;
                } else {
                  // If just "bertha" was said, send a greeting
                  console.log('Just wake word detected, sending greeting');
                  messageToSend = "hello";
                }
              }
              
              // Enable conversation mode immediately for smoother experience
              conversationModeRef.current = true;
              console.log('Conversation mode activated - you can now ask follow-up questions');
              
              // Show notification that follow-up mode is ready
              toast({
                title: "Listening to Bertha...",
                description: "Conversation started - you can ask follow-ups",
                duration: 2000
              });
              
              // Set 2-minute timeout for conversation mode
              if (conversationTimeoutRef.current) {
                clearTimeout(conversationTimeoutRef.current);
              }
              conversationTimeoutRef.current = setTimeout(() => {
                conversationModeRef.current = false;
                console.log('Conversation mode ended - say Bertha to reactivate');
                toast({
                  title: "Conversation Paused",
                  description: "Say 'Bertha' to start chatting again",
                  duration: 3000
                });
              }, 120000); // 2 minutes instead of 90 seconds
              
            } else {
              // We're in conversation mode - accept any message
              console.log('Conversation mode - processing follow-up:', transcript);
              messageToSend = transcript.trim();
              
              // Extend conversation mode
              if (conversationTimeoutRef.current) {
                clearTimeout(conversationTimeoutRef.current);
              }
              conversationTimeoutRef.current = setTimeout(() => {
                conversationModeRef.current = false;
                console.log('Conversation mode ended - say Bertha to reactivate');
              }, 120000); // 2 minutes for follow-ups too
            }
            
            if (messageToSend && messageToSend.length > 1) {
              // Show confirmation
              toast({
                title: isNewConversation ? "Wake Word Detected!" : "Follow-up Message!",
                description: `📤 "${messageToSend.slice(0, 50)}${messageToSend.length > 50 ? '...' : ''}"`,
                duration: 2000
              });
              
              // Send the message
              if (onMessageDetectedRef.current) {
                onMessageDetectedRef.current(messageToSend);
              }
            } else if (isNewConversation) {
              console.log('No meaningful message found');
              toast({
                title: "Try Again",
                description: "Say 'Bertha' followed by your message",
                duration: 2000
              });
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
    
    // Clear conversation mode
    conversationModeRef.current = false;
    if (conversationTimeoutRef.current) {
      clearTimeout(conversationTimeoutRef.current);
      conversationTimeoutRef.current = null;
    }
    
    onMessageDetectedRef.current = null;
  }, []);

  return {
    isWakeWordListening,
    startWakeWordListening,
    stopWakeWordListening
  };
}