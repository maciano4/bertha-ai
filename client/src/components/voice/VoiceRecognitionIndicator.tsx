import { User, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface VoiceRecognitionIndicatorProps {
  recognizedUser: string;
  confidence?: number;
  className?: string;
}

export function VoiceRecognitionIndicator({ 
  recognizedUser, 
  confidence, 
  className = "" 
}: VoiceRecognitionIndicatorProps) {
  return (
    <Card className={`inline-block ${className}`}>
      <CardContent className="p-2 flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
          <User className="w-3 h-3 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-green-700 dark:text-green-300">
            {recognizedUser}
          </span>
          <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
        </div>
        {confidence && (
          <Badge variant="secondary" className="text-xs">
            {Math.round(confidence * 100)}%
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

interface VoiceRecognitionBannerProps {
  recognizedUser: string;
  onDismiss?: () => void;
}

export function VoiceRecognitionBanner({ 
  recognizedUser, 
  onDismiss 
}: VoiceRecognitionBannerProps) {
  return (
    <div className="animate-in slide-in-from-top-2 fade-in duration-300 mb-2">
      <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <User className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Voice Recognized
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">
                Welcome back, {recognizedUser}!
              </p>
            </div>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-green-400 hover:text-green-600 transition-colors"
              data-testid="button-dismiss-recognition"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}