"""What do fitted extras actually add to the asking price?

The earlier attempt compared cars with and without an extra inside a tight cell
(make/model/year/spec/kms band) and found almost nothing — but a strict cell burns
so much sample that it can't see a $500 effect.

This is a better instrument. The pricing engine already controls for year,
odometer, trim, engine, fuel, import history, drivetrain and region, and it
values a *bare* car because each comp is stripped of its own extras first. So
price every car, take the residual (what it is actually asked minus what the bare
car is worth), and compare residuals between cars that have an extra and cars
that don't. Anything the extra is worth shows up in that gap.

Run on utes, where extras are actually fitted — a canopy on a hatchback is noise.

    .venv/bin/python scripts/measure_extras.py
"""

from __future__ import annotations

import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.pricing.comps import find_comps  # noqa: E402
from app.pricing.engine import apply_multi_engine  # noqa: E402
from app.pricing.value import calc_pricing  # noqa: E402

# Where extras are genuinely fitted.
UTES = [
    ("Ford", "Ranger"), ("Toyota", "Hilux"), ("Mitsubishi", "Triton"),
    ("Mazda", "BT-50"), ("Nissan", "Navara"), ("Isuzu", "D-Max"),
    ("Volkswagen", "Amarok"), ("Holden", "Colorado"), ("Ssangyong", "Musso"),
    ("Great Wall", "Cannon"), ("LDV", "T60"),
]

EXTRAS = ["eighteen_wheels", "twenty_wheels", "twentyone_wheels", "twentytwo_wheels"]

SQL = text(
    """
    SELECT id, make, model, spec AS variant, year, kms, price,
           fuel_type, fourwd, imp_history, engine_cc, location, region,
           hard_lid, canopy, tow_bar,
           eighteen_wheels, twenty_wheels, twentyone_wheels, twentytwo_wheels,
           'forsale' AS src
    FROM listings
    WHERE NOT is_held
      AND week_ending = (SELECT MAX(week_ending) FROM listings)
      AND make = :make AND model = :model
      AND price > 0 AND kms > 0 AND year IS NOT NULL
    """
)


def main() -> None:
    db = SessionLocal()
    residuals: dict[str, dict[bool, list[float]]] = {
        e: {True: [], False: []} for e in EXTRAS
    }
    priced = skipped = 0

    for make, model in UTES:
        result = db.execute(SQL, {"make": make, "model": model})
        cols = list(result.keys())
        rows = [dict(zip(cols, r)) for r in result]
        if len(rows) < 20:
            continue

        apply_multi_engine(rows)

        for target in rows:
            # A car must never be its own comp.
            pool = [r for r in rows if r["id"] != target["id"]]
            found = find_comps(target, pool)
            if len(found.comps) < 5:
                skipped += 1
                continue
            valuation = calc_pricing(found.comps, target["kms"], target["year"])
            if valuation is None:
                skipped += 1
                continue

            # Positive residual = asked above what a bare equivalent is worth.
            residual = target["price"] - valuation.mid
            priced += 1
            for extra in EXTRAS:
                residuals[extra][bool(target.get(extra))].append(residual)

    print(f"priced {priced:,} utes ({skipped:,} skipped for thin comps)\n")
    print(f"{'extra':<12}{'fitted':>8}{'bare':>8}{'median gap':>13}{'mean gap':>11}"
          f"{'currently':>11}")
    print("-" * 64)

    from app.pricing.value import EXTRA_CANOPY, EXTRA_HARD_LID

    current = {k: 500 for k in EXTRAS}

    for extra in EXTRAS:
        with_it = residuals[extra][True]
        without = residuals[extra][False]
        if len(with_it) < 30 or len(without) < 30:
            print(f"{extra:<12}{len(with_it):>8}{len(without):>8}"
                  f"{'too thin':>13}{'':>11}{current[extra]:>11,}")
            continue
        med_gap = statistics.median(with_it) - statistics.median(without)
        mean_gap = statistics.mean(with_it) - statistics.mean(without)
        print(f"{extra:<12}{len(with_it):>8,}{len(without):>8,}"
              f"{med_gap:>12,.0f}{mean_gap:>11,.0f}{current[extra]:>11,}")

    print("\nmedian gap is the honest one — a mean chases the odd $80k special.")
    db.close()


if __name__ == "__main__":
    main()
