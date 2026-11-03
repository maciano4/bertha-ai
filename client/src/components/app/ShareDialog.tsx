// Share a bot. Owners switch link sharing on or off and copy (or replace) the link; people the
// bot was shared with can copy the link or remove it from their sidebar.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link2, Copy, Check, RefreshCw, Lock, Globe, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorInfo } from "@/lib/apiError";
import { copyToClipboard } from "@/lib/drafts";
import { shareUrl, type PublicBot } from "@/lib/bots";

export default function ShareDialog({ bot, open, onOpenChange, onRemoved }: {
  bot: PublicBot; open: boolean; onOpenChange: (open: boolean) => void; onRemoved?: () => void;
}) {
  const cache = useQueryClient();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const shared = bot.visibility !== "private";
  const link = shareUrl(bot.slug);

  const refresh = () => {
    cache.invalidateQueries({ queryKey: ["/api/bots"] });
  };

  const setSharing = async (on: boolean) => {
    setBusy(true);
    try {
      await apiRequest("PATCH", `/api/bots/${bot.id}`, { visibility: on ? "link" : "private" });
      refresh();
    } catch (err) {
      toast({ title: "Could not change sharing", description: apiErrorInfo(err).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const newLink = async () => {
    if (!confirm("Make a new share link? The old link will stop working.")) return;
    setBusy(true);
    try {
      await apiRequest("POST", `/api/bots/${bot.id}/new-link`);
      refresh();
      toast({ title: "New link made", description: "The old link no longer works." });
    } catch (err) {
      toast({ title: "Could not make a new link", description: apiErrorInfo(err).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const copy = async () => {
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      toast({ title: "Copy this link", description: link });
    }
  };

  const removeFromSidebar = async () => {
    setBusy(true);
    try {
      await apiRequest("DELETE", `/api/bots/shared/${bot.id}`);
      cache.invalidateQueries({ queryKey: ["/api/bots/shared"] });
      onOpenChange(false);
      onRemoved?.();
      toast({ title: `${bot.name} removed from your sidebar`, description: "Your old chats stay in your history. Open the link again to add it back." });
    } catch (err) {
      toast({ title: "Could not remove it", description: apiErrorInfo(err).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="share-dialog">
        <DialogHeader>
          <DialogTitle>Share {bot.name}</DialogTitle>
          <DialogDescription>
            {bot.isOwner ? "Send the link to anyone. They sign in and the bot appears in their sidebar." : "Pass the link on to someone else who should chat with this bot."}
          </DialogDescription>
        </DialogHeader>

        {bot.isOwner && (
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            {shared ? <Globe className="h-5 w-5 shrink-0 text-primary" /> : <Lock className="h-5 w-5 shrink-0 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{shared ? "Anyone with the link" : "Private"}</p>
              <p className="text-xs text-muted-foreground">{shared ? "People with the link can sign in and chat. It's never listed anywhere." : "Only you can chat with it."}</p>
            </div>
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            <Switch checked={shared} onCheckedChange={setSharing} disabled={busy} aria-label="Anyone with the link can chat" data-testid="switch-link-sharing" />
          </div>
        )}

        {shared ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg bg-muted p-2 pl-3" data-testid="share-link-box">
              <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <code className="min-w-0 flex-1 truncate text-sm" data-testid="text-share-link">{link}</code>
              <Button size="sm" onClick={copy} data-testid="button-copy-share">{copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />} {copied ? "Copied" : "Copy link"}</Button>
            </div>
            {bot.isOwner && (
              <button type="button" onClick={newLink} disabled={busy} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" data-testid="button-new-link">
                <RefreshCw className="h-3 w-3" /> Make a new link (the old one stops working)
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="text-share-off">Turn on link sharing to get a link.</p>
        )}

        {!bot.isOwner && (
          <div className="border-t border-border pt-3">
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={removeFromSidebar} disabled={busy} data-testid="button-remove-shared">
              Remove from my sidebar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
