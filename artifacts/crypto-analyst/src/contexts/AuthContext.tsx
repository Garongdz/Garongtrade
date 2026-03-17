import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface AuthState {
  authenticated: boolean;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (pin: string) => Promise<{ success: boolean; locked?: boolean; remaining?: number; attemptsLeft?: number }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ authenticated: false, loading: true });

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/check`, { credentials: "include" });
      setState({ authenticated: res.ok, loading: false });
    } catch {
      setState({ authenticated: false, loading: false });
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = useCallback(async (pin: string) => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (data.success) setState({ authenticated: true, loading: false });
    return data;
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    setState({ authenticated: false, loading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
