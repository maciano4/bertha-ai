export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
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
