"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LANGUAGES, useT } from "@/lib/i18n";
import { ApexMark } from "./ApexLogo";
import { C, MONO } from "./apex";

/**
 * Apex shell — dark rail, sticky translucent header. Styled from the design
 * build; tokens live in `apex.tsx`.
 */

interface Nav {
  href: string;
  label: string;
  dot?: string;
}

const overview: Nav[] = [
  { href: "/yard", label: "Your yard" },
  { href: "/ask", label: "Ask" },
];

const adminNav: Nav[] = [
  { href: "/admin/users", label: "Users & yards" },
  { href: "/admin/upload", label: "Weekly data" },
  { href: "/admin/publish", label: "Review & publish" },
  { href: "/admin/settings", label: "API keys" },
];

/** True when the viewport is narrow enough to swap the fixed rail for a drawer.
 *  Defaults to false on the server / first paint; corrects on mount. */
export function useIsMobile(maxWidth = 900) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [maxWidth]);
  return isMobile;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { me, loading, signOut } = useAuth();
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace("/sign-in");
    // Authenticated but hasn't finished onboarding / has no live subscription —
    // send them to the paywall instead of flashing the app then bouncing on 402.
    else if (!me.has_access) router.replace("/onboarding");
  }, [loading, me, router]);

  // Close the drawer on navigation and whenever we grow back to desktop.
  useEffect(() => { setNavOpen(false); }, [pathname]);
  useEffect(() => { if (!isMobile) setNavOpen(false); }, [isMobile]);

  if (loading || !me || !me.has_access) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: C.label, fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  const initials = (me.full_name || me.email).slice(0, 2).toUpperCase();

  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%", background: C.page }}>
      {/* Dim + dismiss the drawer on mobile */}
      {isMobile && navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,18,22,.55)", zIndex: 40 }}
        />
      )}
      <aside
        style={{
          width: 264,
          background: C.dark,
          color: "#EFE9DA",
          display: "flex",
          flexDirection: "column",
          padding: "26px 20px",
          height: "100vh",
          top: 0,
          ...(isMobile
            ? {
                position: "fixed",
                left: 0,
                zIndex: 50,
                transform: navOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform .25s ease",
                boxShadow: navOpen ? "0 0 44px rgba(0,0,0,.45)" : "none",
              }
            : { flex: "0 0 264px", position: "sticky" }),
        }}
      >
        <Link href="/yard" style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 4px 4px", color: "#EFE9DA" }}>
          <ApexMark size={40} />
          <div>
            <div style={{ fontFamily: "var(--font-space-grotesk), 'Archivo', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: "-.05em", lineHeight: 1, color: "#EFE9DA" }}>
              apex
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".2em", color: "#8A8AA8", marginTop: 4 }}>
              DEALER DATA
            </div>
          </div>
        </Link>

        <nav style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 26, flex: 1, overflowY: "auto" }}>
          <NavGroup label="Overview" items={overview} pathname={pathname} t={t} />
          {me.role === "admin" && <NavGroup label="Admin" items={adminNav} pathname={pathname} small t={t} />}
        </nav>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "14px 8px 0",
            borderTop: "1px solid rgba(255,255,255,.07)",
            marginTop: 8,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              background: C.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 13,
              color: "#fff",
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: "#EFE9DA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {me.full_name || me.email}
            </div>
            <div style={{ fontSize: 11, color: "#767690", textTransform: "capitalize" }}>{me.role}</div>
          </div>
          <button
            onClick={signOut}
            style={{ fontSize: 11.5, color: "#767690", background: "none", border: "none", cursor: "pointer" }}
          >
            {t("nav.signOut")}
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar initials={initials} onMenu={() => setNavOpen(true)} showMenu={isMobile} />
        {children}
      </main>
    </div>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  small,
  t,
}: {
  label: string;
  items: Nav[];
  pathname: string | null;
  small?: boolean;
  t: (k: string) => string;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: ".2em",
          color: "#6A6A82",
          padding: "0 12px 10px",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((it) => (
          <NavItem key={it.href} item={it} active={pathname === it.href} small={small} t={t} />
        ))}
      </div>
    </div>
  );
}

function NavItem({ item, active, small, t }: { item: Nav; active: boolean; small?: boolean; t: (k: string) => string }) {
  return (
    <Link
      href={item.href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: active ? "11px 12px" : "9px 12px",
        borderRadius: 10,
        fontWeight: active ? 700 : 500,
        fontSize: small ? 13.5 : 14.5,
        color: active ? "#FFFFFF" : small ? "#8A8AA8" : "#B0B0C8",
        background: active ? "linear-gradient(90deg,#333A43,#1B2026)" : undefined,
        boxShadow: active ? "0 4px 14px rgba(120,125,133,.4)" : undefined,
      }}
    >
      <span>{t(item.label)}</span>
      {item.dot && (
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.dot, flexShrink: 0 }} />
      )}
    </Link>
  );
}

function TopBar({ initials, onMenu, showMenu }: { initials: string; onMenu?: () => void; showMenu?: boolean }) {
  const router = useRouter();
  const { t, lang, setLang } = useT();
  const [q, setQ] = useState("");
  const [langOpen, setLangOpen] = useState(false);
  const [newMatches, setNewMatches] = useState(0);
  const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  // Wish-list match alerts — poll the badge count.
  useEffect(() => {
    let alive = true;
    const fetchN = () =>
      Promise.resolve({ total_new: 0 })
        .then((r) => { if (alive) setNewMatches(r.total_new); })
        .catch(() => {});
    fetchN();
    const id = setInterval(fetchN, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    router.push(`/yard?search=${encodeURIComponent(term)}`);
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: showMenu ? "14px 16px" : "20px 40px",
        borderBottom: `1px solid ${C.border}`,
        background: "rgba(219,224,232,.85)",
        backdropFilter: "blur(8px)",
        position: "sticky",
        top: 0,
        zIndex: 5,
      }}
    >
      {showMenu && (
        <button
          type="button"
          onClick={onMenu}
          aria-label={t("nav.overview")}
          style={{
            flexShrink: 0, width: 42, height: 42, borderRadius: 11,
            border: `1px solid ${C.border}`, background: C.card, cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          }}
        >
          <span style={{ width: 18, height: 2, background: C.ink, borderRadius: 2 }} />
          <span style={{ width: 18, height: 2, background: C.ink, borderRadius: 2 }} />
          <span style={{ width: 18, height: 2, background: C.ink, borderRadius: 2 }} />
        </button>
      )}
      <form
        onSubmit={submit}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 13,
          padding: "13px 18px",
          boxShadow: "0 1px 0 rgba(255,255,255,.6) inset",
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            border: "2px solid #8894A6",
            borderRadius: "50%",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("top.search")}
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "inherit",
            fontSize: 15,
            color: C.ink,
            width: "100%",
          }}
        />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: C.mono,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: "2px 7px",
            flexShrink: 0,
          }}
        >
          ↵
        </span>
      </form>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 11,
          padding: "9px 15px",
          fontWeight: 700,
          fontSize: 14,
          color: C.ink,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent }} />
        {t("top.region")}
      </div>

      {/* Wish-list alerts */}
      <Link
        href="/wishlists"
        aria-label={t("nav.wishlists")}
        title={t("nav.wishlists")}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 42,
          height: 42,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          color: "#5A6B82",
          flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {newMatches > 0 && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 19,
              height: 19,
              padding: "0 4px",
              background: "#22C55E",
              color: "#fff",
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #DBE0E8",
            }}
          >
            {newMatches > 99 ? "99+" : newMatches}
          </span>
        )}
      </Link>

      {/* Language switcher — shows the current language; click to change. */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setLangOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={langOpen}
          aria-label={t("settings.language")}
          title={t("settings.language")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 42,
            height: 42,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            color: langOpen ? C.accent : "#5A6B82",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        {langOpen && (
          <>
            <div onClick={() => setLangOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                zIndex: 21,
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                boxShadow: "0 12px 30px -12px rgba(16,24,40,.28)",
                overflow: "hidden",
                minWidth: 180,
                paddingBottom: 4,
              }}
            >
              <div
                style={{
                  padding: "10px 14px 6px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "#8894A6",
                }}
              >
                {t("settings.language")}
              </div>
              {LANGUAGES.map((l) => {
                const active = l.code === lang;
                return (
                  <button
                    key={l.code}
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setLang(l.code);
                      setLangOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 13.5,
                      fontWeight: 600,
                      background: active ? C.accent : "transparent",
                      color: active ? "#fff" : "#41505F",
                    }}
                  >
                    <span style={{ width: 20, fontSize: 15 }}>{l.short}</span>
                    <span>{l.label}</span>
                  </button>
                );
              })}
              <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0" }} />
              <button
                role="menuitem"
                onClick={() => {
                  setLangOpen(false);
                  router.push("/settings");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13.5,
                  fontWeight: 600,
                  background: "transparent",
                  color: "#41505F",
                }}
              >
                <span style={{ width: 20, textAlign: "center", fontSize: 14 }}>⚙</span>
                <span>{t("settings.title")}</span>
              </button>
            </div>
          </>
        )}
      </div>
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          background: C.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 14,
          color: "#fff",
          flexShrink: 0,
        }}
      >
        {initials}
      </div>
    </header>
  );
}
