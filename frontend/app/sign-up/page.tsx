"use client";
import { ApexLogo } from "@/components/ApexLogo";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setToken } from "@/lib/api";

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = e.currentTarget as HTMLFormElement;
    const data = Object.fromEntries(new FormData(form));
    try {
      const r = await api<{ token: { access_token: string } }>("/api/auth/sign-up", {
        method: "POST",
        body: JSON.stringify(data),
      });
      // Signed in immediately — go straight into onboarding (verify → card).
      setToken(r.token.access_token);
      window.location.href = "/onboarding";
    } catch (err: any) {
      setError(err?.detail === "Email already registered" ? "That email is already registered." : (err?.detail || err?.message || "Sign-up failed"));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper grid place-items-center px-6">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-3 mb-6" style={{ color: "#16181A" }}>
          <ApexLogo size={36} />
        </Link>
        <div className="bg-white border border-line rounded-card shadow-soft p-7">
          <h1 className="font-display text-xl font-semibold">Create your account</h1>
          <p className="text-sm text-muted mt-1 mb-5">
            Verify your email and phone, add a card, and your <strong>7-day free trial</strong> starts. No charge until day 7 — cancel anytime before then.
          </p>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Full name" name="full_name" />
            <Field label="Company" name="company" />
            <Field label="Email" name="email" type="email" required />
            <Field label="Phone" name="phone" type="tel" required />
            <Field label="Password" name="password" type="password" required minLength={8} />
            {error && (
              <div className="text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="bg-blue text-white hover:bg-blue-dark disabled:opacity-50 py-2.5 rounded-lg font-semibold mt-2"
            >
              {busy ? "Creating…" : "Create account & start trial"}
            </button>
          </form>
          <div className="text-center text-sm text-muted mt-5">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-blue hover:text-blue-dark font-medium">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        className="bg-paper border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
      />
    </label>
  );
}
