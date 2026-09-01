"use client";

/**
 * Admin: users, and which yards each of them can see.
 *
 * The yard grants are the security boundary of the whole product. Everything a
 * user sees about "my stock" and "my sales" comes from these; every other
 * dealership reaches them anonymised as Dealer 1..5, and the market views carry
 * no dealer identity at all. So a wrong grant here is the only realistic way one
 * dealer ends up looking at a rival's book — which is why the yard picker shows
 * stock counts (there are 1,700+ dealers and several share a trading name) and
 * why removing a grant asks first.
 */

import { useCallback, useEffect, useState } from "react";
import { DealerRow, PendingUser, api } from "@/lib/api";

type Grants = Record<number, DealerRow[]>;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [grants, setGrants] = useState<Grants>({});
  const [openUser, setOpenUser] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DealerRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api<PendingUser[]>("/api/admin/users");
      setUsers(rows);
      const pairs = await Promise.all(
        rows.map(async (u) => [
          u.id,
          await api<DealerRow[]>(`/api/admin/users/${u.id}/dealers`).catch(() => []),
        ] as const)
      );
      setGrants(Object.fromEntries(pairs));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load users.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Debounced so typing a yard name doesn't fire a request per keystroke.
  useEffect(() => {
    if (openUser === null) return;
    const t = setTimeout(async () => {
      try {
        setResults(await api<DealerRow[]>(
          `/api/admin/dealers?q=${encodeURIComponent(query)}&limit=20`));
      } catch { setResults([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [query, openUser]);

  async function act(fn: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setError(null);
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "That didn't work."); }
    finally { setBusy(false); }
  }

  const setStatus = (id: number, status: string) =>
    act(() => api(`/api/admin/users/${id}`, {
      method: "PATCH", body: JSON.stringify({ status }),
    }));

  const removeUser = (u: PendingUser) =>
    act(() => api(`/api/admin/users/${u.id}`, { method: "DELETE" }),
        `Delete ${u.email}? This removes their account and every yard grant.`);

  const grant = (userId: number, d: DealerRow) =>
    act(() => api(`/api/admin/users/${userId}/dealers/${d.id}`, { method: "POST" }));

  const revoke = (userId: number, d: DealerRow) =>
    act(() => api(`/api/admin/users/${userId}/dealers/${d.id}`, { method: "DELETE" }),
        `Stop this user seeing ${d.name}?`);

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>
        Users &amp; yard access
      </h1>
      <p style={{ color: "#5b6472", marginTop: 6, fontSize: 14, maxWidth: 620 }}>
        A user sees only the yards granted here. Every other dealership reaches
        them as Dealer&nbsp;1–5, never by name.
      </p>

      {error && (
        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8,
                      background: "#FEF2F2", color: "#991B1B", fontSize: 14 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
        {users.map((u) => {
          const mine = grants[u.id] || [];
          const open = openUser === u.id;
          return (
            <div key={u.id} style={{
              border: "1px solid #E3E7EE", borderRadius: 12, padding: 16,
              background: "#fff",
            }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start",
                            flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>
                    {u.full_name || u.email}
                    {u.role === "admin" && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700,
                                     padding: "2px 7px", borderRadius: 999,
                                     background: "#EEF2FF", color: "#3730A3" }}>
                        ADMIN
                      </span>
                    )}
                  </div>
                  <div style={{ color: "#5b6472", fontSize: 13, marginTop: 2 }}>
                    {u.email}{u.company ? ` · ${u.company}` : ""}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {mine.length === 0 && (
                      <span style={{ fontSize: 12, color: "#B45309" }}>
                        No yard assigned — they can&apos;t see any of their own data yet
                      </span>
                    )}
                    {mine.map((d) => (
                      <span key={d.id} style={{
                        fontSize: 12, padding: "3px 8px", borderRadius: 999,
                        background: "#F1F5F9", display: "inline-flex", gap: 6,
                      }}>
                        {d.name}
                        <button onClick={() => revoke(u.id, d)} disabled={busy}
                          title="Remove access"
                          style={{ border: 0, background: "none", cursor: "pointer",
                                   color: "#94A3B8", padding: 0, lineHeight: 1 }}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Status value={u.status} />
                  {u.status !== "approved" && (
                    <Btn onClick={() => setStatus(u.id, "approved")} disabled={busy}>
                      Approve
                    </Btn>
                  )}
                  {u.status === "approved" && (
                    <Btn onClick={() => setStatus(u.id, "deactivated")} disabled={busy}>
                      Deactivate
                    </Btn>
                  )}
                  <Btn onClick={() => { setOpenUser(open ? null : u.id); setQuery(""); }}
                       disabled={busy}>
                    {open ? "Done" : "Add yard"}
                  </Btn>
                  <Btn onClick={() => removeUser(u)} disabled={busy} danger>
                    Delete
                  </Btn>
                </div>
              </div>

              {open && (
                <div style={{ marginTop: 14, borderTop: "1px solid #EEF1F5", paddingTop: 14 }}>
                  <input
                    autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search dealerships by name…"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8,
                             border: "1px solid #D9DFE7", fontSize: 14 }}
                  />
                  <div style={{ marginTop: 10, maxHeight: 260, overflowY: "auto" }}>
                    {results.map((d) => {
                      const already = mine.some((m) => m.id === d.id);
                      return (
                        <div key={d.id} style={{
                          display: "flex", justifyContent: "space-between",
                          alignItems: "center", padding: "7px 4px",
                          borderBottom: "1px solid #F4F6F9", fontSize: 14,
                        }}>
                          <span>
                            {d.name}
                            <span style={{ color: "#94A3B8", marginLeft: 8, fontSize: 12 }}>
                              {d.cars} cars{d.region ? ` · ${d.region}` : ""}
                            </span>
                          </span>
                          <Btn onClick={() => grant(u.id, d)} disabled={busy || already}>
                            {already ? "Assigned" : "Assign"}
                          </Btn>
                        </div>
                      );
                    })}
                    {results.length === 0 && (
                      <div style={{ color: "#94A3B8", fontSize: 13, padding: "8px 4px" }}>
                        No dealerships match.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {users.length === 0 && !error && (
          <div style={{ color: "#94A3B8" }}>No users yet.</div>
        )}
      </div>
    </main>
  );
}

function Status({ value }: { value: string }) {
  const tone: Record<string, [string, string]> = {
    approved: ["#ECFDF5", "#065F46"],
    pending: ["#FFFBEB", "#92400E"],
    rejected: ["#FEF2F2", "#991B1B"],
    deactivated: ["#F1F5F9", "#475569"],
  };
  const [bg, fg] = tone[value] || tone.pending;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px",
                   borderRadius: 999, background: bg, color: fg,
                   textTransform: "uppercase", letterSpacing: ".04em" }}>
      {value}
    </span>
  );
}

function Btn({ children, onClick, disabled, danger }: {
  children: React.ReactNode; onClick: () => void;
  disabled?: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 8,
      border: `1px solid ${danger ? "#FECACA" : "#D9DFE7"}`,
      background: danger ? "#FEF2F2" : "#fff",
      color: danger ? "#B91C1C" : "#14233A",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
    }}>
      {children}
    </button>
  );
}
