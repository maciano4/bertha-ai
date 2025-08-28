import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Image } from "lucide-react";

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
  const [settings, setSettings] = useState<SettingsData>({
    language: "en",
    speechEnabled: false,
    searchEnabled: true,
    voiceSpeed: "1"
  });

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem("bertha-settings");
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  // Save settings to localStorage
  const updateSettings = (newSettings: Partial<SettingsData>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem("bertha-settings", JSON.stringify(updated));
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
    <Card className="m-4 shadow-lg">
      <CardHeader>
        <CardTitle className="text-base">Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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

        {/* Web Search Toggle */}
        <div className="flex items-center justify-between">
          <Label className="text-sm text-muted-foreground">Web Search</Label>
          <Switch
            checked={settings.searchEnabled}
            onCheckedChange={(checked) => updateSettings({ searchEnabled: checked })}
            data-testid="switch-search"
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
  );
}
