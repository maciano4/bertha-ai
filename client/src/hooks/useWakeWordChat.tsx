import { useCallback, useRef } from "react";
import { useSpeech } from "@/hooks/useSpeech";
import { useToast } from "@/hooks/use-toast";

export function useWakeWordChat() {
  const { startListening, stopListening, isListening } = useSpeech();
  const { toast } = useToast();
  const currentMessageRef = useRef<string>("");

  const startWakeWordChat = useCallback((
    onSendMessage: (message: string) => void, 
    language: string = 'en-US'
  ) => {
    // Clear any previous message
    currentMessageRef.current = "";
    
    console.log('Starting wake word activated chat...');
    
    // Show user feedback
    toast({
      title: "Wake Word Detected!",
      description: "🎤 Listening for your message...",
      duration: 2000
    });
    
    // Auto-send callback for when speech recognition detects silence
    const handleAutoSend = () => {
      const messageToSend = currentMessageRef.current.trim();
      console.log('Wake word auto-send triggered with message:', messageToSend);
      
      if (messageToSend) {
        onSendMessage(messageToSend);
        currentMessageRef.current = ""; // Clear after sending
        
        toast({
          title: "Message Sent",
          description: `📤 "${messageToSend.slice(0, 30)}${messageToSend.length > 30 ? '...' : ''}"`,
          duration: 1500
        });
      } else {
        toast({
          title: "No Message Detected",
          description: "I didn't hear anything after 'Bertha'. Try again!",
          variant: "destructive",
          duration: 2000
        });
      }
    };

    // Start listening for the actual message after wake word
    startListening(
      (transcript) => {
        const cleanTranscript = transcript.trim();
        if (cleanTranscript) {
          // Accumulate the message
          currentMessageRef.current = currentMessageRef.current + (currentMessageRef.current ? ' ' : '') + cleanTranscript;
          console.log('Wake word chat accumulated message:', currentMessageRef.current);
        }
      },
      language,
      true, // Enable auto-send
      handleAutoSend, // Auto-send callback
      1000 // 1 second silence timeout
    );
  }, [startListening, toast]);

  return {
    startWakeWordChat,
    isListening
  };
}