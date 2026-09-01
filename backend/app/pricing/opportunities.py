"""The opportunities engine — Jarvis's "what's the play", ported intact.

These are Matt's rules from the original build, not re-derived:

  BUY          under 4 weeks' supply, selling under 25 days, moving 2+/week.
               Score (4 - weeksSupply)*10 + (25 - avgDays). "Buy aggressively."
  EXIT         over 15 weeks' supply and over 50 days to sell.
               "Market saturated — wholesale or reprice."
  PRICE SPREAD cheapest sale under 70% of dearest, still selling under 35 days:
               margin lives in buying the low end.

Weeks of supply — stock on the market divided by the weekly sell rate — is the
number the whole thing turns on. None of it needs an LLM; it is arithmetic over
the sold window and the live week, which is why the briefing works before any
API key is pasted in.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import text
from sqlalchemy.orm import Session

SOLD_WEEKS = 8
MIN_SOLD = 10          # a model needs this many sales in the window to be judged


@dataclass
class Opportunity:
    kind: str            # BUY | EXIT | SPREAD
    model: str
    score: float
    detail: str
    stock: int = 0
    per_week: float = 0.0
    weeks_supply: float = 0.0
    avg_days: float = 0.0
    avg_price: int = 0
    i_hold: int | None = None   # filled per-dealer when known


def _model_key(r) -> str:
    parts = [str(r.year or "?"), r.make or "?", r.model or "?"]
    if r.spec_canonical:
        parts.append(r.spec_canonical)
    if r.fuel_type:
        parts.append(r.fuel_type)
    return " ".join(parts)


def compute(db: Session, region: str | None = None, limit: int = 10) -> list[Opportunity]:
    region_sql = "AND region = :region" if region else ""
    params = {"region": region} if region else {}

    sales = db.execute(text(f"""
        SELECT year, make, model, spec_canonical, fuel_type,
               price, number_of_days_listed AS days
        FROM market_sales
        WHERE sold_week >= (
            SELECT MIN(w) FROM (
                SELECT DISTINCT sold_week AS w FROM market_sales
                ORDER BY w DESC LIMIT {SOLD_WEEKS}) t)
          AND make IS NOT NULL AND model IS NOT NULL {region_sql}
    """), params).fetchall()

    stock_rows = db.execute(text(f"""
        SELECT year, make, model, spec_canonical, fuel_type, COUNT(*) AS n
        FROM market_listings
        WHERE week_ending = (SELECT MAX(week_ending) FROM market_listings)
          AND make IS NOT NULL AND model IS NOT NULL {region_sql}
        GROUP BY 1,2,3,4,5
    """), params).fetchall()

    weeks = db.execute(text(f"""
        SELECT COUNT(*) FROM (
            SELECT DISTINCT sold_week FROM market_sales
            ORDER BY sold_week DESC LIMIT {SOLD_WEEKS}) t
    """)).scalar() or 1

    by_model: dict[str, dict] = defaultdict(lambda: {"sold": 0, "prices": [], "days": []})
    for r in sales:
        d = by_model[_model_key(r)]
        d["sold"] += 1
        if r.price:
            d["prices"].append(r.price)
        if r.days is not None:
            d["days"].append(r.days)

    stock = { _model_key(r): r.n for r in stock_rows }

    out: list[Opportunity] = []
    for model, d in by_model.items():
        if d["sold"] < MIN_SOLD:
            continue
        stk = stock.get(model, 0)
        per_wk = d["sold"] / weeks
        supply = stk / per_wk if per_wk > 0 else 99.0
        avg_days = statistics.mean(d["days"]) if d["days"] else 99.0
        avg_price = round(statistics.mean(d["prices"])) if d["prices"] else 0

        common = dict(model=model, stock=stk, per_week=round(per_wk, 1),
                      weeks_supply=round(supply, 1), avg_days=round(avg_days),
                      avg_price=avg_price)

        if supply < 4 and avg_days < 25 and per_wk >= 2:
            out.append(Opportunity(kind="BUY",
                score=(4 - supply) * 10 + (25 - avg_days),
                detail=(f"Only {stk} in stock, market selling {per_wk:.1f}/wk, "
                        f"{avg_days:.0f} days avg, ${avg_price:,}. Buy aggressively."),
                **common))
        if supply > 15 and avg_days > 50:
            out.append(Opportunity(kind="EXIT",
                score=supply + avg_days / 10,
                detail=(f"{stk} in stock, only {per_wk:.1f}/wk selling, "
                        f"{avg_days:.0f} days avg. Market saturated — wholesale or reprice."),
                **common))
        if len(d["prices"]) >= 5 and d["days"]:
            low, high = min(d["prices"]), max(d["prices"])
            if high > 0 and low / high < 0.7 and avg_days < 35:
                out.append(Opportunity(kind="SPREAD",
                    score=(high - low) / 100,
                    detail=(f"${low:,.0f} to ${high:,.0f} range, {avg_days:.0f} days avg sell. "
                            f"Margin opportunity in low-end buys."),
                    **common))

    out.sort(key=lambda o: o.score, reverse=True)
    return out[:limit]


def briefing_text(name: str | None, dealer_name: str | None,
                  opportunities: list[Opportunity], hour_nz: int) -> str:
    """The Jarvis opening — greeting, then the top plays, unprompted."""
    g = "Good morning" if hour_nz < 12 else "Good afternoon" if hour_nz < 17 else "Good evening"
    who = f", {name.split()[0]}" if name else ""
    head = f"{g}{who}."
    head += f" Briefing for {dealer_name}:" if dealer_name else " Your market briefing:"

    if not opportunities:
        return (f"{head}\n\nNot enough data variation to surface plays yet — "
                "load more weeks, or ask me something specific.")

    lines = [head, ""]
    buys = [o for o in opportunities if o.kind == "BUY"][:3]
    exits = [o for o in opportunities if o.kind == "EXIT"][:3]
    spreads = [o for o in opportunities if o.kind == "SPREAD"][:2]
    if buys:
        lines.append("🟢 BUY MORE")
        lines += [f"• {o.model} — {o.detail}" for o in buys]
        lines.append("")
    if exits:
        lines.append("🔴 EXIT / REPRICE")
        lines += [f"• {o.model} — {o.detail}" for o in exits]
        lines.append("")
    if spreads:
        lines.append("💎 MARGIN")
        lines += [f"• {o.model} — {o.detail}" for o in spreads]
        lines.append("")
    lines.append("Ask me anything about your yard or the market.")
    return "\n".join(lines)
