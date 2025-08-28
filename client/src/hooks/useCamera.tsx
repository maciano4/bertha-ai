import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export function useCamera() {
  const [isActive, setIsActive] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  // Check if camera is supported
  useEffect(() => {
    setIsSupported('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices);
  }, []);

  const startCamera = useCallback(async () => {
    if (!isSupported) {
      const errorMsg = "Camera access is not supported in this browser";
      setError(errorMsg);
      toast({
        title: "Camera Error",
        description: errorMsg,
        variant: "destructive"
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true,
        audio: false 
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      setIsActive(true);
      setError(null);
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to access camera";
      setError(errorMsg);
      setIsActive(false);
      
      toast({
        title: "Camera Access Denied",
        description: "Please allow camera access to use visual context features",
        variant: "destructive"
      });
    }
  }, [isSupported, toast]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsActive(false);
    setError(null);
  }, []);

  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !isActive) return null;

    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    ctx.drawImage(video, 0, 0);
    
    return canvas.toDataURL('image/jpeg', 0.8);
  }, [isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    isActive,
    isSupported,
    error,
    videoRef,
    startCamera,
    stopCamera,
    captureFrame
  };
}
