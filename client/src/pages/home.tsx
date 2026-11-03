import { useState, useEffect } from "react";
import ChatInterface from "@/components/chat/ChatInterface";
import CameraPanel from "@/components/panels/CameraPanel";
import SettingsPanel from "@/components/panels/SettingsPanel";
import ActivityPanel from "@/components/panels/ActivityPanel";
import SettingsModal from "@/components/modals/SettingsModal";
import { Button } from "@/components/ui/button";
import { Settings, LayoutDashboard, CalendarDays, LogOut, Menu, MessageSquarePlus, Bot as BotIcon, Compass } from "lucide-react";
import ConversationSidebar, { type ConversationSummary } from "@/components/chat/ConversationSidebar";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorInfo } from "@/lib/apiError";
import { useToast } from "@/hooks/use-toast";
import BotAvatar from "@/components/bots/BotAvatar";
import { BERTHA, toChatBot, type ChatBot, type PublicBot } from "@/lib/bots";

const navLink = "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export default function Home() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customBackground, setCustomBackground] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("conversation"));
  // Which bot answers: null = Bertha. Comes from ?bot=, the bot switcher, or the opened conversation.
  const [botId, setBotId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("bot"));
  const [botHint, setBotHint] = useState<ChatBot | null>(null);
  const { toast } = useToast();

  const conversations = useQuery({
    queryKey: ["/api/conversations"],
    queryFn: async (): Promise<ConversationSummary[]> => (await apiRequest("GET", "/api/conversations")).json(),
  });
  const activeConversation = conversations.data?.find(item => item.id === conversationId);
  // A reloaded ?conversation= link: follow the bot that conversation belongs to.
  useEffect(() => {
    if (activeConversation && (activeConversation.botId ?? null) !== botId) setBotId(activeConversation.botId ?? null);
  }, [activeConversation?.id, activeConversation?.botId]); // eslint-disable-line react-hooks/exhaustive-deps

  const botQuery = useQuery({
    queryKey: ["/api/bots", botId],
    enabled: !!botId,
    queryFn: async (): Promise<PublicBot> => (await apiRequest("GET", `/api/bots/${botId}`)).json(),
  });
  useEffect(() => {
    if (!botId || !botQuery.error) return;
    const info = apiErrorInfo(botQuery.error);
    if (info.status === 401) return;
    if (!conversationId) {
      toast({ title: "That bot isn't available", description: "Its creator may have stopped sharing it or deleted it. You're chatting with Bertha.", variant: "destructive" });
      setBotId(null);
      setBotHint(null);
    }
  }, [botQuery.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const fallbackName = activeConversation?.botName;
  const activeBot: ChatBot = !botId
    ? BERTHA
    : botQuery.data
    ? toChatBot(botQuery.data)
    : botHint?.id === botId
    ? botHint
    : { ...BERTHA, id: botId, name: fallbackName || "Bot", avatarEmoji: activeConversation?.botAvatarEmoji || "🤖", avatarUrl: activeConversation?.botAvatarUrl || null };

  const selectConversation = (conversation: ConversationSummary | null) => {
    setConversationId(conversation?.id ?? null);
    if (conversation) setBotId(conversation.botId ?? null);
  };
  const switchBot = (bot: ChatBot) => {
    setBotHint(bot);
    if (bot.id !== botId) setConversationId(null);
    setBotId(bot.id);
  };

  // Load custom background from localStorage
  useEffect(() => {
    const savedBackground = localStorage.getItem("bertha-custom-background");
    if (savedBackground) {
      setCustomBackground(savedBackground);
    }
  }, []);

  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Keep ?conversation= in the address bar so a reload reopens the same chat.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (conversationId) url.searchParams.set("conversation", conversationId);
    else url.searchParams.delete("conversation");
    if (botId) url.searchParams.set("bot", botId);
    else url.searchParams.delete("bot");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [conversationId, botId]);

  const handleBackgroundChange = (backgroundUrl: string) => {
    setCustomBackground(backgroundUrl);
    localStorage.setItem("bertha-custom-background", backgroundUrl);
  };

  return (
    <div className="chat-background min-h-screen relative">
      {/* Custom Background Overlay */}
      {customBackground && (
        <div 
          className="fixed inset-0 opacity-30 pointer-events-none custom-background"
          style={{ backgroundImage: `url(${customBackground})` }}
        />
      )}
      
      {/* Default Technology Background */}
      {!customBackground && (
        <div 
          className="fixed inset-0 opacity-20 pointer-events-none"
          style={{ 
            backgroundImage: "url('https://images.unsplash.com/photo-1518709268805-4e9042af2176?q=80&w=1000')",
            backgroundSize: "cover",
            backgroundPosition: "center"
          }}
        />
      )}

      {/* Main Chat Interface */}
      <div className="relative z-10 flex h-screen">
        <ConversationSidebar
          activeId={conversationId}
          activeBot={activeBot}
          onSelect={selectConversation}
          onSwitchBot={switchBot}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Chat Container */}
        <div className="flex-1 min-w-0 flex flex-col lg:mr-80">
          {/* Header */}
          <header className="blur-backdrop border-b border-border p-4 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Show your chats" data-testid="button-open-sidebar">
                <Menu className="h-5 w-5" />
              </Button>
              {/* Avatar of whoever is answering (Bertha or a custom bot) */}
              <div className="relative">
                <BotAvatar emoji={activeBot.avatarEmoji} url={activeBot.avatarUrl} name={activeBot.name}
                  className="w-12 h-12 border-2 border-primary shadow-lg text-2xl" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-accent rounded-full border-2 border-white dark:border-black"></div>
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground" data-testid="text-active-bot">{activeBot.id ? activeBot.name : "Bertha AI"}</h1>
                <p className="text-sm text-muted-foreground truncate max-w-[14rem]" data-testid="text-signed-in">
                  {user ? `Signed in as ${user.displayName || user.email}` : "Intelligent Assistant"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              <Link href="/bots" className={navLink} aria-label="My bots" data-testid="link-my-bots">
                <BotIcon className="h-4 w-4" />
                <span className="hidden sm:inline">My Bots</span>
              </Link>
              <Link href="/explore" className={navLink} aria-label="Explore bots" data-testid="link-explore">
                <Compass className="h-4 w-4" />
                <span className="hidden sm:inline">Explore</span>
              </Link>
              <Link href="/appointments" className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Open appointments">
                <CalendarDays className="h-4 w-4" />
                <span className="hidden sm:inline">Appointments</span>
              </Link>
              <Link href="/dashboard" className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Open conversation dashboard">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSettingsOpen(true)}
                data-testid="button-settings"
              >
                <Settings className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConversationId(null)}
                aria-label="New chat"
                title="New chat"
                data-testid="button-clear"
              >
                <MessageSquarePlus className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => logout()}
                aria-label="Log out"
                title="Log out"
                data-testid="button-logout"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </header>

          {/* Chat Interface */}
          <ChatInterface
            key={activeBot.id ?? "bertha"}
            bot={activeBot}
            conversationId={conversationId}
            onConversationStart={setConversationId}
          />
        </div>

        {/* Desktop Floating Panels */}
        <div className="floating-panels hidden lg:block">
          <CameraPanel />
          <SettingsPanel onBackgroundChange={handleBackgroundChange} />
          <ActivityPanel />
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onBackgroundChange={handleBackgroundChange}
      />
    </div>
  );
}
