// Left sidebar: Bertha first, then your bots, then bots shared with you. The open bot expands
// to show its chats. Account, usage, appointments and "Install app" sit at the bottom.
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Search, ChevronRight, SquarePen, Trash2, CalendarDays, LogOut, Settings, Bot as BotIcon, ChevronsUpDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import BotAvatar from "@/components/bots/BotAvatar";
import InstallApp from "./InstallApp";
import { useAppShell } from "./AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { BERTHA, type OwnedBot, type PublicBot } from "@/lib/bots";
import { useChatNav, type ConversationSummary } from "@/lib/chatNav";
import { cn } from "@/lib/utils";

type Usage = { plan: string; enforced: boolean; bots: { used: number; limit: number }; messagesToday: { used: number; ai: number; limit: number } };
interface Row { id: string | null; name: string; avatarEmoji: string | null; avatarUrl: string | null; unavailable?: boolean }

const CHATS_SHOWN = 6;

// "now", "5m", "3h", "Tue", "Mar 4": short, like a messaging app.
export function lastActive(iso?: string | Date | null, now = new Date()) {
  if (!iso) return "";
  const t = new Date(iso); const mins = (now.getTime() - t.getTime()) / 60000;
  if (Number.isNaN(mins)) return "";
  if (mins < 1) return "now";
  if (mins < 60) return `${Math.floor(mins)}m`;
  if (mins < 24 * 60 && t.getDate() === now.getDate()) return `${Math.floor(mins / 60)}h`;
  if (mins < 48 * 60 && new Date(now.getTime() - 86400000).getDate() === t.getDate()) return "Yesterday";
  if (mins < 7 * 24 * 60) return t.toLocaleDateString(undefined, { weekday: "short" });
  return t.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type SearchHit = ConversationSummary & { snippet?: string; botName?: string | null };

export default function BotSidebar({ onClose }: { onClose: () => void }) {
  const nav = useChatNav();
  const [location] = useLocation();
  const shell = useAppShell();
  const { user, logout } = useAuth();
  const cache = useQueryClient();
  const { toast } = useToast();

  const myBots = useQuery<OwnedBot[]>({ queryKey: ["/api/bots"] });
  const shared = useQuery<PublicBot[]>({ queryKey: ["/api/bots/shared"] });
  const conversations = useQuery<ConversationSummary[]>({ queryKey: ["/api/conversations"] });
  const usage = useQuery<Usage>({ queryKey: ["/api/usage"] });
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim()), 250); return () => clearTimeout(t); }, [query]);
  const search = useQuery<SearchHit[]>({
    queryKey: ["/api/conversations", "search", debounced],
    enabled: debounced.length > 0,
    queryFn: async () => (await apiRequest("GET", `/api/conversations?q=${encodeURIComponent(debounced)}`)).json(),
  });

  const chatsByBot = useMemo(() => {
    const map = new Map<string, ConversationSummary[]>();
    for (const item of conversations.data || []) {
      const key = item.botId ?? "bertha";
      map.set(key, [...(map.get(key) || []), item]);
    }
    return map;
  }, [conversations.data]);

  const mine: Row[] = useMemo(() => (myBots.data || []).map(bot => ({ id: bot.id, name: bot.name, avatarEmoji: bot.avatarEmoji, avatarUrl: bot.avatarUrl })), [myBots.data]);
  const sharedRows: Row[] = useMemo(() => {
    const rows: Row[] = (shared.data || []).map(bot => ({ id: bot.id, name: bot.name, avatarEmoji: bot.avatarEmoji, avatarUrl: bot.avatarUrl }));
    // Old chats with a bot that has since gone private (or was deleted) stay readable.
    const known = new Set([...rows.map(row => row.id), ...mine.map(row => row.id)]);
    for (const item of conversations.data || []) {
      if (!item.botId || known.has(item.botId) || !myBots.data || !shared.data) continue;
      known.add(item.botId);
      rows.push({ id: item.botId, name: item.botName || "Bot", avatarEmoji: item.botAvatarEmoji, avatarUrl: item.botAvatarUrl, unavailable: true });
    }
    return rows;
  }, [shared.data, conversations.data, mine, myBots.data]);

  const activeKey = nav.onChat ? (nav.botId ?? "bertha") : null;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(activeKey ? [activeKey] : []));
  const [showAll, setShowAll] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (activeKey) setExpanded(current => current.has(activeKey) ? current : new Set(current).add(activeKey));
  }, [activeKey]);

  const toggle = (key: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Clicking a bot reopens your latest chat with it (or starts one).
  const openBot = (row: Row) => {
    const key = row.id ?? "bertha";
    setExpanded(current => new Set(current).add(key));
    if (activeKey === key) { onClose(); return; }
    const latest = chatsByBot.get(key)?.[0];
    nav.open(row.id, latest?.id ?? null);
  };

  const removeChat = async (conversation: ConversationSummary) => {
    if (!confirm(`Delete "${conversation.title}"? This can't be undone.`)) return;
    try {
      await apiRequest("DELETE", `/api/conversations/${conversation.id}`);
      cache.setQueryData<ConversationSummary[]>(["/api/conversations"], list => list?.filter(item => item.id !== conversation.id));
      cache.removeQueries({ queryKey: ["/api/conversations", conversation.id] });
      if (nav.conversationId === conversation.id) nav.open(conversation.botId, null, true);
    } catch {
      toast({ title: "Could not delete that chat", description: "Please try again.", variant: "destructive" });
    }
  };

  const renderRow = (row: Row) => {
    const key = row.id ?? "bertha";
    const isActive = activeKey === key;
    const isOpen = expanded.has(key);
    const chats = chatsByBot.get(key) || [];
    const visible = showAll.has(key) ? chats : chats.slice(0, CHATS_SHOWN);
    return (
      <li key={key} data-testid={`sidebar-bot-${key}`}>
        <div className={cn("group flex items-center rounded-lg pr-1 transition-colors", isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60")}>
          <button type="button" onClick={() => openBot(row)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            aria-current={isActive ? "page" : undefined} data-testid={`button-open-bot-${key}`}>
            <BotAvatar emoji={row.id ? row.avatarEmoji : null} url={row.avatarUrl} name={row.name} className="h-7 w-7 text-base" />
            <span className={cn("truncate font-medium", row.unavailable && "text-muted-foreground")}>{row.name}</span>
            {row.unavailable && <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">off</span>}
          </button>
          <button type="button" onClick={() => toggle(key)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} chats with ${row.name}`} data-testid={`toggle-chats-${key}`}>
            <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
          </button>
        </div>
        {isOpen && (
          <ul className="mb-1 ml-[1.15rem] mt-0.5 space-y-px border-l border-sidebar-border pl-2" data-testid={`chats-${key}`}>
            {!row.unavailable && (
              <li>
                <button type="button" onClick={() => nav.open(row.id, null)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground", isActive && !nav.conversationId && "bg-sidebar-accent/60 text-foreground")}
                  data-testid={`new-chat-${key}`}>
                  <SquarePen className="h-3.5 w-3.5" /> New chat
                </button>
              </li>
            )}
            {visible.map(chat => {
              const current = nav.conversationId === chat.id;
              return (
                <li key={chat.id} className={cn("group/chat flex items-center rounded-md", current ? "bg-sidebar-accent text-foreground" : "text-foreground/75 hover:bg-sidebar-accent/60 hover:text-foreground")}>
                  <button type="button" onClick={() => nav.open(row.id, chat.id)} className="min-w-0 flex-1 truncate px-2 py-1 text-left text-[13px]" title={chat.title}
                    aria-current={current ? "page" : undefined} data-testid={`conversation-${chat.id}`}>
                    {chat.title || "New chat"}
                  </button>
                  <span className="shrink-0 pr-1 text-[10px] tabular-nums text-muted-foreground md:group-hover/chat:hidden" data-testid={`last-active-${chat.id}`}>{lastActive(chat.lastActivityAt)}</span>
                  <button type="button" onClick={() => removeChat(chat)} className="mr-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 hover:text-destructive md:opacity-0 md:group-hover/chat:opacity-100 md:focus:opacity-100"
                    aria-label={`Delete chat ${chat.title}`} data-testid={`delete-conversation-${chat.id}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
            {chats.length > CHATS_SHOWN && (
              <li>
                <button type="button" onClick={() => setShowAll(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                  {showAll.has(key) ? "Show fewer" : `Show ${chats.length - CHATS_SHOWN} more`}
                </button>
              </li>
            )}
            {chats.length === 0 && row.unavailable && <li className="px-2 py-1 text-xs text-muted-foreground">No chats</li>}
          </ul>
        )}
      </li>
    );
  };

  const initials = (user?.displayName || user?.email || "?").trim().slice(0, 1).toUpperCase();

  return (
    <div className="flex h-full flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <img src="/icons/icon-192.png" alt="" className="h-7 w-7 rounded-lg" />
        <span className="text-[15px] font-semibold tracking-tight">Bertha</span>
        <button type="button" onClick={onClose} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:hidden" aria-label="Close sidebar" data-testid="button-close-sidebar">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="px-3 pb-2">
        <Link href="/bots/new" className={cn("flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/50 text-sm font-medium hover:bg-sidebar-accent", location === "/bots/new" && "bg-sidebar-accent")} data-testid="button-new-bot">
          <Plus className="h-4 w-4" /> New bot
        </Link>
      </div>

      <div className="px-3 pb-2">
        <label className="relative block">
          <span className="sr-only">Search chats</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search chats"
            className="h-8 w-full rounded-lg border border-sidebar-border bg-background/60 pl-8 pr-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring" data-testid="input-search-chats" />
        </label>
      </div>

      {query.trim() ? (
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3" aria-label="Search results" data-testid="search-results">
          {search.isLoading || debounced !== query.trim() ? <p className="px-2 py-1 text-xs text-muted-foreground">Searching…</p>
            : !search.data?.length ? <p className="px-2 py-1 text-xs text-muted-foreground" data-testid="search-empty">No chats match "{query.trim()}"</p>
            : (
              <ul className="space-y-0.5">
                {search.data.map(hit => (
                  <li key={hit.id}>
                    <button type="button" onClick={() => { nav.open(hit.botId ?? null, hit.id); setQuery(""); }}
                      className={cn("w-full rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent/60", nav.conversationId === hit.id && "bg-sidebar-accent")} data-testid={`search-hit-${hit.id}`}>
                      <span className="flex items-center gap-2 text-[13px] font-medium"><span className="min-w-0 flex-1 truncate">{hit.title || "New chat"}</span><span className="shrink-0 text-[10px] font-normal text-muted-foreground">{lastActive(hit.lastActivityAt)}</span></span>
                      <span className="block truncate text-xs text-muted-foreground">{hit.botName ? `${hit.botName} · ` : ""}{hit.snippet}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </nav>
      ) : (
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3" aria-label="Bots">
        <ul className="space-y-0.5" data-testid="sidebar-my-bots">
          {renderRow({ id: null, name: BERTHA.name, avatarEmoji: null, avatarUrl: BERTHA.avatarUrl })}
          {mine.map(renderRow)}
        </ul>
        {myBots.isSuccess && mine.length === 0 && (
          <p className="px-2 pt-2 text-xs text-muted-foreground">Make your own bot with <span className="font-medium text-foreground/80">+ New bot</span>: give it a personality and a voice, then share a link.</p>
        )}
        {sharedRows.length > 0 && (
          <>
            <h2 className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" data-testid="heading-shared">Shared with me</h2>
            <ul className="space-y-0.5" data-testid="sidebar-shared-bots">{sharedRows.map(renderRow)}</ul>
          </>
        )}
      </nav>
      )}

      <div className="space-y-0.5 border-t border-sidebar-border p-2">
        <InstallApp />
        <Link href="/appointments" className={cn("flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm text-foreground/80 hover:bg-sidebar-accent hover:text-foreground", location === "/appointments" && "bg-sidebar-accent text-foreground")} data-testid="link-appointments">
          <CalendarDays className="h-4 w-4" /> Appointments
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring" data-testid="button-account">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-sm font-semibold text-white">{initials}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" data-testid="text-signed-in">{user?.displayName || user?.email}</span>
                <span className="block truncate text-xs text-muted-foreground" data-testid="text-usage">
                  {usage.data ? `${usage.data.messagesToday.used}${usage.data.enforced ? `/${usage.data.messagesToday.limit}` : ""} ${usage.data.messagesToday.used === 1 && !usage.data.enforced ? "message" : "messages"} today` : user?.email}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm font-medium">{user?.displayName || "Your account"}</span>
              <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
            </DropdownMenuLabel>
            {usage.data && (
              <div className="px-2 pb-2 text-xs text-muted-foreground" data-testid="text-usage-detail">
                {usage.data.bots.used} bot{usage.data.bots.used === 1 ? "" : "s"}{usage.data.enforced ? ` of ${usage.data.bots.limit}` : ""} · {usage.data.messagesToday.used} message{usage.data.messagesToday.used === 1 ? "" : "s"} today{usage.data.enforced ? ` of ${usage.data.messagesToday.limit}` : ""}
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/bots" data-testid="link-manage-bots"><BotIcon className="mr-2 h-4 w-4" /> Manage my bots</Link></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => shell?.openSettings()} data-testid="button-settings"><Settings className="mr-2 h-4 w-4" /> Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => logout()} data-testid="button-logout"><LogOut className="mr-2 h-4 w-4" /> Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
