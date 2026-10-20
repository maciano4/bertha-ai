import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Volume2, AlertCircle, CheckCircle2, Info, HelpCircle, Upload, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { queryClient } from "@/lib/queryClient";

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
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualVoiceId, setManualVoiceId] = useState("");
  const [showVoiceCloning, setShowVoiceCloning] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [voiceDescription, setVoiceDescription] = useState("");
  const [audioFiles, setAudioFiles] = useState<File[]>([]);

  // Load saved voice parameters and ID on mount
  useEffect(() => {
    const savedParams = localStorage.getItem("bertha_voice_params");
    if (savedParams) {
      const params = JSON.parse(savedParams);
      setStability([params.stability || 0.5]);
      setSimilarityBoost([params.similarityBoost || 0.75]);
    }
    
    const savedVoiceId = localStorage.getItem("bertha_voice_id");
    if (savedVoiceId) {
      setLocalVoiceId(savedVoiceId);
      setManualVoiceId(savedVoiceId);
    }
  }, []);

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

  // Save voice parameters whenever they change
  useEffect(() => {
    const params = {
      stability: stability[0],
      similarityBoost: similarityBoost[0],
    };
    localStorage.setItem("bertha_voice_params", JSON.stringify(params));
  }, [stability, similarityBoost]);

  // Voice cloning mutation
  const cloneVoiceMutation = useMutation({
    mutationFn: async ({ name, description, files }: { name: string; description: string; files: File[] }) => {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', description);
      
      files.forEach(file => {
        formData.append('audioFiles', file);
      });

      const response = await fetch('/api/elevenlabs/clone-voice', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to clone voice');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Voice Cloned Successfully! 🎉",
        description: `Your custom voice "${data.name}" has been created. You can now use it for text-to-speech.`,
      });
      
      // Refresh voice list
      queryClient.invalidateQueries({ queryKey: ["/api/elevenlabs/voices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/elevenlabs/usage"] });
      
      // Reset form
      setVoiceName("");
      setVoiceDescription("");
      setAudioFiles([]);
      setShowVoiceCloning(false);
      
      // Auto-select the new voice
      handleVoiceChange(data.voiceId);
    },
    onError: (error: Error) => {
      toast({
        title: "Voice Cloning Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + audioFiles.length > 10) {
      toast({
        title: "Too Many Files",
        description: "Maximum 10 audio files allowed.",
        variant: "destructive",
      });
      return;
    }
    setAudioFiles(prev => [...prev, ...files]);
  };

  const removeAudioFile = (index: number) => {
    setAudioFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleCloneVoice = () => {
    if (!voiceName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for your custom voice.",
        variant: "destructive",
      });
      return;
    }

    if (audioFiles.length === 0) {
      toast({
        title: "Audio Files Required",
        description: "Please upload at least one audio file to clone your voice.",
        variant: "destructive",
      });
      return;
    }

    cloneVoiceMutation.mutate({
      name: voiceName,
      description: voiceDescription,
      files: audioFiles,
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

  const handleManualVoiceId = () => {
    if (!manualVoiceId.trim()) {
      toast({
        title: "Invalid Voice ID",
        description: "Please enter a valid voice ID.",
        variant: "destructive",
      });
      return;
    }
    
    handleVoiceChange(manualVoiceId.trim());
    setShowManualInput(false);
  };

  // Check if we have any error fetching voices (includes permission issues, free tier limitations, etc.)
  // If there's an error, we'll offer manual voice ID input
  const shouldShowManualOption = !!voicesError;

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
          ) : shouldShowManualOption ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="space-y-3">
                <p className="text-sm">
                  Unable to load voices automatically. You can manually enter a voice ID from the{" "}
                  <a 
                    href="https://elevenlabs.io/app/voice-library" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline hover:text-primary"
                  >
                    ElevenLabs Voice Library
                  </a>.
                </p>
                
                {!showManualInput ? (
                  <Button 
                    onClick={() => setShowManualInput(true)}
                    variant="outline"
                    size="sm"
                    className="w-full"
                    data-testid="button-show-manual-input"
                  >
                    <HelpCircle className="mr-2 h-4 w-4" />
                    Enter Voice ID Manually
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="manual-voice-id" className="text-sm">Voice ID</Label>
                    <div className="flex gap-2">
                      <Input
                        id="manual-voice-id"
                        placeholder="e.g., 21m00Tcm4TlvDq8ikWAM"
                        value={manualVoiceId}
                        onChange={(e) => setManualVoiceId(e.target.value)}
                        data-testid="input-manual-voice-id"
                      />
                      <Button 
                        onClick={handleManualVoiceId}
                        size="sm"
                        data-testid="button-save-manual-voice"
                      >
                        Save
                      </Button>
                    </div>
                    {localVoiceId && (
                      <p className="text-xs text-muted-foreground">
                        Current: {localVoiceId}
                      </p>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
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
            </>
          )}

          {localVoiceId && (
            <Button 
              onClick={handleTestVoice} 
              disabled={isTestingVoice}
              variant="outline"
              className="w-full"
              data-testid="button-test-voice"
            >
              <Volume2 className="mr-2 h-4 w-4" />
              {isTestingVoice ? "Playing..." : "Test Voice"}
            </Button>
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

      {/* Voice Cloning Section */}
      {usageStats?.canUseInstantVoiceCloning && (
        <Card>
          <Collapsible open={showVoiceCloning} onOpenChange={setShowVoiceCloning}>
            <CardHeader>
              <CollapsibleTrigger className="flex items-center justify-between w-full group">
                <div className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  <CardTitle>Clone Your Voice</CardTitle>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="p-0 h-auto"
                  data-testid="toggle-voice-cloning"
                >
                  {showVoiceCloning ? "Hide" : "Show"}
                </Button>
              </CollapsibleTrigger>
              <CardDescription>
                Create a personalized AI voice from audio samples
              </CardDescription>
            </CardHeader>
            
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Upload 1-10 audio clips (30s-5min each) of clear speech. Best quality comes from 3+ samples with varied intonation.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="voice-name">Voice Name*</Label>
                  <Input
                    id="voice-name"
                    placeholder="e.g., My Custom Voice"
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    data-testid="input-voice-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="voice-description">Description (optional)</Label>
                  <Input
                    id="voice-description"
                    placeholder="e.g., Warm and friendly voice for Bertha"
                    value={voiceDescription}
                    onChange={(e) => setVoiceDescription(e.target.value)}
                    data-testid="input-voice-description"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Audio Files ({audioFiles.length}/10)</Label>
                  <div className="border-2 border-dashed rounded-lg p-4 text-center">
                    <input
                      type="file"
                      accept="audio/*"
                      multiple
                      onChange={handleFileSelection}
                      className="hidden"
                      id="audio-upload"
                      data-testid="input-audio-files"
                    />
                    <label
                      htmlFor="audio-upload"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Click to upload audio files
                      </span>
                      <span className="text-xs text-muted-foreground">
                        MP3, WAV, M4A (max 10MB each)
                      </span>
                    </label>
                  </div>

                  {audioFiles.length > 0 && (
                    <div className="space-y-2 mt-3">
                      {audioFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-secondary rounded-md"
                          data-testid={`audio-file-${index}`}
                        >
                          <span className="text-sm truncate flex-1">{file.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAudioFile(index)}
                            data-testid={`button-remove-file-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleCloneVoice}
                  disabled={cloneVoiceMutation.isPending || !voiceName.trim() || audioFiles.length === 0}
                  className="w-full"
                  data-testid="button-clone-voice"
                >
                  {cloneVoiceMutation.isPending ? (
                    <>Creating Voice...</>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Clone Voice
                    </>
                  )}
                </Button>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Tip:</strong> Voice cloning requires a paid ElevenLabs subscription (Creator tier or higher). 
          Visit{" "}
          <a 
            href="https://elevenlabs.io" 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline hover:text-primary"
          >
            elevenlabs.io
          </a>
          {" "}to upgrade and unlock this feature.
        </AlertDescription>
      </Alert>
    </div>
  );
}
