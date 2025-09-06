import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ObjectUploader } from "@/components/ObjectUploader";
import { X, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBackgroundChange: (backgroundUrl: string) => void;
}

interface SettingsData {
  language: string;
  speechEnabled: boolean;
  searchEnabled: boolean;
  voiceSpeed: string;
  saveHistory: boolean;
  analytics: boolean;
  showNLPInsights: boolean;
}

export default function SettingsModal({ isOpen, onClose, onBackgroundChange }: SettingsModalProps) {
  const [settings, setSettings] = useState<SettingsData>({
    language: "en",
    speechEnabled: false,
    searchEnabled: true,
    voiceSpeed: "1",
    saveHistory: true,
    analytics: false,
    showNLPInsights: false
  });
  
  const { toast } = useToast();

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

  const handleGetUploadParameters = async () => {
    try {
      const response = await apiRequest("POST", "/api/objects/upload");
      const data = await response.json();
      return {
        method: "PUT" as const,
        url: data.uploadURL
      };
    } catch (error) {
      toast({
        title: "Upload Error",
        description: "Failed to get upload URL",
        variant: "destructive"
      });
      throw error;
    }
  };

  const handleUploadComplete = async (result: any) => {
    if (result.successful?.length > 0) {
      const uploadURL = result.successful[0].uploadURL;
      
      try {
        const response = await apiRequest("PUT", "/api/background-images", {
          backgroundImageURL: uploadURL,
          userId: "default" // In a real app, this would be the authenticated user's ID
        });
        
        const data = await response.json();
        onBackgroundChange(uploadURL);
        
        toast({
          title: "Background Updated",
          description: "Your custom background has been set successfully"
        });
      } catch (error) {
        toast({
          title: "Background Error", 
          description: "Failed to set background image",
          variant: "destructive"
        });
      }
    }
  };

  const resetToDefaults = () => {
    const defaults: SettingsData = {
      language: "en",
      speechEnabled: false,
      searchEnabled: true,
      voiceSpeed: "1",
      saveHistory: true,
      analytics: false,
      showNLPInsights: false
    };
    setSettings(defaults);
    localStorage.setItem("bertha-settings", JSON.stringify(defaults));
    onBackgroundChange(""); // Clear custom background
    localStorage.removeItem("bertha-custom-background");
    
    toast({
      title: "Settings Reset",
      description: "All settings have been reset to defaults"
    });
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
    {
      url: "https://images.unsplash.com/photo-1518709268805-4e9042af2176?q=80&w=1000",
      name: "Tech Grid"
    },
    {
      url: "https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=1000", 
      name: "Digital Network"
    },
    {
      url: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=1000",
      name: "Circuit Board"
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" data-testid="modal-settings">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Settings
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Background Customization */}
          <div>
            <h3 className="font-medium text-foreground mb-3">Background</h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {presetBackgrounds.map((bg, index) => (
                <button
                  key={index}
                  className="aspect-square rounded-lg bg-cover bg-center hover:ring-2 hover:ring-primary transition-all"
                  style={{ backgroundImage: `url(${bg.url})` }}
                  onClick={() => onBackgroundChange(bg.url)}
                  title={bg.name}
                  data-testid={`button-preset-${index}`}
                />
              ))}
            </div>
            
            <ObjectUploader
              maxNumberOfFiles={1}
              maxFileSize={10485760} // 10MB
              onGetUploadParameters={handleGetUploadParameters}
              onComplete={handleUploadComplete}
              buttonClassName="w-full"
            >
              <div className="flex items-center justify-center gap-2 py-2 border-2 border-dashed border-border rounded-lg hover:border-primary transition-colors">
                <Upload className="w-4 h-4" />
                <span>Upload Custom Background</span>
              </div>
            </ObjectUploader>
          </div>

          <Separator />

          {/* Voice & Language */}
          <div>
            <h3 className="font-medium text-foreground mb-3">Voice & Language</h3>
            <div className="space-y-4">
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">Language</Label>
                <Select 
                  value={settings.language} 
                  onValueChange={(value) => updateSettings({ language: value })}
                >
                  <SelectTrigger data-testid="select-modal-language">
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

              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">
                  Voice Speed: {settings.voiceSpeed}x
                </Label>
                <Slider
                  value={[parseFloat(settings.voiceSpeed)]}
                  onValueChange={([value]) => updateSettings({ voiceSpeed: value.toString() })}
                  min={0.5}
                  max={2}
                  step={0.1}
                  className="w-full"
                  data-testid="slider-voice-speed"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Privacy & Data */}
          <div>
            <h3 className="font-medium text-foreground mb-3">Privacy & Features</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Speech Output</Label>
                <Switch
                  checked={settings.speechEnabled}
                  onCheckedChange={(checked) => updateSettings({ speechEnabled: checked })}
                  data-testid="switch-modal-speech"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Web Search</Label>
                <Switch
                  checked={settings.searchEnabled}
                  onCheckedChange={(checked) => updateSettings({ searchEnabled: checked })}
                  data-testid="switch-modal-search"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Save Conversation History</Label>
                <Switch
                  checked={settings.saveHistory}
                  onCheckedChange={(checked) => updateSettings({ saveHistory: checked })}
                  data-testid="switch-save-history"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Analytics & Improvement</Label>
                <Switch
                  checked={settings.analytics}
                  onCheckedChange={(checked) => updateSettings({ analytics: checked })}
                  data-testid="switch-analytics"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Show AI Understanding</Label>
                <Switch
                  checked={settings.showNLPInsights}
                  onCheckedChange={(checked) => updateSettings({ showNLPInsights: checked })}
                  data-testid="switch-nlp-insights"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            className="flex-1"
            onClick={resetToDefaults}
            data-testid="button-reset"
          >
            Reset to Default
          </Button>
          <Button
            className="flex-1"
            onClick={onClose}
            data-testid="button-save"
          >
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
