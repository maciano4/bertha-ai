import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft, Menu } from "lucide-react";
import { useAppShell } from "@/components/app/AppShell";

/** A full-height page inside the app's main pane (editor, manage bots...). Scrolls on its own. */
export default function PageShell({ title, back = "/", backLabel = "Back to chat", actions, children }: {
  title: string; back?: string; backLabel?: string; actions?: ReactNode; children: ReactNode;
}) {
  const shell = useAppShell();
  return (
    <div className="h-full overflow-y-auto overscroll-contain" data-testid="page-shell">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-3 py-2.5 sm:px-5">
          {shell && (
            <button type="button" onClick={shell.openSidebar} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground/80 hover:bg-accent md:hidden" aria-label="Open sidebar" data-testid="button-open-sidebar">
              <Menu className="h-5 w-5" />
            </button>
          )}
          <Link href={back} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground" data-testid="link-back">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">{backLabel}</span>
          </Link>
          <h1 className="min-w-0 truncate text-lg font-semibold text-foreground">{title}</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-5" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>{children}</main>
    </div>
  );
}
