import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Appointments from "@/pages/appointments";
import AuthPage from "@/pages/auth";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/appointments" component={Appointments} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Everything in the app needs an account; show login/sign-up until there is one.
function AuthGate() {
  const { user, isLoading, loadError } = useAuth();
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
