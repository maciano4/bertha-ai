// Installable-app helpers: registers the service worker and keeps the browser's
// "beforeinstallprompt" event so the sidebar's Install button can show the real prompt.
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true);

export const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export function setupPwa() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); // we show our own Install button instead of the mini-infobar
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    notify();
  });
  // Only in production builds: in development Vite serves source files that must never be cached.
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(error => console.warn("Service worker not registered:", error));
    });
  }
}

/** canPrompt: the browser offered installation. ios: show Add to Home Screen steps instead. */
export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force(n => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  const standalone = isStandalone() || installed;
  return {
    installed: standalone,
    canPrompt: !standalone && !!deferred,
    ios: !standalone && isIOS(),
    async prompt() {
      if (!deferred) return "unavailable" as const;
      const event = deferred;
      deferred = null;
      await event.prompt();
      const choice = await event.userChoice.catch(() => ({ outcome: "dismissed" as const }));
      notify();
      return choice.outcome;
    },
  };
}
