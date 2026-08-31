"use client";

/**
 * Minimal translation shim.
 *
 * Apex is English-only for now, so the sensible thing
 * is a small map plus a readable fallback rather than a large file of strings
 * nothing renders.
 *
 * The API is unchanged (`useT()` -> `{ t, lang, setLang }`) so callers didn't
 * have to change. If real localisation is needed later, swap the map for a
 * proper catalogue — nothing else has to move.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type Lang = "en";

const STRINGS: Record<string, string> = {
  "nav.overview": "Overview",
  "nav.admin": "Admin",
  "nav.ask": "Ask",
  "nav.yard": "Your yard",
  "nav.weeklyUpload": "Weekly data",
  "nav.reviewPublish": "Review & publish",
  "nav.allUsers": "Users & yards",
  "nav.apiKeys": "API keys",
  "top.search": "Search your stock…",
  "auth.signIn": "Sign in",
  "auth.signInFailed": "Couldn't sign in. Check your email and password.",
  "auth.signOut": "Sign out",
};

/** 'nav.reviewPublish' -> 'Review publish' — readable rather than a raw key. */
function humanise(key: string): string {
  const tail = key.includes(".") ? key.slice(key.lastIndexOf(".") + 1) : key;
  const spaced = tail.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface Ctx {
  t: (key: string, vars?: Record<string, string | number>) => string;
  lang: Lang;
  setLang: (l: Lang) => void;
}

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    let out = STRINGS[key] ?? humanise(key);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return out;
  }, []);

  const value = useMemo(() => ({ t, lang, setLang }), [t, lang]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useT(): Ctx {
  const ctx = useContext(I18nCtx);
  // Usable outside a provider so a page can't crash over a missing wrapper.
  if (!ctx) {
    return {
      t: (key: string) => STRINGS[key] ?? humanise(key),
      lang: "en",
      setLang: () => {},
    };
  }
  return ctx;
}

/**
 * Language options. English only for now — shipping empty locales would be
 * worse than shipping one that's complete.
 */
export const LANGUAGES: { code: Lang; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
];
