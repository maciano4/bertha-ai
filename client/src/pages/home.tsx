import { useState, useEffect } from "react";
import ChatInterface from "@/components/chat/ChatInterface";
import CameraPanel from "@/components/panels/CameraPanel";
import SettingsPanel from "@/components/panels/SettingsPanel";
import ActivityPanel from "@/components/panels/ActivityPanel";
import SettingsModal from "@/components/modals/SettingsModal";
import { Button } from "@/components/ui/button";
import { Settings, Trash2, LayoutDashboard, CalendarDays } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customBackground, setCustomBackground] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("conversation"));

  // Load custom background from localStorage
  useEffect(() => {
    const savedBackground = localStorage.getItem("bertha-custom-background");
    if (savedBackground) {
      setCustomBackground(savedBackground);
    }
  }, []);

  const handleClearConversation = () => {
    if (confirm("Clear all conversation history?")) {
      setConversationId(null);
      // The ChatInterface component will handle clearing its internal state
      window.location.reload();
    }
  };

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
        {/* Chat Container */}
        <div className="flex-1 min-w-0 flex flex-col lg:mr-80">
          {/* Header */}
          <header className="blur-backdrop border-b border-border p-4 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Bertha AI Avatar */}
              <div className="relative">
                <img 
                  src="https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=150&h=150&fit=crop" 
                  alt="Bertha AI Assistant Avatar" 
                  className="w-12 h-12 rounded-full border-2 border-primary shadow-lg object-cover"
                />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-accent rounded-full border-2 border-white dark:border-black"></div>
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Bertha AI</h1>
                <p className="text-sm text-muted-foreground">Intelligent Assistant • Online</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
                onClick={handleClearConversation}
                data-testid="button-clear"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          </header>

          {/* Chat Interface */}
          <ChatInterface 
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
