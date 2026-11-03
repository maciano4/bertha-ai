import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Sparkles, Volume2, Upload, X, Link2, Loader2, Trash2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import PageShell from "@/components/bots/PageShell";
import BotCard from "@/components/bots/BotCard";
import BotAvatar from "@/components/bots/BotAvatar";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorInfo } from "@/lib/apiError";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/drafts";
import { EMPTY_BOT, LIMITS, shareUrl, TEMPLATES, type BotForm, type OwnedBot, type Visibility } from "@/lib/bots";

const EMOJIS = ["🤖", "🎓", "💪", "🎧", "✍️", "✈️", "🧑‍🍳", "🧘", "💼", "🩺", "🎨", "🎵", "📚", "🌍", "🐶", "🦉", "⭐", "💡"];
const DEFAULT_MODEL = "__default__";

function Field({ label, htmlFor, hint, count, max, children }: { label: string; htmlFor: string; hint?: ReactNode; count?: number; max?: number; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {max !== undefined && <span className={`text-xs ${count! > max ? "text-destructive" : "text-muted-foreground"}`}>{count}/{max}</span>}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Shrinks an uploaded picture to a 128px square so it can be stored with the bot.
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't a picture we can use."));
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", load);
  }, []);
  return voices;
}

export default function BotEditor() {
  const params = useParams<{ id?: string }>();
  const editingId = params.id ?? null;
  const [, navigate] = useLocation();
  const cache = useQueryClient();
  const { toast } = useToast();
  const voices = useVoices();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<BotForm>(() => {
    const key = new URLSearchParams(window.location.search).get("template");
    const template = TEMPLATES.find(item => item.key === key);
    return { ...EMPTY_BOT, ...(template?.bot || {}) };
  });
  const [saved, setSaved] = useState<OwnedBot | null>(null);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const options = useQuery<{ models: string[]; defaultModel: string }>({ queryKey: ["/api/bots/options"] });
  const existing = useQuery<OwnedBot>({ queryKey: ["/api/bots", editingId], enabled: !!editingId });
  useEffect(() => {
    const bot = existing.data;
    if (!bot || !bot.isOwner) return;
    setSaved(bot);
    setForm({
      name: bot.name, description: bot.description || "", instructions: bot.instructions || "", greeting: bot.greeting || "",
      avatarEmoji: bot.avatarEmoji || "🤖", avatarUrl: bot.avatarUrl, voiceName: bot.voiceName, voiceRate: Number(bot.voiceRate) || 1,
      voicePitch: Number(bot.voicePitch ?? 1), model: bot.model, visibility: bot.visibility === "private" ? "private" : "link", showInstructions: !!bot.showInstructions,
    });
    if (bot.avatarUrl && !bot.avatarUrl.startsWith("data:")) setUrlInput(bot.avatarUrl);
  }, [existing.data]);

  const set = <K extends keyof BotForm>(key: K, value: BotForm[K]) => setForm(current => ({ ...current, [key]: value }));
  const applyTemplate = (key: string) => {
    const template = TEMPLATES.find(item => item.key === key);
    if (!template) return;
    const hasWork = form.instructions.trim() && form.instructions !== EMPTY_BOT.instructions;
    if (hasWork && !confirm(`Replace what you've written with the ${template.label} template?`)) return;
    setForm(current => ({ ...EMPTY_BOT, visibility: current.visibility, ...template.bot }));
    setUrlInput("");
  };

  const tooLong = form.name.length > LIMITS.name || form.description.length > LIMITS.description || form.instructions.length > LIMITS.instructions || form.greeting.length > LIMITS.greeting;
  const canSave = form.name.trim().length > 0 && !tooLong && !saving;

  const draftInstructions = async () => {
    setError(null);
    const description = form.description.trim() || form.instructions.trim().slice(0, 1000);
    if (!form.name.trim() || description.length < 3) {
      setError("Give your bot a name and a short description first, so the AI knows what to write.");
      return;
    }
    setDrafting(true);
    try {
      const response = await apiRequest("POST", "/api/bots/draft-instructions", {
        name: form.name.trim(), description, current: form.instructions.trim() || undefined,
      });
      const data = await response.json();
      set("instructions", data.instructions);
      toast({ title: "Instructions drafted", description: "Read them over and change anything you like." });
    } catch (err) {
      const info = apiErrorInfo(err);
      setError(info.message);
      toast({ title: "The AI couldn't write instructions", description: info.message, variant: "destructive" });
    } finally {
      setDrafting(false);
    }
  };

  const testVoice = () => {
    if (!("speechSynthesis" in window)) {
      toast({ title: "This browser can't speak", description: "Try Chrome, Edge or Safari.", variant: "destructive" });
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(form.greeting.trim() || `Hi, I'm ${form.name.trim() || "your new bot"}. How can I help?`);
    const voice = voices.find(item => item.name === form.voiceName);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    utterance.rate = form.voiceRate;
    utterance.pitch = form.voicePitch;
    window.speechSynthesis.speak(utterance);
  };

  const onUpload = async (file?: File) => {
    if (!file) return;
    try {
      set("avatarUrl", await resizeImage(file));
      setUrlInput("");
    } catch (err) {
      toast({ title: "Could not use that picture", description: (err as Error).message, variant: "destructive" });
    }
  };
  const applyUrl = () => {
    const value = urlInput.trim();
    if (!value) { set("avatarUrl", null); return; }
    if (!/^https:\/\//i.test(value)) { setError("Picture links must start with https://"); return; }
    set("avatarUrl", value);
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    const payload = {
      ...form,
      name: form.name.trim(), description: form.description.trim(), instructions: form.instructions.trim(), greeting: form.greeting.trim(),
    };
    try {
      const response = editingId
        ? await apiRequest("PATCH", `/api/bots/${editingId}`, payload)
        : await apiRequest("POST", "/api/bots", payload);
      const bot: OwnedBot = await response.json();
      cache.invalidateQueries({ queryKey: ["/api/bots"] });
      cache.invalidateQueries({ queryKey: ["/api/usage"] });
      cache.invalidateQueries({ queryKey: ["/api/conversations"] });
      setSaved(bot);
      toast({ title: editingId ? "Bot saved" : `${bot.name} is ready`, description: bot.visibility === "private" ? "Only you can chat with it." : "Anyone with the link can chat with it." });
      // A new bot opens straight into its chat; edits stay here.
      if (!editingId) navigate(`/?bot=${bot.id}`);
    } catch (err) {
      setError(apiErrorInfo(err).message);
    } finally {
      setSaving(false);
    }
  };

  const newLink = async () => {
    if (!saved || !confirm("Make a new share link? The old link will stop working.")) return;
    try {
      const bot: OwnedBot = await (await apiRequest("POST", `/api/bots/${saved.id}/new-link`)).json();
      setSaved(current => current ? { ...current, slug: bot.slug } : current);
      cache.invalidateQueries({ queryKey: ["/api/bots"] });
      toast({ title: "New link made", description: shareUrl(bot.slug) });
    } catch (err) {
      toast({ title: "Could not make a new link", description: apiErrorInfo(err).message, variant: "destructive" });
    }
  };

  const removeBot = async () => {
    if (!saved) return;
    try {
      await apiRequest("DELETE", `/api/bots/${saved.id}`);
      cache.invalidateQueries({ queryKey: ["/api/bots"] });
      cache.invalidateQueries({ queryKey: ["/api/conversations"] });
      cache.invalidateQueries({ queryKey: ["/api/usage"] });
      toast({ title: `${saved.name} deleted` });
      navigate("/");
    } catch (err) {
      toast({ title: "Could not delete the bot", description: apiErrorInfo(err).message, variant: "destructive" });
    }
  };

  const backTo = editingId ? `/?bot=${editingId}` : "/";
  const voiceGroups = useMemo(() => [...voices].sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name)), [voices]);

  if (editingId && existing.isLoading) return <PageShell title="Edit bot" back={backTo} backLabel="Back to chat"><p className="text-muted-foreground">Loading...</p></PageShell>;
  if (editingId && (existing.error || (existing.data && !existing.data.isOwner))) {
    return (
      <PageShell title="Edit bot" back="/" backLabel="Back to chat">
        <p role="alert" className="text-destructive" data-testid="text-edit-denied">You can only edit bots you made. This one doesn't exist or belongs to someone else.</p>
      </PageShell>
    );
  }

  const sharedVisibility = saved?.visibility ?? form.visibility;

  return (
    <PageShell
      title={editingId ? `Edit ${saved?.name || "bot"}` : "Create a bot"}
      back={backTo} backLabel="Back to chat"
      actions={<>
        {saved && <Button variant="outline" onClick={() => navigate(`/?bot=${saved.id}`)} data-testid="button-chat-now"><MessageCircle className="mr-1.5 h-4 w-4" /> Chat</Button>}
        <Button onClick={save} disabled={!canSave} data-testid="button-save-bot">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingId ? "Save changes" : "Create bot"}</Button>
      </>}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <form className="space-y-6" onSubmit={event => { event.preventDefault(); if (canSave) save(); }}>
          {!editingId && (
            <section className="rounded-2xl border border-border bg-card/60 p-5">
              <h2 className="mb-1 font-semibold">Start from a template</h2>
              <p className="mb-3 text-sm text-muted-foreground">Pick one and change anything you like, or start from scratch.</p>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map(template => (
                  <Button key={template.key} type="button" variant="outline" size="sm" onClick={() => applyTemplate(template.key)} data-testid={`template-${template.key}`}>
                    <span className="mr-1.5">{template.bot.avatarEmoji}</span>{template.label}
                  </Button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4 rounded-2xl border border-border bg-card/60 p-5">
            <h2 className="font-semibold">About your bot</h2>
            <Field label="Name" htmlFor="bot-name" count={form.name.length} max={LIMITS.name}>
              <Input id="bot-name" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Coach Max" data-testid="input-bot-name" />
            </Field>
            <Field label="Short description" htmlFor="bot-description" count={form.description.length} max={LIMITS.description} hint="Shown on the bot's card and share page.">
              <Textarea id="bot-description" rows={2} value={form.description} onChange={e => set("description", e.target.value)} placeholder="What does this bot help with?" data-testid="input-bot-description" />
            </Field>
            <div className="space-y-1.5">
              <Label>Picture</Label>
              <div className="flex flex-wrap items-center gap-3">
                <BotAvatar emoji={form.avatarEmoji} url={form.avatarUrl} name={form.name || "Bot"} className="h-14 w-14 text-3xl" />
                <div className="flex flex-wrap gap-1" role="group" aria-label="Pick an emoji">
                  {EMOJIS.map(emoji => (
                    <button key={emoji} type="button" onClick={() => { set("avatarEmoji", emoji); set("avatarUrl", null); setUrlInput(""); }}
                      className={`h-9 w-9 rounded-md text-xl hover:bg-foreground/10 ${!form.avatarUrl && form.avatarEmoji === emoji ? "bg-primary/20 ring-2 ring-primary" : ""}`}
                      aria-label={`Use ${emoji}`} aria-pressed={!form.avatarUrl && form.avatarEmoji === emoji}>{emoji}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => onUpload(e.target.files?.[0])} data-testid="input-avatar-file" />
                <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="mr-1.5 h-4 w-4" /> Upload picture</Button>
                <Input className="h-9 max-w-xs" value={urlInput} onChange={e => setUrlInput(e.target.value)} onBlur={applyUrl} placeholder="or paste an https:// picture link" aria-label="Picture link" />
                {form.avatarUrl && <Button type="button" size="sm" variant="ghost" onClick={() => { set("avatarUrl", null); setUrlInput(""); }}><X className="mr-1 h-4 w-4" /> Use emoji</Button>}
              </div>
            </div>
            <Field label="Greeting" htmlFor="bot-greeting" count={form.greeting.length} max={LIMITS.greeting} hint="The first thing people see when they start a chat.">
              <Input id="bot-greeting" value={form.greeting} onChange={e => set("greeting", e.target.value)} placeholder="Hi! How can I help?" data-testid="input-bot-greeting" />
            </Field>
          </section>

          <section className="space-y-3 rounded-2xl border border-border bg-card/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Instructions</h2>
              <Button type="button" variant="secondary" size="sm" onClick={draftInstructions} disabled={drafting} data-testid="button-ai-instructions">
                {drafting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                {form.instructions.trim() ? "AI: improve my instructions" : "AI: help me write instructions"}
              </Button>
            </div>
            <Field label="How should your bot act?" htmlFor="bot-instructions" count={form.instructions.length} max={LIMITS.instructions}
              hint="Describe its role, personality, what it should and shouldn't do, and how long its answers should be. Your bot always stays honest and safe, whatever these say.">
              <Textarea id="bot-instructions" rows={10} value={form.instructions} onChange={e => set("instructions", e.target.value)}
                placeholder="You are a friendly... Ask the user... Keep answers short..." data-testid="input-bot-instructions" />
            </Field>
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-card/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Voice</h2>
              <Button type="button" variant="outline" size="sm" onClick={testVoice} data-testid="button-test-voice"><Volume2 className="mr-1.5 h-4 w-4" /> Test voice</Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bot-voice">Voice</Label>
              <Select value={form.voiceName ?? "__auto__"} onValueChange={value => set("voiceName", value === "__auto__" ? null : value)}>
                <SelectTrigger id="bot-voice" data-testid="select-voice"><SelectValue placeholder="Automatic" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__auto__">Automatic (the device's best voice)</SelectItem>
                  {form.voiceName && !voices.some(v => v.name === form.voiceName) && <SelectItem value={form.voiceName}>{form.voiceName} (not on this device)</SelectItem>}
                  {voiceGroups.map(voice => <SelectItem key={voice.voiceURI + voice.name} value={voice.name}>{voice.name} ({voice.lang})</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Voices come from each person's device. If someone doesn't have this voice, their device's usual voice is used.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Speed: {form.voiceRate.toFixed(2)}×</Label>
                <Slider min={0.5} max={2} step={0.05} value={[form.voiceRate]} onValueChange={([value]) => set("voiceRate", value)} aria-label="Voice speed" />
              </div>
              <div className="space-y-2">
                <Label>Pitch: {form.voicePitch.toFixed(2)}</Label>
                <Slider min={0} max={2} step={0.05} value={[form.voicePitch]} onValueChange={([value]) => set("voicePitch", value)} aria-label="Voice pitch" />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-card/60 p-5">
            <h2 className="font-semibold">Sharing and advanced</h2>
            <RadioGroup value={form.visibility} onValueChange={value => set("visibility", value as Visibility)} className="space-y-2" aria-label="Who can chat with this bot">
              {([
                ["private", "Private", "Only you can chat with it."],
                ["link", "Anyone with the link", "People you send the link to can sign in and chat with it. It's never listed anywhere."],
              ] as const).map(([value, label, help]) => (
                <label key={value} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-foreground/5" data-testid={`visibility-${value}`}>
                  <RadioGroupItem value={value} id={`vis-${value}`} className="mt-0.5" />
                  <span><span className="font-medium">{label}</span><span className="block text-sm text-muted-foreground">{help}</span></span>
                </label>
              ))}
            </RadioGroup>
            {saved && sharedVisibility !== "private" && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-primary/10 p-3 text-sm" data-testid="share-link-box">
                <Link2 className="h-4 w-4" />
                <code className="min-w-0 flex-1 truncate" data-testid="text-share-link">{shareUrl(saved.slug)}</code>
                <Button type="button" size="sm" onClick={async () => { const ok = await copyToClipboard(shareUrl(saved.slug)); toast({ title: ok ? "Link copied" : "Copy this link", description: shareUrl(saved.slug) }); }} data-testid="button-copy-share">Copy</Button>
                <Button type="button" size="sm" variant="ghost" onClick={newLink}>New link</Button>
              </div>
            )}
            {saved && form.visibility !== saved.visibility && <p className="text-xs text-muted-foreground">Save to apply the new sharing setting.</p>}
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="bot-show-instructions">Show instructions to people you share with</Label>
                <p className="text-xs text-muted-foreground">Off by default. When off, your instructions stay private, and the bot won't reveal them.</p>
              </div>
              <Switch id="bot-show-instructions" checked={form.showInstructions} onCheckedChange={value => set("showInstructions", value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bot-model">AI model</Label>
              <Select value={form.model ?? DEFAULT_MODEL} onValueChange={value => set("model", value === DEFAULT_MODEL ? null : value)}>
                <SelectTrigger id="bot-model" data-testid="select-model"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_MODEL}>Default{options.data ? ` (${options.data.defaultModel})` : ""}</SelectItem>
                  {options.data?.models.filter(model => model !== options.data?.defaultModel).map(model => <SelectItem key={model} value={model}>{model}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </section>

          {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-bot-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => navigate(backTo)}>Cancel</Button>
            <Button type="submit" disabled={!canSave} data-testid="button-save-bot-bottom">{editingId ? "Save changes" : "Create bot"}</Button>
          </div>
          {saved && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5" data-testid="danger-zone">
              <div>
                <h2 className="font-semibold">Delete this bot</h2>
                <p className="text-sm text-muted-foreground">Removes it and every chat anyone has had with it. This can't be undone.</p>
              </div>
              <Button type="button" variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDelete(true)} data-testid="button-delete-bot">
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete bot
              </Button>
            </section>
          )}
        </form>

        <aside className="lg:sticky lg:top-20 lg:self-start space-y-3" aria-label="Live preview">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Live preview</h2>
          <BotCard name={form.name} description={form.description} avatarEmoji={form.avatarEmoji} avatarUrl={form.avatarUrl} visibility={form.visibility} />
          <div className="rounded-2xl border border-border bg-card/60 p-4" data-testid="bot-preview-chat">
            <div className="flex gap-2">
              <BotAvatar emoji={form.avatarEmoji} url={form.avatarUrl} name={form.name || "Bot"} className="h-8 w-8 text-lg" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{form.name || "Your bot"}</p>
                <div className="mt-1 rounded-2xl rounded-tl-sm bg-secondary/60 px-3 py-2 text-sm" data-testid="text-preview-greeting">
                  {form.greeting.trim() || `Hi! I'm ${form.name.trim() || "your new bot"}. How can I help?`}
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <div className="rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">Hello! What can you do?</div>
            </div>
          </div>
        </aside>
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{saved?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This deletes the bot and every chat anyone has had with it, including people you shared it with. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={removeBot} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete-bot">Delete bot</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
