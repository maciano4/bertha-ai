import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SENT_MESSAGE = "If an account exists for that email, we sent a link to reset your password. It expires in one hour.";

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="chat-background min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background/95 p-6 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/icons/icon-192.png"
            alt="Bertha AI"
            className="mb-3 h-16 w-16 rounded-full border-2 border-primary object-cover shadow"
          />
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  );
}

function BackToLogin() {
  return (
    <p className="mt-5 text-center text-sm text-muted-foreground">
      <a href="/" className="font-medium text-primary underline-offset-4 hover:underline" data-testid="link-back-to-login">
        Back to log in
      </a>
    </p>
  );
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => { throw new Error("Can't reach the Bertha server. Check your connection and try again."); });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Something went wrong (${response.status}). Please try again.`);
  return data;
}

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await postJson("/api/auth/forgot-password", { email: email.trim() });
      setSent(data.message || SENT_MESSAGE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Forgot your password?"
      subtitle="Enter the email on your account. If we know it, we'll send a link to choose a new password."
    >
      {sent ? (
        <p role="status" className="rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground" data-testid="text-reset-sent">{sent}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} data-testid="input-reset-email" />
          </div>
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-reset-error">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !email.trim()} data-testid="button-reset-request">
            {busy ? "Please wait..." : "Email me a reset link"}
          </Button>
        </form>
      )}
      <BackToLogin />
    </Card>
  );
}

function SetPasswordForm() {
  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") || "" : "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!token) return setError("This reset link is invalid or has already been used. Request a new one.");
    if (password.length < 8) return setError("Your password needs at least 8 characters.");
    if (password.length > 200) return setError("That password is too long.");
    if (password !== confirm) return setError("Those passwords don't match.");
    setBusy(true);
    try {
      await postJson("/api/auth/reset-password", { token, password, confirmPassword: confirm });
      setDone(true);
      window.location.assign("/?passwordReset=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <Card title="This reset link doesn't work" subtitle="It may be missing, expired, or already used. Request a new one and we'll email it to you.">
        <a href="/forgot-password" className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline" data-testid="link-request-new-reset">
          Request a new link
        </a>
        <BackToLogin />
      </Card>
    );
  }

  return (
    <Card title="Choose a new password" subtitle="At least 8 characters. After this, you'll log in again on every device.">
      {done ? (
        <p role="status" className="rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground" data-testid="text-reset-done">
          Your password was updated. Taking you to log in...
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={event => setPassword(event.target.value)} data-testid="input-new-password" />
            <p className={`text-xs ${tooShort ? "text-destructive" : "text-muted-foreground"}`}>At least 8 characters.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input id="confirmPassword" type="password" autoComplete="new-password" required value={confirm} onChange={event => setConfirm(event.target.value)} data-testid="input-confirm-password" />
            {mismatch && <p className="text-xs text-destructive" role="alert">Those passwords don't match.</p>}
          </div>
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-reset-error">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || password.length < 8 || password !== confirm} data-testid="button-reset-submit">
            {busy ? "Please wait..." : "Update password"}
          </Button>
        </form>
      )}
      {!done && (
        <p className="mt-5 text-center text-sm text-muted-foreground">
          <a href="/forgot-password" className="font-medium text-primary underline-offset-4 hover:underline">Request a new link</a>
        </p>
      )}
      <BackToLogin />
    </Card>
  );
}

export default function PasswordResetPage() {
  const path = typeof window !== "undefined" ? window.location.pathname.replace(/\/$/, "") : "";
  if (path === "/reset-password") return <SetPasswordForm />;
  return <ForgotPasswordForm />;
}
