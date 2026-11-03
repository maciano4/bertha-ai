import { Message } from "@/hooks/useChat";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Check, Copy } from "lucide-react";
import { copyText, copyToClipboard, splitDraft } from "@/lib/drafts";
import BotAvatar from "@/components/bots/BotAvatar";
import { BERTHA, type ChatBot } from "@/lib/bots";

function CopyButton({ text, label = "Copy", testId }: { text: string; label?: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (event) => {
        event.stopPropagation();
        if (await copyToClipboard(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={copied ? "Copied" : label}
      data-testid={testId}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

// Shows Bertha's reply; a finished draft (between --- lines) gets its own box.
function AssistantContent({ content, canCopy }: { content: string; canCopy: boolean }) {
  const { before, draft, after } = splitDraft(content);
  return (
    <>
      {before && <p className="text-foreground whitespace-pre-wrap" data-testid="text-content">{before}</p>}
      {draft && (
        <div className="mt-2 rounded-md border border-border bg-background/70 p-3" data-testid="draft-block">
          <p className="text-foreground whitespace-pre-wrap">{draft}</p>
        </div>
      )}
      {after && <p className="mt-2 text-foreground whitespace-pre-wrap">{after}</p>}
      {canCopy && content.trim() && (
        <div className="mt-2 flex justify-end">
          <CopyButton text={copyText(content)} label={draft ? "Copy draft" : "Copy"} testId="button-copy" />
        </div>
      )}
    </>
  );
}

interface MessageBubbleProps {
  message: Message;
  showAvatar?: boolean;
  assistant?: ChatBot;
}

export default function MessageBubble({ message, showAvatar, assistant = BERTHA }: MessageBubbleProps) {
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
      "message-bubble min-w-0 break-words p-4 rounded-lg shadow-sm",
      isUser ? "user-message ml-auto" : "ai-message"
    )}>
      {!isUser && showAvatar ? (
        <div className="flex items-start gap-3">
          {userProfilePicture ? (
            <img
              src={userProfilePicture}
              alt={`${message.metadata?.recognizedUser}'s profile`}
              className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
              data-testid="img-avatar"
            />
          ) : (
            <BotAvatar emoji={assistant.avatarEmoji} url={assistant.avatarUrl} name={assistant.name} className="w-8 h-8 text-lg" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-medium text-sm text-muted-foreground">
                {message.metadata?.recognizedUser ? `${assistant.name} (talking to ${message.metadata.recognizedUser})` : assistant.id ? assistant.name : "Bertha AI"}
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
            <AssistantContent content={message.content} canCopy={message.id !== "welcome"} />
            {message.metadata?.searchUsed && (
              <div className="text-xs text-muted-foreground border-l-2 border-accent pl-3 mt-3">
                <p className="font-medium mb-1">💡 Enhanced with Web Search</p>
                <p>Information gathered from web sources to provide you with the most current data.</p>
              </div>
            )}
          </div>
        </div>
      ) : isUser ? (
        <p className="text-foreground whitespace-pre-wrap" data-testid="text-content">
          {message.content}
        </p>
      ) : (
        <AssistantContent content={message.content} canCopy={message.id !== "welcome"} />
      )}
    </div>
  );
}
