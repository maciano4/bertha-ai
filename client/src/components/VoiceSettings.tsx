import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Volume2, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  previewUrl?: string;
}

interface UsageStats {
  characterCount: number;
  characterLimit: number;
  canExtendCharacterLimit: boolean;
  nextCharacterCountResetUnix: number;
  voiceLimit: number;
  professionalVoiceLimit: number;
  canUseInstantVoiceCloning: boolean;
  availableModels: string[];
}

interface VoiceSettingsProps {
  selectedVoiceId?: string;
  onVoiceChange?: (voiceId: string) => void;
  showAdvancedSettings?: boolean;
}

export function VoiceSettings({ 
  selectedVoiceId, 
  onVoiceChange,
  showAdvancedSettings = true 
}: VoiceSettingsProps) {
  const { toast } = useToast();
  const [localVoiceId, setLocalVoiceId] = useState(selectedVoiceId || "");
  const [stability, setStability] = useState([0.5]);
  const [similarityBoost, setSimilarityBoost] = useState([0.75]);
  const [isTestingVoice, setIsTestingVoice] = useState(false);

  // Fetch available voices
  const { data: voicesData, isLoading: voicesLoading, error: voicesError } = useQuery<{ voices: ElevenLabsVoice[] }>({
    queryKey: ["/api/elevenlabs/voices"],
  });

  // Fetch usage stats
  const { data: usageStats, isLoading: statsLoading } = useQuery<UsageStats>({
    queryKey: ["/api/elevenlabs/usage"],
  });

  useEffect(() => {
    if (selectedVoiceId) {
      setLocalVoiceId(selectedVoiceId);
    }
  }, [selectedVoiceId]);

  const handleVoiceChange = (voiceId: string) => {
    setLocalVoiceId(voiceId);
    if (onVoiceChange) {
      onVoiceChange(voiceId);
    }
    
    // Save to localStorage
    localStorage.setItem("bertha_voice_id", voiceId);
    
    toast({
      title: "Voice Updated",
      description: "Bertha's voice has been updated successfully.",
    });
  };

  const handleTestVoice = async () => {
    if (!localVoiceId) {
      toast({
        title: "No Voice Selected",
        description: "Please select a voice first.",
        variant: "destructive",
      });
      return;
    }

    setIsTestingVoice(true);
    
    try {
      const response = await fetch("/api/elevenlabs/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello there! I'm Bertha, your AI assistant. How may I help you today?",
          voiceId: localVoiceId,
          stability: stability[0],
          similarityBoost: similarityBoost[0],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate test audio");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };
      
      await audio.play();
      
      toast({
        title: "Voice Preview",
        description: "Playing voice sample...",
      });
    } catch (error) {
      console.error("Error testing voice:", error);
      toast({
        title: "Test Failed",
        description: "Failed to test the voice. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsTestingVoice(false);
    }
  };

  // Calculate usage percentage
  const usagePercentage = usageStats 
    ? Math.round((usageStats.characterCount / usageStats.characterLimit) * 100)
    : 0;

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return "text-red-500";
    if (percentage >= 70) return "text-yellow-500";
    return "text-green-500";
  };

  if (voicesError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          ElevenLabs is not configured. Please add your API key to enable custom voices.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Voice Selection
          </CardTitle>
          <CardDescription>
            Choose a custom voice for Bertha powered by ElevenLabs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {voicesLoading ? (
            <div className="text-sm text-muted-foreground">Loading voices...</div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="voice-select">Select Voice</Label>
                <Select 
                  value={localVoiceId} 
                  onValueChange={handleVoiceChange}
                  data-testid="select-voice"
                >
                  <SelectTrigger id="voice-select">
                    <SelectValue placeholder="Choose a voice..." />
                  </SelectTrigger>
                  <SelectContent>
                    {voicesData?.voices.map((voice) => (
                      <SelectItem 
                        key={voice.voiceId} 
                        value={voice.voiceId}
                        data-testid={`voice-option-${voice.voiceId}`}
                      >
                        {voice.name} {voice.category ? `(${voice.category})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={handleTestVoice} 
                disabled={!localVoiceId || isTestingVoice}
                variant="outline"
                className="w-full"
                data-testid="button-test-voice"
              >
                <Volume2 className="mr-2 h-4 w-4" />
                {isTestingVoice ? "Playing..." : "Test Voice"}
              </Button>
            </>
          )}

          {showAdvancedSettings && (
            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium">Advanced Settings</h4>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Stability</Label>
                  <span className="text-sm text-muted-foreground">{stability[0].toFixed(2)}</span>
                </div>
                <Slider
                  value={stability}
                  onValueChange={setStability}
                  min={0}
                  max={1}
                  step={0.01}
                  data-testid="slider-stability"
                />
                <p className="text-xs text-muted-foreground">
                  Higher values make the voice more consistent but less expressive
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Similarity Boost</Label>
                  <span className="text-sm text-muted-foreground">{similarityBoost[0].toFixed(2)}</span>
                </div>
                <Slider
                  value={similarityBoost}
                  onValueChange={setSimilarityBoost}
                  min={0}
                  max={1}
                  step={0.01}
                  data-testid="slider-similarity"
                />
                <p className="text-xs text-muted-foreground">
                  Higher values make the voice closer to the original sample
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!statsLoading && usageStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Usage Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm">Character Usage</span>
                  <span className={`text-sm font-medium ${getUsageColor(usagePercentage)}`}>
                    {usagePercentage}%
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${
                      usagePercentage >= 90 ? "bg-red-500" :
                      usagePercentage >= 70 ? "bg-yellow-500" :
                      "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {usageStats.characterCount.toLocaleString()} / {usageStats.characterLimit.toLocaleString()} characters used
                </p>
              </div>

              <div className="pt-3 border-t space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Voice Limit</span>
                  <span>{usageStats.voiceLimit}</span>
                </div>
                {usageStats.canUseInstantVoiceCloning && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs">Instant Voice Cloning Available</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Tip:</strong> You can create custom voices at{" "}
          <a 
            href="https://elevenlabs.io" 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline hover:text-primary"
          >
            elevenlabs.io
          </a>
          {" "}and they will appear here automatically.
        </AlertDescription>
      </Alert>
    </div>
  );
}
