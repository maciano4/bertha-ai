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
  const pauseWakeWordRef = useRef<(() => void) | null>(null);
  const resumeWakeWordRef = useRef<(() => void) | null>(null);
  const { toast } = useToast();

  // Set wake word pause/resume callbacks
  const setWakeWordCallbacks = useCallback((pauseCallback: () => void, resumeCallback: () => void) => {
    pauseWakeWordRef.current = pauseCallback;
    resumeWakeWordRef.current = resumeCallback;
  }, []);

  // Text-to-Speech with ElevenLabs or fallback to browser TTS
  const speak = useCallback(async (text: string, rate: number = 0.8) => {
    // Check if ElevenLabs voice is selected
    const elevenLabsVoiceId = localStorage.getItem("bertha_voice_id");
    
    if (elevenLabsVoiceId) {
      // Use ElevenLabs TTS
      try {
        setIsSpeaking(true);
        console.log(`🔊 Speaking with ElevenLabs voice: ${elevenLabsVoiceId}`);
        
        const response = await fetch("/api/elevenlabs/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voiceId: elevenLabsVoiceId,
            stability: 0.5,
            similarityBoost: 0.75,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate speech");
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        audio.onplay = () => {
          console.log('🔊 ElevenLabs audio playing - KEEPING wake word detection ACTIVE for interruption');
        };
        
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          console.log('🔇 ElevenLabs speech completed');
          
          // Add grace period to ignore speech recognition
          (window as any).berthaJustFinishedSpeaking = true;
          console.log('⏸️ Setting 4-second grace period to ignore audio feedback');
          
          setTimeout(() => {
            (window as any).berthaJustFinishedSpeaking = false;
            console.log('✅ Grace period ended - wake word detection fully active');
          }, 4000);
        };
        
        audio.onerror = (error) => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          console.error('ElevenLabs audio playback error:', error);
          
          // Fallback to browser TTS
          console.log('Falling back to browser TTS');
          speakWithBrowserTTS(text, rate);
        };
        
        await audio.play();
        return;
      } catch (error) {
        console.error('Error using ElevenLabs TTS:', error);
        setIsSpeaking(false);
        
        // Fallback to browser TTS
        console.log('Falling back to browser TTS');
        speakWithBrowserTTS(text, rate);
        return;
      }
    }
    
    // Use browser TTS if no ElevenLabs voice selected
    speakWithBrowserTTS(text, rate);
  }, [toast]);

  // Browser TTS fallback function
  const speakWithBrowserTTS = useCallback((text: string, rate: number = 0.8) => {
    if ('speechSynthesis' in window) {
      // Check if speech synthesis has been initialized with user interaction
      if (!(window as any).speechSynthesisInitialized) {
        console.log('⚠️ Speech synthesis not initialized - requiring user interaction first');
        return;
      }
      
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      // Function to actually speak with proper voice selection
      const doSpeak = (voiceList: SpeechSynthesisVoice[]) => {
        console.log('Available voices:', voiceList.map(v => `${v.name} (${v.lang})`));
        
        // Find the best female voice for a Cameroon grandmother
        let selectedVoice = 
          // First: British/UK female voices 
          voiceList.find(voice => 
            voice.lang.includes('en-GB') && 
            voice.name.toLowerCase().includes('female')
          ) ||
          // Second: Any female voice by name pattern
          voiceList.find(voice => 
            voice.name.toLowerCase().includes('female') &&
            !voice.name.toLowerCase().includes('male')
          ) ||
          // Third: Voices with common female names
          voiceList.find(voice => 
            /\b(linda|zira|susan|anna|karen|sarah|emma|sophie|marie|claire|samantha|victoria)\b/i.test(voice.name)
          ) ||
          // Fourth: French voices for bilingual background
          voiceList.find(voice => 
            voice.lang.startsWith('fr')
          ) ||
          // Last: Avoid male voices explicitly
          voiceList.find(voice => 
            !voice.name.toLowerCase().includes('male') && 
            !voice.name.toLowerCase().includes('man') &&
            !voice.name.toLowerCase().includes('david') &&
            !voice.name.toLowerCase().includes('richard') &&
            !voice.name.toLowerCase().includes('mark') &&
            voice.lang.startsWith('en')
          );
        
        console.log('Selected voice:', selectedVoice ? `${selectedVoice.name} (${selectedVoice.lang})` : 'default');
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Set voice if found
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
        
        // Grandmother voice characteristics
        utterance.rate = 0.75; // Slow, deliberate speech
        utterance.pitch = selectedVoice?.name.toLowerCase().includes('female') ? 1.0 : 1.1; // Female-like pitch
        utterance.volume = 0.95;
        
        utterance.onstart = () => {
          setIsSpeaking(true);
          console.log(`🔊 Speaking with voice: ${selectedVoice ? selectedVoice.name : 'default'} - KEEPING wake word detection ACTIVE for interruption`);
          // DO NOT pause wake word detection - allow interruption
        };
        
        utterance.onend = () => {
          setIsSpeaking(false);
          console.log('🔇 Speech synthesis completed naturally');
          
          // Add grace period to ignore speech recognition for 2 seconds after speech ends
          (window as any).berthaJustFinishedSpeaking = true;
          console.log('⏸️ Setting 2-second grace period to ignore audio feedback');
          
          setTimeout(() => {
            (window as any).berthaJustFinishedSpeaking = false;
            console.log('✅ Grace period ended - wake word detection fully active');
          }, 4000); // 4-second grace period to prevent all feedback
          
          // No need to resume since we never paused
        };
        
        utterance.onerror = (event) => {
          setIsSpeaking(false);
          console.error('Speech synthesis error:', event.error);
          // No need to resume since we never paused
        };
        
        console.log('Starting speech synthesis...');
        window.speechSynthesis.speak(utterance);
      };
      
      // Get voices and handle loading
      const voices = window.speechSynthesis.getVoices();
      
      if (voices.length > 0) {
        doSpeak(voices);
      } else {
        // Wait for voices to load
        window.speechSynthesis.onvoiceschanged = () => {
          const loadedVoices = window.speechSynthesis.getVoices();
          if (loadedVoices.length > 0) {
            console.log('Voices loaded:', loadedVoices.length);
            doSpeak(loadedVoices);
          }
        };
        
        // Fallback after delay
        setTimeout(() => {
          const fallbackVoices = window.speechSynthesis.getVoices();
          if (fallbackVoices.length > 0) {
            doSpeak(fallbackVoices);
          }
        }, 300);
      }
    } else {
      toast({
        title: "Not Supported",
        description: "Text-to-speech is not supported in this browser",
        variant: "destructive"
      });
    }
  }, [toast]);

  // Initialize speech synthesis with user interaction
  const initializeSpeechSynthesis = useCallback(() => {
    if ('speechSynthesis' in window && !(window as any).speechSynthesisInitialized) {
      console.log('🎤 Initializing speech synthesis with user interaction...');
      
      // Create a silent utterance to initialize the speech synthesis
      const utterance = new SpeechSynthesisUtterance('');
      utterance.volume = 0;
      utterance.rate = 0.1;
      utterance.pitch = 0.1;
      
      utterance.onstart = () => {
        (window as any).speechSynthesisInitialized = true;
        console.log('✅ Speech synthesis initialized successfully!');
        window.speechSynthesis.cancel(); // Cancel the silent utterance
      };
      
      utterance.onerror = (event) => {
        console.log('⚠️ Speech synthesis initialization error:', event.error);
        // Mark as initialized anyway to avoid repeated attempts
        (window as any).speechSynthesisInitialized = true;
      };
      
      window.speechSynthesis.speak(utterance);
    }
  }, []);

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
    stopWakeWordListening,
    setWakeWordCallbacks,
    initializeSpeechSynthesis
  };
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
