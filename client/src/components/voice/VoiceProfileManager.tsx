import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { User, Plus, Trash2, Mic, Clock, TrendingUp } from 'lucide-react';
import { VoiceTraining } from './VoiceTraining';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface VoiceProfile {
  id: string;
  name: string;
  language: string;
  samplesCount: number;
  usageCount: number;
  lastUsed: string;
}

interface VoiceStats {
  totalProfiles: number;
  activeProfiles: number;
  mostUsed: string;
  languages: string[];
}

export function VoiceProfileManager() {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [stats, setStats] = useState<VoiceStats | null>(null);
  const [showTraining, setShowTraining] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadProfiles();
    loadStats();
  }, []);

  const loadProfiles = async () => {
    try {
      const response = await apiRequest('GET', '/api/voice/profiles');
      const data = await response.json();
      setProfiles(data.profiles);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load voice profiles",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await apiRequest('GET', '/api/voice/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to load voice stats:', error);
    }
  };

  const deleteProfile = async (profileId: string, profileName: string) => {
    if (!confirm(`Are you sure you want to delete ${profileName}'s voice profile?`)) {
      return;
    }

    try {
      await apiRequest('DELETE', `/api/voice/profiles/${profileId}`);
      setProfiles(prev => prev.filter(p => p.id !== profileId));
      loadStats();
      
      toast({
        title: "Voice Profile Deleted",
        description: `${profileName}'s voice profile has been removed`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete voice profile",
        variant: "destructive"
      });
    }
  };

  const handleTrainingComplete = (profileId: string, name: string) => {
    setShowTraining(false);
    loadProfiles();
    loadStats();
    
    toast({
      title: "Voice Training Complete!",
      description: `${name} is now enrolled in voice recognition`
    });
  };

  const formatLastUsed = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return `${Math.floor(diffMinutes / 1440)}d ago`;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (showTraining) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Voice Training</h3>
          <Button 
            variant="outline" 
            onClick={() => setShowTraining(false)}
            data-testid="button-cancel-training"
          >
            Cancel
          </Button>
        </div>
        <VoiceTraining 
          onComplete={handleTrainingComplete}
          onCancel={() => setShowTraining(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Voice Profiles</h3>
        <Button 
          onClick={() => setShowTraining(true)}
          className="flex items-center gap-2"
          data-testid="button-add-profile"
        >
          <Plus className="w-4 h-4" />
          Add Profile
        </Button>
      </div>

      {/* Voice Recognition Stats */}
      {stats && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Voice Recognition Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <div className="text-muted-foreground">Total Profiles</div>
                <div className="text-lg font-semibold">{stats.totalProfiles}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Active Users</div>
                <div className="text-lg font-semibold">{stats.activeProfiles}</div>
              </div>
            </div>
            
            {stats.mostUsed !== 'None' && (
              <div className="space-y-1">
                <div className="text-muted-foreground">Most Active User</div>
                <div className="font-medium">{stats.mostUsed}</div>
              </div>
            )}
            
            <div className="space-y-2">
              <div className="text-muted-foreground text-xs">Languages</div>
              <div className="flex flex-wrap gap-1">
                {stats.languages.map(lang => (
                  <Badge key={lang} variant="secondary" className="text-xs">
                    {lang}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Voice Profiles List */}
      <div className="space-y-3">
        {profiles.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Mic className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="text-center space-y-1">
                <div className="font-medium">No Voice Profiles</div>
                <div className="text-sm text-muted-foreground">
                  Add voice profiles to enable user recognition by voice
                </div>
              </div>
              <Button 
                onClick={() => setShowTraining(true)}
                className="mt-2"
                data-testid="button-create-first-profile"
              >
                Create First Profile
              </Button>
            </CardContent>
          </Card>
        ) : (
          profiles.map(profile => (
            <Card key={profile.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    
                    <div className="space-y-1">
                      <div className="font-medium">{profile.name}</div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Mic className="w-3 h-3" />
                          {profile.samplesCount} samples
                        </div>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          {profile.usageCount} uses
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatLastUsed(profile.lastUsed)}
                        </div>
                      </div>
                      
                      <Badge variant="outline" className="text-xs">
                        {profile.language}
                      </Badge>
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteProfile(profile.id, profile.name)}
                    className="text-destructive hover:text-destructive"
                    data-testid={`button-delete-profile-${profile.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {profiles.length > 0 && (
        <div className="text-xs text-muted-foreground text-center">
          Voice recognition uses conversation patterns and context to identify users.
          <br />
          Recognition accuracy improves with more conversations.
        </div>
      )}
    </div>
  );
}