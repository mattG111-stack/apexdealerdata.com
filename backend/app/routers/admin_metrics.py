"""Admin operations dashboard — data pipeline + business metrics.

One endpoint the admin dashboard reads: user/login activity, assistant usage, the
state of the weekly snapshot loads, and Stripe billing. Everything is real except
billing, which lights up once a Stripe key is set (see app.billing).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ..billing import billing_metrics, paying_users
from ..db import get_db
from ..models import Listing, Sale, User, UserStatus, WeeklySnapshot
from ..security import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


class Metrics(BaseModel):
    # people
    users_total: int
    users_active: int          # approved
    users_new_30d: int
    logins_7d: int             # users seen in last 7 days
    logins_30d: int
    total_logins: int
    # sign-ups (self-serve)
    signups_total: int
    signups_7d: int
    signups_30d: int
    # onboarding funnel (self-serve users)
    onboarding_email_verified: int
    onboarding_phone_verified: int
    onboarding_trialing: int
    onboarding_paying: int
    # engagement
    questions_asked_total: int
    # billing (Stripe)
    billing_connected: bool
    paying_customers: int
    mrr: float
    income_this_month: float
    currency: str
    billing_error: str | None = None
    # data pipeline
    weeks_loaded: int          # snapshots retained — the history is the product
    latest_week: str | None
    listings_rows: int         # every listing across every week
    sales_rows: int            # derived sales, relists excluded
    sales_provisional: bool    # newest week not yet confirmed by a following one


def _latest_snapshot(db: Session):
    return (db.query(WeeklySnapshot)
            .order_by(WeeklySnapshot.week_ending.desc()).first())


@router.get("/metrics", response_model=Metrics)
def metrics(me: User = Depends(require_admin), db: Session = Depends(get_db)) -> Metrics:
    now = datetime.now(timezone.utc)
    d30 = now - timedelta(days=30)
    d7 = now - timedelta(days=7)

    users_total = db.query(func.count(User.id)).scalar() or 0
    users_active = db.query(func.count(User.id)).filter(User.status == UserStatus.APPROVED.value).scalar() or 0
    users_new_30d = db.query(func.count(User.id)).filter(User.created_at >= d30).scalar() or 0
    logins_7d = db.query(func.count(User.id)).filter(User.last_login_at.isnot(None), User.last_login_at >= d7).scalar() or 0
    logins_30d = db.query(func.count(User.id)).filter(User.last_login_at.isnot(None), User.last_login_at >= d30).scalar() or 0
    total_logins = db.query(func.coalesce(func.sum(User.login_count), 0)).scalar() or 0

    questions_total = db.query(
        func.coalesce(func.sum(User.assistant_questions_used), 0)
    ).scalar() or 0

    # Self-serve sign-ups (distinct from admin-created accounts).
    self_signups = db.query(User).filter(User.signup_source == "self")
    signups_total = self_signups.count()
    signups_7d = self_signups.filter(User.created_at >= d7).count()
    signups_30d = self_signups.filter(User.created_at >= d30).count()
    ob_email = self_signups.filter(User.email_verified_at.isnot(None)).count()
    ob_phone = self_signups.filter(User.phone_verified_at.isnot(None)).count()
    ob_trialing = db.query(func.count(User.id)).filter(User.subscription_status == "trialing").scalar() or 0
    ob_paying = db.query(func.count(User.id)).filter(User.subscription_status == "active").scalar() or 0

    b = billing_metrics()

    latest = _latest_snapshot(db)
    weeks_loaded = db.query(func.count(WeeklySnapshot.id)).scalar() or 0
    listings_rows = db.query(func.count(Listing.id)).scalar() or 0
    # Relists are not sales — excluding them here keeps this number honest
    # against what a dealer sees on their own page.
    sales_rows = db.query(func.count(Sale.id)).filter(Sale.is_relist.is_(False)).scalar() or 0

    return Metrics(
        users_total=users_total, users_active=users_active, users_new_30d=users_new_30d,
        logins_7d=logins_7d, logins_30d=logins_30d, total_logins=int(total_logins),
        signups_total=signups_total, signups_7d=signups_7d, signups_30d=signups_30d,
        onboarding_email_verified=ob_email, onboarding_phone_verified=ob_phone,
        onboarding_trialing=ob_trialing, onboarding_paying=ob_paying,
        questions_asked_total=int(questions_total),
        billing_connected=b.connected, paying_customers=b.active_subscribers,
        mrr=round(b.mrr, 2), income_this_month=round(b.income_this_month, 2),
        currency=b.currency, billing_error=b.error,
        weeks_loaded=int(weeks_loaded),
        latest_week=latest.week_ending.isoformat() if latest else None,
        listings_rows=int(listings_rows),
        sales_rows=int(sales_rows),
        sales_provisional=bool(latest and latest.sales_confirmed_at is None),
    )


class PayingUserRow(BaseModel):
    email: str | None
    name: str | None
    amount_monthly: float
    currency: str
    status: str
    since: str | None
    customer_id: str
    app_user_id: int | None = None      # matched to one of our users, if found


class PayingUsers(BaseModel):
    connected: bool
    customers: list[PayingUserRow]


@router.get("/paying-users", response_model=PayingUsers)
def paying_users_list(me: User = Depends(require_admin), db: Session = Depends(get_db)) -> PayingUsers:
    """All active Stripe subscribers, matched to our user records by Stripe
    customer id or email. Empty (connected=False) until Stripe is configured."""
    b = billing_metrics()
    rows = []
    for c in paying_users():
        u = None
        if c.customer_id:
            u = db.query(User).filter(User.stripe_customer_id == c.customer_id).first()
        if u is None and c.email:
            u = db.query(User).filter(User.email == c.email.lower()).first()
        rows.append(PayingUserRow(
            email=c.email, name=c.name, amount_monthly=c.amount_monthly, currency=c.currency,
            status=c.status, since=c.since, customer_id=c.customer_id,
            app_user_id=u.id if u else None,
        ))
    return PayingUsers(connected=b.connected, customers=rows)
