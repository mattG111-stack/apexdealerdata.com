"""Old engine vs new, on identical cars.

Three changes were made to the ported Jarvis logic, each justified by an argument
and a single example. An argument is not evidence. This scores both versions
against the same real sales, walk-forward, so "better" becomes a number.

OLD reproduces Jarvis as it stood:
  * comps matched with the engine stripped off (`_trimTok`), so a 2.0 could be
    priced from 3.0s
  * the odometer used as a filter (±5k/10k/20k/30k rungs) as well as a model
  * price from a two-anchor line between the lowest-km and highest-km comp
  * extras added to the target only, never stripped from the comps
  * canopy $200, hard lid $600

NEW is what is in app/pricing now.

Both see exactly the same targets and the same comp pool, so any difference is
the logic and nothing else.

    .venv/bin/python scripts/compare_pricing.py [--limit 800]
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
from app.pricing import comps as comps_mod  # noqa: E402
from app.pricing.comps import SOLD_WEEKS, find_comps, in_scope, scopes_for, trim_token  # noqa: E402
from app.pricing.engine import apply_multi_engine  # noqa: E402
from app.pricing.value import calc_pricing, extras_value  # noqa: E402

COLS = """vin, number_plate, link, make, model, spec AS variant, year, kms, price, fuel_type, fourwd,
          imp_history, engine_cc, location, region, hard_lid, canopy, tow_bar,
          eighteen_wheels, twenty_wheels, twentyone_wheels, twentytwo_wheels"""

# --- OLD behaviour ---------------------------------------------------------

OLD_EXPANSIONS = [
    (5_000, 0), (10_000, 0), (20_000, 0), (30_000, 0),
    (5_000, 1), (20_000, 1), ("any", 1), ("any", 2),
]
OLD_EXTRAS = {"canopy": 200, "hard_lid": 600}


def old_extras_value(vehicle: dict) -> int:
    total = 0
    for field, amount in OLD_EXTRAS.items():
        if vehicle.get(field):
            total += amount
    if any(vehicle.get(f) for f in
           ("eighteen_wheels", "twenty_wheels", "twentyone_wheels", "twentytwo_wheels")):
        total += 500
    return total


def old_matches(candidate: dict, target: dict, km_range, year_range) -> bool:
    """Jarvis matching: trim compared with the engine stripped off."""
    if (candidate.get("make") or "").lower() != (target.get("make") or "").lower():
        return False
    if (candidate.get("model") or "").lower() != (target.get("model") or "").lower():
        return False

    tv = trim_token(target.get("variant") or target.get("spec"))
    if tv and trim_token(candidate.get("variant") or candidate.get("spec")) != tv:
        return False

    tf = (target.get("fuel_type") or "").lower()
    if tf:
        cf = (candidate.get("fuel_type") or "").lower()
        if not cf or cf != tf:
            return False

    t_imp, c_imp = target.get("imp_history"), candidate.get("imp_history")
    if t_imp and c_imp:
        if (("nz" in c_imp.lower()) != (t_imp == "NZ New")):
            return False

    tk = target.get("kms") or 0
    if km_range != "any" and tk and candidate.get("kms"):
        if abs(candidate["kms"] - tk) > km_range:
            return False
    ty = target.get("year") or 0
    if year_range != "any" and ty and candidate.get("year"):
        if abs(int(candidate["year"]) - int(ty)) > year_range:
            return False
    return True


def old_calc(comps: list[dict], target_km, target_year):
    """Two-anchor line between the lowest-km and highest-km comp."""
    valid = [c for c in comps if (c.get("price") or 0) > 0 and (c.get("kms") or 0) > 0]
    if not valid:
        return None
    if len(valid) <= 2:
        return round(sum(c["price"] for c in valid) / len(valid) / 100) * 100

    if target_year:
        valid = [
            dict(c, price=max(1000, c["price"] - ((int(c.get("year") or 0) - int(target_year)) * 2000)))
            for c in valid
        ]

    by_km = sorted(valid, key=lambda c: c["kms"])
    lo, hi = by_km[0], by_km[-1]
    if target_km and lo["kms"] != hi["kms"]:
        ratio = max(0.0, min(1.0, (target_km - lo["kms"]) / (hi["kms"] - lo["kms"])))
        mid = lo["price"] + (hi["price"] - lo["price"]) * ratio
    else:
        mid = sum(c["price"] for c in valid) / len(valid)
    return max(1000, round(mid / 100) * 100)


def old_price(target: dict, pool: list[dict]):
    for scope in scopes_for(target):
        scoped = [v for v in pool if in_scope(v, scope)]
        if not scoped:
            continue
        for km_range, year_range in OLD_EXPANSIONS:
            found = [
                v for v in scoped
                if (v.get("price") or 0) > 0 and old_matches(v, target, km_range, year_range)
            ]
            if len(found) >= comps_mod.MIN_COMPS:
                mid = old_calc(found, target.get("kms"), target.get("year"))
                return None if mid is None else mid + old_extras_value(target)
    return None


# --- NEW behaviour ---------------------------------------------------------


def new_price(target: dict, pool: list[dict]):
    found = find_comps(target, pool)
    if not found.comps:
        return None
    valuation = calc_pricing(found.comps, target.get("kms"), target.get("year"))
    if valuation is None:
        return None
    return valuation.mid + extras_value(target)


# --- scoring ---------------------------------------------------------------


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


def summarise(name: str, errors: list[float], attempted: int) -> dict:
    if not errors:
        print(f"{name}: nothing priced")
        return {}
    errors.sort()
    p = lambda q: errors[min(int(len(errors) * q), len(errors) - 1)]  # noqa: E731
    stats = {
        "priced": len(errors) / attempted,
        "median": statistics.median(errors),
        "p75": p(0.75),
        "p90": p(0.90),
        "within10": sum(1 for e in errors if e <= 10) / len(errors),
        "within20": sum(1 for e in errors if e <= 20) / len(errors),
    }
    print(f"{name:<6}{stats['priced']:>9.0%}{stats['median']:>10.1f}%"
          f"{stats['p75']:>9.1f}%{stats['p90']:>9.1f}%"
          f"{stats['within10']:>11.0%}{stats['within20']:>11.0%}")
    return stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=800)
    args = ap.parse_args()

    db = SessionLocal()
    week = db.execute(
        text("SELECT MAX(sold_week) FROM sales WHERE NOT is_provisional")
    ).scalar()
    prior = db.execute(
        text("SELECT MAX(week_ending) FROM listings WHERE week_ending < :w"), {"w": week}
    ).scalar()

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
            ((row["make"] or "").lower(), (row["model"] or "").lower()), []).append(row)

    print(f"week {week}, {len(targets):,} sold cars, {len(pool):,} comps\n")

    old_errors: list[float] = []
    new_errors: list[float] = []

    for target in targets:
        candidates = [
            c for c in by_model.get(
                ((target["make"] or "").lower(), (target["model"] or "").lower()), [])
            if not _same_car(c, target)
        ]
        if not candidates:
            continue
        apply_multi_engine([target, *candidates])
        actual = target["price"]

        old = old_price(target, candidates)
        if old:
            old_errors.append(abs(old - actual) / actual * 100)
        new = new_price(target, candidates)
        if new:
            new_errors.append(abs(new - actual) / actual * 100)

    print(f"{'':<6}{'priced':>9}{'median':>10}{'p75':>9}{'p90':>9}{'within10':>11}{'within20':>11}")
    print("-" * 65)
    old_stats = summarise("OLD", old_errors, len(targets))
    new_stats = summarise("NEW", new_errors, len(targets))

    if old_stats and new_stats:
        print()
        delta = old_stats["median"] - new_stats["median"]
        print(f"median error moved {delta:+.1f} points "
              f"({old_stats['median']:.1f}% -> {new_stats['median']:.1f}%)")
        print(f"cars priced within 10% moved "
              f"{(new_stats['within10'] - old_stats['within10']) * 100:+.0f} points")
    db.close()


if __name__ == "__main__":
    main()
