"""Building the comp pool from Postgres, and pricing one car end to end.

Jarvis built its pool from whatever was loaded in the browser. Apex builds it
from the database, but keeps the same narrow window Matt specified: cars
**currently for sale**, plus cars **sold in the last three weeks**. Stale comps
misprice a moving market, so the depth of history behind this is deliberately not
used for comps — it is for calibration and trend, not for what a car is worth
today.

The pool is fetched wide (make + model only) and narrowed in Python by the
expansion ladder, because the ladder needs to try several rungs against the same
set without eight round trips to the database.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from .comps import CompResult, SOLD_WEEKS, find_comps
from .engine import apply_multi_engine
from .value import Valuation, calc_pricing, extras_value

# Enough to cover any rung of the ladder for a normal model; the ladder itself
# does the narrowing. A cap exists so a query on 'Toyota Corolla' can't pull
# tens of thousands of rows into memory.
MAX_POOL = 4_000

_LISTED_SQL = text(
    """
    SELECT make, model, spec AS variant, year, kms, price,
           fuel_type, fourwd, imp_history, engine_cc,
           location, region, dealer_name_raw AS dealer_name,
           hard_lid, canopy, tow_bar,
           eighteen_wheels, twenty_wheels, twentyone_wheels, twentytwo_wheels,
           'forsale' AS src, NULL::date AS sold_week
    FROM listings
    WHERE NOT is_held
      AND week_ending = (SELECT MAX(week_ending) FROM listings)
      AND make ILIKE :make AND model ILIKE :model
      AND price > 0 AND kms > 0
    LIMIT :cap
    """
)

_SOLD_SQL = text(
    """
    SELECT make, model, spec AS variant, year, kms, price,
           fuel_type, fourwd, imp_history, engine_cc,
           location, region, dealer_name_raw AS dealer_name,
           hard_lid, canopy, tow_bar,
           eighteen_wheels, twenty_wheels, twentyone_wheels, twentytwo_wheels,
           'sold' AS src, sold_week
    FROM sales
    WHERE NOT is_relist
      AND sold_week >= (SELECT MAX(sold_week) FROM sales) - make_interval(weeks => :weeks)
      AND make ILIKE :make AND model ILIKE :model
      AND price > 0 AND kms > 0
    LIMIT :cap
    """
)


def build_comp_pool(db: Session, make: str, model: str) -> list[dict]:
    """Live listings plus the last three weeks of sales, for one make/model.

    Engine disambiguation runs across the whole pool at once rather than per row,
    because whether a trim is ambiguous is a property of the population — a
    Wildtrak is only "2.0 vs 3.0" if both are actually out there.
    """
    params = {"make": make, "model": model, "cap": MAX_POOL}

    rows: list[dict] = []
    for stmt, extra in ((_LISTED_SQL, {}), (_SOLD_SQL, {"weeks": SOLD_WEEKS})):
        result = db.execute(stmt, {**params, **extra})
        cols = list(result.keys())
        rows.extend(dict(zip(cols, r)) for r in result)

    apply_multi_engine(rows)
    return rows


def price_vehicle(db: Session, vehicle: dict) -> dict:
    """Price one car: find comps, walk the ladder if needed, value it.

    The return always carries how the answer was reached — how many comps, which
    rung of the ladder, and whether the net had to be widened. A price without
    that context is the thing this product exists not to produce.
    """
    make = vehicle.get("make") or ""
    model = vehicle.get("model") or ""
    if not make or not model:
        return {
            "priced": False,
            "reason": "Need at least a make and model.",
            "comps": 0,
        }

    pool = build_comp_pool(db, make, model)
    # The target goes through the same engine disambiguation as the pool, or a
    # bare 'Wildtrak' would never match the 'Wildtrak 2.0' rows it belongs with.
    target = dict(vehicle)
    apply_multi_engine([target, *pool])

    found: CompResult = find_comps(target, pool)
    if not found.comps:
        return {
            "priced": False,
            "reason": "No comparable vehicles found.",
            "comps": 0,
            "step": found.step,
        }

    valuation: Valuation | None = calc_pricing(
        found.comps, target.get("kms"), target.get("year")
    )
    if valuation is None:
        return {
            "priced": False,
            "reason": "Comps found but none had a usable price and odometer.",
            "comps": found.count,
            "step": found.step,
        }

    extras = extras_value(target)

    return {
        "priced": True,
        "low": valuation.low + extras,
        "mid": valuation.mid + extras,
        "high": valuation.high + extras,
        "extras_adjustment": extras,
        "comps": valuation.count,
        "single_price": valuation.single_price,
        "step": found.step,
        "scope": found.scope,
        # True when the ladder had to widen. This must reach the dealer: a price
        # from '±2 years, any km, national' deserves less weight than one from
        # five same-year cars in their own city.
        "expanded": found.expanded,
        "sold_comps": sum(1 for c in found.comps if c.get("src") == "sold"),
        "listed_comps": sum(1 for c in found.comps if c.get("src") == "forsale"),
        "variant_used": target.get("variant"),
        # The comps themselves, so the caller can plot the car in its market
        # rather than just quote a number at the dealer. Seeing where your car
        # sits in the cloud is worth more than the figure.
        "comp_points": [
            {
                "kms": c.get("kms"),
                "price": c.get("price"),
                "year": c.get("year"),
                "variant": c.get("variant"),
                "sold": c.get("src") == "sold",
                "extras": sum(
                    1 for f in ("canopy", "hard_lid", "tow_bar") if c.get(f)
                ),
            }
            for c in found.comps
            if c.get("kms") and c.get("price")
        ],
    }
