"""Load the archive of weekly snapshots, oldest first.

Three things make this more than a for-loop:

1. **Not every file is a snapshot.** The folder also holds a 98-column real-estate
   export, a 111-column TradeMe dump, and 3-column spec fragments. A file is only
   loaded if it carries the columns the diff depends on.

2. **Duplicates.** 23 weeks have several copies ('06-01-24 data (1..6).csv').
   One per week wins — the cleaned variant if there is one, else the largest.

3. **Gaps matter more than they look.** Sold derivation compares consecutive
   snapshots, so it assumes they are a week apart. Across a three-month gap the
   diff still finds cars that genuinely went, but it silently misses every car
   that was listed *and* sold inside the gap, and the count can't be read as a
   weekly rate. Gaps are reported, and anything beyond MAX_GAP_DAYS is called out
   rather than quietly folded into the numbers.
"""

from __future__ import annotations

import csv
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal  # noqa: E402
from app.ingest import ingest_snapshot, parse_week_ending  # noqa: E402
from app.models import WeeklySnapshot  # noqa: E402

csv.field_size_limit(10_000_000)

SOURCE_DIR = Path(os.environ.get("APEX_SNAPSHOT_DIR", Path.home() / "Downloads"))

# Files whose names say they are something else entirely.
_NOT_A_SNAPSHOT = re.compile(
    r"logs\.|apex_staged|motorhome|realestate|hougarden|trademe|car_data|private"
    r"|checked_sales|sales report|algo|v4 tool|empty_price|final-|consolidated",
    re.IGNORECASE,
)

# Without these the row can't be identified, priced, or attributed.
REQUIRED_COLUMNS = {"link", "make", "model", "price", "dealer_name"}

# Beyond this, consecutive snapshots aren't a week apart and the derived sales
# can't be read as a weekly rate.
MAX_GAP_DAYS = 14


def header_of(path: Path) -> set[str]:
    try:
        with open(path, newline="", encoding="utf-8", errors="replace") as fh:
            return {h.strip().lower().lstrip("﻿") for h in next(csv.reader(fh))}
    except Exception:
        return set()


def pick_files() -> list[tuple]:
    """One usable file per week, oldest first."""
    best: dict = {}
    skipped_schema = 0

    for path in sorted(SOURCE_DIR.glob("*.csv")):
        if _NOT_A_SNAPSHOT.search(path.name):
            continue
        week = parse_week_ending(path.name)
        if week is None:
            continue

        columns = header_of(path)
        if not REQUIRED_COLUMNS.issubset(columns):
            skipped_schema += 1
            continue

        # Prefer a cleaned/spec-enriched variant, then the larger file.
        cleaned = bool(re.search(r"clean|spec", path.name, re.IGNORECASE))
        score = (cleaned, path.stat().st_size)
        if week not in best or score > best[week][0]:
            best[week] = (score, path, columns)

    if skipped_schema:
        print(f"  skipped {skipped_schema} file(s): missing required columns")

    return [(week, path, cols) for week, (_, path, cols) in sorted(best.items())]


def main() -> None:
    files = pick_files()
    print(f"{len(files)} weeks to consider, {files[0][0]} .. {files[-1][0]}\n")

    db = SessionLocal()
    already = {
        s.week_ending for s in db.query(WeeklySnapshot.week_ending).all()
    } if db.query(WeeklySnapshot).count() else set()
    already = {w[0] if isinstance(w, tuple) else w for w in already}

    loaded = failed = 0
    previous_week = None
    started = time.time()

    for week, path, columns in files:
        if week in already:
            previous_week = week
            continue

        gap = (week - previous_week).days if previous_week else None
        note = ""
        if gap and gap > MAX_GAP_DAYS:
            note = f"  << {gap}d GAP — sales here are not a weekly rate"

        missing = []
        if "vin" not in columns:
            missing.append("vin")
        if "engine_capacity" not in columns:
            missing.append("engine")

        try:
            t0 = time.time()
            result = ingest_snapshot(db, path, week)
            loaded += 1
            print(
                f"{week}  rows={result.rows_inserted:>6,}  sales={result.sales_derived:>5,}  "
                f"relists={result.relists_flagged:>4}  "
                f"{'no ' + '/'.join(missing):<12}  {time.time() - t0:4.1f}s{note}"
            )
        except Exception as exc:  # noqa: BLE001 — one bad week must not stop the run
            failed += 1
            db.rollback()
            print(f"{week}  FAILED  {path.name}: {type(exc).__name__}: {str(exc)[:120]}")

        previous_week = week

    db.close()
    print(
        f"\nloaded {loaded}, failed {failed}, skipped {len(already)} already present"
        f"  ({(time.time() - started) / 60:.1f} min)"
    )


if __name__ == "__main__":
    main()
