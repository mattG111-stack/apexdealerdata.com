"""Two-stage weekly publish: stage → review → publish, with per-row holds.

A weekly file lands STAGED — loaded, diffed, but not visible to dealers. This
module scores the staged rows, holds back the ones that look wrong, summarises
the week for review, and publishes on an admin's confirmation.

Holding individual rows rather than rejecting the file matters: one dealer
fat-fingering a price into a $1 Ranger shouldn't block 50,000 good rows, and it
shouldn't quietly drag the market benchmark for that model down either. Held rows
stay in the snapshot but are excluded from every live view until fixed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .models import Listing, SnapshotStatus, WeeklySnapshot

# Bounds a real used-car listing sits inside. Anything outside is a data error,
# not a bargain — and a $1 listing left in the pool drags its model's benchmark
# down for every dealer looking at it.
MIN_PRICE = 500
MAX_PRICE = 2_000_000
MAX_KMS = 1_500_000
MIN_YEAR = 1900


def _hold_reason(listing: Listing, this_year: int) -> str | None:
    """Why this row should be held back, or None if it's clean."""
    if listing.price is None:
        return "No price"
    if listing.price < MIN_PRICE:
        return f"Price below ${MIN_PRICE:,}"
    if listing.price > MAX_PRICE:
        return f"Price above ${MAX_PRICE:,}"
    if listing.kms is not None and listing.kms > MAX_KMS:
        return "Implausible odometer"
    if listing.year is not None and not (MIN_YEAR <= listing.year <= this_year + 2):
        return "Year out of range"
    return None


def hold_flagged_rows(db: Session, snapshot_id: int) -> dict[str, int]:
    """Flag every suspect row in a staged snapshot. Returns reason -> count."""
    this_year = date.today().year
    reasons: dict[str, int] = {}

    listings = db.execute(
        select(Listing).where(Listing.snapshot_id == snapshot_id)
    ).scalars()

    for listing in listings:
        reason = _hold_reason(listing, this_year)
        if reason:
            listing.is_held = True
            listing.hold_reason = reason
            reasons[reason] = reasons.get(reason, 0) + 1
        else:
            listing.is_held = False
            listing.hold_reason = None

    db.commit()
    return reasons


@dataclass
class StagedSummary:
    has_staged: bool = False
    snapshot_id: int | None = None
    week_ending: str | None = None
    rows: int = 0
    rejected: int = 0
    held_total: int = 0
    hold_reasons: dict[str, int] = field(default_factory=dict)
    dealers: int = 0
    sales_derived: int = 0
    relists_flagged: int = 0
    # Sales for the newest week can't be confirmed until the following snapshot
    # lands — roughly 4% of them turn out to be relists. Surfaced so an admin
    # publishes knowing the number will be revised, not to hide it.
    sales_provisional: bool = True
    uploaded_at: str | None = None


def _staged_snapshot(db: Session) -> WeeklySnapshot | None:
    return db.scalar(
        select(WeeklySnapshot)
        .where(WeeklySnapshot.status == SnapshotStatus.STAGED.value)
        .order_by(WeeklySnapshot.week_ending.desc())
        .limit(1)
    )


def staged_summary(db: Session) -> StagedSummary:
    from .models import Sale  # local import: avoids a cycle at module load

    snapshot = _staged_snapshot(db)
    if snapshot is None:
        return StagedSummary()

    base = select(func.count(Listing.id)).where(Listing.snapshot_id == snapshot.id)
    held_rows = db.execute(
        select(Listing.hold_reason, func.count(Listing.id))
        .where(Listing.snapshot_id == snapshot.id, Listing.is_held.is_(True))
        .group_by(Listing.hold_reason)
    ).all()

    return StagedSummary(
        has_staged=True,
        snapshot_id=snapshot.id,
        week_ending=snapshot.week_ending.isoformat(),
        rows=db.scalar(base) or 0,
        rejected=snapshot.rows_rejected,
        held_total=sum(n for _, n in held_rows),
        hold_reasons={reason or "other": n for reason, n in held_rows},
        dealers=db.scalar(
            select(func.count(func.distinct(Listing.dealer_id))).where(
                Listing.snapshot_id == snapshot.id
            )
        ) or 0,
        sales_derived=db.scalar(
            select(func.count(Sale.id)).where(Sale.sold_week == snapshot.week_ending)
        ) or 0,
        relists_flagged=db.scalar(
            select(func.count(Sale.id)).where(
                Sale.sold_week == snapshot.week_ending, Sale.is_relist.is_(True)
            )
        ) or 0,
        sales_provisional=snapshot.sales_confirmed_at is None,
        uploaded_at=snapshot.created_at.isoformat() if snapshot.created_at else None,
    )


def publish_release(db: Session) -> dict:
    """Make the staged week visible to dealers.

    Unlike Ollie, publishing does not archive the previous week — the history is
    the product. Older weeks stay published and queryable; the UI decides how far
    back to show.
    """
    snapshot = _staged_snapshot(db)
    if snapshot is None:
        return {"published": False, "reason": "Nothing staged."}

    snapshot.status = SnapshotStatus.PUBLISHED.value
    snapshot.published_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "published": True,
        "snapshot_id": snapshot.id,
        "week_ending": snapshot.week_ending.isoformat(),
    }


def publish_held_row(db: Session, listing_id: int) -> bool:
    """Release one held row after an admin has looked at it."""
    result = db.execute(
        update(Listing)
        .where(Listing.id == listing_id, Listing.is_held.is_(True))
        .values(is_held=False, hold_reason=None)
    )
    db.commit()
    return result.rowcount > 0
