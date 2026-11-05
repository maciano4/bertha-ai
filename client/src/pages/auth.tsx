import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

// `embedded` renders just the card (used under a shared bot's card on /b/<slug>).
export default function AuthPage({ initialMode = "login", embedded = false, signupText }: { initialMode?: "login" | "signup"; embedded?: boolean; signupText?: string }) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";
  const passwordUpdated = !isSignup && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("passwordReset") === "1";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (isSignup && password.length < 8) return setError("Your password needs at least 8 characters.");
    setBusy(true);
    try {
      if (isSignup) await signup(email.trim(), password, displayName.trim());
      else await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => { setMode(isSignup ? "login" : "signup"); setError(null); };

  return (
    <main className={embedded ? "flex justify-center" : "chat-background min-h-screen flex items-center justify-center p-4"}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background/95 p-6 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/icons/icon-192.png"
            alt="Bertha AI"
            className="mb-3 h-16 w-16 rounded-full border-2 border-primary object-cover shadow"
          />
          <h1 className="text-2xl font-bold text-foreground">{isSignup ? "Create your Bertha account" : "Welcome back"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSignup && signupText ? signupText : isSignup ? "Your chats and appointments are saved to your account and follow you to any device." : "Log in to see your chats and appointments."}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {isSignup && (
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Your first name (optional)</Label>
              <Input id="displayName" autoComplete="given-name" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80} data-testid="input-name" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} data-testid="input-email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} required minLength={isSignup ? 8 : undefined}
              value={password} onChange={e => setPassword(e.target.value)} data-testid="input-password" />
            {isSignup && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
            {!isSignup && (
              <a href="/forgot-password" className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline" data-testid="link-forgot-password">
                Forgot password?
              </a>
            )}
          </div>
          {passwordUpdated && !error && (
            <p role="status" className="rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground" data-testid="text-password-reset">
              Your password was updated. Please log in.
            </p>
          )}
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-auth-error">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !email || !password} data-testid="button-auth-submit">
            {busy ? "Please wait..." : isSignup ? "Create account" : "Log in"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {isSignup ? "Already have an account?" : "New to Bertha?"}{" "}
          <button type="button" onClick={switchMode} className="font-medium text-primary underline-offset-4 hover:underline" data-testid="button-auth-switch">
            {isSignup ? "Log in" : "Create an account"}
          </button>
        </p>
      </div>
    </main>
  );
}
