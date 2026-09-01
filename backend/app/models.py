"""Apex schema.

Three things here differ from an obvious design, each for a reason:

1. **Every weekly snapshot is kept, and listings are snapshot-scoped.** Apex
   cares about the *trajectory* — what a car was first asked at,
   every markdown, and the ask it finally cleared at. That history only exists if
   the weekly rows are all still there. ~50k rows x 110 weeks.

2. **Sales are derived, not ingested.** A car on last week's sheet and absent this
   week is sold (`sold_via` records which key proved it). Because a car can vanish
   for a week and come back, a sale is `provisional` until the following snapshot
   confirms it, and flipped to `is_relist` if the car reappears. Measured at 4.0%
   on real data, so this correction is not optional.

3. **`dealer_id` is on both listings and sales.** It is the column the row-level
   security policies key on, and it is the only thing standing between one dealer
   and a rival's stock list.
"""

from datetime import date, datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"


class UserStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    DEACTIVATED = "deactivated"


class SnapshotStatus(str, Enum):
    """Two-stage publish: load, review, then go live."""
    STAGED = "staged"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class MatchKey(str, Enum):
    """How a listing was recognised week-to-week. Ordered tightest first — this
    ordering is load-bearing, see ingest. VIN alone covers 88.9% of rows but
    misses ~11 points of still-live cars that plate and link catch."""
    VIN = "vin"
    PLATE = "plate"
    LINK = "link"
    ATTRS = "attrs"


# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    company: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(16), default=UserRole.USER.value, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default=UserStatus.PENDING.value, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    login_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(64), index=True)

    # The dealership currently in view. It is a *convenience*, not a permission:
    # it must always be one the admin has granted (see DealerAccess), and the
    # scoping layer verifies that rather than trusting this column.
    dealer_id: Mapped[int | None] = mapped_column(ForeignKey("dealers.id"), index=True)

    # --- self-serve onboarding (verify email → verify phone → card → trial) ---
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    subscription_status: Mapped[str | None] = mapped_column(String(24), index=True)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signup_source: Mapped[str | None] = mapped_column(String(16))

    # --- assistant usage --------------------------------------------------
    # Apex runs on a platform LLM key, not bring-your-own: a dealer principal has
    # no reason to hold a Claude key. Usage is metered per user instead so one
    # account can't run up the platform bill.
    assistant_questions_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    assistant_period_start: Mapped[date | None] = mapped_column(Date)


class VerificationCode(Base):
    """Short-lived onboarding code. Newest unconsumed, unexpired row per channel
    is the valid one; single-use, with an attempt cap."""
    __tablename__ = "verification_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)   # "email" | "phone"
    code: Mapped[str] = mapped_column(String(12), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------------
# Dealers
# ---------------------------------------------------------------------------


class Dealer(Base):
    """A dealership as Apex knows it.

    The feed's `dealer_name` is free text and branch-level — 818 distinct values in
    one week, including things like 'AUCKLAND CITY TOYOTA - MT WELLINGTON SUPER
    STORE'. A principal who owns three branches must see all three as one business,
    so the feed string is an *alias* pointing here rather than the identity itself.
    """
    __tablename__ = "dealers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    # Branches roll up to a group when one is set; otherwise the dealer is its own group.
    group_id: Mapped[int | None] = mapped_column(ForeignKey("dealers.id"), index=True)
    region: Mapped[str | None] = mapped_column(String(64))
    address: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DealerAccess(Base):
    """Which dealerships a user may see data for. Granted by an admin only.

    Users do not choose their own dealership. A principal who owns three branches
    is granted all three; everyone else gets exactly one. Making this an explicit
    admin-managed grant rather than a field on the user means access is auditable
    (who granted it, when) and revocable, and that a bug in signup can never hand
    someone another dealer's book.
    """
    __tablename__ = "dealer_access"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    dealer_id: Mapped[int] = mapped_column(ForeignKey("dealers.id"), index=True, nullable=False)
    granted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "dealer_id", name="uq_dealer_access"),
    )


class DealerAlias(Base):
    """Maps a raw `dealer_name` string from the feed to a dealer.

    Created automatically on ingest for any unseen string, so a new dealership
    never silently drops its rows. An admin merges aliases afterwards; that merge
    is what makes multi-branch groups work.
    """
    __tablename__ = "dealer_aliases"

    id: Mapped[int] = mapped_column(primary_key=True)
    raw_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    dealer_id: Mapped[int] = mapped_column(ForeignKey("dealers.id"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------------
# Weekly data
# ---------------------------------------------------------------------------


class WeeklySnapshot(Base):
    """One weekly listings file. These are never
    archived away — the whole point is the history."""
    __tablename__ = "weekly_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    week_ending: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    rows_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows_inserted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows_rejected: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), default=SnapshotStatus.STAGED.value, nullable=False, index=True
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set once the *next* snapshot has been ingested, which is when this week's
    # derived sales stop being provisional.
    sales_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    note: Mapped[str | None] = mapped_column(Text)


class _VehicleMixin:
    """The 39 fields the weekly feed carries, shared by listings and sales."""

    # identity
    link: Mapped[str | None] = mapped_column(String(1024))
    vin: Mapped[str | None] = mapped_column(String(32))
    number_plate: Mapped[str | None] = mapped_column(String(16))

    # what it is
    name: Mapped[str | None] = mapped_column(String(255))
    make: Mapped[str | None] = mapped_column(String(64))
    model: Mapped[str | None] = mapped_column(String(96))
    year: Mapped[int | None] = mapped_column(Integer)
    spec: Mapped[str | None] = mapped_column(String(128))
    # Trim plus normalised engine — 'WILDTRAK 2.0'. The engine is resolved before
    # the trim is cleaned (see app.trims): a bare 'Wildtrak' is 1996cc or 2993cc
    # or 3198cc, and those are $55k, $70k and $35k cars. Engine size proxies for
    # generation, so it is frequently the largest price discriminator in a model,
    # not a detail on top of the trim.
    spec_canonical: Mapped[str | None] = mapped_column(String(128), index=True)
    # Normalised displacement in litres (1996cc and 2000cc are both 2.0). Stored
    # so the comp cascade can widen on engine without re-parsing strings.
    engine_litres: Mapped[float | None] = mapped_column(Float)
    body_style: Mapped[str | None] = mapped_column(String(32))
    seats: Mapped[int | None] = mapped_column(Integer)
    engine_cc: Mapped[int | None] = mapped_column(Integer)
    fuel_type: Mapped[str | None] = mapped_column(String(24))
    transmission: Mapped[str | None] = mapped_column(String(24))
    fourwd: Mapped[str | None] = mapped_column(String(8))
    ext_color: Mapped[str | None] = mapped_column(String(32))
    kms: Mapped[int | None] = mapped_column(Integer)
    kms_category: Mapped[str | None] = mapped_column(String(32))
    imp_history: Mapped[str | None] = mapped_column(String(16))   # 'NZ New' | 'Imported'

    # where
    location: Mapped[str | None] = mapped_column(String(96))
    region: Mapped[str | None] = mapped_column(String(64))

    # price. `price_type` is 'Asking price' on 100% of rows in every file seen,
    # so nothing here is ever a transacted figure — say "sells at", not "sold for".
    price: Mapped[float | None] = mapped_column(Float, index=True)
    price_type: Mapped[str | None] = mapped_column(String(32))
    est_price: Mapped[float | None] = mapped_column(Float)

    # time on market as the feed reports it
    number_of_days_listed: Mapped[int | None] = mapped_column(Integer)
    listed_category: Mapped[str | None] = mapped_column(String(16))  # 0-45|45-90|90-120|>120

    # demand signal
    views: Mapped[int | None] = mapped_column(Integer)
    watchlisted: Mapped[int | None] = mapped_column(Integer)

    # seller-declared flags
    overseas: Mapped[bool | None] = mapped_column(Boolean)
    quick_sale: Mapped[bool | None] = mapped_column(Boolean)
    upgrading: Mapped[bool | None] = mapped_column(Boolean)

    # fitment
    hard_lid: Mapped[bool | None] = mapped_column(Boolean)
    canopy: Mapped[bool | None] = mapped_column(Boolean)
    tow_bar: Mapped[bool | None] = mapped_column(Boolean)
    eighteen_wheels: Mapped[bool | None] = mapped_column(Boolean)
    twenty_wheels: Mapped[bool | None] = mapped_column(Boolean)
    twentyone_wheels: Mapped[bool | None] = mapped_column(Boolean)
    twentytwo_wheels: Mapped[bool | None] = mapped_column(Boolean)

    # seller, as the feed spelled it (resolved to dealer_id on the concrete tables)
    dealer_name_raw: Mapped[str | None] = mapped_column(String(255))
    dealer_address: Mapped[str | None] = mapped_column(String(512))


class Listing(_VehicleMixin, Base):
    """One car, as it appeared in one weekly snapshot.

    A car alive for 12 weeks has 12 rows. That repetition is the price history:
    joining a car's rows across snapshots gives its markdown trajectory, which is
    what the pricing engine learns the price-to-days relationship from.
    """
    __tablename__ = "listings"

    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("weekly_snapshots.id"), index=True, nullable=False
    )
    # Not indexed alone — the (dealer_id, week_ending) composite below is the
    # path every dealer query actually takes.
    dealer_id: Mapped[int | None] = mapped_column(ForeignKey("dealers.id"))
    # Denormalised from the snapshot so RLS and the common "last 13 weeks" filter
    # never need a join.
    week_ending: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Held back during pre-publish review; excluded from every live view even
    # though its snapshot is published.
    is_held: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    hold_reason: Mapped[str | None] = mapped_column(String(300))

    # --- valuation, computed at ingest and stored -------------------------
    # Every live car is priced when the week loads, not on demand. That is what
    # makes "show me the deals" a query rather than 50,000 pricing runs, and it
    # is how the property build worked: the API serves stored values, so changing the pricing
    # engine means re-pricing the week for it to take effect.
    fair_value: Mapped[float | None] = mapped_column(Float)
    value_low: Mapped[float | None] = mapped_column(Float)
    value_high: Mapped[float | None] = mapped_column(Float)
    # (fair_value - price) / price. Positive = listed below what it's worth.
    margin: Mapped[float | None] = mapped_column(Float, index=True)
    # How many comps backed it, and which rung of the ladder found them. A deal
    # off 4 comps at "within 2 years" is a different animal from one off 30 in
    # the same year, and the dealer has to be able to see which.
    comps_used: Mapped[int | None] = mapped_column(Integer)
    comp_step: Mapped[str | None] = mapped_column(String(64))
    comp_scope: Mapped[str | None] = mapped_column(String(24))
    # True when the comp net had to be widened beyond the tightest rung.
    comp_expanded: Mapped[bool | None] = mapped_column(Boolean)
    # 'high' | 'medium' | 'low' — from comp count and whether it widened.
    confidence: Mapped[str | None] = mapped_column(String(8), index=True)
    # The deal flag. Guarded, not just "margin > 0" — see app.pricing.deals.
    is_underpriced: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    # Median days-to-sell for this car's comp group: how quickly the money comes
    # back. A cheap car nobody buys is not a deal.
    days_to_sell: Mapped[float | None] = mapped_column(Float)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # The dealer dashboard's primary access path.
        Index("ix_listings_dealer_week", "dealer_id", "week_ending"),
        # Comp lookup for pricing: currently-for-sale cars of the same shape.
        Index("ix_listings_comp", "week_ending", "make", "model", "year"),
        # No index for week-to-week identity matching: it happens in Python over
        # in-memory sets (app.vehicle_keys), never as a SQL lookup. Both indexes
        # were measured at zero scans and 128 MB.
    )


class Sale(_VehicleMixin, Base):
    """A car that was listed and then wasn't — derived, never ingested.

    Carries the vehicle's fields as they stood in its **final** snapshot, so
    `price` is the ask it disappeared at and `number_of_days_listed` is how long
    that took.
    """
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Not indexed alone — the (dealer_id, sold_week) composite below is the path
    # every dealer query takes.
    dealer_id: Mapped[int | None] = mapped_column(ForeignKey("dealers.id"))

    # The snapshot it was last seen in, and the one it was missing from.
    last_seen_snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("weekly_snapshots.id"), nullable=False
    )
    sold_week: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Which key proved the car was gone — i.e. the tightest key that failed to
    # match. Kept so a suspicious sale can be traced back to how it was decided.
    sold_via: Mapped[str | None] = mapped_column(String(8))

    # Where this sale came from:
    #   'imported' — a sold file that carries a real sale date. Authoritative.
    #   'derived'  — inferred from a car disappearing between two snapshots.
    # Both are kept. Imported wins on any week that has it, because a stated sale
    # date beats an inference from a 7-day gap; derived fills the weeks that were
    # never exported. Mixing them without this column would double-count.
    source: Mapped[str] = mapped_column(
        String(12), default="derived", nullable=False, index=True
    )

    # A sale derived from the newest snapshot can still turn out to be a relist;
    # nothing confirms it until the following week lands. 4.0% of them reappear.
    is_provisional: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False, index=True
    )
    # The car came back. Flagged, not deleted, and excluded from every sales
    # count (scope §4).
    is_relist: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    relisted_week: Mapped[date | None] = mapped_column(Date)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # "What did I sell last week" — the single most common question.
        Index("ix_sales_dealer_week", "dealer_id", "sold_week"),
        # No (sold_week, make, model, year) composite: the comp pool is filtered
        # in Python, so it was never scanned.
    )


class CanonicalTrim(Base):
    """Maps a raw `spec` string to one canonical trim for a make/model.

    77.8% of listings carry a spec and there are 1,047 distinct raw values in a
    single week. Left alone, 'Wildtrak' and 'Wildtrak 2.0 D' are two different
    cars and every Ranger benchmark is computed on half the population.
    """
    __tablename__ = "canonical_trims"

    id: Mapped[int] = mapped_column(primary_key=True)
    make: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(96), nullable=False)
    raw_spec: Mapped[str] = mapped_column(String(128), nullable=False)
    canonical_spec: Mapped[str] = mapped_column(String(128), nullable=False)
    # Set when a human confirmed the mapping; unreviewed rows are auto-derived
    # and safe to re-derive.
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("make", "model", "raw_spec", name="uq_trim_make_model_raw"),
        Index("ix_trim_lookup", "make", "model", "raw_spec"),
    )


class AppSetting(Base):
    """A platform-level secret, set by an admin and shared by the whole app.

    Each user having their own LLM key suits an investor tool, not a dealer.
    A dealer principal has no reason to hold a Claude key, so Apex runs on one
    platform key that an admin sets here — same for CarJam.

    Values are encrypted at rest (see app.secrets_store) and have no read path
    through the API: callers can learn that a key is set and its last four
    characters, never the key.
    """
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    value_encrypted: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


class IngestJob(Base):
    """Tracks one async ingest. Created the moment a file lands; the background
    task updates status as it goes."""
    __tablename__ = "ingest_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    week_ending: Mapped[date | None] = mapped_column(Date)
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    file_path: Mapped[str | None] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False, index=True)
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    stage: Mapped[str | None] = mapped_column(String(64))
    rows_total: Mapped[int | None] = mapped_column(Integer)
    rows_inserted: Mapped[int | None] = mapped_column(Integer)
    rows_rejected: Mapped[int | None] = mapped_column(Integer)
    sales_derived: Mapped[int | None] = mapped_column(Integer)
    relists_flagged: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    # JSON list of anomalies found by the post-ingest audit. Warnings don't fail
    # the ingest; they flag rows for review on the admin page.
    audit_warnings: Mapped[str | None] = mapped_column(Text)
    snapshot_id: Mapped[int | None] = mapped_column(ForeignKey("weekly_snapshots.id"))
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
