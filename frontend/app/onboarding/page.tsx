"use client";
import { ApexLogo } from "@/components/ApexLogo";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Me, api } from "@/lib/api";

/**
 * Self-serve onboarding funnel: verify email → verify phone → add card (Stripe
 * Checkout) → 7-day trial. The backend's me.next_step drives which step shows.
 * A user with no active subscription is routed here by the API client on 402.
 */

type Step = "verify_email" | "verify_phone" | "add_card" | "done";
const ORDER: Step[] = ["verify_email", "verify_phone", "add_card"];

export default function OnboardingPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    try {
      setMe(await api<Me>("/api/auth/me"));
    } catch {
      window.location.href = "/sign-in";
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  if (loading) return <Shell><div className="text-sm text-muted">Loading…</div></Shell>;
  if (!me) return null;

  if (me.next_step === "done" || me.has_access) {
    return (
      <Shell>
        <div className="text-center py-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-under/10 grid place-items-center text-under text-2xl mb-3">✓</div>
          <h1 className="font-display text-xl font-semibold mb-2">You&rsquo;re all set</h1>
          <p className="text-sm text-muted mb-5">
            {me.subscription_status === "trialing"
              ? "Your 7-day free trial is active. Full access is unlocked."
              : "Your account is active."}
          </p>
          <Link href="/" className="inline-block bg-blue text-white hover:bg-blue-dark py-2.5 px-5 rounded-lg font-semibold text-sm">
            Enter Apex →
          </Link>
        </div>
      </Shell>
    );
  }

  const step = me.next_step as Step;
  return (
    <Shell>
      <Steps current={step} me={me} />
      {step === "verify_email" && <VerifyEmail me={me} onDone={reload} />}
      {step === "verify_phone" && <VerifyPhone me={me} onDone={reload} />}
      {step === "add_card" && <AddCard />}
    </Shell>
  );
}

function Steps({ current, me }: { current: Step; me: Me }) {
  const labels: Record<Step, string> = {
    verify_email: "Email",
    verify_phone: "Phone",
    add_card: "Payment",
    done: "Done",
  };
  const doneMap: Record<Step, boolean> = {
    verify_email: me.email_verified,
    verify_phone: me.phone_verified,
    add_card: me.has_access,
    done: true,
  };
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {ORDER.map((s, i) => {
        const active = s === current;
        const done = doneMap[s];
        return (
          <div key={s} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold text-white"
                style={{ background: done ? "#0A8754" : active ? "#2563EB" : "#CBD5E1" }}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`text-xs font-medium ${active ? "text-text" : "text-faint"}`}>{labels[s]}</span>
            </div>
            {i < ORDER.length - 1 && <span className="w-6 h-px bg-line" />}
          </div>
        );
      })}
    </div>
  );
}

function VerifyEmail({ me, onDone }: { me: Me; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api("/api/auth/verify/email", { method: "POST", body: JSON.stringify({ code }) });
      onDone();
    } catch (e: any) {
      setErr(reason(e?.detail));
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setResent(false);
    await api("/api/auth/verify/email/send", { method: "POST" }).catch(() => null);
    setResent(true);
  }

  return (
    <CodeForm
      title="Verify your email"
      sub={<>We sent a 6-digit code to <strong>{me.email}</strong>. Enter it below.</>}
      code={code} setCode={setCode} busy={busy} err={err} onSubmit={submit} onResend={resend} resent={resent}
    />
  );
}

function VerifyPhone({ me, onDone }: { me: Me; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  // Auto-send the first phone code on mount.
  useEffect(() => {
    api("/api/auth/verify/phone/send", { method: "POST" }).catch(() => null);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api("/api/auth/verify/phone", { method: "POST", body: JSON.stringify({ code }) });
      onDone();
    } catch (e: any) {
      setErr(reason(e?.detail));
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setResent(false);
    await api("/api/auth/verify/phone/send", { method: "POST" }).catch(() => null);
    setResent(true);
  }

  return (
    <CodeForm
      title="Verify your phone"
      sub={<>We sent a code by SMS to <strong>{me.phone}</strong>. Enter it below.</>}
      code={code} setCode={setCode} busy={busy} err={err} onSubmit={submit} onResend={resend} resent={resent}
    />
  );
}

function CodeForm({
  title, sub, code, setCode, busy, err, onSubmit, onResend, resent,
}: {
  title: string; sub: React.ReactNode; code: string; setCode: (v: string) => void;
  busy: boolean; err: string | null; onSubmit: (e: React.FormEvent) => void;
  onResend: () => void; resent: boolean;
}) {
  return (
    <>
      <h1 className="font-display text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted mt-1 mb-5">{sub}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoFocus
          placeholder="123456"
          className="bg-paper border border-line rounded-lg px-3 py-3 text-center text-2xl tracking-[0.4em] font-bold focus:outline-none focus:border-blue"
        />
        {err && <div className="text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
        <button
          type="submit"
          disabled={busy || code.length < 6}
          className="bg-blue text-white hover:bg-blue-dark disabled:opacity-50 py-2.5 rounded-lg font-semibold"
        >
          {busy ? "Verifying…" : "Verify & continue"}
        </button>
      </form>
      <button onClick={onResend} className="text-xs text-blue hover:text-blue-dark mt-4">
        {resent ? "Code sent ✓" : "Resend code"}
      </button>
    </>
  );
}

function AddCard() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function checkout() {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ url: string }>("/api/billing/checkout", { method: "POST" });
      window.location.href = r.url;              // Stripe-hosted Checkout
    } catch (e: any) {
      setErr(
        e?.detail?.startsWith("Billing is not configured")
          ? "Payments aren't switched on yet. Please contact support — your email and phone are verified."
          : (e?.detail || e?.message || "Could not start checkout"),
      );
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="font-display text-xl font-semibold">Start your 7-day free trial</h1>
      <p className="text-sm text-muted mt-1 mb-4">
        Add a card to unlock full access. You won&rsquo;t be charged today — your first payment is in 7 days, and you can cancel anytime before then.
      </p>
      <ul className="text-sm text-muted mb-5 space-y-1.5">
        <li>✓ Every below-market deal across Auckland, valued off recent sales</li>
        <li>✓ Every car you hold priced against the live market</li>
        <li>✓ Cancel before day 7 and pay nothing</li>
      </ul>
      {err && <div className="text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</div>}
      <button
        onClick={checkout}
        disabled={busy}
        className="w-full bg-blue text-white hover:bg-blue-dark disabled:opacity-50 py-3 rounded-lg font-semibold"
      >
        {busy ? "Opening secure checkout…" : "Add card & start trial →"}
      </button>
      <p className="text-[11px] text-faint text-center mt-3">Secure payment by Stripe. Card required to start the trial.</p>
    </>
  );
}

function reason(detail: string | undefined): string {
  switch (detail) {
    case "mismatch": return "That code isn't right. Check and try again.";
    case "expired": return "That code has expired. Tap resend for a new one.";
    case "no_code": return "No active code. Tap resend to get a new one.";
    case "too_many_attempts": return "Too many attempts. Tap resend for a fresh code.";
    default: return detail || "Something went wrong. Try again.";
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper grid place-items-center px-6">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-3 mb-6" style={{ color: "#16181A" }}>
          <ApexLogo size={36} />
        </Link>
        <div className="bg-white border border-line rounded-card shadow-soft p-7">{children}</div>
      </div>
    </div>
  );
}
