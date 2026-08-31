"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Staged = {
  has_staged: boolean;
  sold_batch_id: number | null;
  forsale_batch_id: number | null;
  sold_rows: number;
  forsale_rows: number;
  forsale_rejected: number;
  held_total: number;
  hold_reasons: Record<string, number>;
  pv_checked: number;
  pv_pending: number;
  uploaded_at: string | null;
};

type Held = {
  id: number; address: string | null; suburb: string | null; property_type: string | null;
  hold_reason: string | null; beds: number | null; baths: number | null;
  floor_area_m2: number | null; land_area_m2: number | null; cv_numeric: number | null;
  zoning: string | null; asking_price: number | null; pv_cv: number | null; pv_estimate_mid: number | null;
};

const money = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(n);

export default function AdminPublishPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const [s, setS] = useState<Staged | null>(null);
  const [held, setHeld] = useState<Held[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const st = await api<Staged>("/api/admin/release/staged").catch(() => null);
    setS(st);
    if (st?.has_staged) setHeld(await api<Held[]>("/api/admin/release/held").catch(() => []));
    else setHeld([]);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function publish() {
    if (!s) return;
    if (!confirm(`Publish this release live? ${s.held_total} flagged row(s) will be held back for fixing.`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ count: number; held_back: number }>("/api/admin/release/publish", { method: "POST" });
      setMsg(`Published ${r.count} batch(es) live. ${r.held_back} row(s) held back.`);
      await load();
    } catch (e: any) {
      setMsg(e?.detail || e?.message || "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <div className="px-4 sm:px-7 py-6 text-muted text-sm">Loading…</div>;

  if (!s.has_staged) {
    return (
      <div className="px-4 sm:px-7 py-6">
        <Header />
        <div className="bg-white border border-line rounded-card shadow-soft p-6 mt-4">
          <div className="font-display font-semibold">Nothing staged</div>
          <p className="text-sm text-muted mt-1">
            Upload this week&rsquo;s sold + for-sale CSVs on the{" "}
            <a href="/admin/upload" className="text-blue">Upload page</a>. They land here staged (not live) for review, then you publish.
          </p>
          {msg && <div className="text-sm mt-3" style={{ color: "#0A8754" }}>{msg}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-7 py-6">
      <Header />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
        <Stat label="For-sale rows" value={s.forsale_rows.toLocaleString()} />
        <Stat label="Sold rows" value={s.sold_rows.toLocaleString()} />
        <Stat label="Rejected at load" value={s.forsale_rejected.toLocaleString()} />
        <Stat label="Held for review" value={s.held_total.toLocaleString()} accent={s.held_total > 0} />
        <Stat label="CoreLogic enriched" value={`${s.pv_checked}/${s.forsale_rows}`} />
      </div>

      {Object.keys(s.hold_reasons).length > 0 && (
        <div className="mt-3 text-sm text-muted">
          Held reasons:{" "}
          {Object.entries(s.hold_reasons).map(([r, n], i) => (
            <span key={r}>{i > 0 ? " · " : ""}<strong className="text-text">{n}</strong> {r}</span>
          ))}
        </div>
      )}

      {/* Publish */}
      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={publish}
          disabled={busy}
          className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
          style={{ background: "#0A8754" }}
        >
          {busy ? "Publishing…" : `Publish release live — hold back ${s.held_total} flagged`}
        </button>
        {msg && <span className="text-sm" style={{ color: "#0A8754" }}>{msg}</span>}
      </div>
      <p className="text-xs text-faint mt-2">
        Clean rows go live immediately. The {s.held_total} flagged row(s) below stay hidden — fix each and publish it individually.
      </p>

      {/* Held rows */}
      {held.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display font-semibold text-sm mb-3">Held rows — fix &amp; publish</h2>
          <div className="flex flex-col gap-3">
            {held.map((h) => <HeldCard key={h.id} row={h} onChange={load} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function HeldCard({ row, onChange }: { row: Held; onChange: () => void }) {
  const [f, setF] = useState({
    beds: row.beds ?? "", baths: row.baths ?? "", floor_area_m2: row.floor_area_m2 ?? "",
    land_area_m2: row.land_area_m2 ?? "", cv_numeric: row.cv_numeric ?? "", zoning: row.zoning ?? "",
  });
  const [busy, setBusy] = useState(false);

  const num = (v: string | number) => (v === "" ? null : Number(v));

  async function save() {
    setBusy(true);
    try {
      await api(`/api/admin/listings/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          beds: num(f.beds), baths: num(f.baths), floor_area_m2: num(f.floor_area_m2),
          land_area_m2: num(f.land_area_m2), cv_numeric: num(f.cv_numeric),
          zoning: f.zoning === "" ? null : f.zoning,
        }),
      });
    } finally { setBusy(false); }
  }
  async function publish() {
    setBusy(true);
    try {
      await save();
      await api(`/api/admin/listings/${row.id}/publish`, { method: "POST" });
      onChange();
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{row.address || "—"}{row.suburb ? `, ${row.suburb}` : ""}</div>
          <div className="text-xs text-danger font-medium mt-0.5">⚠ {row.hold_reason}</div>
          <div className="text-[11px] text-faint mt-0.5">
            CoreLogic: CV {money(row.pv_cv)} · AVM {money(row.pv_estimate_mid)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3">
        <MiniField label="Beds" value={f.beds} onChange={(v) => setF({ ...f, beds: v })} />
        <MiniField label="Baths" value={f.baths} onChange={(v) => setF({ ...f, baths: v })} />
        <MiniField label="Floor m²" value={f.floor_area_m2} onChange={(v) => setF({ ...f, floor_area_m2: v })} />
        <MiniField label="Land m²" value={f.land_area_m2} onChange={(v) => setF({ ...f, land_area_m2: v })} />
        <MiniField label="CV" value={f.cv_numeric} onChange={(v) => setF({ ...f, cv_numeric: v })} />
        <MiniField label="Zoning" value={f.zoning} onChange={(v) => setF({ ...f, zoning: v })} text />
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button onClick={save} disabled={busy} className="px-3 py-1.5 text-xs border border-line rounded-md hover:border-blue disabled:opacity-50">Save</button>
        <button onClick={publish} disabled={busy} className="px-3 py-1.5 text-xs font-semibold text-white rounded-md disabled:opacity-50" style={{ background: "#0A8754" }}>Save &amp; publish this row</button>
      </div>
    </div>
  );
}

function MiniField({ label, value, onChange, text }: { label: string; value: string | number; onChange: (v: string) => void; text?: boolean }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-faint font-semibold">{label}</span>
      <input
        value={value}
        inputMode={text ? undefined : "decimal"}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 bg-white border border-line rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-blue"
      />
    </label>
  );
}

function Header() {
  return (
    <>
      <div className="text-[11px] uppercase tracking-widest text-blue font-semibold">ADMIN · WEEKLY PUBLISH</div>
      <h1 className="font-display text-2xl font-semibold mt-1.5">Review &amp; publish</h1>
      <p className="text-sm text-muted mt-1">Staged data isn&rsquo;t live yet. Review the flags, then publish — flagged rows are held back to fix.</p>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-4">
      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className="font-display text-2xl font-bold mt-1 tnum" style={accent ? { color: "#D4503E" } : undefined}>{value}</div>
    </div>
  );
}
