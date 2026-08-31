// Empty/unset NEXT_PUBLIC_API_BASE => "" => the browser calls /api on the SAME
// origin, which the next.config rewrite proxies to the backend. That keeps the
// app reachable through one URL with no CORS. Set an absolute URL only if you
// want the browser to hit the backend directly.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

const TOKEN_KEY = "apex_token";

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    // Expired or invalid token — clear it and bounce to sign-in rather than
    // leaving the page in a half-broken state.
    if (res.status === 401 && typeof window !== "undefined" && !path.includes("/sign-in")) {
      setToken(null);
      if (!window.location.pathname.startsWith("/sign-in")) {
        window.location.href = "/sign-in";
      }
    }
    if (res.status === 402 && typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/onboarding")) {
      window.location.href = "/onboarding";
    }
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------- people ----------

export interface Me {
  id: number;
  email: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  role: string;
  status: string;
  next_step?: string;
  email_verified: boolean;
  phone_verified: boolean;
  /** Trialing, paying, admin, or admin-approved. The single gate the shell and
   *  onboarding read to decide whether to show the product or the paywall. */
  has_access: boolean;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  dealer_id?: number | null;
}

export interface PendingUser {
  id: number;
  email: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  role: string;
  status: string;
  created_at?: string | null;
  last_login_at?: string | null;
  login_count?: number;
  subscription_status?: string | null;
}

// ---------- yards ----------

export interface DealerRow {
  id: number;
  name: string;
  region: string | null;
  /** Stock in the most recent week. There are 1,700+ dealers and several share a
   *  trading name, so size is how you tell two branches apart. */
  cars: number;
}

// ---------- platform keys ----------

export interface AppSetting {
  name: string;
  label: string;
  help_text: string;
  is_set: boolean;
  last_four: string | null;
  updated_at: string | null;
  /** A value is stored but can't be decrypted — almost always a rotated
   *  JWT_SECRET. Surfaced so an admin is told to re-enter rather than left
   *  wondering why the assistant stopped working. */
  unreadable: boolean;
}

export interface SettingTestResult {
  ok: boolean;
  detail: string;
}

// ---------- weekly data ----------

export interface IngestJob {
  id: number;
  filename: string;
  week_ending: string | null;
  status: string;
  progress_pct: number;
  stage: string | null;
  rows_total: number | null;
  rows_inserted: number | null;
  rows_rejected: number | null;
  sales_derived: number | null;
  relists_flagged: number | null;
  error_message: string | null;
  audit_warnings: string | null;
  snapshot_id: number | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface Snapshot {
  id: number;
  week_ending: string;
  filename: string;
  rows_inserted: number;
  rows_rejected: number;
  status: string;
  sales_confirmed: boolean;
  published_at: string | null;
}

export interface StagedSummary {
  has_staged: boolean;
  snapshot_id: number | null;
  week_ending: string | null;
  rows: number;
  rejected: number;
  held_total: number;
  hold_reasons: Record<string, number>;
  dealers: number;
  sales_derived: number;
  relists_flagged: number;
  /** Sales in the newest week aren't confirmed until the following snapshot
   *  lands — about 4% turn out to be relists. */
  sales_provisional: boolean;
  uploaded_at: string | null;
}

// ---------- assistant ----------

export interface AssistantAnswer {
  answer: string;
  tool_calls: { name: string; arguments?: Record<string, unknown> | null }[];
  questions_used: number;
  questions_limit: number;
}

// ---------- dealer ----------

export interface ModelTrend {
  make: string;
  model: string;
  /** How many of these THEY sold — why the row is on their screen at all. */
  my_sales: number;
  then_ask: number | null;
  now_ask: number | null;
  move_pct: number | null;
  move_dollars: number | null;
  now_listed: number;
}

export interface StockRow {
  id: number;
  make: string | null;
  model: string | null;
  year: number | null;
  spec: string | null;
  kms: number | null;
  price: number | null;
  fair_value: number | null;
  /** Positive = asking above what it's worth. */
  margin_pct: number | null;
  comps_used: number | null;
  confidence: string | null;
  days_listed: number | null;
  age_band: string | null;
  link: string | null;
}

export interface StockSummary {
  cars: number;
  total_asking: number;
  over_90_days: number;
  over_90_value: number;
  priced_over_market: number;
  priced_under_market: number;
  median_days_listed: number | null;
}

export interface PriceResult {
  priced: boolean;
  reason?: string;
  low?: number;
  mid?: number;
  high?: number;
  comps?: number;
  step?: string;
  scope?: string;
  expanded?: boolean;
  sold_comps?: number;
  listed_comps?: number;
  variant_used?: string;
  single_price?: boolean;
  /** The comps behind the number, so the car can be plotted in its market. */
  comp_points?: {
    kms: number; price: number; year?: number | null;
    variant?: string | null; sold?: boolean; extras?: number;
  }[];
}
