import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { MessageCircle, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageShell from "@/components/bots/PageShell";
import BotCard from "@/components/bots/BotCard";
import { apiRequest } from "@/lib/queryClient";
import type { PublicBot } from "@/lib/bots";

export default function ExplorePage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const bots = useQuery({
    queryKey: ["/api/bots/explore", query],
    queryFn: async (): Promise<PublicBot[]> => (await apiRequest("GET", `/api/bots/explore?q=${encodeURIComponent(query)}`)).json(),
    staleTime: 30_000,
  });

  return (
    <PageShell title="Explore bots" actions={<Button onClick={() => navigate("/bots/new")}><Plus className="mr-2 h-4 w-4" /> Create a bot</Button>}>
      <div className="relative mb-5 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search public bots" aria-label="Search public bots" data-testid="input-explore-search" />
      </div>
      {bots.isLoading && <p className="text-muted-foreground">Loading bots...</p>}
      {bots.error && <p role="alert" className="text-destructive">Bots could not be loaded. Reload to try again.</p>}
      {bots.data?.length === 0 && (
        <p className="text-muted-foreground" data-testid="explore-empty">
          {query ? `No public bots match "${query}".` : "No public bots yet."} <Link href="/bots/new" className="text-primary underline">Make one and share it.</Link>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="explore-grid">
        {bots.data?.map(bot => (
          <BotCard key={bot.id} name={bot.name} description={bot.description} avatarEmoji={bot.avatarEmoji} avatarUrl={bot.avatarUrl} creatorName={bot.isOwner ? "you" : bot.creatorName}
            footer={<>
              <Button size="sm" onClick={() => navigate(`/?bot=${bot.id}`)} data-testid={`button-explore-chat-${bot.slug}`}><MessageCircle className="mr-1.5 h-4 w-4" /> Chat</Button>
              <Button size="sm" variant="outline" onClick={() => navigate(`/b/${bot.slug}`)}>Details</Button>
            </>}
          >
            {typeof bot.chatCount === "number" && <p className="mt-3 text-xs text-muted-foreground">{bot.chatCount} chat{bot.chatCount === 1 ? "" : "s"}</p>}
          </BotCard>
        ))}
      </div>
    </PageShell>
  );
}
