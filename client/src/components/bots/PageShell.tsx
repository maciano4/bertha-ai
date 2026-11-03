import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function PageShell({ title, back = "/", backLabel = "Back to chat", actions, children }: {
  title: string; back?: string; backLabel?: string; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="chat-background min-h-screen">
      <header className="blur-backdrop sticky top-0 z-20 border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href={back} className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-foreground/10 hover:text-foreground" data-testid="link-back">
            <ArrowLeft className="h-4 w-4" /> <span>{backLabel}</span>
          </Link>
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
