import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
  lastActivityAt: string | null;
}

function when(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface Props {
  activeId: string | null;
  onSelect: (id: string | null) => void;
  open: boolean;
  onClose: () => void;
}

export default function ConversationSidebar({ activeId, onSelect, open, onClose }: Props) {
  const cache = useQueryClient();
  const { toast } = useToast();
  const conversations = useQuery({
    queryKey: ["/api/conversations"],
    queryFn: async (): Promise<ConversationSummary[]> => (await apiRequest("GET", "/api/conversations")).json(),
  });

  const remove = async (conversation: ConversationSummary) => {
    if (!confirm(`Delete "${conversation.title}"? This can't be undone.`)) return;
    try {
      await apiRequest("DELETE", `/api/conversations/${conversation.id}`);
      if (conversation.id === activeId) onSelect(null);
      cache.setQueryData<ConversationSummary[]>(["/api/conversations"], list => list?.filter(item => item.id !== conversation.id));
      cache.removeQueries({ queryKey: ["/api/conversations", conversation.id] });
    } catch {
      toast({ title: "Could not delete that chat", description: "Please try again.", variant: "destructive" });
    }
  };

  const pick = (id: string | null) => { onSelect(id); onClose(); };

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          "blur-backdrop z-40 flex w-72 shrink-0 flex-col border-r border-border",
          "fixed inset-y-0 left-0 transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Your chats"
        data-testid="conversation-sidebar"
      >
        <div className="flex items-center gap-2 p-3">
          <Button className="flex-1 justify-start" onClick={() => pick(null)} data-testid="button-new-chat">
            <MessageSquarePlus className="mr-2 h-4 w-4" /> New chat
          </Button>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onClose} aria-label="Close chat list">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {conversations.isLoading && <p className="px-2 py-3 text-sm text-muted-foreground">Loading your chats...</p>}
          {conversations.error && <p role="alert" className="px-2 py-3 text-sm text-destructive">Your chats could not be loaded. Reload to try again.</p>}
          {conversations.data?.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No saved chats yet. Say hello to Bertha to start one.</p>}
          <ul className="space-y-1">
            {conversations.data?.map(conversation => (
              <li key={conversation.id} className="group relative">
                <button
                  type="button"
                  onClick={() => pick(conversation.id)}
                  className={cn(
                    "w-full rounded-md px-3 py-2 pr-9 text-left transition-colors hover:bg-foreground/10",
                    conversation.id === activeId && "bg-foreground/15",
                  )}
                  aria-current={conversation.id === activeId ? "page" : undefined}
                  data-testid={`conversation-${conversation.id}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{conversation.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{when(conversation.lastActivityAt || conversation.updatedAt)}</span>
                  </div>
                  {conversation.lastMessage && <p className="truncate text-xs text-muted-foreground">{conversation.lastMessage}</p>}
                </button>
                <button
                  type="button"
                  onClick={() => remove(conversation)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground opacity-100 hover:bg-destructive/10 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Delete ${conversation.title}`}
                  data-testid={`button-delete-${conversation.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
