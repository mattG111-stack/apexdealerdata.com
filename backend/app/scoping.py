"""Which dealerships a request may see.

Access is granted by an admin (DealerAccess) and never chosen by the user. This
module is the single place that turns a user into a set of dealer ids, so there
is one thing to audit rather than a filter repeated across every endpoint.

`User.dealer_id` is only a "currently viewing" convenience. It is verified
against the grants here every time — a stale or tampered value can widen nothing.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import DealerAccess, User, UserRole


def granted_dealer_ids(db: Session, user: User) -> list[int]:
    """Every dealership this user has been granted, ascending."""
    rows = db.execute(
        select(DealerAccess.dealer_id)
        .where(DealerAccess.user_id == user.id)
        .order_by(DealerAccess.dealer_id)
    ).scalars()
    return list(rows)


def is_admin(user: User) -> bool:
    return user.role == UserRole.ADMIN.value


def effective_dealer_ids(db: Session, user: User) -> list[int]:
    """The dealerships this request should actually be scoped to.

    If the user has selected one and it is granted, that one. Otherwise all of
    their grants — a principal with three branches sees the whole business by
    default rather than an arbitrary branch.

    Admins see everything, expressed as a flag rather than a list (see
    `scope_params`). An admin who selects a specific dealership still gets scoped
    to it, so "look at this dealer's view" works without dropping the bypass.
    """
    granted = granted_dealer_ids(db, user)
    if user.dealer_id is not None and (is_admin(user) or user.dealer_id in granted):
        return [user.dealer_id]
    return granted


def scope_params(db: Session, user: User) -> tuple[str, str]:
    """The two session-variable values the scoped views read.

    Returns (dealer_ids, is_admin). The admin bypass is deliberately a separate
    flag: there are 800+ dealers, and expressing "all" as a list would be slow
    and could be silently truncated. It is only ever the literal '1'.

    An admin viewing one dealership gets the narrow scope instead of the bypass,
    so they see exactly what that dealer sees.
    """
    if is_admin(user) and user.dealer_id is None:
        return "", "1"
    return scope_value(effective_dealer_ids(db, user)), "0"


def scope_value(dealer_ids: list[int]) -> str:
    """The session-variable form the dealer-scoped views read.

    Empty string when there are no grants, which makes the views return nothing.
    Failing closed matters more here than anywhere else in the codebase.
    """
    return ",".join(str(i) for i in dealer_ids)


def can_view_dealer(db: Session, user: User, dealer_id: int) -> bool:
    if user.role == UserRole.ADMIN.value:
        # Admins may administer a dealer record without being granted its data;
        # data access still goes through effective_dealer_ids.
        return True
    return dealer_id in granted_dealer_ids(db, user)
