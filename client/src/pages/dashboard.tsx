import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, ArrowUpRight, Clock3, MessageSquareText, Search,
  RotateCw, Plus, PanelLeftClose, X, CalendarDays, Activity, CalendarRange,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Conversation = {
  id: string | number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
  lastActivityAt: string | null;
};
type ChatMessage = {
  id: string | number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  metadata?: unknown;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, withTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function initials(title: string) {
  const words = title.trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word.charAt(0).toUpperCase()).join("") || "C";
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [showList, setShowList] = useState(true);

  const conversationsQuery = useQuery({
    queryKey: ["/api/conversations"],
    queryFn: () => getJson<Conversation[]>("/api/conversations"),
  });
  const conversations = conversationsQuery.data ?? [];
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      `${conversation.title} ${conversation.lastMessage ?? ""}`.toLocaleLowerCase().includes(query),
    );
  }, [conversations, search]);
  const selected = conversations.find((item) => String(item.id) === String(selectedId)) ?? null;

  const messagesQuery = useQuery({
    queryKey: ["/api/conversations", selected?.id, "messages"],
    queryFn: () => getJson<ChatMessage[]>(`/api/conversations/${encodeURIComponent(String(selected?.id))}/messages`),
    enabled: selected !== null,
  });

  const totalMessages = conversations.reduce((sum, item) => sum + (Number(item.messageCount) || 0), 0);
  const latestActivity = conversations.reduce<string | null>((latest, item) => {
    const candidate = item.lastActivityAt || item.updatedAt;
    if (!candidate) return latest;
    if (!latest || new Date(candidate).getTime() > new Date(latest).getTime()) return candidate;
    return latest;
  }, null);

  return (
    <main className="min-h-[100dvh] bg-[#111416] text-[#edf0eb]">
      <div className="pointer-events-none fixed inset-0 opacity-[0.16]" aria-hidden="true"
        style={{ backgroundImage: "radial-gradient(ellipse at 78% 2%, rgba(157,185,153,.22), transparent 34%), radial-gradient(ellipse at 0% 90%, rgba(120,143,130,.1), transparent 35%)" }} />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-[1440px] flex-col px-4 pb-8 sm:px-7 lg:px-10">
        <header className="flex min-h-[76px] items-center justify-between border-b border-white/[0.09]">
          <Link href="/" className="inline-flex items-center gap-2 rounded-sm text-sm text-[#aab2ad] transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9c4a4]">
            <ArrowLeft className="h-4 w-4" /> Back to chat
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/appointments" className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-[#aab2ad] transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9c4a4]">
              <CalendarRange className="h-4 w-4" /><span>Appointments</span>
            </Link>
            <div className="hidden items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-[#a4b49f] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#a4b49f]" /> Personal archive
            </div>
          </div>
        </header>

        <section className="pb-7 pt-9 sm:pb-9 sm:pt-12">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9aaa94]">Your conversations</p>
              <h1 className="font-display text-[clamp(2.3rem,5vw,4.1rem)] leading-[0.98] tracking-[-0.055em] text-[#f0f2ec]">A record of<br className="hidden sm:block" /> what you explored.</h1>
              <p className="mt-4 max-w-lg text-sm leading-6 text-[#9ba39e]">Review recent chats, pick up a thread, or search your conversation history.</p>
            </div>
            <Button onClick={() => setLocation("/")} className="h-11 w-full rounded-md bg-[#d1e0ca] px-5 text-[#1b241d] hover:bg-[#e1eadb] sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> New chat
            </Button>
          </div>
        </section>

        <section aria-label="Conversation activity overview" className="mb-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-white/[0.09] bg-white/[0.09] sm:grid-cols-3">
          <Overview icon={<MessageSquareText className="h-4 w-4" />} label="Conversations" value={conversationsQuery.isLoading ? "—" : String(conversations.length)} />
          <Overview icon={<Activity className="h-4 w-4" />} label="Messages exchanged" value={conversationsQuery.isLoading ? "—" : String(totalMessages)} />
          <Overview icon={<CalendarDays className="h-4 w-4" />} label="Latest activity" value={conversationsQuery.isLoading ? "—" : formatDate(latestActivity)} />
        </section>

        <section className="grid min-h-[480px] flex-1 grid-cols-1 overflow-hidden rounded-xl border border-white/[0.1] bg-[#171b1d]/90 md:grid-cols-[minmax(260px,360px)_1fr]">
          <aside className={`${showList || !selected ? "flex" : "hidden"} min-h-[440px] flex-col border-b border-white/[0.09] md:flex md:border-b-0 md:border-r`}>
            <div className="border-b border-white/[0.08] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#e9ece6]">History <span className="ml-1 font-mono text-xs text-[#7e8982]">{conversations.length}</span></h2>
                {selected && <button type="button" onClick={() => setShowList(false)} className="rounded p-1 text-[#849088] hover:text-white md:hidden" aria-label="Close conversation list"><X className="h-4 w-4" /></button>}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8982]" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or preview" aria-label="Search conversations"
                  className="h-10 border-white/[0.1] bg-[#111416] pl-9 text-sm text-[#e9ece6] placeholder:text-[#707b74] focus-visible:ring-[#a9c4a4]" />
                {search && <button aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#87918a] hover:text-white"><X className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {conversationsQuery.isLoading ? <ConversationSkeleton /> :
                conversationsQuery.isError ? <InlineError onRetry={() => conversationsQuery.refetch()} /> :
                conversations.length === 0 ? <EmptyHistory /> :
                filtered.length === 0 ? <div className="px-4 py-10 text-center text-sm text-[#89938c]">No conversations match “{search}”.</div> :
                <ul className="space-y-1">
                  {filtered.map((conversation) => {
                    const active = String(selectedId) === String(conversation.id);
                    return <li key={conversation.id}>
                      <button type="button" onClick={() => { setSelectedId(conversation.id); setShowList(false); }}
                        aria-current={active ? "true" : undefined}
                        className={`w-full rounded-lg p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9c4a4] ${active ? "bg-[#26302a]" : "hover:bg-white/[0.045]"}`}>
                        <div className="flex items-start gap-3">
                          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-mono text-xs ${active ? "bg-[#a9c4a4] text-[#1b241d]" : "bg-[#29302c] text-[#b7c7b2]"}`}>{initials(conversation.title)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-[#e7eae4]">{conversation.title || "Untitled conversation"}</span>
                            <span className="mt-1 block truncate text-xs leading-5 text-[#89938c]">{conversation.lastMessage || "No message preview"}</span>
                            <span className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-[#707b74]"><Clock3 className="h-3 w-3" />{formatDate(conversation.lastActivityAt || conversation.updatedAt)}</span>
                          </span>
                        </div>
                      </button>
                    </li>;
                  })}
                </ul>}
            </div>
          </aside>

          <div className={`${selected && !showList ? "flex" : selected ? "hidden" : "flex"} min-h-[480px] flex-col md:flex`}>
            {!selected ? <TranscriptWelcome /> : <>
              <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-6">
                <button type="button" className="rounded-md p-2 text-[#9ba59d] hover:bg-white/[0.06] md:hidden" onClick={() => setShowList(true)} aria-label="Show conversation history"><PanelLeftClose className="h-4 w-4" /></button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-[#edf0eb]">{selected.title || "Untitled conversation"}</h2>
                  <p className="mt-1 font-mono text-[10px] tracking-wide text-[#89938c]">{Number(selected.messageCount) || 0} messages · Updated {formatDate(selected.lastActivityAt || selected.updatedAt, true)}</p>
                </div>
                <Button asChild variant="outline" className="h-9 shrink-0 border-white/[0.13] bg-transparent text-[#dce4d8] hover:bg-white/[0.07] hover:text-white">
                  <Link href={`/?conversation=${encodeURIComponent(String(selected.id))}`}><span className="hidden sm:inline">Continue conversation</span><span className="sm:hidden">Continue</span><ArrowUpRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7">
                {messagesQuery.isLoading ? <TranscriptSkeleton /> :
                  messagesQuery.isError ? <div className="mx-auto max-w-md py-12"><InlineError onRetry={() => messagesQuery.refetch()} /></div> :
                  !messagesQuery.data?.length ? <div className="py-16 text-center text-sm text-[#89938c]">This conversation has no messages yet.</div> :
                  <ol className="mx-auto max-w-3xl space-y-6">
                    {messagesQuery.data.map((message) => <li key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      <article className={`max-w-[92%] rounded-xl px-4 py-3 sm:max-w-[82%] ${message.role === "user" ? "rounded-br-sm bg-[#29362e] text-[#e8efe5]" : message.role === "system" ? "border border-white/[0.1] bg-[#202426] text-[#aab2ad]" : "rounded-bl-sm bg-[#202628] text-[#dce1dc]"}`}>
                        <div className="mb-2 flex items-center justify-between gap-6">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a4b49f]">{message.role === "assistant" ? "Bertha" : message.role}</span>
                          <time className="shrink-0 font-mono text-[10px] text-[#78837c]" dateTime={message.createdAt}>{formatDate(message.createdAt, true)}</time>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                      </article>
                    </li>)}
                  </ol>}
              </div>
            </>}
          </div>
        </section>
        <footer className="py-5 text-center text-[11px] leading-5 text-[#748078]">This history is temporary and available in this browser session while the server is running.</footer>
      </div>
    </main>
  );
}

function Overview({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 bg-[#171b1d] px-4 py-4 sm:px-5">
    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#27302a] text-[#a9c4a4]">{icon}</span>
    <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f8a82]">{label}</p><p className="mt-1 truncate text-sm font-medium text-[#e2e7e0]">{value}</p></div>
  </div>;
}

function InlineError({ onRetry }: { onRetry: () => void }) {
  return <div className="px-3 py-8 text-center">
    <p className="text-sm font-medium text-[#d9dfd7]">Couldn’t load this history.</p>
    <p className="mt-1 text-xs text-[#89938c]">Check your connection and try again.</p>
    <Button variant="outline" size="sm" onClick={onRetry} className="mt-4 border-white/[0.14] bg-transparent text-[#d8e0d5] hover:bg-white/[0.07]"><RotateCw className="mr-2 h-3.5 w-3.5" />Retry</Button>
  </div>;
}

function EmptyHistory() {
  return <div className="px-4 py-12 text-center">
    <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.1] bg-[#202628] text-[#a9c4a4]"><MessageSquareText className="h-5 w-5" /></div>
    <p className="text-sm font-medium text-[#d9dfd7]">No conversations yet</p>
    <p className="mx-auto mt-2 max-w-[210px] text-xs leading-5 text-[#89938c]">Start a chat and your recent history will appear here.</p>
    <Button asChild variant="outline" size="sm" className="mt-4 border-white/[0.14] bg-transparent text-[#d8e0d5] hover:bg-white/[0.07]"><Link href="/"><Plus className="mr-2 h-3.5 w-3.5" />New chat</Link></Button>
  </div>;
}

function ConversationSkeleton() {
  return <div aria-label="Loading conversations" className="space-y-2 p-2">
    {[0, 1, 2, 3].map((index) => <div key={index} className="flex animate-pulse gap-3 rounded-lg p-3"><span className="h-9 w-9 rounded-md bg-white/[0.07]" /><span className="flex-1 pt-1"><span className="mb-2 block h-3 w-3/5 rounded bg-white/[0.07]" /><span className="block h-2.5 w-4/5 rounded bg-white/[0.05]" /></span></div>)}
  </div>;
}

function TranscriptSkeleton() {
  return <div aria-label="Loading messages" className="mx-auto max-w-3xl space-y-6 py-5">
    {[0, 1, 2, 3].map((index) => <div key={index} className={`animate-pulse ${index % 2 ? "ml-auto" : ""} h-24 w-[78%] rounded-xl bg-white/[0.06]`} />)}
  </div>;
}

function TranscriptWelcome() {
  return <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-white/[0.1] bg-[#222a26] text-[#a9c4a4]"><MessageSquareText className="h-6 w-6" /></div>
    <h2 className="font-display text-2xl tracking-[-0.03em] text-[#e8ece6]">Choose a conversation</h2>
    <p className="mt-2 max-w-sm text-sm leading-6 text-[#89938c]">Select a chat from your history to read the full transcript and continue where you left off.</p>
    <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.14em] text-[#6f7a72]">Your archive, in context</p>
  </div>;
}
