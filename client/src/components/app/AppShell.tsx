// The app frame: a persistent bot sidebar on the left (a slide-out drawer on phones) and the
// current page in the main pane. Fills the whole window; only the panes inside scroll.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import BotSidebar from "./BotSidebar";
import SettingsModal from "@/components/modals/SettingsModal";
import { cn } from "@/lib/utils";

interface AppShellValue {
  openSidebar: () => void;
  closeSidebar: () => void;
  openSettings: () => void;
  background: string | null;
}

const AppShellContext = createContext<AppShellValue | null>(null);
export const useAppShell = () => useContext(AppShellContext);

export default function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [background, setBackground] = useState<string | null>(() => localStorage.getItem("bertha-custom-background") || null);
  const [location] = useLocation();

  // Picking something in the drawer navigates; close the drawer whenever the page or chat changes.
  useEffect(() => { setDrawerOpen(false); }, [location]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const changeBackground = useCallback((url: string) => {
    setBackground(url || null);
    if (url) localStorage.setItem("bertha-custom-background", url);
    else localStorage.removeItem("bertha-custom-background");
  }, []);

  const value: AppShellValue = {
    openSidebar: () => setDrawerOpen(true),
    closeSidebar: () => setDrawerOpen(false),
    openSettings: () => setSettingsOpen(true),
    background,
  };

  return (
    <AppShellContext.Provider value={value}>
      <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground" data-testid="app-shell">
        {/* Phone drawer backdrop */}
        <div
          className={cn("fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity md:hidden", drawerOpen ? "opacity-100" : "pointer-events-none opacity-0")}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
          data-testid="drawer-overlay"
        />
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[min(20rem,86vw)] flex-col border-r border-border bg-sidebar shadow-2xl transition-transform duration-200 ease-out",
            "md:static md:z-auto md:w-72 md:translate-x-0 md:shadow-none",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-label="Your bots and chats"
          data-testid="sidebar"
          data-open={drawerOpen ? "true" : "false"}
        >
          <BotSidebar onClose={() => setDrawerOpen(false)} />
        </aside>
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden" data-testid="main-pane">{children}</main>
      </div>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onBackgroundChange={changeBackground} />
    </AppShellContext.Provider>
  );
}
