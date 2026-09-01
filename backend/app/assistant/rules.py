"""Deterministic answers for the questions dealers actually ask.

Jarvis had no LLM at all — every answer was a pattern match onto SQL, and it was
right every time because arithmetic doesn't hallucinate. That layer belongs in
front of Claude, not behind it:

  * the common questions answer instantly, cost nothing, and can't be wrong
    in the ways a model can be
  * Claude only sees the questions no pattern catches — the long tail it is
    actually for
  * with no API key configured, Ollie still works for everything below

Each handler returns formatted text (optionally with a chart spec the ask page
renders as SVG), or None meaning "not mine, pass it on". A chart is data the
answer already contains, drawn — never a separate computation that could
disagree with the words beside it.
"""

from __future__ import annotations

import json
import re

from sqlalchemy.orm import Session

from . import tools
from .sql import Scope


def _num(v):
    """The SQL layer serialises Decimals as strings ('14.0'); undo that here
    so handlers can do arithmetic without caring."""
    if isinstance(v, str):
        try:
            return float(v)
        except ValueError:
            return v
    return v


def _rows(raw: str) -> list[dict]:
    try:
        d = json.loads(raw)
        rows = d.get("rows", []) if isinstance(d, dict) else []
        return [{k: _num(v) for k, v in r.items()} for r in rows]
    except Exception:
        return []


def _money(v) -> str:
    return f"${v:,.0f}" if v is not None else "—"


# --- handlers ---------------------------------------------------------------


def _sales_last_week(q: str, scope: Scope, db: Session) -> str | None:
    if not re.search(r"(how many|sales?|sold).{0,30}(last week|this week|week)|up or down", q):
        return None
    rows = _rows(tools.my_sales_vs_market(4, scope))
    if not rows:
        return "No sales data loaded yet — upload a couple of weeks first."
    lines = ["Your sales, week by week (market beside you):", ""]
    for r in rows:
        wc = int(r.get("weeks_covered") or 1)
        gap = ""
        if wc > 1:
            mine_rate = (r["my_sales"] or 0) / wc
            gap = (f"  ⚠ covers ~{wc} weeks of data (snapshot gap) —"
                   f" about {mine_rate:.0f}/wk for you")
        lines.append(
            f"• week ending {r['sold_week']}: you {r['my_sales'] or 0}"
            f" ({r['my_avg_days'] or '—'} days avg) · market {r['market_sales']:,}"
            f" ({r['market_avg_days']} days avg){gap}"
        )
    if len(rows) >= 2:
        # Compare weekly RATES so a gap week doesn't read as a boom.
        now = (rows[0]["my_sales"] or 0) / int(rows[0].get("weeks_covered") or 1)
        prev = (rows[1]["my_sales"] or 0) / int(rows[1].get("weeks_covered") or 1)
        if prev:
            diff = now - prev
            word = "up" if diff > 0.5 else "down" if diff < -0.5 else "about flat"
            lines += ["", f"On a weekly rate that's {word}"
                      + (f" {abs(diff):.0f} a week." if abs(diff) > 0.5 else ".")]
    lines += ["", "Newest week is provisional — about 4% of derived sales turn out to be relists."]
    chart = {
        "type": "bar",
        "title": "Your sales per week (gap weeks shown as weekly rate)",
        "points": [
            {"label": r["sold_week"][5:] + ("*" if int(r.get("weeks_covered") or 1) > 1 else ""),
             "value": round((r["my_sales"] or 0) / int(r.get("weeks_covered") or 1)),
             "warn": int(r.get("weeks_covered") or 1) > 1}
            for r in reversed(rows)
        ],
    }
    return {"text": "\n".join(lines), "chart": chart}


def _stock_health(q: str, scope: Scope, db: Session) -> str | None:
    if not re.search(r"over 90|90 days|aged stock|old stock|(what am i|what'?s).{0,15}holding|stock health", q):
        return None
    rows = _rows(tools.my_stock_health(scope))
    if not rows:
        return "No stock loaded for you yet."
    total = sum(r["cars"] for r in rows)
    lines = [f"You're holding {total} cars:", ""]
    for r in rows:
        lines.append(
            f"• {r['age_band']} days: {r['cars']} cars, {_money(r['asking_total'])} asking"
            f" (avg {_money(r['avg_price'])})"
        )
    risky = [r for r in rows if r["age_band"] in (">120", "90-120")]
    if risky:
        n = sum(r["cars"] for r in risky)
        v = sum(r["asking_total"] or 0 for r in risky)
        lines += ["", f"⚠ {n} cars past 90 days holding {_money(v)} — the market has seen these and passed."]
    chart = {
        "type": "bar",
        "title": "Cars by age on the yard (days listed)",
        "points": [{"label": r["age_band"], "value": r["cars"],
                    "warn": r["age_band"] in (">120", "90-120")} for r in rows],
    }
    return {"text": "\n".join(lines), "chart": chart}


def _fastest(q: str, scope: Scope, db: Session) -> str | None:
    if not re.search(r"fastest|hot(test)?|turning|don'?t stock|should i (buy|stock)|selling quick", q):
        return None
    rows = _rows(tools.fastest_movers(scope, 4, 10))
    if not rows:
        return "Not enough recent sales to rank movers yet."
    lines = ["Fastest movers in the market (last 4 weeks):", ""]
    for r in rows[:10]:
        gap = "  ← you don't stock this" if not r["i_hold"] else f"  (you hold {r['i_hold']})"
        spec = f" {r['spec_canonical']}" if r.get("spec_canonical") else ""
        lines.append(
            f"• {r['make']} {r['model']}{spec}: {r['sales']} sold,"
            f" {r['median_days']:.0f} days median, avg {_money(r['avg_ask'])}{gap}"
        )
    return "\n".join(lines)


def _price_position(q: str, scope: Scope, db: Session) -> str | None:
    if not re.search(r"furthest|mispriced|over ?priced|under ?priced|priced (over|under|right|wrong)|vs.{0,10}market", q):
        return None
    rows = _rows(tools.my_price_position(scope, 10))
    if not rows:
        return "None of your current stock has enough comparable cars to judge."
    lines = ["Your stock furthest from the market (evidence shown on every line):", ""]
    for r in rows[:10]:
        d = r["pct_vs_market"]
        side = "over" if d and d > 0 else "under"
        extras = f" · has {r['my_extras']}" if r.get("my_extras") else ""
        lines.append(
            f"• {r['year']} {r['make']} {r['model']} {r.get('spec_canonical') or ''}:"
            f" asking {_money(r['my_ask'])} vs {_money(r['market_median'])} market —"
            f" {abs(d or 0):.1f}% {side} ({r['comps']} comps){extras}"
        )
    lines += ["", "Treat anything under 5 comps as a hint, not a finding."]
    chart = {
        "type": "diverging",
        "title": "% versus market (right = over, left = under)",
        "points": [
            {"label": f"{r['year']:.0f} {r['model']} {r.get('spec_canonical') or ''}".strip(),
             "value": r["pct_vs_market"] or 0}
            for r in rows[:8]
        ],
    }
    return {"text": "\n".join(lines), "chart": chart}


def _opportunities(q: str, scope: Scope, db: Session) -> str | None:
    if not re.search(r"opportunit|the play|where.{0,12}(money|margin)|best (move|buy)|what should i buy|arbitrage|brief", q):
        return None
    from ..pricing.opportunities import compute

    ops = compute(db, limit=10)
    if not ops:
        return "No clear plays in the current data — load more weeks or ask something specific."
    lines = ["🎯 The plays right now:", ""]
    for kind, label in (("BUY", "🟢 BUY MORE"), ("EXIT", "🔴 EXIT / REPRICE"), ("SPREAD", "💎 MARGIN")):
        subset = [o for o in ops if o.kind == kind][:3]
        if subset:
            lines.append(label)
            lines += [f"• {o.model} — {o.detail}" for o in subset]
            lines.append("")
    return "\n".join(lines).rstrip()


def _peers(q: str, scope: Scope, db: Session) -> dict | None:
    if not re.search(r"other dealers?|compet|peers?|stack up|benchmark|compare (me|us|my)|versus|similar (yards?|dealers?)|how (do|am) (we|i) (compare|going|doing)", q):
        return None
    from ..peers import compute as peer_compute

    viewer_ids = [int(x) for x in scope.dealer_ids.split(",") if x.strip().isdigit()]
    result = peer_compute(db, viewer_ids)
    if not result:
        return {"text": "I need your yard assigned (and a loaded week) before I can benchmark you.", "chart": None}

    lines = [f"You against {result['basis']} — last {result['weeks']} weeks. "
             "Peers are never named; sizes shown as % of yours.", ""]
    for r in result["rows"]:
        ask = _money(r["avg_sale_ask"]) if r["avg_sale_ask"] else "—"
        lines.append(
            f"• {r['label']}: {r['sales']} sales · "
            f"{r['avg_days_to_sell'] or '—'} days to sell · avg ask {ask} · "
            f"yard sitting {r['median_days_on_yard'] or '—'} days · size {r['size_pct']:.0f}%"
        )
    you = result["rows"][0]
    peers = result["rows"][1:]
    beat = sum(1 for r in peers if you["sales"] > r["sales"])
    faster = sum(1 for r in peers
                 if you["avg_days_to_sell"] and r["avg_days_to_sell"]
                 and you["avg_days_to_sell"] < r["avg_days_to_sell"])
    lines += ["", f"You out-sold {beat} of {len(peers)} and turned stock faster than {faster} of {len(peers)}."]
    chart = {
        "type": "bar",
        "title": f"Sales, last {result['weeks']} weeks — you vs similar yards",
        "points": [{"label": r["label"], "value": r["sales"],
                    "warn": r["label"] != "You"} for r in result["rows"]],
    }
    return {"text": "\n".join(lines), "chart": chart}


HANDLERS = [_peers, _opportunities, _sales_last_week, _stock_health, _fastest, _price_position]


def try_answer(question: str, scope: Scope, db: Session) -> dict | None:
    """The deterministic layer. None means: this one's for Claude.

    Returns {"text": ..., "chart": ... | None} — handlers may return a bare
    string and it is normalised here.
    """
    q = question.lower().strip()
    for handler in HANDLERS:
        try:
            answer = handler(q, scope, db)
        except Exception:
            # A broken pattern must never take the whole ask box down —
            # fall through to the model (or the no-key message) instead.
            continue
        if answer:
            return {"text": answer, "chart": None} if isinstance(answer, str) else answer
    return None
