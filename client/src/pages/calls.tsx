import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import PageShell from "@/components/bots/PageShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface VoiceSettings {
  isOwner: boolean;
  phoneNumber?: string | null;
  answeringEnabled?: boolean;
  greeting?: string;
  availabilityNote?: string;
  webhookUrl?: string;
  statusUrl?: string;
  mediaStreamUrl?: string;
}

interface CallRecord {
  id: string;
  fromNumber: string;
  forwardedFrom: string | null;
  status: string;
  startedAt: string;
  durationSeconds: number | null;
  summary: string | null;
  transcript: string;
  aiUnavailable: boolean;
  smsStatus: string;
}

async function getJson<T>(url: string): Promise<T> {
  return (await apiRequest("GET", url)).json();
}

function when(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function length(seconds: number | null) {
  if (seconds == null) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${seconds}s`;
}

export default function CallsPage() {
  const { toast } = useToast();
  const cache = useQueryClient();
  const settings = useQuery<VoiceSettings>({ queryKey: ["/api/voice/settings"], queryFn: () => getJson("/api/voice/settings") });
  const calls = useQuery<{ calls: CallRecord[] }>({
    queryKey: ["/api/voice/calls"],
    enabled: settings.data?.isOwner === true,
    queryFn: () => getJson("/api/voice/calls"),
    refetchInterval: 15000,
  });
  const [greeting, setGreeting] = useState("");
  const [availability, setAvailability] = useState("");
  const [answering, setAnswering] = useState(true);
  const hydrated = useRef(false);
  useEffect(() => {
    if (!settings.data?.isOwner) return;
    setAnswering(settings.data.answeringEnabled !== false);
    if (hydrated.current) return;
    hydrated.current = true;
    setGreeting(settings.data.greeting || "");
    setAvailability(settings.data.availabilityNote || "");
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async (patch: { answeringEnabled?: boolean; greeting?: string; availabilityNote?: string }) => {
      await apiRequest("PATCH", "/api/voice/settings", patch);
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["/api/voice/settings"] });
      toast({ title: "Call settings saved" });
    },
    onError: () => {
      const current = cache.getQueryData<VoiceSettings>(["/api/voice/settings"]);
      if (current) setAnswering(current.answeringEnabled !== false);
      toast({ title: "Could not save call settings", variant: "destructive" });
    },
  });

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copied" });
    } catch {
      toast({ title: "Select the address and copy it", variant: "destructive" });
    }
  };

  return (
    <PageShell title="Calls">
      <div className="mx-auto max-w-2xl space-y-6" data-testid="calls-page">
        {settings.isLoading && <p className="text-sm text-muted-foreground">Loading calls…</p>}
        {settings.isError && <p className="text-sm text-destructive" role="alert">Could not load call settings.</p>}
        {settings.data && !settings.data.isOwner && (
          <p className="text-sm text-muted-foreground">Only the owner of this Bertha line can see missed calls.</p>
        )}
        {settings.data?.isOwner && (
          <>
            <section className="space-y-4 rounded-xl border border-border bg-card p-4" data-testid="call-settings">
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <h2 className="text-base font-semibold">Bertha's number</h2>
                  <p className="text-sm text-muted-foreground" data-testid="text-phone-number">
                    {settings.data.phoneNumber || "Set TWILIO_PHONE_NUMBER to show the number callers reach."}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="answering-enabled">Answer missed calls</Label>
                <Switch
                  id="answering-enabled"
                  checked={answering}
                  disabled={save.isPending}
                  onCheckedChange={checked => { setAnswering(checked); save.mutate({ answeringEnabled: checked }); }}
                  data-testid="toggle-answering"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="greeting">Greeting override</Label>
                <Textarea id="greeting" value={greeting} maxLength={300} onChange={event => setGreeting(event.target.value)}
                  placeholder="Hi, this is Bertha, Chris's assistant. He missed your call, so I picked up. Who's calling?"
                  data-testid="input-greeting" />
                <p className="text-xs text-muted-foreground">Leave this blank to use Bertha's usual greeting.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="availability">What Bertha may say about availability</Label>
                <Textarea id="availability" value={availability} maxLength={500} onChange={event => setAvailability(event.target.value)}
                  placeholder="Free after 4pm on weekdays. Do not book anything."
                  data-testid="input-availability" />
                <p className="text-xs text-muted-foreground">If this is empty, she will not guess Chris's schedule or agree to anything.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => save.mutate({ greeting, availabilityNote: availability })} disabled={save.isPending} data-testid="button-save-call-settings">
                  Save greeting
                </Button>
                <a href="#missed-call-setup" className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-primary underline-offset-4 hover:underline" data-testid="link-setup">
                  Setup guide
                </a>
              </div>
            </section>

            <section className="space-y-3" data-testid="call-list">
              <h2 className="text-base font-semibold">Missed calls</h2>
              {calls.isLoading && <p className="text-sm text-muted-foreground">Loading call history…</p>}
              {calls.data && calls.data.calls.length === 0 && (
                <p className="text-sm text-muted-foreground">No calls yet. When someone calls Bertha's number, the summary shows up here and a text goes to the owner phone.</p>
              )}
              <ul className="space-y-3">
                {(calls.data?.calls || []).map(call => (
                  <li key={call.id} className="rounded-xl border border-border bg-card p-4" data-testid={`call-${call.id}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{call.fromNumber}{call.forwardedFrom ? ` · forwarded from ${call.forwardedFrom}` : ""}</p>
                      <p className="text-xs text-muted-foreground">{when(call.startedAt)}{call.durationSeconds != null ? ` · ${length(call.durationSeconds)}` : ""}</p>
                    </div>
                    <p className="mt-2 text-sm">{call.summary || (call.status === "completed" ? "No message was captured." : "Call in progress…")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {call.aiUnavailable ? "AI was unavailable. " : ""}
                      {call.smsStatus === "sent" ? "Text sent." : call.smsStatus === "failed" ? "Text failed." : call.smsStatus === "skipped" ? "Text skipped (Twilio is not configured)." : ""}
                    </p>
                    {call.transcript && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground">Transcript</summary>
                        <pre className="mt-2 whitespace-pre-wrap text-xs text-foreground/80">{call.transcript}</pre>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section id="missed-call-setup" className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm" data-testid="call-setup">
              <h2 className="text-base font-semibold">Set up the Twilio number</h2>
              <p className="text-muted-foreground">Buy a voice-capable Twilio number, point its voice webhook at this app, and optionally forward your carrier's unanswered calls to that number. The same steps are in the README under Missed calls.</p>
              <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
                <li>In Twilio, buy a phone number that can receive calls (a trial number is enough to test).</li>
                <li>Open the number, choose Voice, and set “A call comes in” to Webhook, HTTP POST, and the address below.</li>
                <li>Set “Call status changes” to HTTP POST and the status address, so Bertha learns when the call ends.</li>
                <li>On Replit, use the public https preview URL, not localhost. Twilio must be able to reach it, and the audio stream is <span className="font-medium text-foreground">wss</span> on that same host.</li>
                <li>Optional: on your mobile carrier, forward unanswered calls to Bertha's Twilio number.</li>
                <li>Add the secrets from the README, then turn answering on above.</li>
              </ol>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">Voice webhook</span>
                <span className="flex gap-2">
                  <input readOnly value={settings.data.webhookUrl || ""} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs" data-testid="input-webhook-url" />
                  <Button type="button" variant="outline" onClick={() => settings.data?.webhookUrl && copy(settings.data.webhookUrl)}>Copy</Button>
                </span>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">Call status webhook</span>
                <span className="flex gap-2">
                  <input readOnly value={settings.data.statusUrl || ""} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs" />
                  <Button type="button" variant="outline" onClick={() => settings.data?.statusUrl && copy(settings.data.statusUrl)}>Copy</Button>
                </span>
              </label>
              <p className="text-xs text-muted-foreground">Media stream: {settings.data.mediaStreamUrl}. Each live call adds its own one-time token.</p>
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
