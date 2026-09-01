"""Admin: which yards a user is allowed to see.

Users never choose their own dealership — an admin grants it. A principal who
owns three branches gets all three; everyone else gets one. Everything outside a
user's grants is anonymised to "Dealer 1..5" by the benchmarking layer, and the
market views don't carry dealer identity at all, so a wrong grant is the only way
someone could see a yard that isn't theirs. That makes this the most
security-sensitive screen in the product.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Dealer, DealerAccess, Listing, User
from ..security import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


class DealerOut(BaseModel):
    id: int
    name: str
    region: str | None
    cars: int          # stock in the most recent week — how the admin recognises a yard


class GrantOut(BaseModel):
    user_id: int
    dealer_id: int
    dealer_name: str


@router.get("/dealers", response_model=list[DealerOut])
def search_dealers(
    q: str = "",
    limit: int = 25,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[DealerOut]:
    """Find a yard by name. Stock count is included because there are 1,700+
    dealers and several share a trading name — the size is how an admin tells
    'Turners Hamilton' from 'Turners Tauranga' at a glance."""
    latest = select(func.max(Listing.week_ending)).scalar_subquery()

    stmt = (
        select(
            Dealer.id,
            Dealer.name,
            Dealer.region,
            func.count(Listing.id).label("cars"),
        )
        .outerjoin(
            Listing,
            (Listing.dealer_id == Dealer.id) & (Listing.week_ending == latest),
        )
        .group_by(Dealer.id, Dealer.name, Dealer.region)
        .order_by(func.count(Listing.id).desc())
        .limit(min(limit, 100))
    )
    if q.strip():
        stmt = stmt.where(Dealer.name.ilike(f"%{q.strip()}%"))

    return [
        DealerOut(id=r.id, name=r.name, region=r.region, cars=r.cars or 0)
        for r in db.execute(stmt)
    ]


@router.get("/users/{user_id}/dealers", response_model=list[DealerOut])
def list_user_dealers(
    user_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[DealerOut]:
    latest = select(func.max(Listing.week_ending)).scalar_subquery()
    stmt = (
        select(Dealer.id, Dealer.name, Dealer.region, func.count(Listing.id).label("cars"))
        .join(DealerAccess, DealerAccess.dealer_id == Dealer.id)
        .outerjoin(
            Listing,
            (Listing.dealer_id == Dealer.id) & (Listing.week_ending == latest),
        )
        .where(DealerAccess.user_id == user_id)
        .group_by(Dealer.id, Dealer.name, Dealer.region)
        .order_by(Dealer.name)
    )
    return [
        DealerOut(id=r.id, name=r.name, region=r.region, cars=r.cars or 0)
        for r in db.execute(stmt)
    ]


@router.post("/users/{user_id}/dealers/{dealer_id}", response_model=GrantOut, status_code=201)
def grant_dealer(
    user_id: int,
    dealer_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> GrantOut:
    user = db.get(User, user_id)
    dealer = db.get(Dealer, dealer_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such user.")
    if dealer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such dealership.")

    existing = db.scalar(
        select(DealerAccess).where(
            DealerAccess.user_id == user_id, DealerAccess.dealer_id == dealer_id
        )
    )
    if existing is None:
        db.add(DealerAccess(user_id=user_id, dealer_id=dealer_id, granted_by_id=admin.id))

    # First grant becomes the yard they land on; later ones only widen access.
    if user.dealer_id is None:
        user.dealer_id = dealer_id
    db.commit()

    return GrantOut(user_id=user_id, dealer_id=dealer_id, dealer_name=dealer.name)


@router.delete("/users/{user_id}/dealers/{dealer_id}", status_code=204,
               response_class=Response, response_model=None)
def revoke_dealer(
    user_id: int,
    dealer_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    grant = db.scalar(
        select(DealerAccess).where(
            DealerAccess.user_id == user_id, DealerAccess.dealer_id == dealer_id
        )
    )
    if grant is not None:
        db.delete(grant)

    # Don't leave them pointed at a yard they can no longer see.
    user = db.get(User, user_id)
    if user is not None and user.dealer_id == dealer_id:
        remaining = db.scalar(
            select(DealerAccess.dealer_id)
            .where(DealerAccess.user_id == user_id, DealerAccess.dealer_id != dealer_id)
            .limit(1)
        )
        user.dealer_id = remaining
    db.commit()
