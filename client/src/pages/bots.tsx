import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Copy, Link2, MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PageShell from "@/components/bots/PageShell";
import BotCard from "@/components/bots/BotCard";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorInfo } from "@/lib/apiError";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/drafts";
import { shareUrl, TEMPLATES, type OwnedBot } from "@/lib/bots";

type Usage = { plan: string; enforced: boolean; bots: { used: number; limit: number }; messagesToday: { used: number; ai: number; limit: number } };

export default function BotsPage() {
  const [, navigate] = useLocation();
  const cache = useQueryClient();
  const { toast } = useToast();
  const bots = useQuery<OwnedBot[]>({ queryKey: ["/api/bots"] });
  const usage = useQuery<Usage>({ queryKey: ["/api/usage"] });
  const [deleting, setDeleting] = useState<OwnedBot | null>(null);

  const refresh = () => {
    cache.invalidateQueries({ queryKey: ["/api/bots"] });
    cache.invalidateQueries({ queryKey: ["/api/usage"] });
    cache.invalidateQueries({ queryKey: ["/api/conversations"] });
  };

  const duplicate = async (bot: OwnedBot) => {
    try {
      await apiRequest("POST", `/api/bots/${bot.id}/duplicate`);
      toast({ title: `Copied "${bot.name}"`, description: "The copy is private until you share it." });
      refresh();
    } catch (error) {
      toast({ title: "Could not copy that bot", description: apiErrorInfo(error).message, variant: "destructive" });
    }
  };
  const copyLink = async (bot: OwnedBot) => {
    const ok = await copyToClipboard(shareUrl(bot.slug));
    toast({ title: ok ? "Share link copied" : "Copy this link", description: shareUrl(bot.slug) });
  };
  const remove = async () => {
    if (!deleting) return;
    try {
      await apiRequest("DELETE", `/api/bots/${deleting.id}`);
      toast({ title: `Deleted "${deleting.name}"` });
      cache.removeQueries({ queryKey: ["/api/bots", deleting.id] });
      refresh();
    } catch (error) {
      toast({ title: "Could not delete that bot", description: apiErrorInfo(error).message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <PageShell
      title="My Bots"
      actions={<>
        <Button onClick={() => navigate("/bots/new")} data-testid="button-create-bot"><Plus className="mr-2 h-4 w-4" /> Create a bot</Button>
      </>}
    >
      {usage.data && (
        <p className="mb-4 text-sm text-muted-foreground" data-testid="text-usage">
          {usage.data.bots.used} bot{usage.data.bots.used === 1 ? "" : "s"} · {usage.data.messagesToday.used} message{usage.data.messagesToday.used === 1 ? "" : "s"} today
          {usage.data.enforced ? ` (limits: ${usage.data.bots.limit} bots, ${usage.data.messagesToday.limit} messages a day)` : ""}
        </p>
      )}
      {bots.isLoading && <p className="text-muted-foreground">Loading your bots...</p>}
      {bots.error && <p role="alert" className="text-destructive">Your bots could not be loaded. Reload to try again.</p>}

      {bots.data?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center" data-testid="bots-empty">
          <h2 className="text-lg font-semibold">Make your first bot</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Give it a name, a personality and a voice. Keep it to yourself, or share a link so friends and customers can chat with it.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {TEMPLATES.map(template => (
              <Button key={template.key} variant="outline" onClick={() => navigate(`/bots/new?template=${template.key}`)} data-testid={`empty-template-${template.key}`}>
                <span className="mr-2">{template.bot.avatarEmoji}</span>{template.label}
              </Button>
            ))}
            <Button onClick={() => navigate("/bots/new")}>Start from scratch</Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {bots.data?.map(bot => (
          <BotCard key={bot.id} name={bot.name} description={bot.description} avatarEmoji={bot.avatarEmoji} avatarUrl={bot.avatarUrl} visibility={bot.visibility}
            footer={<>
              <Button size="sm" onClick={() => navigate(`/?bot=${bot.id}`)} data-testid={`button-chat-${bot.id}`}><MessageCircle className="mr-1.5 h-4 w-4" /> Chat</Button>
              <Button size="sm" variant="outline" onClick={() => navigate(`/bots/${bot.id}/edit`)} data-testid={`button-edit-${bot.id}`}><Pencil className="mr-1.5 h-4 w-4" /> Edit</Button>
              {bot.visibility !== "private" && (
                <Button size="sm" variant="outline" onClick={() => copyLink(bot)} data-testid={`button-copy-link-${bot.id}`}><Link2 className="mr-1.5 h-4 w-4" /> Copy link</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => duplicate(bot)} aria-label={`Duplicate ${bot.name}`} data-testid={`button-duplicate-${bot.id}`}><Copy className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleting(bot)} aria-label={`Delete ${bot.name}`} data-testid={`button-delete-bot-${bot.id}`}><Trash2 className="h-4 w-4" /></Button>
            </>}
          >
            <p className="mt-3 text-xs text-muted-foreground">
              {(bot.chatCount ?? 0)} chat{bot.chatCount === 1 ? "" : "s"} · updated {new Date(bot.updatedAt).toLocaleDateString()}
            </p>
          </BotCard>
        ))}
      </div>

      <AlertDialog open={!!deleting} onOpenChange={open => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the bot and every chat anyone has had with it, including people you shared it with. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete-bot">Delete bot</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
