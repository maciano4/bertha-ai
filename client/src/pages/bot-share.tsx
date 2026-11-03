import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import BotCard from "@/components/bots/BotCard";
import BotAvatar from "@/components/bots/BotAvatar";
import AuthPage from "@/pages/auth";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import type { PublicBot } from "@/lib/bots";

// /b/<slug>: a shared bot's link. Signed in, the bot is added to your "Shared with me" list and
// its chat opens. Signed out, you see its card and are asked to sign up or log in first.
export default function BotSharePage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const bot = useQuery({
    queryKey: ["/api/public/bots", slug, user?.id ?? "guest"],
    queryFn: async (): Promise<PublicBot | null> => {
      const response = await fetch(`/api/public/bots/${encodeURIComponent(slug)}`, { credentials: "include" });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      return response.json();
    },
  });

  const cache = useQueryClient();
  const [addFailed, setAddFailed] = useState(false);
  const botData = bot.data;
  useEffect(() => {
    if (!user || !botData) return;
    let cancelled = false;
    (async () => {
      try {
        if (!botData.isOwner) await apiRequest("POST", "/api/bots/shared", { slug });
        if (cancelled) return;
        await cache.invalidateQueries({ queryKey: ["/api/bots/shared"] });
        navigate(`/?bot=${botData.id}`, { replace: true });
      } catch {
        if (!cancelled) setAddFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, botData?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user && botData && !addFailed) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground" role="status" data-testid="share-opening">Opening {botData.name}...</div>;
  }

  return (
    <main className={user ? "h-full overflow-y-auto px-4 py-10" : "chat-background min-h-[100dvh] px-4 py-10"}>
      <div className="mx-auto max-w-md space-y-5">
        {bot.isLoading && <p className="text-center text-muted-foreground" role="status">Loading...</p>}
        {bot.error && <p role="alert" className="text-center text-destructive">This page could not be loaded. Reload to try again.</p>}
        {bot.data === null && (
          <div className="rounded-2xl border border-border bg-card/80 p-6 text-center" data-testid="share-not-found">
            <h1 className="text-xl font-semibold">This bot isn't available</h1>
            <p className="mt-1 text-sm text-muted-foreground">The link may be wrong, or its creator stopped sharing it.</p>
            <Button className="mt-4" onClick={() => navigate("/")}>{user ? "Back to chat" : "Go to Bertha AI"}</Button>
          </div>
        )}
        {bot.data && (
          <>
            <BotCard name={bot.data.name} description={bot.data.description} avatarEmoji={bot.data.avatarEmoji} avatarUrl={bot.data.avatarUrl}
              creatorName={bot.data.isOwner ? "you" : bot.data.creatorName} className="p-6"
              footer={user ? (
                <>
                  <Button onClick={() => navigate(`/?bot=${bot.data!.id}`)} data-testid="button-start-chat"><MessageCircle className="mr-2 h-4 w-4" /> Start chatting</Button>
                  {bot.data.isOwner && <Button variant="outline" onClick={() => navigate(`/bots/${bot.data!.id}/edit`)}>Edit</Button>}
                </>
              ) : (
                <>
                  <Button onClick={() => setAuthMode("signup")} data-testid="button-share-signup">Sign up free to chat</Button>
                  <Button variant="outline" onClick={() => setAuthMode("login")} data-testid="button-share-login">Log in</Button>
                </>
              )}
            >
              {bot.data.greeting && (
                <div className="mt-4 flex gap-2">
                  <BotAvatar emoji={bot.data.avatarEmoji} url={bot.data.avatarUrl} name={bot.data.name} className="h-8 w-8 text-lg" />
                  <div className="rounded-2xl rounded-tl-sm bg-secondary/60 px-3 py-2 text-sm" data-testid="text-share-greeting">{bot.data.greeting}</div>
                </div>
              )}
              {bot.data.instructions && (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">{bot.data.isOwner ? "Instructions (only you can see these)" : "Instructions"}</summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-md bg-foreground/5 p-3" data-testid="text-share-instructions">{bot.data.instructions}</p>
                </details>
              )}
            </BotCard>
            {!user && authMode && (
              <AuthPage key={authMode} embedded initialMode={authMode}
                signupText={`Create a free account to chat with ${bot.data.name}. Your chats are private to you.`} />
            )}
            {!user && !authMode && <p className="text-center text-xs text-muted-foreground">Made with Bertha AI. You need a free account to chat, so your conversations are saved privately.</p>}
          </>
        )}
      </div>
    </main>
  );
}
