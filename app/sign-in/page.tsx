"use client";
import { ApexLogo } from "@/components/ApexLogo";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

export default function SignInPage() {
  const { signIn } = useAuth();
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const m = await signIn(email, password);
      router.push(m && m.has_access ? "/yard" : "/onboarding");
    } catch (err: any) {
      setError(err?.detail || err?.message || t("auth.signInFailed"));
    } finally {
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
          <h1 className="font-display text-xl font-semibold">{t("auth.signIn")}</h1>
          <p className="text-sm text-muted mt-1 mb-5">
            {t("auth.demoNote")}
          </p>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label={t("auth.email")} type="email" value={email} onChange={setEmail} />
            <Field label={t("auth.password")} type="password" value={password} onChange={setPassword} />
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
              {busy ? t("auth.signingIn") : t("auth.signIn")}
            </button>
          </form>
          <div className="text-center text-sm text-muted mt-5">
            {t("auth.newHere")}{" "}
            <Link href="/sign-up" className="text-blue hover:text-blue-dark font-medium">
              {t("auth.requestAccess")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-paper border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
      />
    </label>
  );
}
