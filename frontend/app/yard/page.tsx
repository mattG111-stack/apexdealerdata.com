"use client";

/**
 * The dealer screen: what the market is doing to their models, what they're
 * holding, and a box to price a car.
 *
 * Not a dashboard of tiles. Every number here is one a dealer can act on this
 * morning, and every one carries the evidence behind it — the comp count and
 * confidence sit next to the figure, because "12% over market" off four comps
 * and off thirty are different statements and only one is worth acting on.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Me, ModelTrend, PriceResult, StockRow, StockSummary, api,
} from "@/lib/api";
import { CompScatter } from "@/components/CompScatter";

export default function YardPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [trends, setTrends] = useState<ModelTrend[]>([]);
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [u, t, s, k] = await Promise.all([
          api<Me>("/api/auth/me"),
          api<ModelTrend[]>("/api/dealer/insights").catch(() => []),
          api<StockSummary>("/api/dealer/stock/summary").catch(() => null),
          api<StockRow[]>("/api/dealer/stock?limit=12").catch(() => []),
        ]);
        setMe(u); setTrends(t); setSummary(s); setStock(k);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load.");
      }
    })();
  }, []);

  return (
    <main className="apex" style={{ maxWidth: 960, margin: "0 auto", padding: "30px 20px 90px" }}>
      <Greeting name={me?.full_name || me?.email?.split("@")[0] || null} />

      {error && <Banner tone="bad">{error}</Banner>}

      {summary && summary.cars > 0 && (
        <section style={{ marginTop: 22 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Stat label="on the yard" value={summary.cars.toLocaleString()} />
            <Stat label="asking total" value={money(summary.total_asking)} />
            <Stat
              label="past 90 days"
              value={`${summary.over_90_days}`}
              sub={money(summary.over_90_value) + " tied up"}
              tone={summary.over_90_days > 0 ? "warn" : undefined}
            />
            <Stat
              label="median days listed"
              value={summary.median_days_listed?.toFixed(0) ?? "—"}
            />
            <Stat label="priced over market" value={`${summary.priced_over_market}`} />
            <Stat label="priced under" value={`${summary.priced_under_market}`} />
          </div>
        </section>
      )}

      <Section title="What your models are doing">
        {trends.length === 0 ? (
          <Empty>Not enough sales history yet to trend your models.</Empty>
        ) : (
          <Table
            head={["model", "you sold", "then", "now", "move"]}
            rows={trends.slice(0, 8).map((t) => [
              `${t.make} ${t.model}`,
              String(t.my_sales),
              money(t.then_ask),
              money(t.now_ask),
              <Move key="m" pct={t.move_pct} dollars={t.move_dollars} />,
            ])}
          />
        )}
        <Note>
          Measured on cars newly listed each week, not the whole book — 90% of
          live listings never change price, so the full book measures stickiness
          rather than the market.
        </Note>
      </Section>

      <Section title="Your stock, against the market">
        {stock.length === 0 ? (
          <Empty>No priced stock for the latest week.</Empty>
        ) : (
          <Table
            head={["car", "kms", "asking", "worth", "vs market", "evidence", "days"]}
            rows={stock.map((s) => [
              `${s.year ?? ""} ${s.make ?? ""} ${s.model ?? ""} ${s.spec ?? ""}`.trim(),
              s.kms ? `${Math.round(s.kms / 1000)}k` : "—",
              money(s.price),
              money(s.fair_value),
              <Move key="v" pct={s.margin_pct} invert />,
              <Evidence key="e" comps={s.comps_used} confidence={s.confidence} />,
              String(s.days_listed ?? "—"),
            ])}
          />
        )}
        <Note>
          Ordered by strength of evidence first, then by how far the price sits
          from the market — a big gap off three comps is noise, not a finding.
        </Note>
      </Section>

      <PriceACar />
    </main>
  );
}

/* ---------- greeting ---------- */

function Greeting({ name }: { name: string | null }) {
  // NZ time, not the server's — this deploys offshore and a Wellington dealer
  // should not be told "good evening" at breakfast.
  const hour = Number(
    new Intl.DateTimeFormat("en-NZ", {
      hour: "numeric", hour12: false, timeZone: "Pacific/Auckland",
    }).format(new Date())
  );
  const part = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const who = name ? `, ${name.split(" ")[0]}` : "";

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.03em" }}>
        {part}{who} — let&apos;s move some metal
      </h1>
      <p style={{ color: "#5b6472", marginTop: 6, fontSize: 15 }}>
        Here&apos;s your yard and the market around it.
      </p>
    </div>
  );
}

/* ---------- price a car ---------- */

function PriceACar() {
  const [form, setForm] = useState({
    make: "", model: "", variant: "", year: "", kms: "",
    engine_cc: "", fuel_type: "", region: "",
  });
  const [result, setResult] = useState<PriceResult | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      setResult(await api<PriceResult>("/api/dealer/price", {
        method: "POST",
        body: JSON.stringify({
          make: form.make, model: form.model,
          variant: form.variant || undefined,
          year: form.year ? Number(form.year) : undefined,
          kms: form.kms ? Number(form.kms) : undefined,
          engine_cc: form.engine_cc ? Number(form.engine_cc) : undefined,
          fuel_type: form.fuel_type || undefined,
          region: form.region || undefined,
        }),
      }));
    } catch {
      setResult({ priced: false, reason: "Couldn't price that." });
    } finally { setBusy(false); }
  }, [form]);

  return (
    <Section title="Price a car">
      <form onSubmit={submit} style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
        gap: 8,
      }}>
        <In p="Make" v={form.make} on={set("make")} required />
        <In p="Model" v={form.model} on={set("model")} required />
        <In p="Trim" v={form.variant} on={set("variant")} />
        <In p="Year" v={form.year} on={set("year")} />
        <In p="Kms" v={form.kms} on={set("kms")} />
        <In p="Engine cc" v={form.engine_cc} on={set("engine_cc")} />
        <In p="Fuel" v={form.fuel_type} on={set("fuel_type")} />
        <In p="Region" v={form.region} on={set("region")} />
        <button type="submit" disabled={busy || !form.make || !form.model} style={{
          padding: "10px 18px", borderRadius: 10, border: "1px solid #16A34A",
          background: "#22C55E", color: "#06210F", fontWeight: 700, fontSize: 14,
          cursor: "pointer", gridColumn: "span 1",
        }}>
          {busy ? "…" : "Price it"}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: 14 }}>
          {result.priced ? (
            <div className="ax-panel ax-rise">
              <div style={{ display: "flex", alignItems: "baseline", gap: 14,
                            flexWrap: "wrap" }}>
                <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-.04em" }}>
                  {money(result.mid)}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 14 }}>
                  range {money(result.low)}–{money(result.high)}
                </div>
              </div>

              {result.comp_points && result.comp_points.length > 1 && (
                <div style={{ marginTop: 16 }}>
                  <CompScatter
                    points={result.comp_points}
                    targetKms={form.kms ? Number(form.kms) : null}
                    targetPrice={result.mid ?? null}
                    valueMid={result.mid ?? null}
                  />
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 13, color: "#5b6472" }}>
                {result.comps} comps ({result.sold_comps} sold, {result.listed_comps} listed)
                {result.variant_used ? ` · read as ${result.variant_used}` : ""}
                <br />
                {result.step}
                {result.expanded && (
                  <strong style={{ color: "#92400E" }}> · net was widened, treat as indicative</strong>
                )}
              </div>
            </div>
          ) : (
            <Banner tone="warn">{result.reason || "Couldn't price that."}</Banner>
          )}
        </div>
      )}
    </Section>
  );
}

/* ---------- bits ---------- */

function money(v: number | null | undefined) {
  return v == null ? "—" : "$" + Math.round(v).toLocaleString();
}

function Move({ pct, dollars, invert }: {
  pct: number | null; dollars?: number | null; invert?: boolean;
}) {
  if (pct == null) return <span style={{ color: "#94A3B8" }}>—</span>;
  // On stock, "over market" is the bad direction; on trends, down is bad.
  const bad = invert ? pct > 0 : pct < 0;
  return (
    <span style={{ color: bad ? "#B91C1C" : "#065F46", fontWeight: 600 }}>
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
      {dollars != null && (
        <span style={{ color: "#94A3B8", fontWeight: 400 }}>
          {" "}({dollars > 0 ? "+" : ""}{money(Math.abs(dollars)).replace("$", "$")})
        </span>
      )}
    </span>
  );
}

function Evidence({ comps, confidence }: { comps: number | null; confidence: string | null }) {
  const tone: Record<string, string> = {
    high: "#065F46", medium: "#92400E", low: "#94A3B8",
  };
  return (
    <span style={{ fontSize: 13, color: tone[confidence || "low"] }}>
      {comps ?? 0} comps · {confidence ?? "low"}
    </span>
  );
}

function Stat({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: "warn";
}) {
  return (
    <div style={{
      flex: "1 1 130px", border: "1px solid #E3E7EE", borderRadius: 12,
      padding: "12px 14px", background: tone === "warn" ? "#FFFBEB" : "#fff",
    }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em",
                    color: "#94A3B8", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, marginTop: 4,
                    letterSpacing: "-.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#92400E", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 34 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase",
                   letterSpacing: ".07em", color: "#5b6472", marginBottom: 10 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid #E3E7EE", borderRadius: 12,
                  background: "#fff" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>{head.map((h) => (
            <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11,
                                 textTransform: "uppercase", letterSpacing: ".05em",
                                 color: "#94A3B8", borderBottom: "1px solid #EEF1F5" }}>
              {h}
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} style={{ padding: "10px 14px",
                                     borderBottom: "1px solid #F4F6F9",
                                     whiteSpace: "nowrap" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p style={{ marginTop: 8, fontSize: 12, color: "#94A3B8" }}>{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "#94A3B8", fontSize: 14, padding: "8px 0" }}>{children}</div>;
}

function Banner({ children, tone }: { children: React.ReactNode; tone: "bad" | "warn" }) {
  const c = tone === "bad"
    ? { bg: "#FEF2F2", fg: "#991B1B" }
    : { bg: "#FFFBEB", fg: "#92400E" };
  return (
    <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8,
                  background: c.bg, color: c.fg, fontSize: 14 }}>
      {children}
    </div>
  );
}

function In({ p, v, on, required }: {
  p: string; v: string; on: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  return (
    <input placeholder={p} value={v} onChange={on} required={required} style={{
      padding: "9px 12px", borderRadius: 9, border: "1px solid #D9DFE7", fontSize: 14,
    }} />
  );
}
