"use client";

/**
 * Admin: the platform API keys.
 *
 * Write-only by design. A saved key can never be read back through the API —
 * only whether it is set and its last four characters — so a stolen admin
 * session can't walk off with the platform's credentials.
 *
 * The Test button makes a real call, because a format check can't tell a revoked
 * key from a working one and the difference would otherwise surface to a dealer
 * mid-question.
 */

import { useCallback, useEffect, useState } from "react";
import { AppSetting, SettingTestResult, api } from "@/lib/api";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [tests, setTests] = useState<Record<string, SettingTestResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setSettings(await api<AppSetting[]>("/admin/settings")); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't load settings."); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(name: string) {
    const value = (drafts[name] || "").trim();
    if (!value) return;
    setBusy(name); setError(null);
    try {
      await api(`/admin/settings/${name}`, {
        method: "PUT", body: JSON.stringify({ value }),
      });
      setDrafts((d) => ({ ...d, [name]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that key.");
    } finally { setBusy(null); }
  }

  async function clear(name: string) {
    if (!window.confirm("Remove this key? Anything relying on it stops working.")) return;
    setBusy(name);
    try { await api(`/admin/settings/${name}`, { method: "DELETE" }); await load(); }
    finally { setBusy(null); }
  }

  async function test(name: string) {
    setBusy(name);
    setTests((t) => ({ ...t, [name]: { ok: false, detail: "Testing…" } }));
    try {
      const result = await api<SettingTestResult>(
        `/admin/settings/${name}/test`, { method: "POST" });
      setTests((t) => ({ ...t, [name]: result }));
    } catch (e) {
      setTests((t) => ({
        ...t,
        [name]: { ok: false, detail: e instanceof Error ? e.message : "Test failed." },
      }));
    } finally { setBusy(null); }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>
        API keys
      </h1>
      <p style={{ color: "#5b6472", marginTop: 6, fontSize: 14 }}>
        Set once for the whole platform. Dealers never see or enter these.
      </p>

      {error && (
        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8,
                      background: "#FEF2F2", color: "#991B1B", fontSize: 14 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
        {settings.map((s) => {
          const result = tests[s.name];
          return (
            <div key={s.name} style={{
              border: "1px solid #E3E7EE", borderRadius: 12, padding: 18, background: "#fff",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between",
                            alignItems: "center", gap: 12 }}>
                <div style={{ fontWeight: 700 }}>{s.label}</div>
                {s.unreadable ? (
                  <Pill bg="#FEF2F2" fg="#991B1B">Unreadable — re-enter</Pill>
                ) : s.is_set ? (
                  <Pill bg="#ECFDF5" fg="#065F46">Set ····{s.last_four}</Pill>
                ) : (
                  <Pill bg="#FFFBEB" fg="#92400E">Not set</Pill>
                )}
              </div>

              <p style={{ color: "#5b6472", fontSize: 13, marginTop: 6 }}>{s.help_text}</p>

              {s.unreadable && (
                <p style={{ color: "#991B1B", fontSize: 13, marginTop: 8 }}>
                  A key is stored but can&apos;t be decrypted — this happens when
                  JWT_SECRET is rotated. Paste it again below.
                </p>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <input
                  type="password" autoComplete="off"
                  value={drafts[s.name] || ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [s.name]: e.target.value }))}
                  placeholder={s.is_set ? "Paste a new key to replace it" : "Paste the key"}
                  style={{ flex: "1 1 260px", padding: "9px 12px", borderRadius: 8,
                           border: "1px solid #D9DFE7", fontSize: 14 }}
                />
                <button onClick={() => save(s.name)}
                  disabled={busy === s.name || !(drafts[s.name] || "").trim()}
                  style={btn(true)}>
                  Save
                </button>
                {s.is_set && (
                  <>
                    <button onClick={() => test(s.name)} disabled={busy === s.name}
                            style={btn(false)}>Test</button>
                    <button onClick={() => clear(s.name)} disabled={busy === s.name}
                            style={btn(false)}>Remove</button>
                  </>
                )}
              </div>

              {result && (
                <div style={{ marginTop: 10, fontSize: 13,
                              color: result.ok ? "#065F46" : "#991B1B" }}>
                  {result.ok ? "✓ " : "✗ "}{result.detail}
                </div>
              )}

              {s.updated_at && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#94A3B8" }}>
                  Updated {new Date(s.updated_at).toLocaleString()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 24, fontSize: 13, color: "#94A3B8" }}>
        Keys are encrypted at rest and never returned by the API — only whether
        one is set and its last four characters.
      </p>
    </main>
  );
}

function Pill({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                   background: bg, color: fg, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 8,
    border: primary ? "1px solid #16A34A" : "1px solid #D9DFE7",
    background: primary ? "#22C55E" : "#fff",
    color: primary ? "#06210F" : "#14233A",
    cursor: "pointer",
  };
}
