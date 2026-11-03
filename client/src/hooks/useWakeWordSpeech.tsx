import { useState, useRef, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export type WakeWordStatus = "off" | "starting" | "listening" | "blocked" | "unsupported" | "error";

// Names the browser commonly produces when someone says "Bertha".
const WAKE_NAMES = "bertha's|berthas|bertha|berta|birtha|burtha|bertah|berthe";
// Looser mis-hearings, only accepted right after a greeting ("hey Martha").
const LOOSE_NAMES = "martha|vertha|bertie|berth|bert";
const GREETING = "hi|hey|hello|hiya|ok|okay|yo|good morning|good afternoon|good evening";
const STRONG_WAKE = new RegExp(`(?:^|\\b)(?:(?:${GREETING})[\\s,.!]*)?(?:${WAKE_NAMES})\\b`, "i");
const LOOSE_WAKE = new RegExp(`(?:^|\\b)(?:${GREETING})[\\s,.!]*(?:${LOOSE_NAMES})\\b`, "i");
const FILLER_ONLY = /^(?:um+|uh+|hmm+|oh|ah|please|so|and|ok|okay|hi|hey|hello|yes|yeah)?$/i;

const tidy = (text: string) =>
  text.replace(/^[\s,.!?;:'’\-–—]+/, "").replace(/[\s,;:\-–—]+$/, "").trim();

/**
 * Finds the wake word in a transcript and returns whatever was asked with it.
 * "Hi Bertha" -> { matched: true, command: "" } (wake word only)
 * "Hey Berta, what time is it?" -> { matched: true, command: "what time is it?" }
 * "What's the weather, Bertha" -> { matched: true, command: "What's the weather" }
 */
export function extractWakeCommand(transcript: string): { matched: boolean; command: string } {
  const text = transcript.trim();
  const match = STRONG_WAKE.exec(text) || LOOSE_WAKE.exec(text);
  if (!match) return { matched: false, command: "" };

  let command = tidy(text.slice(match.index + match[0].length));
  if (!command) command = tidy(text.slice(0, match.index));
  if (FILLER_ONLY.test(command.replace(/[.!?]+$/, ""))) command = "";
  return { matched: true, command };
}

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);

// True when the microphone most likely picked up Bertha's own voice.
function isLikelyEcho(transcript: string): boolean {
  const spoken: string | undefined = (window as any).lastBerthaSpokenMessage;
  const recentlySpoke = (window.speechSynthesis && window.speechSynthesis.speaking) || (window as any).berthaJustFinishedSpeaking;
  if (!spoken || !recentlySpoke) return false;
  const heard = words(transcript);
  if (heard.length === 0) return true;
  const saidWords = words(spoken);
  // Near-verbatim piece of what she just said, or a long phrase made almost entirely of her words.
  if (` ${saidWords.join(" ")} `.includes(` ${heard.join(" ")} `)) return true;
  const said = new Set(saidWords);
  const overlap = heard.filter(word => said.has(word)).length;
  return heard.length >= 5 && overlap / heard.length >= 0.8;
}

const STOP_WORDS = /^(?:stop|pause|be quiet|quiet|shush|stop please|pause please|that's enough)[.!]?$/i;
// Ends conversation mode ("goodbye", "that's all", "stop listening").
const GOODBYE_WORDS = /^(?:(?:ok(?:ay)?|alright|thanks?|thank you|well)[\s,.!]*)*(?:good ?bye|bye(?:[\s-]bye)?|that'?s all(?: for now| thanks| thank you)?|that is all|stop listening|(?:we'?re|i'?m|i am|we are) done|end (?:the )?conversation|talk to you later|see you later|good night)(?:[\s,.!]*(?:thanks?|thank you|bertha))*[\s.!]*$/i;
const CONVERSATION_SILENCE_MS = 45000; // Back to "Hi Bertha" after this much quiet.
const UTTERANCE_JOIN_MS = 900; // Wait for the rest of a sentence the speech service split in two.
const REPEAT_WORDS = /^(?:repeat|repeat that|say that again|what did you say)[.!?]?$/i;

export function useWakeWordSpeech() {
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  const [status, setStatus] = useState<WakeWordStatus>("off");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [heardText, setHeardText] = useState<string>("");
  const [isConversationActive, setIsConversationActive] = useState(false);
  const recognitionRef = useRef<any>(null);
  const onMessageDetectedRef = useRef<((message: string) => void) | null>(null);
  const onWakeOnlyRef = useRef<(() => void) | null>(null);
  const onGoodbyeRef = useRef<(() => void) | null>(null);
  const lastActivityRef = useRef(0);
  const pendingTextRef = useRef("");
  const pendingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const conversationModeRef = useRef<boolean>(false);
  const conversationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heardTimerRef = useRef<NodeJS.Timeout | null>(null);
  const failuresRef = useRef(0);
  const isPausedRef = useRef<boolean>(false);
  const wantedRef = useRef<boolean>(false); // true while wake word is switched on
  const { toast } = useToast();

  const inIframe = typeof window !== "undefined" && window.self !== window.top;

  const showHeard = useCallback((text: string) => {
    setHeardText(text);
    if (heardTimerRef.current) clearTimeout(heardTimerRef.current);
    heardTimerRef.current = setTimeout(() => setHeardText(""), 6000);
  }, []);

  const setConversationMode = useCallback((active: boolean) => {
    conversationModeRef.current = active;
    setIsConversationActive(active);
    if (conversationTimeoutRef.current) {
      clearInterval(conversationTimeoutRef.current);
      conversationTimeoutRef.current = null;
    }
    if (active) {
      // Follow-ups need no wake word until 45 seconds of quiet. The clock restarts on every thing
      // she hears and stays frozen while Bertha is talking, so a long answer never uses it up.
      lastActivityRef.current = Date.now();
      conversationTimeoutRef.current = setInterval(() => {
        if (window.speechSynthesis?.speaking) lastActivityRef.current = Date.now();
        if (Date.now() - lastActivityRef.current < CONVERSATION_SILENCE_MS) return;
        conversationModeRef.current = false;
        setIsConversationActive(false);
        if (conversationTimeoutRef.current) clearInterval(conversationTimeoutRef.current);
        conversationTimeoutRef.current = null;
      }, 1000);
    }
  }, []);

  // Joins the pieces of one sentence (Chrome often splits a spoken sentence at a pause) before sending.
  const deliverCommand = useCallback((text: string) => {
    pendingTextRef.current = `${pendingTextRef.current} ${text}`.trim();
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      const full = pendingTextRef.current;
      pendingTextRef.current = "";
      if (full) onMessageDetectedRef.current?.(full);
    }, UTTERANCE_JOIN_MS);
  }, []);

  const blockedMessage = useCallback(() => inIframe
    ? "The microphone is blocked inside the Replit preview window. Open Bertha in her own Chrome tab, then allow the microphone."
    : "Microphone access is blocked. Click the lock/tune icon in Chrome's address bar, set Microphone to Allow, then click \"Enable microphone\".", [inIframe]);

  const handleTranscript = useCallback((rawTranscript: string) => {
    const transcript = rawTranscript.trim();
    if (!transcript || isPausedRef.current) return;
    const { matched, command } = extractWakeCommand(transcript);
    const berthaSpeaking = !!(window.speechSynthesis && window.speechSynthesis.speaking);
    console.log("🎤 Wake word heard:", transcript, { matched, command, conversation: conversationModeRef.current, berthaSpeaking });

    // Ignore Bertha hearing herself through the speakers (this includes her saying her own name).
    if (isLikelyEcho(transcript)) {
      console.log("🔇 Ignoring echo of Bertha's own voice");
      return;
    }

    if (STOP_WORDS.test(transcript)) {
      if (berthaSpeaking) window.speechSynthesis.cancel();
      showHeard(transcript);
      return;
    }

    // "Goodbye" / "that's all" / "stop listening" ends the conversation and goes back to waiting for "Hi Bertha".
    if ((conversationModeRef.current || matched) && (GOODBYE_WORDS.test(transcript) || (matched && GOODBYE_WORDS.test(command)))) {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
      pendingTextRef.current = "";
      if (berthaSpeaking) window.speechSynthesis.cancel();
      showHeard(transcript);
      setConversationMode(false);
      onGoodbyeRef.current?.();
      return;
    }

    if (berthaSpeaking) {
      // While she is talking, only her name interrupts her.
      if (!matched) return;
      window.speechSynthesis.cancel();
    }

    if (matched) {
      showHeard(transcript);
      setConversationMode(true);
      if (command) {
        deliverCommand(command);
      } else {
        // Just "Hi Bertha": acknowledge and send the next thing he says.
        onWakeOnlyRef.current?.();
      }
      return;
    }

    if (!conversationModeRef.current) return; // Not addressed to Bertha.

    showHeard(transcript);
    if (REPEAT_WORDS.test(transcript)) {
      const last = (window as any).lastBerthaSpokenMessage;
      if (last) window.dispatchEvent(new CustomEvent("berthaRepeat", { detail: last }));
      return;
    }
    setConversationMode(true); // Reset the follow-up timer.
    deliverCommand(transcript);
  }, [deliverCommand, setConversationMode, showHeard]);

  const scheduleRestart = useCallback((delay: number) => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (!wantedRef.current || isPausedRef.current) return;
      const recognition = recognitionRef.current;
      if (!recognition) return;
      try {
        recognition.start();
      } catch {
        // Already running; nothing to do.
      }
    }, delay);
  }, []);

  const createRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true; // Lets us show "heard you" while he talks.
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (recognitionRef.current !== recognition) return;
      setIsWakeWordListening(true);
      setStatus("listening");
      setStatusMessage("");
    };

    recognition.onresult = (event: any) => {
      if (recognitionRef.current !== recognition) return;
      failuresRef.current = 0;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript || "";
        if (result.isFinal) handleTranscript(text);
        else interim += text;
      }
      if (interim.trim() && !isPausedRef.current && !isLikelyEcho(interim)) {
        setHeardText(interim.trim());
        // Stop Bertha as soon as her name is heard, without waiting for the end of the sentence.
        if (window.speechSynthesis?.speaking && extractWakeCommand(interim).matched) window.speechSynthesis.cancel();
      }
    };

    recognition.onerror = (event: any) => {
      if (recognitionRef.current !== recognition) return;
      const error = event.error;
      if (error === "no-speech" || error === "aborted") return; // Normal; onend restarts.
      console.warn("Wake word recognition error:", error);
      failuresRef.current += 1;
      if (error === "not-allowed" || error === "service-not-allowed") {
        recognition._blocked = true;
        setStatus("blocked");
        setStatusMessage(error === "service-not-allowed" && !inIframe
          ? "This browser's speech service is turned off. Use Google Chrome or Microsoft Edge and allow the microphone."
          : blockedMessage());
      } else if (error === "audio-capture") {
        setStatus("error");
        setStatusMessage("No microphone was found. Plug one in or check your sound settings, then click \"Enable microphone\".");
      } else if (error === "network") {
        setStatus("error");
        setStatusMessage("Chrome's speech service can't be reached. Check your internet connection; Bertha will keep retrying.");
      } else {
        setStatus("error");
        setStatusMessage(`Voice recognition error: ${error}. Bertha will keep retrying.`);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      setIsWakeWordListening(false);
      if (!wantedRef.current || isPausedRef.current || recognition._blocked) return;
      // Chrome ends continuous sessions on its own every so often; restart, backing off after errors.
      const delay = failuresRef.current === 0 ? 250 : Math.min(10000, 1000 * failuresRef.current);
      scheduleRestart(delay);
    };

    return recognition;
  }, [blockedMessage, handleTranscript, inIframe, scheduleRestart]);

  const launch = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setStatus("unsupported");
      setStatusMessage("This browser can't listen for \"Hi Bertha\". Please open Bertha in Google Chrome or Microsoft Edge on a computer or Android phone.");
      return;
    }
    const old = recognitionRef.current;
    recognitionRef.current = null;
    if (old) {
      try { old.abort(); } catch { /* ignore */ }
    }
    const recognition = createRecognition();
    recognitionRef.current = recognition;
    failuresRef.current = 0;
    setStatus("starting");
    setStatusMessage("");
    try {
      recognition.start();
    } catch (error) {
      console.warn("Wake word start failed:", error);
      scheduleRestart(1000);
    }
  }, [createRecognition, scheduleRestart]);

  const startWakeWordListening = useCallback((onMessageDetected: (message: string) => void, onWakeOnly?: () => void, onGoodbye?: () => void) => {
    onMessageDetectedRef.current = onMessageDetected;
    onWakeOnlyRef.current = onWakeOnly || null;
    onGoodbyeRef.current = onGoodbye || null;
    wantedRef.current = true;
    isPausedRef.current = false;
    launch();
  }, [launch]);

  // Called from a click: asks for the microphone (shows Chrome's prompt) and restarts listening.
  const enableMicrophone = useCallback(async () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      launch();
      return;
    }
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      } catch (error: any) {
        const name = error?.name || "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setStatus("blocked");
          setStatusMessage(blockedMessage());
        } else if (name === "NotFoundError") {
          setStatus("error");
          setStatusMessage("No microphone was found. Plug one in or check your sound settings.");
        } else {
          setStatus("error");
          setStatusMessage(`Could not open the microphone (${name || "unknown error"}).`);
        }
        toast({ title: "Microphone not available", description: name === "NotFoundError" ? "No microphone was found." : blockedMessage(), variant: "destructive" });
        return;
      }
    }
    wantedRef.current = true;
    isPausedRef.current = false;
    launch();
  }, [blockedMessage, launch, toast]);

  const stopWakeWordListening = useCallback((clearConversation: boolean = true) => {
    wantedRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      try { recognition.abort(); } catch { /* ignore */ }
    }
    setIsWakeWordListening(false);
    setStatus("off");
    setStatusMessage("");
    if (clearConversation) {
      setConversationMode(false);
      onMessageDetectedRef.current = null;
      onWakeOnlyRef.current = null;
      onGoodbyeRef.current = null;
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
      pendingTextRef.current = "";
    }
  }, [setConversationMode]);

  const clearConversationMode = useCallback(() => setConversationMode(false), [setConversationMode]);

  // Temporarily release the microphone (e.g. while the manual mic button is in use).
  const pauseWakeWordDetection = useCallback(() => {
    isPausedRef.current = true;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
  }, []);

  const resumeWakeWordDetection = useCallback(() => {
    if (!isPausedRef.current) return;
    isPausedRef.current = false;
    if (wantedRef.current) scheduleRestart(400);
  }, [scheduleRestart]);

  // Only one recognizer can use the microphone at a time; step aside for the mic button.
  useEffect(() => {
    const handleManual = (event: Event) => {
      const active = (event as CustomEvent<{ active: boolean }>).detail?.active;
      if (active) pauseWakeWordDetection();
      else resumeWakeWordDetection();
    };
    window.addEventListener("bertha-manual-listening", handleManual);
    return () => window.removeEventListener("bertha-manual-listening", handleManual);
  }, [pauseWakeWordDetection, resumeWakeWordDetection]);

  useEffect(() => () => {
    wantedRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    if (heardTimerRef.current) clearTimeout(heardTimerRef.current);
    if (conversationTimeoutRef.current) clearInterval(conversationTimeoutRef.current);
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
  }, []);

  return {
    isWakeWordListening,
    status,
    statusMessage,
    heardText,
    isConversationActive,
    inIframe,
    startWakeWordListening,
    stopWakeWordListening,
    enableMicrophone,
    clearConversationMode,
    pauseWakeWordDetection,
    resumeWakeWordDetection
  };
}
