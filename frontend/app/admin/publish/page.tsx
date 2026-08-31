"use client";

/**
 * Admin: review the staged week, then publish it to dealers.
 *
 * A weekly file lands staged, not live. Rows that look wrong — no price, a $1
 * car, an implausible odometer — are held back automatically. One dealer
 * fat-fingering a price shouldn't block 50,000 good rows, and it shouldn't drag
 * that model's benchmark down for everyone either.
 */

import { useCallback, useEffect, useState } from "react";
import { StagedSummary, api } from "@/lib/api";

interface HeldRow {
  id: number;
  week_ending: string;
  make: string | null;
  model: string | null;
  year: number | null;
  spec_canonical: string | null;
  kms: number | null;
  price: number | null;
  dealer_name_raw: string | null;
  link: string | null;
  is_held: boolean;
  hold_reason: string | null;
}

export default function PublishPage() {
  const [staged, setStaged] = useState<StagedSummary | null>(null);
  const [held, setHeld] = useState<HeldRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api<StagedSummary>("/api/admin/release/staged");
      setStaged(s);
      setHeld(s.has_staged
        ? await api<HeldRow[]>(`/api/admin/release/held?snapshot_id=${s.snapshot_id}&limit=100`)
        : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setError(null); setMsg(null);
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "That didn't work."); }
    finally { setBusy(false); }
  }

  const publish = () => act(async () => {
    await api("/api/admin/release/publish", { method: "POST" });
    setMsg("Published — dealers can see this week now.");
  }, `Publish week ending ${staged?.week_ending}? Dealers will see it immediately.`);

  const release = (row: HeldRow) =>
    act(() => api(`/api/admin/listings/${row.id}/publish`, { method: "POST" }));

  return (
    <main className="apex" style={{ maxWidth: 1000, margin: "0 auto", padding: "30px 20px 80px" }}>
      <h1 className="ax-h1">Review &amp; publish</h1>
      <p className="ax-sub">
        A week loads staged. Nothing reaches a dealer until you publish it.
      </p>

      {error && <Note tone="bad">{error}</Note>}
      {msg && <Note tone="ok">{msg}</Note>}

      {!staged?.has_staged ? (
        <div className="ax-panel" style={{ marginTop: 22 }}>
          Nothing staged. Load a weekly file first.
        </div>
      ) : (
        <>
          <div className="ax-stats" style={{ marginTop: 22 }}>
            <Stat label="week ending" value={staged.week_ending ?? "—"} />
            <Stat label="listings" value={staged.rows.toLocaleString()} />
            <Stat label="dealers" value={staged.dealers.toLocaleString()} />
            <Stat label="sales derived" value={staged.sales_derived.toLocaleString()}
                  sub={staged.sales_provisional ? "provisional" : undefined} />
            <Stat label="relists flagged" value={staged.relists_flagged.toLocaleString()} />
            <Stat label="held back" value={staged.held_total.toLocaleString()}
                  warn={staged.held_total > 0} />
          </div>

          {staged.sales_provisional && (
            <Note tone="warn">
              Sales for this week are provisional. About 4% turn out to be relists
              once the following week lands, and the count will revise down.
            </Note>
          )}

          {Object.keys(staged.hold_reasons).length > 0 && (
            <div className="ax-panel" style={{ marginTop: 16 }}>
              <div className="ax-eyebrow">Why rows were held</div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(staged.hold_reasons).map(([reason, n]) => (
                  <span key={reason} className="ax-chip medium">
                    {n.toLocaleString()} · {reason}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <button className="ax-btn" onClick={publish} disabled={busy}>
              Publish week {staged.week_ending}
            </button>
          </div>

          {held.length > 0 && (
            <>
              <h2 className="ax-eyebrow" style={{ marginTop: 34, marginBottom: 10 }}>
                Held rows
              </h2>
              <div className="ax-scroll">
                <table className="ax-table">
                  <thead>
                    <tr>
                      <th>car</th><th>kms</th><th>price</th><th>dealer</th>
                      <th>why held</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {held.map((r) => (
                      <tr key={r.id}>
                        <td>{`${r.year ?? ""} ${r.make ?? ""} ${r.model ?? ""} ${r.spec_canonical ?? ""}`.trim() || "—"}</td>
                        <td>{r.kms ? `${Math.round(r.kms / 1000)}k` : "—"}</td>
                        <td>{r.price != null ? `$${Math.round(r.price).toLocaleString()}` : "—"}</td>
                        <td style={{ color: "var(--muted)" }}>{r.dealer_name_raw ?? "—"}</td>
                        <td><span className="ax-chip medium">{r.hold_reason ?? "—"}</span></td>
                        <td>
                          <button className="ax-btn ghost" onClick={() => release(r)} disabled={busy}
                                  style={{ padding: "5px 11px", fontSize: 12 }}>
                            Release
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="ax-note">
                Releasing a row makes it visible to dealers and puts it back into
                the market benchmarks. Only do it if the price and odometer are
                genuinely right.
              </p>
            </>
          )}
        </>
      )}
    </main>
  );
}

function Stat({ label, value, sub, warn }: {
  label: string; value: string; sub?: string; warn?: boolean;
}) {
  return (
    <div className={`ax-stat${warn ? " warn" : ""}`}>
      <div className="ax-eyebrow">{label}</div>
      <div className="v">{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#92400E", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Note({ children, tone }: { children: React.ReactNode; tone: "bad" | "warn" | "ok" }) {
  const c = { bad: ["#FEF2F2", "#991B1B"], warn: ["#FFFBEB", "#92400E"], ok: ["#ECFDF5", "#065F46"] }[tone];
  return (
    <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8,
                  background: c[0], color: c[1], fontSize: 14 }}>
      {children}
    </div>
  );
}
