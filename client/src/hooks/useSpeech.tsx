import { useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { isMobileDevice, isIOS, isAndroid } from "@/lib/mobileDetection";

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
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentSpeechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechRequestIdRef = useRef(0);
  const { toast } = useToast();

  // Initialize Audio Context for mobile devices
  const initializeAudioContext = useCallback(() => {
    if (!audioContextRef.current && (isMobileDevice() || isIOS())) {
      try {
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass();
          console.log('📱 Audio Context initialized for mobile');
          
          // Resume context to ensure it transitions to "running" state
          if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().then(() => {
              console.log('📱 Audio Context resumed and running');
            }).catch((error) => {
              console.warn('Failed to resume Audio Context:', error);
            });
          }
        }
      } catch (error) {
        console.warn('Failed to initialize Audio Context:', error);
      }
    }
  }, []);

  // Play audio with mobile support
  const playAudioWithMobileSupport = useCallback(async (audioUrl: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio; // Track current audio
      
      // Mobile-specific configurations
      if (isMobileDevice()) {
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
      }
      
      audio.onplay = () => {
        console.log('🔊 Audio playing (mobile-compatible)');
      };
      
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        console.log('🔇 Audio completed');
        
        // Add grace period
        (window as any).berthaJustFinishedSpeaking = true;
        console.log('⏸️ Setting 4-second grace period');
        
        setTimeout(() => {
          (window as any).berthaJustFinishedSpeaking = false;
          console.log('✅ Grace period ended');
        }, 4000);
        
        resolve();
      };
      
      audio.onerror = (error) => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        console.error('Audio playback error:', error);
        reject(error);
      };
      
      // Attempt to play
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error('Audio play failed:', error);
          if (error.name === 'NotAllowedError' || error.name === 'NotSupportedError') {
            console.log('📱 Mobile autoplay blocked - will retry on next user interaction');
          }
          currentAudioRef.current = null;
          reject(error);
        });
      }
    });
  }, []);

  // Set wake word pause/resume callbacks
  const setWakeWordCallbacks = useCallback((pauseCallback: () => void, resumeCallback: () => void) => {
    pauseWakeWordRef.current = pauseCallback;
    resumeWakeWordRef.current = resumeCallback;
  }, []);

  // Chat replies use the browser's built-in speech synthesis so the feature
  // works without an API key and remains available on desktop and mobile.
  const speak = useCallback((text: string, rate: number = 1.0) => {
    if (!text.trim()) return;

    // A new reply always replaces anything Bertha is currently saying.
    stopSpeaking();
    speakWithBrowserTTS(text, rate);
  }, [toast]);

  // Browser TTS fallback function
  const speakWithBrowserTTS = useCallback((text: string, rate: number = 1.0) => {
    console.log('🔊 Browser TTS requested. speechSynthesis available:', 'speechSynthesis' in window);
    
    if ('speechSynthesis' in window) {
      const requestId = ++speechRequestIdRef.current;
      window.speechSynthesis.cancel();
      
      const startSpeaking = () => {
        // An iOS delay can outlive a newer reply; do not let stale speech start.
        if (requestId !== speechRequestIdRef.current) return;
        speakBrowserTTSInternal(text, rate, requestId);
      };

      // iOS Safari workaround: small delay before speaking
      if (isIOS()) {
        console.log('🍎 Using iOS Safari delay before speaking');
        setTimeout(startSpeaking, 100);
      } else {
        startSpeaking();
      }
    } else {
      console.error('❌ speechSynthesis API not available in this browser');
      
      // Check if we're in a webview (like Replit mobile app)
      const isWebView = /wv|WebView|Replit/i.test(navigator.userAgent);
      
      toast({
        title: "Voice Not Available",
        description: isWebView 
          ? "For voice support, please open this app in your phone's browser (Chrome, Safari, etc.) instead of the Replit app"
          : "Text-to-speech is not supported in this browser. Try using Chrome or Safari",
        variant: "default",
        duration: 8000
      });
    }
  }, [toast]);

  // Internal browser TTS function
  const speakBrowserTTSInternal = useCallback((
    text: string,
    rate: number = 1.0,
    requestId?: number
  ) => {
    if (!('speechSynthesis' in window)) return;
      
      // Function to actually speak with proper voice selection
      const doSpeak = (voiceList: SpeechSynthesisVoice[]) => {
        if (requestId !== undefined && requestId !== speechRequestIdRef.current) return;
        console.log('Available voices:', voiceList.map(v => `${v.name} (${v.lang})`));
        
        // Prefer clear, friendly female voices, with common system names first.
        const preferredFemaleNames = [
          "google us english female",
          "samantha",
          "microsoft zira",
          "zira",
        ];
        const femaleNamePattern = /\b(linda|susan|anna|karen|sarah|emma|sophie|marie|claire|victoria|female)\b/i;
        const maleNamePattern = /\b(male|man|david|richard|mark|alex|daniel)\b/i;
        const selectedVoice =
          voiceList.find(voice => {
            const name = voice.name.toLowerCase();
            return preferredFemaleNames.some(preferred =>
              name === preferred || name.startsWith(`${preferred} `)
            );
          }) ||
          voiceList.find(voice => femaleNamePattern.test(voice.name)) ||
          voiceList.find(voice =>
            voice.lang.toLowerCase().startsWith('en-us') &&
            !maleNamePattern.test(voice.name)
          ) ||
          voiceList.find(voice =>
            voice.lang.toLowerCase().startsWith('en') &&
            !maleNamePattern.test(voice.name)
          ) ||
          voiceList.find(voice => !maleNamePattern.test(voice.name));
        
        console.log('Selected voice:', selectedVoice ? `${selectedVoice.name} (${selectedVoice.lang})` : 'default');
        
        const utterance = new SpeechSynthesisUtterance(text);
        currentSpeechUtteranceRef.current = utterance; // Track current utterance for interruption
        
        // Set voice if found
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
        
        // Natural conversational delivery: close to the browser default, with
        // a small pitch lift to avoid sounding flat on generic voices.
        utterance.rate = Math.min(1.05, Math.max(0.95, rate));
        utterance.pitch = 1.08;
        utterance.volume = 1;
        
        utterance.onstart = () => {
          setIsSpeaking(true);
          console.log(`🔊 Speaking with voice: ${selectedVoice ? selectedVoice.name : 'default'} - KEEPING wake word detection ACTIVE for interruption`);
          // DO NOT pause wake word detection - allow interruption
        };
        
        utterance.onend = () => {
          if (currentSpeechUtteranceRef.current === utterance) {
            setIsSpeaking(false);
            currentSpeechUtteranceRef.current = null;
          }
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
          if (currentSpeechUtteranceRef.current === utterance) {
            setIsSpeaking(false);
            currentSpeechUtteranceRef.current = null;
          }
          if (event.error !== 'canceled' && event.error !== 'interrupted') {
            console.error('Speech synthesis error:', event.error);
          }
          // No need to resume since we never paused
        };
        
        console.log('Starting speech synthesis...');
        window.speechSynthesis.speak(utterance);
      };
      
      // Voices can load asynchronously, especially on Safari and mobile.
      const voices = window.speechSynthesis.getVoices();
      
      if (voices.length > 0) {
        doSpeak(voices);
      } else {
        let didStart = false;
        const handleVoicesChanged = () => {
          const loadedVoices = window.speechSynthesis.getVoices();
          if (!didStart && loadedVoices.length > 0) {
            didStart = true;
            console.log('Voices loaded:', loadedVoices.length);
            doSpeak(loadedVoices);
          }
        };
        window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
        
        // Fallback after delay
        setTimeout(() => {
          const fallbackVoices = window.speechSynthesis.getVoices();
          if (!didStart) {
            didStart = true;
            // Some mobile browsers do not populate getVoices() until after
            // their first utterance. Speaking without an assigned voice lets
            // the browser choose its own default instead of dropping a reply.
            doSpeak(fallbackVoices);
          }
        }, 300);
      }
  }, []);

  // Initialize speech synthesis with user interaction
  const initializeSpeechSynthesis = useCallback(() => {
    if ('speechSynthesis' in window) {
      // Calling resume/getVoices from a user gesture helps Safari and mobile
      // browsers unlock their speech engine without adding audible output.
      window.speechSynthesis.resume();
      window.speechSynthesis.getVoices();
      (window as any).speechSynthesisInitialized = true;
    }
  }, []);

  // Stop any ongoing speech immediately (enhanced with interruption support)
  const stopSpeaking = useCallback(() => {
    console.log('🛑 Stopping all speech output');
    speechRequestIdRef.current += 1;
    
    // Stop ElevenLabs audio if playing
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    
    // Stop browser TTS if speaking
    if (currentSpeechUtteranceRef.current) {
      window.speechSynthesis.cancel();
      currentSpeechUtteranceRef.current = null;
    }
    
    // Also cancel any ongoing speech synthesis
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    setIsSpeaking(false);
    console.log('✅ All speech stopped');
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
      // Check if agent is currently speaking - if so, interrupt immediately
      if (isSpeaking) {
        console.log('🛑 User speaking detected while agent is talking - interrupting agent');
        stopSpeaking();
      }
      
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
    initializeSpeechSynthesis,
    initializeAudioContext
  };
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
