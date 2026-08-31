"use client";

/**
 * Shared Apex design primitives — the tokens and building blocks lifted from
 * the design build, so every panel is styled from one place rather than each
 * page re-deriving the same hex codes.
 *
 * Tokens match `SubdivisionCalc.tsx`, which was styled first.
 */

export const C = {
  page: "#DBE0E8",
  card: "#FFFFFF",
  border: "#E1E7EF",
  divider: "#EDF1F6",
  ink: "#14233A",
  label: "#5A6B82",
  faint: "#7A8698",
  mono: "#8894A6",
  dark: "#16191F",
  darkText: "#F1ECDD",
  accent: "#333A43",
  good: "#22C55E",
  danger: "#EF4444",
  chipBg: "#EEF2F7",
} as const;

export const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/** White panel — the default container for every section on a detail page. */
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        padding: "26px 28px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Section heading inside a Card. */
export function CardTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>{children}</div>
      {sub && (
        <div style={{ fontSize: 14, color: "#6E7C90", marginTop: 6, lineHeight: 1.5, maxWidth: 560 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** Label/value row — the workhorse of the pricing, cashflow and feasibility panels. */
export function Row({
  label,
  value,
  strong,
  tone,
  last,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  tone?: "good" | "bad";
  last?: boolean;
}) {
  const color = tone === "good" ? C.good : tone === "bad" ? C.danger : strong ? C.accent : undefined;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 20,
        padding: "13px 0",
        borderBottom: last ? undefined : `1px solid ${C.divider}`,
      }}
    >
      <span style={{ fontSize: 15, color: C.label, flexShrink: 0 }}>{label}</span>
      <span
        className="tnum"
        style={{ fontSize: 16, fontWeight: strong ? 800 : 600, color, textAlign: "right" }}
      >
        {value}
      </span>
    </div>
  );
}

/** All-caps mono eyebrow used above every figure. */
export function Eyebrow({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 10.5,
        letterSpacing: ".14em",
        color: dark ? "#7C8698" : C.mono,
      }}
    >
      {children}
    </div>
  );
}

/** One of the six key-spec tiles. */
export function SpecTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "16px 18px",
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: C.mono }}>
        {label}
      </div>
      <div className="tnum" style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

/** Chip on the dark hero. */
export function HeroChip({ children, tone }: { children: React.ReactNode; tone?: "good" }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 12,
        background: tone === "good" ? "rgba(52,211,153,.12)" : "rgba(255,255,255,.08)",
        border: `1px solid ${tone === "good" ? "rgba(52,211,153,.3)" : "rgba(255,255,255,.14)"}`,
        borderRadius: 9,
        padding: "7px 12px",
        whiteSpace: "nowrap",
        color: tone === "good" ? "#C9CED6" : undefined,
      }}
    >
      {children}
    </span>
  );
}

/** Caveat strip — screening-only warnings and assumption notes. */
export function Note({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  if (!warn) {
    return (
      <div style={{ fontSize: 12.5, color: C.faint, marginTop: 16, lineHeight: 1.5 }}>{children}</div>
    );
  }
  return (
    <div
      style={{
        fontSize: 12.5,
        color: "#6D28D9",
        background: "rgba(59,108,168,.09)",
        border: "1px solid rgba(59,108,168,.22)",
        borderRadius: 11,
        padding: "12px 15px",
        marginTop: 16,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}
