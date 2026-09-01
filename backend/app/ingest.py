"""Weekly snapshot ingest, and the sold derivation that hangs off it.

One weekly CSV of every live listing lands; this loads it, then works out what
sold by comparing it with the previous week. Nothing about sales is ingested —
a sale is the *absence* of a car that was there last week.

Order matters, and it is not the obvious one:

    1. load this week's listings
    2. derive sales:   last week's cars that this week can't find
    3. confirm sales:  last week's *derived* sales that reappeared are relists

Step 3 is why a sale is provisional when it is first derived. 4.0% of derived
sales come back the following week — a car pulled and relisted, not sold. That
correction cannot be made until the next snapshot exists, so this week's numbers
are honest but not yet final, and the UI has to say so.
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy import insert, select, update
from sqlalchemy.orm import Session

from . import vehicle_keys
from .models import (
    Dealer,
    DealerAlias,
    Listing,
    Sale,
    SnapshotStatus,
    WeeklySnapshot,
)
from .trims import canonicalise, engine_litres

# A 50k-row file is small, but not small enough to want 50k INSERTs.
CHUNK = 2_000

csv.field_size_limit(10_000_000)


# ---------------------------------------------------------------------------
# Parsing the file
# ---------------------------------------------------------------------------

# 'week ending 03-08-26.csv', '03-08-26 data.csv', 'cleaned 18-08-2026.xlsx'
_DATE_IN_NAME = re.compile(r"(\d{1,2})-(\d{1,2})-(\d{2,4})")


def parse_week_ending(filename: str) -> date | None:
    """The week-ending date encoded in the filename, NZ-style day-month-year.

    Every file this project has ever produced is named this way; guessing wrong
    would file a week's listings under the wrong date and corrupt the diff, so an
    unparseable name returns None and the caller must be told rather than
    defaulting to today.
    """
    m = _DATE_IN_NAME.search(filename)
    if not m:
        return None
    day, month, year = (int(g) for g in m.groups())
    if year < 100:
        year += 2000
    try:
        return date(year, month, day)
    except ValueError:
        return None


_TRUE = {"yes", "y", "true", "1"}
_FALSE = {"no", "n", "false", "0"}


def _text(value: object, limit: int | None = None) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    return s[:limit] if limit else s


def _num(value: object) -> float | None:
    s = _text(value)
    if s is None:
        return None
    # '10,813' and '$34,990' both appear
    s = s.replace(",", "").replace("$", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _int(value: object) -> int | None:
    n = _num(value)
    return int(n) if n is not None else None


def _bool(value: object) -> bool | None:
    s = _text(value)
    if s is None:
        return None
    low = s.lower()
    if low in _TRUE:
        return True
    if low in _FALSE:
        return False
    return None


def _engine_cc(value: object) -> int | None:
    """'4000cc' -> 4000."""
    s = _text(value)
    if not s:
        return None
    m = re.search(r"(\d{3,5})", s)
    return int(m.group(1)) if m else None


def to_vehicle_fields(row: dict) -> dict:
    """One CSV row -> the columns shared by listings and sales."""
    spec = _text(row.get("spec"), 128)
    capacity = _text(row.get("engine_capacity"))

    return {
        "link": _text(row.get("link"), 1024),
        "vin": _text(row.get("vin"), 32),
        "number_plate": _text(row.get("number_plate"), 16),
        "name": _text(row.get("name"), 255),
        "make": _text(row.get("make"), 64),
        "model": _text(row.get("model"), 96),
        "year": _int(row.get("year")),
        "spec": spec,
        # Engine is resolved before the trim is cleaned — see app.trims for why.
        "spec_canonical": _text(canonicalise(spec, capacity), 128),
        "engine_litres": engine_litres(spec, capacity),
        "body_style": _text(row.get("body_style"), 32),
        "seats": _int(row.get("seats")),
        "engine_cc": _engine_cc(capacity),
        "fuel_type": _text(row.get("fuel_type"), 24),
        "transmission": _text(row.get("transmission"), 24),
        "fourwd": _text(row.get("fourwd"), 8),
        "ext_color": _text(row.get("ext_color"), 32),
        "kms": _int(row.get("kms")),
        "kms_category": _text(row.get("kms_category"), 32),
        "imp_history": _text(row.get("imp_history"), 16),
        # The header is 'location'/'Location' depending on the file.
        "location": _text(row.get("location") or row.get("Location"), 96),
        "region": _text(row.get("region") or row.get("Region"), 64),
        "price": _num(row.get("price")),
        "price_type": _text(row.get("price_type"), 32),
        "est_price": _num(row.get("est_price")),
        "number_of_days_listed": _int(row.get("number_of_days_listed")),
        "listed_category": _text(row.get("listed_category"), 16),
        "views": _int(row.get("views")),
        "watchlisted": _int(row.get("watchlisted")),
        "overseas": _bool(row.get("overseas")),
        "quick_sale": _bool(row.get("quick_sale")),
        "upgrading": _bool(row.get("upgrading")),
        "hard_lid": _bool(row.get("hard_lid")),
        "canopy": _bool(row.get("canopy")),
        "tow_bar": _bool(row.get("tow_bar")),
        "eighteen_wheels": _bool(row.get("eighteen_wheels")),
        "twenty_wheels": _bool(row.get("twenty_wheels")),
        "twentyone_wheels": _bool(row.get("twentyone_wheels")),
        "twentytwo_wheels": _bool(row.get("twentytwo_wheels")),
        "dealer_name_raw": _text(row.get("dealer_name"), 255),
        "dealer_address": _text(row.get("dealer_address"), 512),
    }


# ---------------------------------------------------------------------------
# Dealers
# ---------------------------------------------------------------------------


class DealerResolver:
    """Raw `dealer_name` strings -> dealer ids, creating what it hasn't seen.

    Auto-creating matters: if an unknown dealership silently mapped to nothing,
    its rows would vanish from its own dashboard. An admin merges branches into
    groups afterwards; a wrong-but-present dealer is fixable, a missing one is
    invisible.
    """

    def __init__(self, db: Session):
        self.db = db
        self._cache: dict[str, int] = {
            alias.raw_name: alias.dealer_id for alias in db.query(DealerAlias).all()
        }
        self.created: int = 0

    def resolve(self, raw_name: str | None, region: str | None, address: str | None) -> int | None:
        if not raw_name:
            return None
        hit = self._cache.get(raw_name)
        if hit is not None:
            return hit

        dealer = Dealer(name=raw_name[:255], region=region, address=address)
        self.db.add(dealer)
        self.db.flush()
        self.db.add(DealerAlias(raw_name=raw_name[:255], dealer_id=dealer.id))
        self.db.flush()

        self._cache[raw_name] = dealer.id
        self.created += 1
        return dealer.id


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------


@dataclass
class IngestResult:
    snapshot_id: int
    week_ending: date
    rows_total: int = 0
    rows_inserted: int = 0
    rows_rejected: int = 0
    dealers_created: int = 0
    sales_derived: int = 0
    relists_flagged: int = 0
    sales_confirmed: int = 0
    warnings: list[str] = field(default_factory=list)


def read_rows(path: str | Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8", errors="replace") as fh:
        return list(csv.DictReader(fh))


def ingest_snapshot(
    db: Session,
    path: str | Path,
    week_ending: date | None = None,
    uploaded_by_id: int | None = None,
) -> IngestResult:
    """Load one weekly file, then derive what sold since the previous week."""
    path = Path(path)
    week = week_ending or parse_week_ending(path.name)
    if week is None:
        raise ValueError(
            f"Can't read a week-ending date from '{path.name}'. "
            "Name it like 'week ending 03-08-26.csv' or pass the date explicitly."
        )

    existing = db.scalar(select(WeeklySnapshot).where(WeeklySnapshot.week_ending == week))
    if existing is not None:
        raise ValueError(f"Week ending {week} is already loaded (snapshot {existing.id}).")

    rows = read_rows(path)
    snapshot = WeeklySnapshot(
        week_ending=week,
        filename=path.name,
        rows_total=len(rows),
        status=SnapshotStatus.STAGED.value,
        uploaded_by_id=uploaded_by_id,
    )
    db.add(snapshot)
    db.flush()

    result = IngestResult(snapshot_id=snapshot.id, week_ending=week, rows_total=len(rows))
    resolver = DealerResolver(db)

    payload: list[dict] = []
    for row in rows:
        fields = to_vehicle_fields(row)
        # A row with no make or model isn't a car we can do anything with.
        if not fields["make"] or not fields["model"]:
            result.rows_rejected += 1
            continue
        fields["snapshot_id"] = snapshot.id
        fields["week_ending"] = week
        fields["dealer_id"] = resolver.resolve(
            fields["dealer_name_raw"], fields["region"], fields["dealer_address"]
        )
        payload.append(fields)

    for i in range(0, len(payload), CHUNK):
        db.execute(insert(Listing), payload[i : i + CHUNK])

    result.rows_inserted = len(payload)
    result.dealers_created = resolver.created
    snapshot.rows_inserted = result.rows_inserted
    snapshot.rows_rejected = result.rows_rejected

    unidentifiable = sum(1 for r in rows if vehicle_keys.is_unidentifiable(r))
    if unidentifiable:
        # Measured at zero on real files. A row with no VIN, plate, link or
        # attributes can never be matched, so it books as sold every week — if
        # this fires, the feed changed and the sales figures are wrong.
        result.warnings.append(
            f"{unidentifiable:,} rows have no usable identity key and will book "
            "as sold every week. Check the feed."
        )

    db.flush()
    _derive_sales(db, snapshot, rows, result)
    _confirm_previous_sales(db, snapshot, rows, result)
    db.commit()
    return result


def _previous_snapshot(db: Session, snapshot: WeeklySnapshot) -> WeeklySnapshot | None:
    return db.scalar(
        select(WeeklySnapshot)
        .where(WeeklySnapshot.week_ending < snapshot.week_ending)
        .order_by(WeeklySnapshot.week_ending.desc())
        .limit(1)
    )


def _listing_rows(db: Session, snapshot_id: int) -> list[dict]:
    """Prior-week listings shaped like CSV rows, so one matcher serves both."""
    cols = (
        Listing.id,
        Listing.vin,
        Listing.number_plate,
        Listing.link,
        Listing.make,
        Listing.model,
        Listing.year,
        Listing.spec,
        Listing.kms,
        Listing.dealer_name_raw,
        Listing.ext_color,
    )
    out = []
    for r in db.execute(select(*cols).where(Listing.snapshot_id == snapshot_id)):
        out.append(
            {
                "id": r.id,
                "vin": r.vin,
                "number_plate": r.number_plate,
                "link": r.link,
                "make": r.make,
                "model": r.model,
                "year": r.year,
                "spec": r.spec,
                "kms": r.kms,
                "dealer_name": r.dealer_name_raw,
                "ext_color": r.ext_color,
            }
        )
    return out


def _derive_sales(
    db: Session, snapshot: WeeklySnapshot, current_rows: list[dict], result: IngestResult
) -> None:
    """Last week's cars that this week can't find are sales."""
    previous = _previous_snapshot(db, snapshot)
    if previous is None:
        # Nothing to diff against; the first snapshot loaded produces no sales.
        return

    index = vehicle_keys.build_index(current_rows)
    prior = _listing_rows(db, previous.id)
    gone_ids = [row["id"] for row in prior if vehicle_keys.match(row, index) is None]
    if not gone_ids:
        return

    # Copy the vehicle's fields as they stood in its *final* snapshot, so `price`
    # is the ask it disappeared at and `number_of_days_listed` is how long that took.
    vehicle_cols = [
        c.name
        for c in Listing.__table__.columns
        if c.name not in {"id", "snapshot_id", "week_ending", "is_held", "hold_reason", "created_at"}
    ]

    for i in range(0, len(gone_ids), CHUNK):
        chunk = gone_ids[i : i + CHUNK]
        listings = db.execute(
            select(Listing).where(Listing.id.in_(chunk))
        ).scalars().all()
        payload = []
        for listing in listings:
            record = {col: getattr(listing, col) for col in vehicle_cols}
            record.update(
                last_seen_snapshot_id=previous.id,
                sold_week=snapshot.week_ending,
                is_provisional=True,
                is_relist=False,
            )
            payload.append(record)
        if payload:
            db.execute(insert(Sale), payload)

    result.sales_derived = len(gone_ids)


def _confirm_previous_sales(
    db: Session, snapshot: WeeklySnapshot, current_rows: list[dict], result: IngestResult
) -> None:
    """Settle last week's provisional sales: a car that came back was a relist.

    This is the step that makes the numbers correct rather than merely fast. On
    real data it moves ~4% of "sales" out of the count.
    """
    previous = _previous_snapshot(db, snapshot)
    if previous is None:
        return

    pending = db.execute(
        select(Sale).where(
            Sale.sold_week == previous.week_ending,
            Sale.is_provisional.is_(True),
        )
    ).scalars().all()
    if not pending:
        return

    index = vehicle_keys.build_index(current_rows)
    relisted = [
        sale.id
        for sale in pending
        if vehicle_keys.match(
            {
                "vin": sale.vin,
                "number_plate": sale.number_plate,
                "link": sale.link,
                "make": sale.make,
                "model": sale.model,
                "year": sale.year,
                "spec": sale.spec,
                "kms": sale.kms,
                "dealer_name": sale.dealer_name_raw,
                "ext_color": sale.ext_color,
            },
            index,
        )
        is not None
    ]

    if relisted:
        for i in range(0, len(relisted), CHUNK):
            db.execute(
                update(Sale)
                .where(Sale.id.in_(relisted[i : i + CHUNK]))
                .values(is_relist=True, relisted_week=snapshot.week_ending)
            )

    db.execute(
        update(Sale)
        .where(Sale.sold_week == previous.week_ending, Sale.is_provisional.is_(True))
        .values(is_provisional=False)
    )
    previous.sales_confirmed_at = datetime.now(timezone.utc)

    result.relists_flagged = len(relisted)
    result.sales_confirmed = len(pending) - len(relisted)
