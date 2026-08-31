"""A market index for NZ used cars, chained week to week.

Comparing the median asking price across all listings from one week to the next
measures the wrong thing: the mix changes constantly, so a week with more utes
looks like a rising market. Any trend read off raw medians is mostly noise about
what happened to be listed.

Instead, chain it. For each consecutive pair of weeks, take only the cells
(make, model, year, spec, kms band) present in BOTH, compute the median price
change within each cell, and take the median of those. That is a like-for-like
movement. Multiply the weekly links together and you have an index.

Why it matters for pricing: comps are drawn from up to three weeks back and used
as if they were today's money. If the market moves 1% a week, a three-week-old
comp is 3% stale, which is most of the error budget on a $50k car.

    .venv/bin/python scripts/market_index.py [--weeks 40]
"""

from __future__ import annotations

import argparse
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.db import SessionLocal  # noqa: E402

MIN_CELL = 3        # cars needed in a cell, in each week, for it to count
MIN_CELLS = 40      # linked cells needed before a week's move is believable

CELL_SQL = text(
    """
    SELECT make, model, year, spec_canonical, kms_category,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS med,
           COUNT(*) AS n
    FROM listings
    WHERE week_ending = :week AND NOT is_held
      AND price > 0 AND make IS NOT NULL AND model IS NOT NULL
      AND year IS NOT NULL AND spec_canonical IS NOT NULL
      AND kms_category IS NOT NULL
    GROUP BY 1,2,3,4,5
    HAVING COUNT(*) >= :min_cell
    """
)


def cells(db, week) -> dict[tuple, float]:
    return {
        (r.make, r.model, r.year, r.spec_canonical, r.kms_category): float(r.med)
        for r in db.execute(CELL_SQL, {"week": week, "min_cell": MIN_CELL})
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--weeks", type=int, default=40)
    args = ap.parse_args()

    db = SessionLocal()
    weeks = [
        r[0] for r in db.execute(
            text("SELECT week_ending FROM weekly_snapshots ORDER BY week_ending DESC "
                 "LIMIT :n"), {"n": args.weeks}
        )
    ][::-1]

    if len(weeks) < 3:
        print("Need at least three snapshots.")
        return

    print(f"chained like-for-like index, {weeks[0]} .. {weeks[-1]}")
    print(f"(cells of make/model/year/spec/kms band with {MIN_CELL}+ cars in both weeks)\n")
    print(f"{'week':<13}{'gap':>5}{'cells':>7}{'move':>9}{'index':>9}")
    print("-" * 44)

    index = 100.0
    moves: list[float] = []
    previous = cells(db, weeks[0])
    prev_week = weeks[0]
    print(f"{str(weeks[0]):<13}{'':>5}{len(previous):>7}{'':>9}{index:>9.1f}")

    for week in weeks[1:]:
        current = cells(db, week)
        shared = set(previous) & set(current)
        changes = [
            (current[k] - previous[k]) / previous[k] * 100
            for k in shared
            if previous[k] > 0
        ]
        gap = (week - prev_week).days

        if len(changes) >= MIN_CELLS:
            move = statistics.median(changes)
            index *= 1 + move / 100
            moves.append(move / max(gap / 7, 1))   # normalise to a per-week rate
            print(f"{str(week):<13}{gap:>5}{len(changes):>7}{move:>8.2f}%{index:>9.1f}")
        else:
            print(f"{str(week):<13}{gap:>5}{len(changes):>7}{'thin':>9}{index:>9.1f}")

        previous, prev_week = current, week

    if moves:
        weekly = statistics.median(moves)
        print(f"\nmedian like-for-like move: {weekly:+.2f}% per week")
        print(f"a 3-week-old comp is therefore about {abs(weekly) * 3:.1f}% stale "
              f"({'over' if weekly < 0 else 'under'}-stating today's money)")
        print(f"on a $50,000 car that is ${abs(weekly) * 3 / 100 * 50000:,.0f}")
    db.close()


if __name__ == "__main__":
    main()
