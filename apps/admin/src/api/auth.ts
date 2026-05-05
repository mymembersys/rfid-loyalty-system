import { createContext, createElement, ReactNode, useContext, useEffect, useState } from "react";
import { apiFetch } from "./client";

const TOKEN_KEY = "rfid_admin_token";
const USER_KEY  = "rfid_admin_user";

export type AuthUser = {
  id: string; email: string; full_name: string; role: string; branch_id: string | null;
};

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser]   = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user)); else localStorage.removeItem(USER_KEY);
  }, [user]);

  async function login(email: string, password: string) {
    const r = await apiFetch<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(r.token);
    setUser(r.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return createElement(AuthContext.Provider, { value: { token, user, login, logout } }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
