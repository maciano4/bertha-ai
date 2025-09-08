import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Mic, User, Check, X, Volume2 } from 'lucide-react';
import { useSpeech } from '@/hooks/useSpeech';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ProfilePictureUpload } from './ProfilePictureUpload';

interface VoiceTrainingProps {
  onComplete?: (profileId: string, name: string) => void;
  onCancel?: () => void;
}

const TRAINING_PHRASES = [
  "Hello Bertha, my name is",
  "Hi there, how are you doing today?",
  "Can you help me with something?",
  "I would like to ask you a question",
  "Thank you for your assistance"
];

export function VoiceTraining({ onComplete, onCancel }: VoiceTrainingProps) {
  const [step, setStep] = useState<'name' | 'training' | 'picture' | 'complete'>('name');
  const [userName, setUserName] = useState('');
  const [currentPhrase, setCurrentPhrase] = useState(0);
  const [recordedSamples, setRecordedSamples] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  
  const { startListening, stopListening, isListening, speak } = useSpeech();
  const { toast } = useToast();

  const handleNameSubmit = () => {
    if (!userName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter your name to continue",
        variant: "destructive"
      });
      return;
    }
    setStep('training');
  };

  const startRecording = () => {
    if (currentPhrase >= TRAINING_PHRASES.length) return;
    
    setIsRecording(true);
    const phrase = TRAINING_PHRASES[currentPhrase];
    
    startListening(
      (transcript) => {
        const recordedText = `${phrase} ${transcript}`;
        setRecordedSamples(prev => [...prev, recordedText]);
        setIsRecording(false);
        
        // Move to next phrase
        if (currentPhrase < TRAINING_PHRASES.length - 1) {
          setCurrentPhrase(prev => prev + 1);
          
          toast({
            title: "Good!",
            description: `Sample ${currentPhrase + 1} recorded. Ready for next one?`
          });
        } else {
          // Voice training complete, move to picture step
          await completeVoiceTraining();
        }
      },
      'en-US',
      false // Don't auto-send during training
    );
  };

  const stopRecording = () => {
    stopListening();
    setIsRecording(false);
  };

  const completeVoiceTraining = async () => {
    try {
      const response = await apiRequest('POST', '/api/voice/profiles', {
        name: userName,
        samples: recordedSamples,
        language: 'en-US'
      });
      
      const data = await response.json();
      setProfileId(data.profileId);
      setStep('picture');
      
      // Speak confirmation
      speak(`Great! I've learned your voice, ${userName}. Now let's add your picture so I can personalize your experience.`);
      
      toast({
        title: "Voice Training Complete!",
        description: `Voice profile created. Now add your profile picture to complete personalization.`
      });
      
    } catch (error) {
      toast({
        title: "Training Failed",
        description: "Could not save voice profile. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handlePictureUpdated = (newUrl: string) => {
    setProfilePictureUrl(newUrl);
    setStep('complete');
    
    speak(`Perfect! Your personalized profile is now complete, ${userName}. I'll recognize your voice and show your picture when we chat.`);
    
    toast({
      title: "Personalization Complete!",
      description: "Your voice and picture are now linked. Bertha will recognize you!"
    });
  };

  const skipPicture = () => {
    setStep('complete');
    
    speak(`No problem, ${userName}. Your voice profile is ready. You can always add a picture later.`);
  };

  const handleComplete = () => {
    if (profileId && userName) {
      onComplete?.(profileId, userName);
    }
  };

  const playPhrase = () => {
    if (currentPhrase < TRAINING_PHRASES.length) {
      speak(`Please say: ${TRAINING_PHRASES[currentPhrase]}`);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="w-5 h-5" />
          Voice Training
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'name' && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Let me learn your voice so I can recognize and greet you by name!
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="username">What's your name?</Label>
              <Input
                id="username"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
                onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                data-testid="input-username"
              />
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleNameSubmit} className="flex-1" data-testid="button-start-training">
                Start Voice Training
              </Button>
              {onCancel && (
                <Button variant="outline" onClick={onCancel}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'training' && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Hi {userName}! I need to record 5 voice samples to learn your voice.
            </div>
            
            <div className="text-center">
              <div className="text-lg font-semibold mb-2">
                Sample {currentPhrase + 1} of {TRAINING_PHRASES.length}
              </div>
              <div className="p-3 bg-muted rounded-lg mb-4">
                <div className="text-sm text-muted-foreground mb-2">Say this phrase:</div>
                <div className="font-medium">"{TRAINING_PHRASES[currentPhrase]}"</div>
              </div>
            </div>

            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={playPhrase}
                data-testid="button-play-phrase"
              >
                <Volume2 className="w-4 h-4 mr-1" />
                Hear It
              </Button>
            </div>
            
            <div className="flex justify-center">
              {!isRecording ? (
                <Button
                  onClick={startRecording}
                  size="lg"
                  className="w-24 h-24 rounded-full"
                  data-testid="button-record-sample"
                >
                  <Mic className="w-8 h-8" />
                </Button>
              ) : (
                <Button
                  onClick={stopRecording}
                  variant="destructive"
                  size="lg"
                  className="w-24 h-24 rounded-full animate-pulse"
                  data-testid="button-stop-recording"
                >
                  <Mic className="w-8 h-8" />
                </Button>
              )}
            </div>
            
            <div className="text-center text-sm text-muted-foreground">
              {isRecording ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  Recording... Click to stop
                </div>
              ) : (
                "Click the microphone to record your voice"
              )}
            </div>

            <div className="flex justify-center gap-1">
              {Array.from({ length: TRAINING_PHRASES.length }).map((_, index) => (
                <div
                  key={index}
                  className={`w-3 h-3 rounded-full ${
                    index < recordedSamples.length
                      ? 'bg-green-500'
                      : index === currentPhrase
                      ? 'bg-blue-500'
                      : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {step === 'picture' && profileId && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-lg font-semibold mb-2">
                Voice Training Complete! 🎉
              </div>
              <div className="text-sm text-muted-foreground mb-4">
                Now let's add your profile picture so Bertha can personalize your chat experience.
              </div>
            </div>

            <ProfilePictureUpload 
              profileId={profileId}
              profileName={userName}
              onPictureUpdated={handlePictureUpdated}
            />

            <div className="flex justify-center gap-2">
              <Button 
                variant="outline" 
                onClick={skipPicture}
                data-testid="button-skip-picture"
              >
                Skip for Now
              </Button>
            </div>

            <div className="text-xs text-muted-foreground text-center">
              You can always add or change your profile picture later in the Voice Profile Manager.
            </div>
          </div>
        )}

        {step === 'complete' && (
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-8 h-8 text-green-600" />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="text-lg font-semibold">Voice Training Complete!</div>
              <div className="text-sm text-muted-foreground">
                I've learned your voice, {userName}. I'll recognize you in future conversations!
              </div>
            </div>
            
            <Button onClick={handleComplete} className="w-full" data-testid="button-complete-training">
              Start Chatting
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}