"""Pricing every live listing, and deciding which ones are actually deals.

This is the shape Ollie had for property: value the whole market on ingest,
store it, and let "show me the deals" be a query rather than fifty thousand
pricing runs. A dealer opens the app and sees what is worth buying — they don't
have to think of the question first.

The hard part is not finding cars priced under their comps. It is refusing to
call most of them deals. A car is cheap for a reason far more often than it is
cheap by mistake, and a list padded with junk teaches a dealer to ignore the
list. The guards below all exist to throw away a plausible-looking margin.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import timedelta

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..models import Listing, Sale
from .comps import SOLD_WEEKS, find_comps
from .engine import apply_multi_engine
from .value import calc_pricing, extras_value

# --- what counts as a deal -------------------------------------------------

# Below this the margin is inside the engine's own error. Measured median error
# is 7.6%, so anything under it is noise wearing a bargain's clothes.
MIN_MARGIN = 0.10

# Above this it is almost never a bargain — it is a damaged car, a wrong
# odometer, a typo, or a dealer clearing something with a story attached.
MAX_MARGIN = 0.45

# A margin off three comps is arithmetic, not evidence.
MIN_COMPS_FOR_DEAL = 5

# A car already sitting this long is not underpriced, whatever the comps say.
# The market has been looking at it for three months and passed.
STALE_DAYS = 90

# Cheap is not the same as sellable. If cars of this shape take longer than this
# to clear, the money is tied up whatever the margin looks like.
MAX_DAYS_TO_SELL = 75

CHUNK = 500


def confidence_of(comps: int, expanded: bool) -> str:
    if comps >= 15 and not expanded:
        return "high"
    if comps >= 8:
        return "medium"
    return "low"


def _is_deal(margin: float | None, comps: int, days_listed: int | None,
             days_to_sell: float | None) -> bool:
    """Every one of these is a way of saying no."""
    if margin is None or not (MIN_MARGIN <= margin <= MAX_MARGIN):
        return False
    if comps < MIN_COMPS_FOR_DEAL:
        return False
    if days_listed is not None and days_listed > STALE_DAYS:
        return False
    if days_to_sell is not None and days_to_sell > MAX_DAYS_TO_SELL:
        return False
    return True


def _days_to_sell_by_model(db: Session) -> dict[tuple, float]:
    """Median days-to-sell per make/model/spec, from recent confirmed sales.

    Answers "how fast does the money come back", which is half of whether a
    cheap car is worth buying.
    """
    latest = db.scalar(select(Sale.sold_week).order_by(Sale.sold_week.desc()).limit(1))
    if latest is None:
        return {}

    rows = db.execute(
        select(Sale.make, Sale.model, Sale.number_of_days_listed)
        .where(
            Sale.is_relist.is_(False),
            Sale.number_of_days_listed.isnot(None),
            Sale.sold_week >= latest - timedelta(weeks=8),
        )
    )

    buckets: dict[tuple, list[int]] = defaultdict(list)
    for make, model, days in rows:
        buckets[((make or "").lower(), (model or "").lower())].append(days)

    return {
        key: statistics.median(values)
        for key, values in buckets.items()
        if len(values) >= 5
    }


def price_week(db: Session, week_ending=None, verbose: bool = True) -> dict:
    """Price every live listing in a week and store the result.

    Comps are built once per make/model rather than per car — the pool is the
    expensive part, and every Ranger shares one.
    """
    if week_ending is None:
        week_ending = db.scalar(
            select(Listing.week_ending).order_by(Listing.week_ending.desc()).limit(1)
        )
    if week_ending is None:
        return {"priced": 0, "deals": 0}

    speed = _days_to_sell_by_model(db)

    listings = db.execute(
        select(Listing).where(
            Listing.week_ending == week_ending, Listing.is_held.is_(False)
        )
    ).scalars().all()

    by_model: dict[tuple, list[Listing]] = defaultdict(list)
    for listing in listings:
        by_model[((listing.make or "").lower(), (listing.model or "").lower())].append(listing)

    # Recent sales join the comp pool alongside live stock — a car that actually
    # cleared is better evidence than one still asking.
    latest_sale = db.scalar(select(Sale.sold_week).order_by(Sale.sold_week.desc()).limit(1))
    sold_rows: dict[tuple, list[dict]] = defaultdict(list)
    if latest_sale is not None:
        for s in db.execute(
            select(
                Sale.make, Sale.model, Sale.spec, Sale.year, Sale.kms, Sale.price,
                Sale.fuel_type, Sale.fourwd, Sale.imp_history, Sale.engine_cc,
                Sale.location, Sale.region,
            ).where(
                Sale.is_relist.is_(False),
                Sale.price.isnot(None), Sale.kms.isnot(None),
                Sale.sold_week >= latest_sale - timedelta(weeks=SOLD_WEEKS),
            )
        ):
            sold_rows[((s.make or "").lower(), (s.model or "").lower())].append(
                {
                    "make": s.make, "model": s.model, "variant": s.spec,
                    "year": s.year, "kms": s.kms, "price": s.price,
                    "fuel_type": s.fuel_type, "fourwd": s.fourwd,
                    "imp_history": s.imp_history, "engine_cc": s.engine_cc,
                    "location": s.location, "region": s.region, "src": "sold",
                }
            )

    priced = deals = 0
    updates: list[dict] = []

    for key, group in by_model.items():
        pool = [
            {
                "make": l.make, "model": l.model, "variant": l.spec,
                "year": l.year, "kms": l.kms, "price": l.price,
                "fuel_type": l.fuel_type, "fourwd": l.fourwd,
                "imp_history": l.imp_history, "engine_cc": l.engine_cc,
                "location": l.location, "region": l.region, "src": "forsale",
                "_id": l.id,
            }
            for l in group
            if l.price and l.kms
        ] + sold_rows.get(key, [])

        if len(pool) < MIN_COMPS_FOR_DEAL:
            continue

        apply_multi_engine(pool)

        for listing in group:
            if not listing.price or not listing.kms:
                continue

            target = {
                "make": listing.make, "model": listing.model, "variant": listing.spec,
                "year": listing.year, "kms": listing.kms, "price": listing.price,
                "fuel_type": listing.fuel_type, "fourwd": listing.fourwd,
                "imp_history": listing.imp_history, "engine_cc": listing.engine_cc,
                "location": listing.location, "region": listing.region,
                "hard_lid": listing.hard_lid, "canopy": listing.canopy,
                "tow_bar": listing.tow_bar,
            }
            apply_multi_engine([target, *pool])

            # A car is never its own comp.
            candidates = [p for p in pool if p.get("_id") != listing.id]
            found = find_comps(target, candidates)
            if not found.comps:
                continue

            valuation = calc_pricing(found.comps, listing.kms, listing.year)
            if valuation is None:
                continue

            # Never call a car a deal when its odometer sits outside the range
            # the comps actually cover — the km line is being extrapolated past
            # its own evidence, and depreciation against kilometres is a curve,
            # not a line. Measured: cars over 120,000km were flagged at 9.1%
            # versus 4.0% under 60,000km, which is the model being generous to
            # worn-out cars rather than the market being generous.
            comp_kms = [c["kms"] for c in found.comps if c.get("kms")]
            in_range = bool(comp_kms) and min(comp_kms) <= listing.kms <= max(comp_kms)

            extras = extras_value(target)
            fair = valuation.mid + extras
            margin = (fair - listing.price) / listing.price

            # Keyed on make/model only. Keying on the trim as well looked more
            # precise but never matched — the sales side stores 'WILDTRAK 2.0'
            # and the target carries 'Wildtrak 2.0 D', so the guard silently
            # never fired.
            dts = speed.get(
                ((listing.make or "").lower(), (listing.model or "").lower())
            )

            priced += 1
            deal = in_range and _is_deal(
                margin, found.count, listing.number_of_days_listed, dts)
            if deal:
                deals += 1

            updates.append({
                "b_id": listing.id,
                "fair_value": fair,
                "value_low": valuation.low + extras,
                "value_high": valuation.high + extras,
                "margin": margin,
                "comps_used": found.count,
                "comp_step": found.step,
                "comp_scope": found.scope,
                "comp_expanded": found.expanded,
                "confidence": confidence_of(found.count, found.expanded),
                "is_underpriced": deal,
                "days_to_sell": dts,
            })

        if verbose and len(updates) >= 5000:
            _flush(db, updates)
            print(f"  priced {priced:,}…")
            updates = []

    _flush(db, updates)
    db.commit()
    return {"week_ending": str(week_ending), "priced": priced, "deals": deals}


def _flush(db: Session, updates: list[dict]) -> None:
    """Write the batch with plain SQL.

    Deliberately not an ORM bulk update: the session already holds these Listing
    objects, and SQLAlchemy's bulk paths either refuse to reconcile them or
    demand the primary key be spelled `id`. Raw SQL sidesteps both and is faster
    over 50,000 rows.
    """
    if not updates:
        return
    stmt = text(
        """
        UPDATE listings SET
            fair_value = :fair_value,
            value_low = :value_low,
            value_high = :value_high,
            margin = :margin,
            comps_used = :comps_used,
            comp_step = :comp_step,
            comp_scope = :comp_scope,
            comp_expanded = :comp_expanded,
            confidence = :confidence,
            is_underpriced = :is_underpriced,
            days_to_sell = :days_to_sell
        WHERE id = :b_id
        """
    )
    for i in range(0, len(updates), CHUNK):
        db.execute(stmt, updates[i : i + CHUNK])
