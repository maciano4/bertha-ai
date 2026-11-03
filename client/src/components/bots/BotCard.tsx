import type { ReactNode } from "react";
import BotAvatar from "./BotAvatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Visibility } from "@/lib/bots";

const visibilityLabel: Record<Visibility, string> = { private: "Private", link: "Anyone with the link" };

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  return <Badge variant={visibility === "link" ? "default" : "secondary"} data-testid="badge-visibility">{visibilityLabel[visibility] ?? "Anyone with the link"}</Badge>;
}

export default function BotCard({ name, description, avatarEmoji, avatarUrl, creatorName, visibility, footer, className, children }: {
  name: string; description?: string | null; avatarEmoji?: string | null; avatarUrl?: string | null; creatorName?: string | null;
  visibility?: Visibility; footer?: ReactNode; className?: string; children?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col rounded-2xl border border-border bg-background/90 p-5 shadow-sm", className)} data-testid="bot-card">
      <div className="flex items-start gap-3">
        <BotAvatar emoji={avatarEmoji} url={avatarUrl} name={name || "Bot"} className="h-14 w-14 text-3xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-foreground" data-testid="text-bot-name">{name || "Untitled bot"}</h2>
            {visibility && <VisibilityBadge visibility={visibility} />}
          </div>
          {creatorName && <p className="text-xs text-muted-foreground">by {creatorName}</p>}
          {description && <p className="mt-1 text-sm text-muted-foreground line-clamp-3" data-testid="text-bot-description">{description}</p>}
        </div>
      </div>
      {children}
      {footer && <div className="mt-4 flex flex-wrap gap-2">{footer}</div>}
    </div>
  );
}
