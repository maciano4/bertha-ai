import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Appointments from "@/pages/appointments";
import AuthPage from "@/pages/auth";
import NotFound from "@/pages/not-found";
import BotsPage from "@/pages/bots";
import BotEditor from "@/pages/bot-editor";
import ExplorePage from "@/pages/explore";
import BotSharePage from "@/pages/bot-share";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/appointments" component={Appointments} />
      <Route path="/bots" component={BotsPage} />
      <Route path="/bots/new" component={BotEditor} />
      <Route path="/bots/:id/edit" component={BotEditor} />
      <Route path="/explore" component={ExplorePage} />
      <Route path="/b/:slug" component={BotSharePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Everything in the app needs an account; show login/sign-up until there is one.
function AuthGate() {
  const { user, isLoading, loadError } = useAuth();
  const [location] = useLocation();
  if (isLoading) {
    return <div className="chat-background flex min-h-screen items-center justify-center text-muted-foreground" role="status">Loading Bertha...</div>;
  }
  if (loadError) {
    return (
      <div className="chat-background flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center" role="alert">
        <p className="text-foreground">{loadError}</p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }
  // A shared bot's card is visible signed out, with a sign-up prompt.
  if (!user && location.startsWith("/b/")) return <Router />;
  if (!user) return <AuthPage initialMode={window.location.pathname === "/signup" ? "signup" : "login"} />;
  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <AuthGate />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
