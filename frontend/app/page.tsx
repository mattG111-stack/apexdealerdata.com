import Link from "next/link";
import { ApexMark } from "@/components/ApexLogo";

export default function Landing() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3" style={{ color: "#16181A" }}>
            <ApexMark size={34} />
            <div>
              <div style={{ fontFamily: "var(--font-space-grotesk), 'Archivo', sans-serif", fontWeight: 700, fontSize: 19, letterSpacing: "-.05em", lineHeight: 1 }}>ollie</div>
              <div className="text-[10px] tracking-widest uppercase text-faint mt-0.5">Property Intelligence</div>
            </div>
          </Link>
          <div className="flex-1" />
          <Link href="/sign-in" className="text-sm text-muted hover:text-text px-4 py-2">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="text-sm bg-[#333A43] text-white hover:bg-[#1B2026] px-4 py-2 rounded-lg font-semibold"
          >
            Request access
          </Link>
        </div>
      </header>

      <section className="max-w-[1200px] mx-auto px-6 pt-24 pb-16">
        <div className="text-xs uppercase tracking-widest text-blue font-semibold mb-4">
          Auckland · 15,000+ live listings
        </div>
        <h1 className="font-display text-5xl md:text-6xl font-semibold leading-tight max-w-3xl">
          Find the deals the market hasn&rsquo;t priced in.
        </h1>
        <p className="text-muted mt-6 max-w-2xl text-lg">
          Ollie scans every Auckland listing every week, gives each one its own valuation, flags the
          underpriced, the cashflow-positive, the subdividable, and ranks them by a single buy score &mdash; so you
          spend your time on the listings worth your time.
        </p>
        <div className="flex gap-3 mt-8">
          <Link href="/sign-up" className="bg-[#333A43] text-white hover:bg-[#1B2026] px-5 py-3 rounded-lg font-semibold">
            Request access
          </Link>
          <Link
            href="/sign-in"
            className="border border-line hover:border-blue text-text px-5 py-3 rounded-lg font-semibold bg-white"
          >
            I already have an account
          </Link>
        </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-6 pb-16 grid md:grid-cols-3 gap-4">
        <Stat label="Live for-sale listings" value="15,001" />
        <Stat label="Sold properties analysed" value="25,872" />
        <Stat label="Buy-score backed" value="100%" tone="under" />
      </section>

      <section className="max-w-[1200px] mx-auto px-6 pb-24 grid md:grid-cols-3 gap-5">
        <Feature
          title="Independent valuation"
          body="Every Auckland listing gets Ollie's own valuation, so you can see at a glance what a property is really worth versus what it's listed for."
          color="#2E7DF6"
        />
        <Feature
          title="Underpriced deal-finder"
          body="Surfaces listings priced below Ollie's valuation, with a confidence tier and recent local sales to sanity-check against."
          color="#0A8754"
        />
        <Feature
          title="Cashflow-positive screening"
          body="Estimates rent, computes annual cashflow at standard NZ assumptions, flags every yield-positive property."
          color="#0E8C8C"
        />
        <Feature
          title="Subdivision feasibility"
          body="38-zone Auckland Unitary Plan map, lot-count math, demolish-vs-keep economics on every eligible site."
          color="#FF6A00"
        />
        <Feature
          title="Single buy score"
          body="0–100 score per listing blending discount, yield, and subdivision upside. Sort the market by one number."
          color="#2E7DF6"
        />
        <Feature
          title="Weekly refresh"
          body="Admin uploads new scrapes; the algorithm re-prices the whole market and you see the new opportunities the next morning."
          color="#1D5FD0"
        />
      </section>

      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        © 2026 Ollie Property Intelligence
      </footer>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "under" }) {
  return (
    <div className="bg-white border border-line rounded-card p-5 shadow-soft">
      <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className={`font-display text-3xl font-bold mt-1 ${tone === "under" ? "text-under" : ""}`}>{value}</div>
    </div>
  );
}

function Feature({ title, body, color }: { title: string; body: string; color: string }) {
  return (
    <div className="bg-white border border-line rounded-card p-5 shadow-soft">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
        <span className="font-display font-semibold">{title}</span>
      </div>
      <div className="text-sm text-muted leading-relaxed">{body}</div>
    </div>
  );
}
