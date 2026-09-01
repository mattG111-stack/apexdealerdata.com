"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Me, api, setToken } from "./api";

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Me | null>;
  signOut: () => void;
  refresh: () => Promise<Me | null>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async (): Promise<Me | null> => {
    setLoading(true);
    try {
      const m = await api<Me>("/api/auth/me");
      setMe(m);
      return m;
    } catch {
      setMe(null);
      setToken(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const body = new URLSearchParams({ username: email, password }).toString();
      const r = await api<{ access_token: string }>("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      setToken(r.access_token);
      return await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(() => {
    setToken(null);
    setMe(null);
    router.push("/sign-in");
  }, [router]);

  return <Ctx.Provider value={{ me, loading, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
