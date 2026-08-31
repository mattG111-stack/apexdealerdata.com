"use client";

/**
 * The question box — the product.
 *
 * No dashboard. A dealer asks in plain English and gets an answer built from
 * their own stock and sales, benchmarked against the market. The starter
 * questions exist because a blank box is intimidating, not because the answers
 * are canned — each one just fills the box.
 */

import { useEffect, useRef, useState } from "react";
import { AssistantAnswer, api } from "@/lib/api";

const STARTERS = [
  "How many did I sell last week, and is that up or down?",
  "What am I holding that's over 90 days?",
  "How fast did my cars sell versus the market?",
  "What's selling fastest right now that I don't stock?",
  "Which of my cars are priced furthest from the market?",
  "What did I sell by body type last month?",
];

interface Turn {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

export default function AskPage() {
  const [history, setHistory] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState<{ used: number; limit: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, busy]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;

    setHistory((h) => [...h, { role: "user", content: q }]);
    setQuestion("");
    setBusy(true);
    setError(null);

    try {
      const res = await api<AssistantAnswer>("/api/assistant/ask", {
        method: "POST",
        body: JSON.stringify({
          question: q,
          // Send prior turns so follow-ups work ("what about the 3.0?").
          history: history.slice(-8).map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      setHistory((h) => [...h, {
        role: "assistant",
        content: res.answer,
        tools: res.tool_calls?.map((t) => t.name) ?? [],
      }]);
      setUsed({ used: res.questions_used, limit: res.questions_limit });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 780, margin: "0 auto", padding: "32px 20px 120px" }}>
      {history.length === 0 && (
        <>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.03em" }}>
            What do you need to know?
          </h1>
          <p style={{ color: "#5b6472", marginTop: 8, fontSize: 15 }}>
            Ask about your stock, your sales, or the market around you.
          </p>
          <div style={{ marginTop: 22, display: "grid", gap: 8 }}>
            {STARTERS.map((s) => (
              <button key={s} onClick={() => ask(s)} style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 10,
                border: "1px solid #E3E7EE", background: "#fff", fontSize: 14,
                cursor: "pointer",
              }}>
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "grid", gap: 18 }}>
        {history.map((t, i) => (
          <div key={i}>
            {t.role === "user" ? (
              <div style={{
                fontWeight: 700, fontSize: 16, letterSpacing: "-.01em",
              }}>
                {t.content}
              </div>
            ) : (
              <div style={{
                whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.6,
                background: "#fff", border: "1px solid #E3E7EE",
                borderRadius: 12, padding: "14px 16px",
              }}>
                {t.content}
                {t.tools && t.tools.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10,
                                borderTop: "1px solid #F1F5F9",
                                fontSize: 12, color: "#94A3B8" }}>
                    built from: {Array.from(new Set(t.tools)).join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div style={{ color: "#94A3B8", fontSize: 14 }}>working on it…</div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8,
                      background: "#FEF2F2", color: "#991B1B", fontSize: 14 }}>
          {error}
        </div>
      )}

      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, padding: "14px 20px",
        background: "linear-gradient(to top, #fff 70%, transparent)",
      }}>
        <form
          onSubmit={(e) => { e.preventDefault(); void ask(question); }}
          style={{ maxWidth: 780, margin: "0 auto", display: "flex", gap: 8 }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about your yard…"
            disabled={busy}
            style={{
              flex: 1, padding: "13px 16px", borderRadius: 12,
              border: "1px solid #D9DFE7", fontSize: 15, background: "#fff",
            }}
          />
          <button type="submit" disabled={busy || !question.trim()} style={{
            padding: "13px 20px", borderRadius: 12, border: "1px solid #16A34A",
            background: "#22C55E", color: "#06210F", fontWeight: 700,
            fontSize: 15, cursor: busy ? "not-allowed" : "pointer",
            opacity: busy || !question.trim() ? 0.5 : 1,
          }}>
            Ask
          </button>
        </form>
        {used && (
          <div style={{ maxWidth: 780, margin: "6px auto 0", fontSize: 12,
                        color: "#94A3B8" }}>
            {used.used} of {used.limit} questions this month
          </div>
        )}
      </div>
    </main>
  );
}
