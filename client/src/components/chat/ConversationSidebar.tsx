import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Compass, MessageSquarePlus, Plus, Trash2, X, Bot as BotIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import BotAvatar from "@/components/bots/BotAvatar";
import { BERTHA, toChatBot, type ChatBot, type OwnedBot } from "@/lib/bots";

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
  lastActivityAt: string | null;
  botId: string | null;
  botName: string | null;
  botAvatarEmoji: string | null;
  botAvatarUrl: string | null;
}

function when(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface Props {
  activeId: string | null;
  activeBot: ChatBot;
  onSelect: (conversation: ConversationSummary | null) => void;
  onSwitchBot: (bot: ChatBot) => void;
  open: boolean;
  onClose: () => void;
}

type BotChoice = { id: string | null; name: string; avatarEmoji: string | null; avatarUrl: string | null; full?: OwnedBot };

export default function ConversationSidebar({ activeId, activeBot, onSelect, onSwitchBot, open, onClose }: Props) {
  const cache = useQueryClient();
  const { toast } = useToast();
  const [showAll, setShowAll] = useState(false);
  const conversations = useQuery({
    queryKey: ["/api/conversations"],
    queryFn: async (): Promise<ConversationSummary[]> => (await apiRequest("GET", "/api/conversations")).json(),
  });
  const myBots = useQuery<OwnedBot[]>({ queryKey: ["/api/bots"] });

  // Bots shared with you that you've chatted with show up in the switcher too.
  const sharedBots = useMemo(() => {
    const mine = new Set((myBots.data || []).map(bot => bot.id));
    const seen = new Map<string, BotChoice>();
    for (const conversation of conversations.data || []) {
      if (conversation.botId && !mine.has(conversation.botId) && !seen.has(conversation.botId)) {
        seen.set(conversation.botId, { id: conversation.botId, name: conversation.botName || "Bot", avatarEmoji: conversation.botAvatarEmoji, avatarUrl: conversation.botAvatarUrl });
      }
    }
    if (activeBot.id && !mine.has(activeBot.id) && !seen.has(activeBot.id)) {
      seen.set(activeBot.id, { id: activeBot.id, name: activeBot.name, avatarEmoji: activeBot.avatarEmoji, avatarUrl: activeBot.avatarUrl });
    }
    return Array.from(seen.values()).slice(0, 8);
  }, [conversations.data, myBots.data, activeBot]);

  const visible = useMemo(() => (conversations.data || []).filter(item => showAll || (item.botId ?? null) === activeBot.id), [conversations.data, showAll, activeBot.id]);

  const remove = async (conversation: ConversationSummary) => {
    if (!confirm(`Delete "${conversation.title}"? This can't be undone.`)) return;
    try {
      await apiRequest("DELETE", `/api/conversations/${conversation.id}`);
      if (conversation.id === activeId) onSelect(null);
      cache.setQueryData<ConversationSummary[]>(["/api/conversations"], list => list?.filter(item => item.id !== conversation.id));
      cache.removeQueries({ queryKey: ["/api/conversations", conversation.id] });
    } catch {
      toast({ title: "Could not delete that chat", description: "Please try again.", variant: "destructive" });
    }
  };

  const pick = (conversation: ConversationSummary | null) => { onSelect(conversation); onClose(); };
  const switchTo = (choice: BotChoice) => {
    onSwitchBot(choice.full ? toChatBot(choice.full) : choice.id ? { ...BERTHA, id: choice.id, name: choice.name, avatarEmoji: choice.avatarEmoji || "🤖", avatarUrl: choice.avatarUrl } : BERTHA);
    onClose();
  };

  const choiceItem = (choice: BotChoice) => (
    <DropdownMenuItem key={choice.id ?? "bertha"} onSelect={() => switchTo(choice)} data-testid={`switch-bot-${choice.id ?? "bertha"}`}
      className={cn("gap-2", choice.id === activeBot.id && "bg-accent")}>
      <BotAvatar emoji={choice.avatarEmoji} url={choice.avatarUrl} name={choice.name} className="h-6 w-6 text-sm" />
      <span className="truncate">{choice.name}</span>
    </DropdownMenuItem>
  );

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          "blur-backdrop z-40 flex w-72 shrink-0 flex-col border-r border-border",
          "fixed inset-y-0 left-0 transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Your chats"
        data-testid="conversation-sidebar"
      >
        <div className="space-y-2 p-3">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex-1 justify-start gap-2 bg-background/40" data-testid="button-bot-switcher" aria-label={`Chatting with ${activeBot.name}. Switch bot`}>
                  <BotAvatar emoji={activeBot.avatarEmoji} url={activeBot.avatarUrl} name={activeBot.name} className="h-6 w-6 text-sm" />
                  <span className="truncate">{activeBot.name}</span>
                  <ChevronDown className="ml-auto h-4 w-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 max-h-[70vh] overflow-y-auto" align="start">
                <DropdownMenuLabel>Chat with</DropdownMenuLabel>
                {choiceItem({ id: null, name: "Bertha", avatarEmoji: null, avatarUrl: BERTHA.avatarUrl })}
                {(myBots.data?.length ?? 0) > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel>My bots</DropdownMenuLabel></>}
                {myBots.data?.map(bot => choiceItem({ id: bot.id, name: bot.name, avatarEmoji: bot.avatarEmoji, avatarUrl: bot.avatarUrl, full: bot }))}
                {sharedBots.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel>Shared with me</DropdownMenuLabel></>}
                {sharedBots.map(choiceItem)}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/bots/new" data-testid="link-new-bot-menu"><Plus className="mr-2 h-4 w-4" /> Create a bot</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/bots"><BotIcon className="mr-2 h-4 w-4" /> My bots</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/explore"><Compass className="mr-2 h-4 w-4" /> Explore bots</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={onClose} aria-label="Close chat list">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <Button className="w-full justify-start" onClick={() => pick(null)} data-testid="button-new-chat">
            <MessageSquarePlus className="mr-2 h-4 w-4" /> New chat{activeBot.id ? ` with ${activeBot.name}` : ""}
          </Button>
          <div className="flex rounded-md bg-foreground/5 p-0.5 text-xs" role="group" aria-label="Which chats to show">
            <button type="button" onClick={() => setShowAll(false)} aria-pressed={!showAll} data-testid="filter-this-bot"
              className={cn("flex-1 truncate rounded px-2 py-1", !showAll && "bg-background shadow-sm font-medium")}>{activeBot.name}</button>
            <button type="button" onClick={() => setShowAll(true)} aria-pressed={showAll} data-testid="filter-all-chats"
              className={cn("flex-1 rounded px-2 py-1", showAll && "bg-background shadow-sm font-medium")}>All chats</button>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {conversations.isLoading && <p className="px-2 py-3 text-sm text-muted-foreground">Loading your chats...</p>}
          {conversations.error && <p role="alert" className="px-2 py-3 text-sm text-destructive">Your chats could not be loaded. Reload to try again.</p>}
          {conversations.data && visible.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {showAll || !activeBot.id ? "No saved chats yet. Say hello to Bertha to start one." : `No chats with ${activeBot.name} yet. Say hello to start one.`}
            </p>
          )}
          <ul className="space-y-1">
            {visible.map(conversation => (
              <li key={conversation.id} className="group relative">
                <button
                  type="button"
                  onClick={() => pick(conversation)}
                  className={cn(
                    "w-full rounded-md px-3 py-2 pr-9 text-left transition-colors hover:bg-foreground/10",
                    conversation.id === activeId && "bg-foreground/15",
                  )}
                  aria-current={conversation.id === activeId ? "page" : undefined}
                  data-testid={`conversation-${conversation.id}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {showAll && (
                        <BotAvatar emoji={conversation.botId ? conversation.botAvatarEmoji : null} url={conversation.botId ? conversation.botAvatarUrl : BERTHA.avatarUrl}
                          name={conversation.botName || "Bertha"} className="h-4 w-4 text-[10px]" />
                      )}
                      <span className="truncate text-sm font-medium text-foreground">{conversation.title}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{when(conversation.lastActivityAt || conversation.updatedAt)}</span>
                  </div>
                  {conversation.lastMessage && <p className="truncate text-xs text-muted-foreground">{conversation.lastMessage}</p>}
                </button>
                <button
                  type="button"
                  onClick={() => remove(conversation)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground opacity-100 hover:bg-destructive/10 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Delete ${conversation.title}`}
                  data-testid={`button-delete-${conversation.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
