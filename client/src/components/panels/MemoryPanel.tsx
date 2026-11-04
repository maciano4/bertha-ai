import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Brain } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Memory { id: string; kind: string; content: string; createdAt: string }
interface FollowUp { id: string; kind: string; summary: string; dueAt: string | null }

// What Bertha remembers about the user, and the unfinished things she may bring up.
// Everything here can be deleted; nothing is shared with other users.
export default function MemoryPanel() {
  const cache = useQueryClient();
  const { toast } = useToast();
  const memories = useQuery<Memory[]>({ queryKey: ["/api/memories"] });
  const followups = useQuery<FollowUp[]>({ queryKey: ["/api/followups"] });
  const [draft, setDraft] = useState("");
  const [bargeIn, setBargeIn] = useState(() => localStorage.getItem("bertha-barge-in") !== "off");
  const [notify, setNotify] = useState(() => typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const refresh = () => { cache.invalidateQueries({ queryKey: ["/api/memories"] }); cache.invalidateQueries({ queryKey: ["/api/followups"] }); };
  const run = async (fn: () => Promise<unknown>, failed: string) => {
    try { await fn(); refresh(); } catch { toast({ title: failed, description: "Please try again.", variant: "destructive" }); }
  };

  return (
    <Card className="m-4 shadow-lg" data-testid="memory-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Brain className="h-4 w-4" /> What Bertha remembers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Bertha picks up things you tell her (people, preferences, plans) so she can talk like someone who knows you. Delete anything you don't want her to keep.</p>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const content = draft.trim(); if (!content) return; setDraft(""); run(() => apiRequest("POST", "/api/memories", { content }), "Could not save that"); }}>
          <Input value={draft} onChange={e => setDraft(e.target.value)} placeholder="e.g. I take my tea with honey" maxLength={300} data-testid="input-memory" />
          <Button type="submit" size="sm" disabled={!draft.trim()} data-testid="button-add-memory">Add</Button>
        </form>
        {memories.isLoading ? <p className="text-xs text-muted-foreground">Loading…</p>
          : !memories.data?.length ? <p className="text-xs text-muted-foreground" data-testid="memories-empty">Nothing yet. Chat a little and she'll start to remember.</p>
          : (
            <ul className="space-y-1" data-testid="memory-list">
              {memories.data.map(m => (
                <li key={m.id} className="group flex items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/60" data-testid={`memory-${m.id}`}>
                  <span className="min-w-0 flex-1">{m.content}</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive" aria-label={`Forget: ${m.content}`}
                    onClick={() => run(() => apiRequest("DELETE", `/api/memories/${m.id}`), "Could not delete that")} data-testid={`delete-memory-${m.id}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        {!!memories.data?.length && (
          <Button variant="outline" size="sm" className="w-full" data-testid="button-forget-all"
            onClick={() => { if (window.confirm("Forget everything Bertha remembers about you?")) run(() => apiRequest("DELETE", "/api/memories"), "Could not clear memories"); }}>
            Forget everything
          </Button>
        )}
        <div className="space-y-2 border-t border-border pt-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={bargeIn} data-testid="toggle-barge-in"
              onChange={e => { setBargeIn(e.target.checked); localStorage.setItem("bertha-barge-in", e.target.checked ? "on" : "off"); }} />
            <span>Stop talking when I start speaking<span className="block text-xs text-muted-foreground">Uses the microphone while Bertha speaks. Works best with headphones.</span></span>
          </label>
          {notify === "default" && (
            <Button variant="outline" size="sm" className="w-full" data-testid="button-allow-notifications"
              onClick={() => Notification.requestPermission().then(setNotify)}>Allow reminder notifications</Button>
          )}
        </div>
        {!!followups.data?.length && (
          <div className="border-t border-border pt-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unfinished things</h3>
            <ul className="space-y-1" data-testid="followup-list">
              {followups.data.map(f => (
                <li key={f.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate" title={f.summary}>{f.summary}</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => run(() => apiRequest("PATCH", `/api/followups/${f.id}`, { status: "done" }), "Could not update")}>Done</Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => run(() => apiRequest("PATCH", `/api/followups/${f.id}`, { status: "dismissed" }), "Could not update")}>Remove</Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
