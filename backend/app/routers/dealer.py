"""The dealer product: market insights, their own stock, and pricing a car.

Everything here is scoped by the admin's grants (app.scoping) and served from
dealer-scoped views, so a dealer physically cannot reach a rival's rows.

The three endpoints map to the three things a dealer actually does: work out
what the market is doing to the models they trade, look at what they're holding
and whether it's priced right, and price a car in front of them.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..pricing import price_vehicle
from ..scoping import effective_dealer_ids, scope_params
from ..security import current_user

router = APIRouter(prefix="/api/dealer", tags=["dealer"])


def _scoped(db: Session, user: User, sql: str, **params) -> list[dict]:
    """Run a query with the caller's dealer scope set for the transaction."""
    dealer_ids, admin_flag = scope_params(db, user)
    db.execute(
        text("SELECT set_config('apex.dealer_ids', :d, true), "
             "       set_config('apex.is_admin', :a, true)"),
        {"d": dealer_ids, "a": admin_flag},
    )
    result = db.execute(text(sql), params)
    cols = list(result.keys())
    return [dict(zip(cols, r)) for r in result]


# --- 1. market insights ----------------------------------------------------


class ModelTrend(BaseModel):
    make: str
    model: str
    my_sales: int          # how many of these THEY sold — why it's on their screen
    then_ask: float | None
    now_ask: float | None
    move_pct: float | None
    move_dollars: float | None
    now_listed: int


@router.get("/insights", response_model=list[ModelTrend])
def insights(
    weeks: int = 12,
    me: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[ModelTrend]:
    """What the models THIS dealer trades are doing.

    Ranked by their own sales volume, because a market-wide index is abstract —
    a dealer who moves Hiluxes doesn't care what the average car did.

    Measured on FRESH listings only (on the market a week or less). 90% of live
    cars never change price week to week, so an index over the whole book
    measures listing stickiness rather than the market.
    """
    if not effective_dealer_ids(db, me) and me.role != "admin":
        raise HTTPException(status.HTTP_409_CONFLICT, "No dealership assigned yet.")

    weeks = max(4, min(weeks, 52))
    return [
        ModelTrend(**row)
        for row in _scoped(db, me, """
        WITH mine AS (
            SELECT make, model, COUNT(*) AS my_sales
            FROM my_sales GROUP BY 1,2 HAVING COUNT(*) >= 3
        ),
        bounds AS (
            SELECT MAX(week_ending) AS now_w,
                   MIN(week_ending) AS then_w
            FROM (SELECT DISTINCT week_ending FROM market_listings
                  ORDER BY week_ending DESC LIMIT :weeks) w
        ),
        fresh AS (
            SELECT l.make, l.model, l.week_ending,
                   PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.price) AS med,
                   COUNT(*) AS n
            FROM market_listings l, bounds b
            WHERE l.number_of_days_listed <= 7 AND l.price > 0
              AND l.week_ending IN (b.now_w, b.then_w)
            GROUP BY 1,2,3 HAVING COUNT(*) >= 10
        )
        SELECT m.make, m.model, m.my_sales,
               ROUND(f0.med) AS then_ask,
               ROUND(f1.med) AS now_ask,
               ROUND(((f1.med / NULLIF(f0.med,0) - 1) * 100)::numeric, 1) AS move_pct,
               ROUND(f1.med - f0.med) AS move_dollars,
               f1.n AS now_listed
        FROM mine m
        JOIN bounds b ON TRUE
        LEFT JOIN fresh f0 ON f0.make=m.make AND f0.model=m.model AND f0.week_ending=b.then_w
        LEFT JOIN fresh f1 ON f1.make=m.make AND f1.model=m.model AND f1.week_ending=b.now_w
        WHERE f0.med IS NOT NULL AND f1.med IS NOT NULL
        ORDER BY m.my_sales DESC
        LIMIT 15
        """, weeks=weeks)
    ]


# --- 2. their own stock ----------------------------------------------------


class StockRow(BaseModel):
    id: int
    make: str | None
    model: str | None
    year: int | None
    spec: str | None
    kms: int | None
    price: float | None
    fair_value: float | None
    margin_pct: float | None       # + = they're asking under what it's worth
    comps_used: int | None
    confidence: str | None
    days_listed: int | None
    age_band: str | None
    link: str | None


@router.get("/stock", response_model=list[StockRow])
def stock(
    limit: int = 200,
    me: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[StockRow]:
    """Their current stock, priced, furthest from market first.

    Ordered by confidence first, then by how far the price sits from the market.
    Sorting on the gap alone surfaces the thinnest-evidence rows — the one-off
    imports and oddities with three comps — which is precisely the wrong thing to
    put at the top of a screen a dealer is meant to act on.

    `comps_used` and `confidence` stay on every row. A car 12% over market off
    four comps is a hint; off thirty it's a finding.
    """
    return [
        StockRow(**row)
        for row in _scoped(db, me, """
        SELECT id, make, model, year, spec_canonical AS spec, kms, price,
               ROUND(fair_value) AS fair_value,
               ROUND((margin * -100)::numeric, 1) AS margin_pct,
               comps_used, confidence,
               number_of_days_listed AS days_listed,
               listed_category AS age_band,
               link
        FROM my_listings
        WHERE week_ending = (SELECT MAX(week_ending) FROM my_listings)
        -- Evidence first, size of gap second. Sorting on the gap alone puts the
        -- three-comp oddities at the top — a 1993 Supra "141% over market" is an
        -- artifact, and a dealer who sees that first stops trusting the screen.
        ORDER BY
            CASE confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
            ABS(COALESCE(margin, 0)) DESC NULLS LAST
        LIMIT :limit
        """, limit=max(1, min(limit, 500)))
    ]


class StockSummary(BaseModel):
    cars: int
    total_asking: float
    over_90_days: int
    over_90_value: float
    priced_over_market: int
    priced_under_market: int
    median_days_listed: float | None


@router.get("/stock/summary", response_model=StockSummary)
def stock_summary(
    me: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> StockSummary:
    rows = _scoped(db, me, """
        SELECT COUNT(*) AS cars,
               COALESCE(SUM(price), 0) AS total_asking,
               COUNT(*) FILTER (WHERE number_of_days_listed > 90) AS over_90_days,
               COALESCE(SUM(price) FILTER (WHERE number_of_days_listed > 90), 0)
                   AS over_90_value,
               COUNT(*) FILTER (WHERE margin < -0.05) AS priced_over_market,
               COUNT(*) FILTER (WHERE margin > 0.05) AS priced_under_market,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY number_of_days_listed)
                   AS median_days_listed
        FROM my_listings
        WHERE week_ending = (SELECT MAX(week_ending) FROM my_listings)
    """)
    return StockSummary(**rows[0])


# --- 3. price a car --------------------------------------------------------


class PriceIn(BaseModel):
    make: str = Field(min_length=1)
    model: str = Field(min_length=1)
    year: int | None = None
    kms: int | None = None
    variant: str | None = None
    engine_cc: int | None = None
    fuel_type: str | None = None
    imp_history: str | None = None
    fourwd: str | None = None
    region: str | None = None
    canopy: bool | None = None
    hard_lid: bool | None = None
    tow_bar: bool | None = None


@router.post("/price")
def price(
    body: PriceIn,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Price one car.

    The response always carries how the answer was reached — comp count, which
    rung of the ladder, whether the net had to widen. A price without that
    context is exactly what this product exists not to produce.
    """
    return price_vehicle(db, body.model_dump(exclude_none=True))


# --- 4. the briefing -------------------------------------------------------


class Briefing(BaseModel):
    text: str
    plays: list[dict]


@router.get("/briefing", response_model=Briefing)
def briefing(
    me: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Briefing:
    """The Jarvis opening: greet the dealer and lead with the plays, unprompted.

    Pure arithmetic over the sold window and the live week — no LLM involved, so
    it works before any API key is configured and costs nothing per view.
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from ..models import Dealer
    from ..pricing.opportunities import briefing_text, compute

    ops = compute(db, limit=10)

    dealer_name = None
    ids = effective_dealer_ids(db, me)
    if len(ids) == 1:
        dealer = db.get(Dealer, ids[0])
        dealer_name = dealer.name if dealer else None

    hour = datetime.now(ZoneInfo("Pacific/Auckland")).hour
    return Briefing(
        text=briefing_text(me.full_name, dealer_name, ops, hour),
        plays=[o.__dict__ for o in ops],
    )
