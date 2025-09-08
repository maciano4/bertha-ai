import { Message } from "@/hooks/useChat";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface MessageBubbleProps {
  message: Message;
  showAvatar?: boolean;
}

export default function MessageBubble({ message, showAvatar }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const [userProfilePicture, setUserProfilePicture] = useState<string | null>(null);

  // Get user profile picture if this is a recognized user message
  useEffect(() => {
    const recognizedUser = message.metadata?.recognizedUser;
    if (recognizedUser && !isUser && !isSystem) {
      // This is an AI message responding to a recognized user
      // For now, we'll fetch the profile picture from the voice profiles API
      fetch('/api/voice/profiles')
        .then(res => res.json())
        .then(data => {
          const profiles = data.profiles || [];
          const profile = profiles.find((p: any) => p.name === recognizedUser);
          if (profile && profile.profilePictureUrl) {
            setUserProfilePicture(profile.profilePictureUrl);
          }
        })
        .catch(error => console.error('Error fetching user profile:', error));
    }
  }, [message.metadata?.recognizedUser, isUser, isSystem]);

  if (isSystem) {
    return (
      <div className="message-bubble system-message p-3 rounded-lg shadow-sm mx-auto text-center max-w-md">
        <i className="fas fa-info-circle mr-2"></i>
        {message.content}
      </div>
    );
  }

  return (
    <div className={cn(
      "message-bubble p-4 rounded-lg shadow-sm",
      isUser ? "user-message ml-auto" : "ai-message"
    )}>
      {!isUser && showAvatar ? (
        <div className="flex items-start gap-3">
          <img 
            src={userProfilePicture || "https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=40&h=40&fit=crop"} 
            alt={message.metadata?.recognizedUser ? `${message.metadata.recognizedUser}'s profile` : "Bertha AI"} 
            className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
            data-testid="img-avatar"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-medium text-sm text-muted-foreground">
                {message.metadata?.recognizedUser ? `Bertha (talking to ${message.metadata.recognizedUser})` : "Bertha AI"}
              </p>
              {message.metadata?.searchUsed && (
                <span className="text-xs text-accent-foreground bg-accent px-2 py-1 rounded-full">
                  Web Search
                </span>
              )}
              {message.metadata?.translationUsed && (
                <span className="text-xs text-accent-foreground bg-accent px-2 py-1 rounded-full">
                  Translated
                </span>
              )}
            </div>
            <p className="text-foreground whitespace-pre-wrap" data-testid="text-content">
              {message.content}
            </p>
            {message.metadata?.searchUsed && (
              <div className="text-xs text-muted-foreground border-l-2 border-accent pl-3 mt-3">
                <p className="font-medium mb-1">💡 Enhanced with Web Search</p>
                <p>Information gathered from web sources to provide you with the most current data.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-foreground whitespace-pre-wrap" data-testid="text-content">
          {message.content}
        </p>
      )}
    </div>
  );
}
