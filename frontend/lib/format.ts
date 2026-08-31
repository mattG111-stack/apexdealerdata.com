const nzd = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  maximumFractionDigits: 0,
});

// Property-scale money is rounded to the nearest $1,000. A valuation reading
// "$907,939" implies a precision the model does not have — median error is
// ~7.9%, so the last three digits are noise dressed up as accuracy.
// The floor keeps small figures (weekly rent, fees) exact.
const ROUND_ABOVE = 50_000;

export function toNearestThousand(v: number): number {
  return Math.abs(v) >= ROUND_ABOVE ? Math.round(v / 1000) * 1000 : v;
}

export function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return nzd.format(toNearestThousand(v));
}

export function fmtMoneyShort(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtNumber(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function fmtArea(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 10_000) return `${(v / 10_000).toFixed(2)} ha`;
  return `${Math.round(v).toLocaleString()} m²`;
}

// Format a Unix epoch (seconds or ms, as number or numeric string) into "Mon YYYY".
// Falls back to parsing an ISO/date string; returns "—" if unusable.
export function fmtEpoch(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) {
    const d = new Date(n < 1e12 ? n * 1000 : n);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("en-NZ", { month: "short", year: "numeric" });
  }
  const d2 = new Date(v as string);
  return isNaN(d2.getTime()) ? String(v) : d2.toLocaleDateString("en-NZ", { month: "short", year: "numeric" });
}

// Full NZ-style date: dd-mm-yyyy. Handles our epoch-seconds strings
// ("1097924400.0"), ISO dates ("2026-07-01"), and leaves a bare year untouched.
export function fmtDayDate(v: string | number | null | undefined): string {
  if (v == null || v === "" || v === "—") return "—";
  const s = String(v);
  if (/^\d{4}$/.test(s)) return s;                 // bare year — nothing to expand
  let d: Date;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0 && !s.includes("-")) {
    d = new Date(n < 1e12 ? n * 1000 : n);         // epoch seconds or ms
  } else {
    d = new Date(s);                               // ISO / parseable string
  }
  if (isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}
