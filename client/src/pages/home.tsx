// The chat pane: header for whichever bot is open, then the conversation.
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu, SquarePen, Share2, Settings2, Settings, CalendarDays } from "lucide-react";
import ChatInterface from "@/components/chat/ChatInterface";
import ShareDialog from "@/components/app/ShareDialog";
import { useAppShell } from "@/components/app/AppShell";
import BotAvatar from "@/components/bots/BotAvatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiErrorInfo } from "@/lib/apiError";
import { useToast } from "@/hooks/use-toast";
import { BERTHA, toChatBot, type ChatBot, type OwnedBot, type PublicBot } from "@/lib/bots";
import { useChatNav, type ConversationSummary } from "@/lib/chatNav";
import { cn } from "@/lib/utils";

function HeaderButton({ label, onClick, href, testId, children }: { label: string; onClick?: () => void; href?: string; testId: string; children: React.ReactNode }) {
  const className = "inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground/75 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href
          ? <Link href={href} className={className} aria-label={label} data-testid={testId}>{children}</Link>
          : <button type="button" onClick={onClick} className={className} aria-label={label} data-testid={testId}>{children}</button>}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function Home() {
  const nav = useChatNav();
  const { botId, conversationId } = nav;
  const shell = useAppShell();
  const cache = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [shareOpen, setShareOpen] = useState(false);

  const conversations = useQuery<ConversationSummary[]>({ queryKey: ["/api/conversations"] });
  const myBots = useQuery<OwnedBot[]>({ queryKey: ["/api/bots"] });
  const sharedBots = useQuery<PublicBot[]>({ queryKey: ["/api/bots/shared"] });
  const activeConversation = conversations.data?.find(item => item.id === conversationId);

  // A ?conversation= link whose bot differs from ?bot=: follow the conversation's bot.
  useEffect(() => {
    if (activeConversation && (activeConversation.botId ?? null) !== botId) nav.open(activeConversation.botId ?? null, activeConversation.id, true);
  }, [activeConversation?.id, activeConversation?.botId]); // eslint-disable-line react-hooks/exhaustive-deps

  const botQuery = useQuery<PublicBot>({ queryKey: ["/api/bots", botId], enabled: !!botId, retry: false });
  useEffect(() => {
    if (!botId || !botQuery.error) return;
    const info = apiErrorInfo(botQuery.error);
    if (info.status === 401) return;
    if (!conversationId) {
      toast({ title: "That bot isn't available", description: "Its creator may have stopped sharing it or deleted it. You're chatting with Bertha.", variant: "destructive" });
      nav.open(null, null, true);
    }
  }, [botQuery.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const listed = botId ? (myBots.data?.find(bot => bot.id === botId) ?? sharedBots.data?.find(bot => bot.id === botId)) : undefined;
  const card: PublicBot | undefined = botQuery.data ?? listed;
  const activeBot: ChatBot = !botId
    ? BERTHA
    : card
    ? toChatBot(card)
    : { ...BERTHA, id: botId, name: activeConversation?.botName || "Bot", avatarEmoji: activeConversation?.botAvatarEmoji || "🤖", avatarUrl: activeConversation?.botAvatarUrl || null };
  const unavailable = !!botId && !!botQuery.error;
  const isOwner = !!card?.isOwner;

  const onConversationStart = useCallback((id: string) => {
    nav.open(botId, id, true);
    // Chatting with a shared bot adds it to "Shared with me".
    if (botId) cache.invalidateQueries({ queryKey: ["/api/bots/shared"] });
  }, [botId, nav, cache]);

  const subtitle = !botId
    ? "Your assistant"
    : unavailable
    ? "No longer available. You can still read this chat."
    : card?.description || (card?.creatorName && !isOwner ? `by ${card.creatorName}` : isOwner ? "Your bot" : "Shared with you");

  return (
    <div className="relative flex h-full min-h-0 flex-col chat-background" data-testid="chat-pane">
      {shell?.background && (
        <div className="custom-background pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: `url(${shell.background})` }} aria-hidden="true" />
      )}
      <header className="relative z-10 flex items-center gap-2 border-b border-border/70 bg-background/70 px-2 py-2 backdrop-blur-xl sm:px-4"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <button type="button" onClick={shell?.openSidebar} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground/80 hover:bg-accent md:hidden" aria-label="Open sidebar" data-testid="button-open-sidebar">
          <Menu className="h-5 w-5" />
        </button>
        <BotAvatar emoji={activeBot.avatarEmoji} url={activeBot.avatarUrl} name={activeBot.name} className="h-9 w-9 text-xl ring-1 ring-border" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold leading-tight text-foreground" data-testid="text-active-bot">{activeBot.name}</h1>
          <p className={cn("truncate text-xs text-muted-foreground", unavailable && "text-destructive/80")} data-testid="text-bot-subtitle">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <HeaderButton label="New chat" onClick={() => nav.open(botId, null)} testId="button-clear"><SquarePen className="h-[18px] w-[18px]" /></HeaderButton>
          {!botId && <HeaderButton label="Appointments" href="/appointments" testId="button-appointments"><CalendarDays className="h-[18px] w-[18px]" /></HeaderButton>}
          {card && !unavailable && (card.isOwner || card.visibility !== "private") && (
            <HeaderButton label="Share" onClick={() => setShareOpen(true)} testId="button-share"><Share2 className="h-[18px] w-[18px]" /></HeaderButton>
          )}
          {!botId && <HeaderButton label="Voice and settings" onClick={shell?.openSettings} testId="button-chat-settings"><Settings2 className="h-[18px] w-[18px]" /></HeaderButton>}
          {isOwner && <HeaderButton label="Bot settings" href={`/bots/${botId}/edit`} testId="button-bot-settings"><Settings className="h-[18px] w-[18px]" /></HeaderButton>}
        </div>
      </header>

      <div className="relative z-0 flex min-h-0 flex-1 flex-col">
        <ChatInterface key={activeBot.id ?? "bertha"} bot={activeBot} conversationId={conversationId} onConversationStart={onConversationStart} />
      </div>

      {card && <ShareDialog bot={card} open={shareOpen} onOpenChange={setShareOpen} onRemoved={() => navigate("/")} />}
    </div>
  );
}
