import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Image, ExternalLink, Info } from "lucide-react";
import { VoiceSettings } from "../VoiceSettings";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SettingsData {
  language: string;
  speechEnabled: boolean;
  searchEnabled: boolean;
  voiceSpeed: string;
}

interface SettingsPanelProps {
  onBackgroundChange: (backgroundUrl: string) => void;
}

export default function SettingsPanel({ onBackgroundChange }: SettingsPanelProps) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsData>({
    language: "en",
    speechEnabled: true,
    searchEnabled: true,
    voiceSpeed: "1"
  });
  
  // Detect if user is in webview (like Replit app)
  const isWebView = typeof window !== 'undefined' && (/wv|WebView|Replit/i.test(navigator.userAgent) || !('speechSynthesis' in window));
  const appUrl = typeof window !== 'undefined' ? window.location.href : '';
  
  const copyUrlToClipboard = () => {
    navigator.clipboard.writeText(appUrl).then(() => {
      toast({
        title: "Link Copied!",
        description: "Paste this link in your phone's browser (Chrome or Safari)",
        duration: 3000
      });
    }).catch(() => {
      toast({
        title: "Could not copy",
        description: appUrl,
        duration: 5000
      });
    });
  };

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem("bertha-settings");
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  useEffect(() => {
    const handleSettingsChange = (event: Event) => {
      const updatedSettings = (event as CustomEvent<Partial<SettingsData>>).detail;
      if (updatedSettings) {
        setSettings(currentSettings => ({ ...currentSettings, ...updatedSettings }));
      }
    };

    window.addEventListener("bertha-settings-changed", handleSettingsChange);
    return () => window.removeEventListener("bertha-settings-changed", handleSettingsChange);
  }, []);

  // Save settings to localStorage
  const updateSettings = (newSettings: Partial<SettingsData>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem("bertha-settings", JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("bertha-settings-changed", { detail: updated }));
  };

  const languages = [
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "de", label: "German" },
    { value: "ja", label: "Japanese" },
    { value: "zh", label: "Chinese" }
  ];

  const presetBackgrounds = [
    "https://images.unsplash.com/photo-1518709268805-4e9042af2176?q=80&w=1000", // Abstract tech
    "https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=1000", // Digital network
    "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=1000", // Circuit board
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1000"  // Space tech
  ];

  return (
    <>
      <Card className="m-4 shadow-lg">
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Webview Warning for Voice Support */}
          {isWebView && (
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <Info className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm">
                <div className="space-y-2">
                  <p className="font-medium">Voice features need a regular browser</p>
                  <p className="text-xs text-muted-foreground">
                    The Replit app doesn't support voice. For full voice features, open this app in Chrome or Safari.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={copyUrlToClipboard}
                  >
                    <ExternalLink className="mr-2 h-3 w-3" />
                    Copy Link to Open in Browser
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          {/* Language Selection */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Output Language</Label>
            <Select 
              value={settings.language} 
              onValueChange={(value) => updateSettings({ language: value })}
            >
              <SelectTrigger data-testid="select-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Speech Output Toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">Speech Output</Label>
            <Switch
              checked={settings.speechEnabled}
              onCheckedChange={(checked) => updateSettings({ speechEnabled: checked })}
              data-testid="switch-speech"
            />
          </div>

          {/* Background Presets */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Background</Label>
            <div className="grid grid-cols-2 gap-2">
              {presetBackgrounds.map((bg, index) => (
                <button
                  key={index}
                  className="aspect-square rounded-lg bg-cover bg-center hover:ring-2 hover:ring-primary transition-all"
                  style={{ backgroundImage: `url(${bg})` }}
                  onClick={() => onBackgroundChange(bg)}
                  data-testid={`button-background-${index}`}
                />
              ))}
            </div>
          </div>

          {/* Custom Background Upload */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    const result = e.target?.result as string;
                    onBackgroundChange(result);
                  };
                  reader.readAsDataURL(file);
                }
              };
              input.click();
            }}
            data-testid="button-upload-background"
          >
            <Image className="w-4 h-4 mr-2" />
            Upload Custom Background
          </Button>
        </CardContent>
      </Card>

      {/* Voice Selection */}
      <div className="m-4">
        <VoiceSettings showAdvancedSettings={true} />
      </div>
    </>
  );
}
