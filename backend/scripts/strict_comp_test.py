"""How far does a strict like-for-like comp rule actually get you?

The rule under test, exactly as specified: same make, same model, same spec,
same engine size, odometer within 5,000km, same fuel type, same import history.
No expansion, no widening.

It is the most defensible comp anyone could ask for — every car in the set is
genuinely the same car. The only question is how often such a set exists, and
whether it prices better than a looser one when it does.

Scored walk-forward against real sales, with each car's own prior-week listing
excluded, so nothing prices itself.

    .venv/bin/python scripts/strict_comp_test.py [--limit 800] [--km 5000]
"""

from __future__ import annotations

import argparse
import statistics
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.pricing.comps import SOLD_WEEKS, find_comps  # noqa: E402
from app.pricing.engine import apply_multi_engine, disp_code  # noqa: E402
from app.pricing.value import calc_pricing, extras_value  # noqa: E402

COLS = """vin, number_plate, link, make, model, spec AS variant, year, kms, price,
          fuel_type, fourwd, imp_history, engine_cc, location, region,
          hard_lid, canopy, tow_bar,
          eighteen_wheels, twenty_wheels, twentyone_wheels, twentytwo_wheels"""


def _same_car(candidate: dict, target: dict) -> bool:
    for key in ("vin", "number_plate", "link"):
        a, b = candidate.get(key), target.get(key)
        if a and b and a == b:
            return True
    return False


def _norm(value) -> str:
    return str(value or "").strip().lower()


def strict_matches(candidate: dict, target: dict, km_window: int) -> bool:
    """Same car in every respect that matters, within the odometer window."""
    if _norm(candidate.get("make")) != _norm(target.get("make")):
        return False
    if _norm(candidate.get("model")) != _norm(target.get("model")):
        return False

    # Spec compared as written, after multi-engine disambiguation has run.
    if _norm(candidate.get("variant")) != _norm(target.get("variant")):
        return False

    # Engine size, via the same banding the engine uses (1996 and 2000cc are one
    # engine). Both sides must state it — an unknown engine is not a match.
    c_engine = disp_code(candidate.get("engine_cc"), candidate.get("fuel_type"))
    t_engine = disp_code(target.get("engine_cc"), target.get("fuel_type"))
    if not c_engine or not t_engine or c_engine != t_engine:
        return False

    if _norm(candidate.get("fuel_type")) != _norm(target.get("fuel_type")):
        return False
    if _norm(candidate.get("imp_history")) != _norm(target.get("imp_history")):
        return False

    c_km, t_km = candidate.get("kms"), target.get("kms")
    if not c_km or not t_km or abs(c_km - t_km) > km_window:
        return False

    return True


def score(errors: list[float], attempted: int, label: str) -> None:
    if not errors:
        print(f"{label:<22}{0:>8.0%}{'—':>10}{'—':>9}{'—':>9}{'—':>11}")
        return
    errors.sort()
    p = lambda q: errors[min(int(len(errors) * q), len(errors) - 1)]  # noqa: E731
    print(f"{label:<22}{len(errors) / attempted:>8.0%}"
          f"{statistics.median(errors):>9.1f}%{p(0.75):>8.1f}%{p(0.90):>8.1f}%"
          f"{sum(1 for e in errors if e <= 10) / len(errors):>10.0%}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=800)
    ap.add_argument("--km", type=int, default=5_000)
    ap.add_argument("--min-comps", type=int, default=3)
    args = ap.parse_args()

    db = SessionLocal()
    week = db.execute(
        text("SELECT MAX(sold_week) FROM sales WHERE NOT is_provisional")).scalar()
    prior = db.execute(
        text("SELECT MAX(week_ending) FROM listings WHERE week_ending < :w"),
        {"w": week}).scalar()

    def rows(sql, **kw):
        res = db.execute(text(sql), kw)
        keys = list(res.keys())
        return [dict(zip(keys, r)) for r in res]

    targets = rows(
        f"SELECT {COLS} FROM sales WHERE NOT is_relist AND sold_week = :w "
        "AND price > 0 AND kms > 0 AND make IS NOT NULL AND model IS NOT NULL "
        f"AND year IS NOT NULL ORDER BY id LIMIT {args.limit}", w=week)
    pool = rows(f"SELECT {COLS}, 'forsale' AS src FROM listings WHERE NOT is_held "
                "AND week_ending = :p AND price > 0 AND kms > 0", p=prior)
    pool += rows(f"SELECT {COLS}, 'sold' AS src FROM sales WHERE NOT is_relist "
                 "AND sold_week < :w AND sold_week >= :f AND price > 0 AND kms > 0",
                 w=week, f=week - timedelta(weeks=SOLD_WEEKS))

    by_model: dict[tuple, list[dict]] = {}
    for row in pool:
        by_model.setdefault(
            (_norm(row["make"]), _norm(row["model"])), []).append(row)

    print(f"week {week}, {len(targets):,} sold cars, {len(pool):,} comps")
    print(f"strict rule: same make/model/spec/engine/fuel/import, "
          f"odometer within {args.km:,}km, {args.min_comps}+ comps\n")

    strict_errors: list[float] = []
    ladder_errors: list[float] = []
    comp_counts: list[int] = []
    strict_found = 0

    for target in targets:
        candidates = [
            c for c in by_model.get((_norm(target["make"]), _norm(target["model"])), [])
            if not _same_car(c, target)
        ]
        if not candidates:
            continue
        apply_multi_engine([target, *candidates])
        actual = target["price"]

        strict = [c for c in candidates if strict_matches(c, target, args.km)]
        if len(strict) >= args.min_comps:
            strict_found += 1
            comp_counts.append(len(strict))
            valuation = calc_pricing(strict, target["kms"], target["year"])
            if valuation:
                predicted = valuation.mid + extras_value(target)
                strict_errors.append(abs(predicted - actual) / actual * 100)

        found = find_comps(target, candidates)
        if found.comps:
            valuation = calc_pricing(found.comps, target["kms"], target["year"])
            if valuation:
                predicted = valuation.mid + extras_value(target)
                ladder_errors.append(abs(predicted - actual) / actual * 100)

    print(f"{'':<22}{'priced':>8}{'median':>10}{'p75':>9}{'p90':>9}{'within10':>11}")
    print("-" * 69)
    score(strict_errors, len(targets), f"strict ±{args.km // 1000}k km")
    score(ladder_errors, len(targets), "current ladder")

    if comp_counts:
        comp_counts.sort()
        print(f"\nwhen the strict rule works it finds a median of "
              f"{statistics.median(comp_counts):.0f} comps "
              f"(max {comp_counts[-1]})")
    print(f"strict rule found a usable set for {strict_found:,} of {len(targets):,} "
          f"cars ({strict_found / len(targets):.0%})")
    db.close()


if __name__ == "__main__":
    main()
