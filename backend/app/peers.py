"""Peer benchmarking — you against five similar yards, never named.

Matt's spec, from the original scope:
  * five peers of similar size (within ~25% of the viewer's stock count)
  * a franchise yard (60%+ one make) is compared with SAME-BRAND yards —
    a Toyota store against Toyota stores, not against an independent
  * peers appear only as "Dealer 1..5"; absolute yard size is never shown,
    only % of the viewer's own; absolute sales numbers are fine
  * labels are stable (sorted selection), so Dealer 3 stays Dealer 3
    week to week and trends mean something

Computed server-side from the base tables — this is the one legitimate place
dealer identity is touched, and only aggregates ever leave it.

Verified feasible on the real data before this was written: 812 of 818 yards
can find five peers inside the size band.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

SIZE_BAND = 0.25       # ±25% of the viewer's stock count
FRANCHISE_SHARE = 0.6  # 60%+ one make = compare same-brand
PEERS = 5
SOLD_WEEKS = 4


@dataclass
class PeerRow:
    label: str            # "You" or "Dealer N"
    size_pct: float       # stock as % of the viewer's — never an absolute
    sales: int
    avg_days_to_sell: float | None
    avg_sale_ask: float | None
    median_days_on_yard: float | None


def compute(db: Session, viewer_ids: list[int]) -> dict | None:
    if not viewer_ids:
        return None
    params = {"ids": viewer_ids}

    # Everyone's current stock, and their dominant make, in one pass.
    rows = db.execute(text("""
        WITH latest AS (SELECT MAX(week_ending) AS w FROM listings),
        stock AS (
            SELECT dealer_id, make, COUNT(*) AS n
            FROM listings, latest
            WHERE week_ending = latest.w AND NOT is_held AND dealer_id IS NOT NULL
            GROUP BY dealer_id, make
        ),
        totals AS (
            SELECT dealer_id, SUM(n) AS cars FROM stock GROUP BY dealer_id
        ),
        top AS (
            SELECT DISTINCT ON (s.dealer_id) s.dealer_id, s.make AS top_make,
                   s.n::float / t.cars AS share, t.cars
            FROM stock s JOIN totals t USING (dealer_id)
            ORDER BY s.dealer_id, s.n DESC
        )
        SELECT dealer_id, top_make, share, cars FROM top
    """)).fetchall()

    # Postgres SUM comes back Decimal; keep everything float so the band
    # arithmetic doesn't care.
    sizes = {r.dealer_id: float(r.cars) for r in rows}
    top_make = {r.dealer_id: (r.top_make, r.share) for r in rows}

    my_size = sum(sizes.get(i, 0) for i in viewer_ids)
    if my_size == 0:
        return None

    mine_make, mine_share = ("", 0.0)
    if len(viewer_ids) == 1:
        mine_make, mine_share = top_make.get(viewer_ids[0], ("", 0.0))
        mine_share = float(mine_share or 0)

    candidates = [d for d in sizes if d not in viewer_ids]

    # Franchise rule first; ladder down exactly as settled — same brand + size,
    # then same brand nearest-size, then plain size band.
    chosen: list[int] = []
    if mine_share >= FRANCHISE_SHARE:
        brand = [d for d in candidates
                 if top_make.get(d, ("",))[0] == mine_make
                 and top_make.get(d, ("", 0))[1] >= FRANCHISE_SHARE]
        in_band = [d for d in brand
                   if abs(sizes[d] - my_size) <= my_size * SIZE_BAND]
        pool = in_band if len(in_band) >= PEERS else brand
        chosen = sorted(pool, key=lambda d: abs(sizes[d] - my_size))[:PEERS]
    if len(chosen) < PEERS:
        in_band = [d for d in candidates if d not in chosen
                   and abs(sizes[d] - my_size) <= my_size * SIZE_BAND]
        chosen += sorted(in_band, key=lambda d: abs(sizes[d] - my_size))[:PEERS - len(chosen)]
    if not chosen:
        return None

    # Stable labels: sort the selection by dealer id so Dealer 3 is the same
    # yard every week.
    chosen = sorted(chosen)

    def metrics(ids: list[int]) -> dict:
        sales = db.execute(text(f"""
            WITH recent AS (SELECT DISTINCT sold_week FROM sales
                            ORDER BY sold_week DESC LIMIT {SOLD_WEEKS})
            SELECT s.price, s.number_of_days_listed AS days
            FROM sales s JOIN recent r ON r.sold_week = s.sold_week
            WHERE NOT s.is_relist AND s.dealer_id = ANY(:ids)
        """), {"ids": ids}).fetchall()
        yard = db.execute(text("""
            SELECT number_of_days_listed FROM listings
            WHERE week_ending = (SELECT MAX(week_ending) FROM listings)
              AND NOT is_held AND dealer_id = ANY(:ids)
              AND number_of_days_listed IS NOT NULL
        """), {"ids": ids}).fetchall()
        days = [s.days for s in sales if s.days is not None]
        prices = [s.price for s in sales if s.price]
        return {
            "sales": len(sales),
            "avg_days": round(statistics.mean(days)) if days else None,
            "avg_ask": round(statistics.mean(prices)) if prices else None,
            "yard_days": round(statistics.median([y[0] for y in yard])) if yard else None,
        }

    out = []
    me = metrics(viewer_ids)
    out.append(PeerRow("You", 100.0, me["sales"], me["avg_days"], me["avg_ask"], me["yard_days"]))
    for i, d in enumerate(chosen, 1):
        m = metrics([d])
        out.append(PeerRow(f"Dealer {i}", round(100 * sizes[d] / my_size),
                           m["sales"], m["avg_days"], m["avg_ask"], m["yard_days"]))

    return {
        "basis": (f"5 {mine_make} yards" if mine_share >= FRANCHISE_SHARE and len(chosen) >= PEERS
                  else "5 yards of similar size"),
        "weeks": SOLD_WEEKS,
        "rows": [r.__dict__ for r in out],
    }
