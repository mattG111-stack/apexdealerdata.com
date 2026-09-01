"""Admin review and publish for the weekly snapshot.

A week lands staged. An admin looks at what was held and why, fixes or releases
individual rows, then publishes the week to dealers.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status as http_status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import release as release_service
from ..db import get_db
from ..models import Listing, User
from ..security import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


class StagedOut(BaseModel):
    has_staged: bool
    snapshot_id: int | None
    week_ending: str | None
    rows: int
    rejected: int
    held_total: int
    hold_reasons: dict[str, int]
    dealers: int
    sales_derived: int
    relists_flagged: int
    sales_provisional: bool
    uploaded_at: str | None


@router.get("/release/staged", response_model=StagedOut)
def get_staged(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> StagedOut:
    return StagedOut(**release_service.staged_summary(db).__dict__)


class HeldRow(BaseModel):
    id: int
    week_ending: str
    make: str | None
    model: str | None
    year: int | None
    spec_canonical: str | None
    kms: int | None
    price: float | None
    dealer_name_raw: str | None
    link: str | None
    is_held: bool
    hold_reason: str | None


def _row(listing: Listing) -> HeldRow:
    return HeldRow(
        id=listing.id,
        week_ending=listing.week_ending.isoformat(),
        make=listing.make,
        model=listing.model,
        year=listing.year,
        spec_canonical=listing.spec_canonical,
        kms=listing.kms,
        price=listing.price,
        dealer_name_raw=listing.dealer_name_raw,
        link=listing.link,
        is_held=listing.is_held,
        hold_reason=listing.hold_reason,
    )


@router.get("/release/held", response_model=list[HeldRow])
def list_held(
    snapshot_id: int | None = None,
    limit: int = 200,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[HeldRow]:
    stmt = select(Listing).where(Listing.is_held.is_(True))
    if snapshot_id is not None:
        stmt = stmt.where(Listing.snapshot_id == snapshot_id)
    stmt = stmt.order_by(Listing.id.desc()).limit(min(limit, 1000))
    return [_row(l) for l in db.execute(stmt).scalars()]


@router.post("/release/rescan/{snapshot_id}")
def rescan(
    snapshot_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Re-apply the hold rules — after fixing source data, or changing a bound."""
    reasons = release_service.hold_flagged_rows(db, snapshot_id)
    return {"held_total": sum(reasons.values()), "hold_reasons": reasons}


@router.post("/release/publish")
def publish(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    return release_service.publish_release(db)


class ListingPatch(BaseModel):
    price: float | None = None
    kms: int | None = None
    year: int | None = None
    spec_canonical: str | None = None


@router.patch("/listings/{listing_id}", response_model=HeldRow)
def edit_listing(
    listing_id: int,
    body: ListingPatch,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> HeldRow:
    listing = db.get(Listing, listing_id)
    if listing is None:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "No such listing.")

    for field_name, value in body.model_dump(exclude_unset=True).items():
        setattr(listing, field_name, value)
    db.commit()
    db.refresh(listing)
    return _row(listing)


@router.post("/listings/{listing_id}/publish", response_model=HeldRow)
def publish_listing(
    listing_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> HeldRow:
    if not release_service.publish_held_row(db, listing_id):
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "No such held listing.")
    listing = db.get(Listing, listing_id)
    return _row(listing)


@router.post("/listings/{listing_id}/hold", response_model=HeldRow)
def hold_listing(
    listing_id: int,
    reason: str = "Held by admin",
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> HeldRow:
    listing = db.get(Listing, listing_id)
    if listing is None:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "No such listing.")
    listing.is_held = True
    listing.hold_reason = reason
    db.commit()
    db.refresh(listing)
    return _row(listing)
