import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import Appointments from "@/pages/appointments";
import AuthPage from "@/pages/auth";
import PasswordResetPage from "@/pages/password-reset";
import NotFound from "@/pages/not-found";
import BotsPage from "@/pages/bots";
import BotEditor from "@/pages/bot-editor";
import BotSharePage from "@/pages/bot-share";
import AppShell from "@/components/app/AppShell";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/appointments" component={Appointments} />
      <Route path="/bots" component={BotsPage} />
      <Route path="/bots/new" component={BotEditor} />
      <Route path="/bots/:id/edit" component={BotEditor} />
      <Route path="/b/:slug" component={BotSharePage} />
      {/* Old pages folded into the app: the dashboard is the sidebar now, Explore is gone. */}
      <Route path="/dashboard"><Redirect to="/" replace /></Route>
      <Route path="/explore"><Redirect to="/" replace /></Route>
      <Route path="/login"><Redirect to="/" replace /></Route>
      <Route path="/signup"><Redirect to="/" replace /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

const Splash = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-background p-4 text-center text-muted-foreground">
    <img src="/icons/icon-192.png" alt="" className="h-14 w-14 rounded-2xl" />
    {children}
  </div>
);

function isPasswordResetPath(location: string) {
  const path = location.split("?")[0].replace(/\/$/, "") || "/";
  return path === "/forgot-password" || path === "/reset-password";
}

// Everything in the app needs an account; show login/sign-up until there is one.
// The reset pages stay reachable while signed in, so an emailed link always opens the form.
function AuthGate() {
  const { user, isLoading, loadError } = useAuth();
  const [location] = useLocation();
  if (isPasswordResetPath(location)) return <PasswordResetPage />;
  if (isLoading) return <Splash><span role="status">Loading Bertha...</span></Splash>;
  if (loadError) {
    return (
      <Splash>
        <p className="text-foreground" role="alert">{loadError}</p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </Splash>
    );
  }
  // A shared bot's card is visible signed out, with a sign-up prompt.
  if (!user && location.startsWith("/b/")) return <Route path="/b/:slug" component={BotSharePage} />;
  if (!user) return <AuthPage initialMode={window.location.pathname === "/signup" ? "signup" : "login"} />;
  return <AppShell><Router /></AppShell>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <AuthProvider>
          <Toaster />
          <AuthGate />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
