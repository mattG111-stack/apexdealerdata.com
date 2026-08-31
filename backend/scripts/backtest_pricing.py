"""Walk-forward back-test of the pricing engine against real sales.

We hold the ask each car actually cleared at, so the engine can be scored rather
than argued about. The only way to do that honestly is to price each sold car
using **only what was known before it sold** — otherwise the car sits in its own
comp set and the engine marks its own homework.

So for a sale in week W:
    comps = listings live in week W-1  +  sales from weeks W-3 .. W-1
    the car itself, and everything from week W, is excluded

That is exactly the information a dealer would have had on the Monday morning
they priced it.

What "good" looks like: used cars of the same spec genuinely scatter, so a median
absolute error in the 5-10% range is a working engine, not a broken one. The
number that matters more than the median is the tail — how often it is badly
wrong — because one $10k miss costs more trust than fifty $500 ones.

    .venv/bin/python scripts/backtest_pricing.py [--week 2026-08-03] [--limit 400]
"""

from __future__ import annotations

import argparse
import statistics
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.pricing.comps import SOLD_WEEKS, find_comps  # noqa: E402
from app.pricing.engine import apply_multi_engine  # noqa: E402
from app.pricing.value import calc_pricing, extras_value  # noqa: E402

VEHICLE_COLS = """
    make, model, spec AS variant, year, kms, price,
    fuel_type, fourwd, imp_history, engine_cc,
    location, region,
    hard_lid, canopy, tow_bar,
    eighteen_wheels, twenty_wheels, twentyone_wheels, twentytwo_wheels
"""

_TARGETS = text(
    f"""
    SELECT id, vin, number_plate, link, {VEHICLE_COLS}, number_of_days_listed
    FROM sales
    WHERE NOT is_relist AND sold_week = :week
      AND price > 0 AND kms > 0 AND make IS NOT NULL AND model IS NOT NULL
      AND year IS NOT NULL
    ORDER BY id
    LIMIT :limit
    """
)

# Everything live the week BEFORE the sale — what was on the market at the time.
_POOL_LISTED = text(
    f"""
    SELECT vin, number_plate, link, {VEHICLE_COLS}, 'forsale' AS src
    FROM listings
    WHERE NOT is_held AND week_ending = :prior_week
      AND price > 0 AND kms > 0
    """
)

# Sales from the weeks before it, never the week itself.
_POOL_SOLD = text(
    f"""
    SELECT vin, number_plate, link, {VEHICLE_COLS}, 'sold' AS src
    FROM sales
    WHERE NOT is_relist
      AND sold_week < :week AND sold_week >= :from_week
      AND price > 0 AND kms > 0
    """
)


def _rows(db, stmt, **params) -> list[dict]:
    result = db.execute(stmt, params)
    cols = list(result.keys())
    return [dict(zip(cols, r)) for r in result]


def _same_car(candidate: dict, target: dict) -> bool:
    """Is this the target car itself?

    A car that sold in week W was on the market in week W-1, so its own prior
    listing sits in the comp pool with the same VIN, odometer and asking price.
    Left in, the engine partly prices each car off itself and the error rate is
    fiction — the tighter the odometer filter, the worse the flattery, which is
    exactly backwards from what a back-test is meant to show.
    """
    for key in ("vin", "number_plate", "link"):
        a, b = candidate.get(key), target.get(key)
        if a and b and a == b:
            return True
    return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", help="Sold week to score (default: latest confirmed).")
    ap.add_argument("--limit", type=int, default=400)
    args = ap.parse_args()

    db = SessionLocal()

    if args.week:
        week = date.fromisoformat(args.week)
    else:
        # The newest week whose sales are confirmed — provisional sales still
        # contain ~4% relists, which are not sales at all.
        week = db.execute(
            text("SELECT MAX(sold_week) FROM sales WHERE NOT is_provisional")
        ).scalar()
    if week is None:
        print("No confirmed sold week to score.")
        return

    prior_week = db.execute(
        text("SELECT MAX(week_ending) FROM listings WHERE week_ending < :w"), {"w": week}
    ).scalar()
    if prior_week is None:
        print(f"No listings snapshot before {week}.")
        return

    targets = _rows(db, _TARGETS, week=week, limit=args.limit)
    if not targets:
        print(f"No sales in week {week}.")
        return

    pool = _rows(db, _POOL_LISTED, prior_week=prior_week)
    pool += _rows(db, _POOL_SOLD, week=week, from_week=week - timedelta(weeks=SOLD_WEEKS))

    print(f"scoring week {week}   (comps from listings {prior_week} "
          f"+ sales in the {SOLD_WEEKS} weeks before)")
    print(f"{len(targets):,} sold cars, {len(pool):,} comps available\n")

    by_model: dict[tuple, list[dict]] = defaultdict(list)
    for row in pool:
        by_model[((row["make"] or "").lower(), (row["model"] or "").lower())].append(row)

    errors: list[float] = []
    dollar_errors: list[float] = []
    unpriced = 0
    widened = 0

    for target in targets:
        key = ((target["make"] or "").lower(), (target["model"] or "").lower())
        candidates = [c for c in by_model.get(key, []) if not _same_car(c, target)]
        if not candidates:
            unpriced += 1
            continue

        apply_multi_engine([target, *candidates])
        found = find_comps(target, candidates)
        if not found.comps:
            unpriced += 1
            continue

        valuation = calc_pricing(found.comps, target["kms"], target["year"])
        if valuation is None:
            unpriced += 1
            continue

        predicted = valuation.mid + extras_value(target)
        actual = target["price"]
        errors.append(abs(predicted - actual) / actual * 100)
        dollar_errors.append(abs(predicted - actual))
        if found.expanded:
            widened += 1

    scored = len(errors)
    if not scored:
        print("Nothing could be priced — check the pool.")
        return

    errors.sort()
    dollar_errors.sort()

    def pct(values, p):
        return values[min(int(len(values) * p), len(values) - 1)]

    print(f"priced      {scored:,} of {len(targets):,}  "
          f"({scored / len(targets):.0%}; {unpriced:,} had no usable comps)")
    print(f"widened     {widened:,} ({widened / scored:.0%} needed a looser rung)\n")
    print(f"median error      {statistics.median(errors):6.1f}%   "
          f"${statistics.median(dollar_errors):>7,.0f}")
    print(f"75th percentile   {pct(errors, 0.75):6.1f}%   ${pct(dollar_errors, 0.75):>7,.0f}")
    print(f"90th percentile   {pct(errors, 0.90):6.1f}%   ${pct(dollar_errors, 0.90):>7,.0f}")
    print()
    for threshold in (5, 10, 20):
        share = sum(1 for e in errors if e <= threshold) / scored
        print(f"within {threshold:>2}%        {share:6.1%}")

    db.close()


if __name__ == "__main__":
    main()
