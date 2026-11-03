import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface AuthUser { id: string; email: string; displayName: string | null; timeZone: string | null }

interface AuthValue {
  user: AuthUser | null;
  isLoading: boolean;
  loadError: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function postAuth(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => { throw new Error("Can't reach the Bertha server. Check your connection and try again."); });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Something went wrong (${response.status}). Please try again.`);
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const me = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async (): Promise<AuthUser | null> => {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Could not check your sign-in. Please reload the page.");
      return (await response.json()).user;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // A request came back 401 (session expired or logged out elsewhere): re-check.
  useEffect(() => {
    const recheck = () => cache.invalidateQueries({ queryKey: ["/api/auth/me"] });
    window.addEventListener("bertha-unauthorized", recheck);
    return () => window.removeEventListener("bertha-unauthorized", recheck);
  }, [cache]);

  // Drop everything cached for the previous account, but keep the sign-in query itself
  // (removing it would detach the observer above and the screen would not update).
  const resetAccountData = useCallback((user: AuthUser | null) => {
    cache.removeQueries({ predicate: query => query.queryKey[0] !== "/api/auth/me" });
    cache.setQueryData(["/api/auth/me"], user);
  }, [cache]);
  const signedIn = resetAccountData;

  const login = useCallback(async (email: string, password: string) => {
    const data = await postAuth("/api/auth/login", { email, password });
    signedIn(data.user);
  }, [signedIn]);

  const signup = useCallback(async (email: string, password: string, displayName: string) => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const data = await postAuth("/api/auth/signup", { email, password, displayName: displayName || null, timeZone });
    signedIn(data.user);
  }, [signedIn]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    window.speechSynthesis?.cancel();
    window.history.replaceState(null, "", "/");
    resetAccountData(null);
  }, [resetAccountData]);

  return (
    <AuthContext.Provider value={{
      user: me.data ?? null,
      isLoading: me.isLoading,
      loadError: me.error ? (me.error as Error).message : null,
      login, signup, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
