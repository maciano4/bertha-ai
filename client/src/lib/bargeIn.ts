// Barge-in: while Bertha talks, listen to the microphone level and call onSpeech as soon as
// the user starts talking over her, so she can stop mid-sentence like a person would.
// Relies on the browser's echo cancellation to ignore her own voice from the speakers.

export interface BargeInOptions {
  /** How loud above the room's noise floor counts as speech (multiplier). */
  sensitivity?: number;
  /** How long the level must stay up before it counts (ms); filters coughs and clicks. */
  holdMs?: number;
  /** Ignore the first part of playback while the echo canceller adapts (ms). */
  graceMs?: number;
}

export function bargeInSupported() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!(window.AudioContext || (window as any).webkitAudioContext);
}

// Only listen if the user already allowed the microphone; never pop a permission prompt mid-reply.
export async function micAlreadyAllowed() {
  try {
    const status = await (navigator as any).permissions?.query({ name: "microphone" });
    return status ? status.state === "granted" : false;
  } catch { return false; }
}

export function rms(samples: Float32Array) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (samples.length || 1));
}

// Pure decision logic, kept separate so it can be unit tested.
export function createVad({ sensitivity = 3, holdMs = 180, graceMs = 350 }: BargeInOptions = {}) {
  let floor = 0; let calibrated = 0; let above = 0; let start = -1;
  return (level: number, now: number) => {
    if (start < 0) start = now;
    if (now - start < graceMs) { floor = calibrated++ ? floor * 0.8 + level * 0.2 : level; return false; }
    const threshold = Math.max(0.02, floor * sensitivity);
    if (level > threshold) { if (!above) above = now; return now - above >= holdMs; }
    above = 0; floor = floor * 0.95 + level * 0.05;
    return false;
  };
}

export async function startBargeIn(onSpeech: () => void, options: BargeInOptions = {}): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);
  const vad = createVad(options);
  let stopped = false;
  const stop = () => {
    if (stopped) return; stopped = true;
    clearInterval(timer);
    try { source.disconnect(); } catch { /* already gone */ }
    stream.getTracks().forEach(t => t.stop());
    ctx.close().catch(() => {});
  };
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buffer);
    if (vad(rms(buffer), performance.now())) { stop(); onSpeech(); }
  }, 30);
  return stop;
}
