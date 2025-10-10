export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  
  const ua = navigator.userAgent;
  
  // Check user agent for mobile devices
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  
  // Check for iPadOS (reports as Macintosh but has touch support)
  const isIPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  
  return mobileUA || isIPadOS;
}

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  
  const ua = navigator.userAgent;
  
  // Check standard iOS devices
  const standardIOS = /iPhone|iPad|iPod/i.test(ua);
  
  // Check for iPadOS (reports as Macintosh but has touch support)
  const isIPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  
  return standardIOS || isIPadOS;
}

export function isAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  
  return /Android/i.test(navigator.userAgent);
}

export function isSafari(): boolean {
  if (typeof window === 'undefined') return false;
  
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export function supportsWebAudio(): boolean {
  if (typeof window === 'undefined') return false;
  
  return 'AudioContext' in window || 'webkitAudioContext' in window;
}
