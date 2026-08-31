"use client";

/**
 * Admin: load the weekly snapshot.
 *
 * A file lands staged, not live. The ingest runs in the background because a
 * 50,000-row week takes about nine seconds — long enough that holding the
 * request open would time out behind a proxy.
 *
 * The week-ending date comes from the filename. Guessing it wrong would file a
 * week under the wrong date and corrupt every sold-derivation after it, so an
 * unreadable name is rejected rather than defaulted to today.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { IngestJob, Snapshot, api } from "@/lib/api";

export default function AdminUploadPage() {
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [j, s] = await Promise.all([
        api<IngestJob[]>("/api/admin/jobs?limit=10"),
        api<Snapshot[]>("/api/admin/snapshots?limit=15"),
      ]);
      setJobs(j); setSnapshots(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Poll only while something is actually running.
  useEffect(() => {
    if (!jobs.some((j) => j.status === "running" || j.status === "pending")) return;
    const t = setInterval(() => { void load(); }, 2000);
    return () => clearInterval(t);
  }, [jobs, load]);

  async function upload(file: File) {
    setUploading(true); setError(null);
    const body = new FormData();
    body.append("file", file);
    try {
      await api("/api/admin/upload", { method: "POST", body });
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally { setUploading(false); }
  }

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>
        Weekly data
      </h1>
      <p style={{ color: "#5b6472", marginTop: 6, fontSize: 14, maxWidth: 640 }}>
        Name the file with its week, like <code>week ending 03-08-26.csv</code>.
        It loads staged for review — dealers don&apos;t see it until you publish.
      </p>

      {error && (
        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8,
                      background: "#FEF2F2", color: "#991B1B", fontSize: 14 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 20, padding: 18, border: "1px dashed #CBD5E1",
                    borderRadius: 12, background: "#fff" }}>
        <input ref={fileRef} type="file" accept=".csv"
          disabled={uploading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
        {uploading && (
          <span style={{ marginLeft: 10, fontSize: 13, color: "#5b6472" }}>
            uploading…
          </span>
        )}
      </div>

      {jobs.length > 0 && (
        <>
          <h2 style={h2}>Recent loads</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {jobs.map((j) => (
              <div key={j.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between",
                              gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 600 }}>
                    {j.filename}
                    {j.week_ending && (
                      <span style={{ color: "#94A3B8", marginLeft: 8, fontWeight: 400 }}>
                        week ending {j.week_ending}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700,
                                 color: j.status === "failed" ? "#B91C1C"
                                      : j.status === "completed" ? "#065F46" : "#92400E" }}>
                    {j.status}{j.stage ? ` · ${j.stage}` : ""}
                  </span>
                </div>
                {j.status === "completed" && (
                  <div style={{ marginTop: 6, fontSize: 13, color: "#5b6472" }}>
                    {(j.rows_inserted ?? 0).toLocaleString()} listings
                    {j.rows_rejected ? ` · ${j.rows_rejected} rejected` : ""}
                    {j.sales_derived != null &&
                      ` · ${j.sales_derived.toLocaleString()} sales derived`}
                    {j.relists_flagged != null && j.relists_flagged > 0 &&
                      ` · ${j.relists_flagged} relists flagged`}
                  </div>
                )}
                {j.error_message && (
                  <div style={{ marginTop: 6, fontSize: 13, color: "#B91C1C" }}>
                    {j.error_message}
                  </div>
                )}
                {j.audit_warnings && (
                  <div style={{ marginTop: 6, fontSize: 13, color: "#92400E" }}>
                    {j.audit_warnings}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <h2 style={h2}>Weeks loaded</h2>
      <div style={{ display: "grid", gap: 6 }}>
        {snapshots.map((s) => (
          <div key={s.id} style={{ ...card, display: "flex",
                                   justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontWeight: 600 }}>{s.week_ending}</span>
            <span style={{ fontSize: 13, color: "#5b6472" }}>
              {s.rows_inserted.toLocaleString()} listings · {s.status}
              {!s.sales_confirmed && (
                <span title="Sales for this week aren't confirmed until the next snapshot lands — about 4% turn out to be relists."
                      style={{ marginLeft: 8, color: "#92400E" }}>
                  sales provisional
                </span>
              )}
            </span>
          </div>
        ))}
        {snapshots.length === 0 && (
          <div style={{ color: "#94A3B8" }}>Nothing loaded yet.</div>
        )}
      </div>
    </main>
  );
}

const h2: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, marginTop: 28, marginBottom: 10,
  textTransform: "uppercase", letterSpacing: ".06em", color: "#5b6472",
};

const card: React.CSSProperties = {
  border: "1px solid #E3E7EE", borderRadius: 10, padding: "12px 14px", background: "#fff",
};
