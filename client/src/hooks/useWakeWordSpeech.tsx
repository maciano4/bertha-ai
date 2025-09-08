import { useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export function useWakeWordSpeech() {
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const onMessageDetectedRef = useRef<((message: string) => void) | null>(null);
  const conversationModeRef = useRef<boolean>(false);
  const conversationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPausedRef = useRef<boolean>(false); // Track if wake word detection is temporarily paused
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
          const isBerthaSpeaking = window.speechSynthesis && window.speechSynthesis.speaking;
          
          console.log('Wake word detection heard:', transcript);
          console.log('🎤 DETECTION STATE:', {
            transcript: transcript.slice(0, 40),
            isBerthaSpeaking: isBerthaSpeaking,
            conversationMode: conversationModeRef.current,
            isPaused: isPausedRef.current,
            hasBertha: transcript.includes('bertha')
          });
          
          // Check if "bertha" is mentioned OR we're in conversation mode
          // Only process transcripts with meaningful content (more than 2 characters)
          const hasBerthaWakeWord = transcript.includes('bertha');
          const isInConversationMode = conversationModeRef.current;
          
          console.log(`Processing transcript: "${transcript}"`);
          console.log(`Has Bertha wake word: ${hasBerthaWakeWord}`);
          console.log(`Is in conversation mode: ${isInConversationMode}`);
          console.log(`Is paused: ${isPausedRef.current}`);
          
          // Skip processing if wake word detection is paused (e.g., during speech synthesis)
          if (isPausedRef.current) {
            console.log('⏸️ Wake word detection paused - ignoring transcript');
            return;
          }
          
          if (transcript.length > 2 && (hasBerthaWakeWord || isInConversationMode)) {
            let messageToSend = '';
            let isNewConversation = hasBerthaWakeWord;
            
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
              console.log('🗣️ CONVERSATION MODE - Processing follow-up:', transcript);
              messageToSend = transcript.trim();
              
              // Reset conversation timeout
              if (conversationTimeoutRef.current) {
                clearTimeout(conversationTimeoutRef.current);
              }
              conversationTimeoutRef.current = setTimeout(() => {
                conversationModeRef.current = false;
                console.log('❌ Conversation mode ended - say Bertha to reactivate');
                toast({
                  title: "Conversation Paused",
                  description: "Say 'Bertha' to start chatting again",
                  duration: 3000
                });
              }, 120000); // 2 minutes for follow-ups too
            }
            
            if (messageToSend && messageToSend.length > 1) {
              // Check for grace period after speech synthesis ends to ignore audio echoes
              if ((window as any).berthaJustFinishedSpeaking) {
                console.log('⏸️ Grace period active - ignoring potential audio echo:', transcript.slice(0, 50));
                return;
              }
              
              // Check if we're currently speaking to prevent audio feedback loops BEFORE sending message
              if (window.speechSynthesis && window.speechSynthesis.speaking) {
                // Allow ANY speech to interrupt Bertha (natural conversation flow)
                const transcriptLower = transcript.toLowerCase();
                
                console.log('🔍 INTERRUPTION CHECK:', {
                  transcript: transcript.slice(0, 60),
                  transcriptLower: transcriptLower.slice(0, 60),
                  messageLength: messageToSend.length,
                  isSpeaking: window.speechSynthesis.speaking
                });
                
                // Only interrupt if there's meaningful speech (more than 2 characters)
                if (messageToSend.length > 2) {
                  console.log(`🛑 INTERRUPTING Bertha speech - user spoke:`, transcriptLower.slice(0, 50));
                  window.speechSynthesis.cancel();
                } else {
                  console.log('⏸️ Ignoring very short speech during synthesis:', transcript.slice(0, 20));
                  return; // Ignore very short/unclear speech
                }
              }
              
              console.log(`📤 SENDING MESSAGE: "${messageToSend}" (New conversation: ${isNewConversation})`);
              
              // Show confirmation
              toast({
                title: isNewConversation ? "Wake Word Detected!" : "Follow-up Message!",
                description: `📤 "${messageToSend.slice(0, 50)}${messageToSend.length > 50 ? '...' : ''}"`,
                duration: 2000
              });
              
              // Send the message
              if (onMessageDetectedRef.current) {
                console.log('✅ Calling onMessageDetected with:', messageToSend);
                onMessageDetectedRef.current(messageToSend);
              } else {
                console.error('❌ onMessageDetectedRef.current is null!');
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
      
      // Auto-restart wake word detection after brief delay (preserve conversation mode)
      if (!recognition._stopped) {
        setTimeout(() => {
          try {
            if (recognitionRef.current) {
              console.log(`🔄 Restarting speech recognition (Conversation mode: ${conversationModeRef.current})`);
              recognition.start();
            }
          } catch (error) {
            console.log('Wake word recognition restart handled');
          }
        }, 1000);
      }
    };

    recognition.onend = () => {
      // Don't auto-restart if manually paused for speech synthesis
      if (recognition._manuallyPaused) {
        console.log('🚫 Recognition manually paused - NOT auto-restarting');
        return;
      }
      
      // Auto-restart unless explicitly stopped (preserve conversation mode)
      if (!recognition._stopped) {
        setTimeout(() => {
          try {
            if (recognitionRef.current) {
              console.log(`🔄 Auto-restarting speech recognition (Conversation mode: ${conversationModeRef.current})`);
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

  const stopWakeWordListening = useCallback((clearConversation: boolean = true) => {
    if (recognitionRef.current) {
      recognitionRef.current._stopped = true;
      recognitionRef.current.stop();
      setIsWakeWordListening(false);
      console.log('Wake word detection stopped');
    }
    
    // Only clear conversation mode when explicitly requested
    if (clearConversation) {
      console.log('🛑 Explicitly stopping wake word - clearing conversation mode');
      conversationModeRef.current = false;
      if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
        conversationTimeoutRef.current = null;
      }
    } else {
      console.log('🔄 Stopping wake word but preserving conversation mode');
    }
    
    // Only clear message handler if clearing conversation
    if (clearConversation) {
      onMessageDetectedRef.current = null;
    }
  }, []);

  const clearConversationMode = useCallback(() => {
    console.log('🗑️ Manually clearing conversation mode');
    conversationModeRef.current = false;
    if (conversationTimeoutRef.current) {
      clearTimeout(conversationTimeoutRef.current);
      conversationTimeoutRef.current = null;
    }
  }, []);

  const pauseWakeWordDetection = useCallback(() => {
    console.log('🛑 STOPPING wake word detection completely');
    isPausedRef.current = true;
    
    // Completely stop recognition and prevent auto-restart
    if (recognitionRef.current) {
      try {
        recognitionRef.current._manuallyPaused = true; // Flag to prevent auto-restart
        recognitionRef.current._stopRequested = true;
        recognitionRef.current.stop();
        console.log('🔇 Speech recognition STOPPED during Bertha speech');
      } catch (error) {
        console.log('Recognition stop handled');
      }
    }
  }, []);

  const resumeWakeWordDetection = useCallback(() => {
    console.log('⏱️ Starting 3-second cooldown before resuming wake word detection');
    
    // Longer cooldown to ensure all speech synthesis audio is completely finished
    setTimeout(() => {
      isPausedRef.current = false;
      
      // Restart speech recognition completely
      if (recognitionRef.current) {
        try {
          recognitionRef.current._manuallyPaused = false; // Clear the manual pause flag
          recognitionRef.current._stopRequested = false;
          recognitionRef.current.start();
          console.log('🎤 Wake word detection RESTARTED after cooldown');
        } catch (error) {
          console.log('Recognition restart handled');
        }
      }
    }, 3000); // 3 second cooldown
  }, []);

  return {
    isWakeWordListening,
    startWakeWordListening,
    stopWakeWordListening,
    clearConversationMode,
    pauseWakeWordDetection,
    resumeWakeWordDetection
  };
}