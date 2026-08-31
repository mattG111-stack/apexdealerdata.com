"""refresh scoped views for valuation columns

`my_listings` is defined as SELECT *, and Postgres freezes that column list when
the view is created. It was created before the valuation columns existed, so it
kept serving the old shape and every query touching `margin` failed with
"column does not exist".

Any migration that adds a column to `listings` or `sales` has to recreate these
views, otherwise the new column is invisible to everything that reads through
them — which is all dealer-facing code.

`market_listings` keeps an explicit column list on purpose: it must never carry
dealer identity, and naming the columns means a future column can't leak into it
by accident. The valuation columns are added to it deliberately here.

Revision ID: ff6d92fd0ccf
"""

from alembic import op

revision = "ff6d92fd0ccf"
down_revision = "797c95261056"
branch_labels = None
depends_on = None

_SCOPE = (
    "(current_setting('apex.is_admin', true) = '1'"
    " OR dealer_id = ANY(string_to_array("
    "NULLIF(current_setting('apex.dealer_ids', true), ''), ',')::int[]))"
)

_MARKET_LISTING_COLS = """
    id, snapshot_id, week_ending,
    link, vin, number_plate, name, make, model, year, spec, spec_canonical,
    engine_litres, body_style, seats, engine_cc, fuel_type, transmission, fourwd,
    ext_color, kms, kms_category, imp_history, location, region,
    price, price_type, est_price, number_of_days_listed, listed_category,
    views, watchlisted, overseas, quick_sale, upgrading,
    hard_lid, canopy, tow_bar, eighteen_wheels, twenty_wheels,
    twentyone_wheels, twentytwo_wheels,
    fair_value, value_low, value_high, margin, comps_used, comp_step,
    comp_scope, comp_expanded, confidence, is_underpriced, days_to_sell
"""

_MARKET_SALE_COLS = """
    id, last_seen_snapshot_id, sold_week, sold_via, is_provisional, is_relist,
    relisted_week, source,
    link, vin, number_plate, name, make, model, year, spec, spec_canonical,
    engine_litres, body_style, seats, engine_cc, fuel_type, transmission, fourwd,
    ext_color, kms, kms_category, imp_history, location, region,
    price, price_type, est_price, number_of_days_listed, listed_category,
    views, watchlisted, overseas, quick_sale, upgrading,
    hard_lid, canopy, tow_bar, eighteen_wheels, twenty_wheels,
    twentyone_wheels, twentytwo_wheels
"""


def _rebuild() -> None:
    for view in ("market_sales", "market_listings", "my_sales", "my_listings"):
        op.execute(f"DROP VIEW IF EXISTS {view}")

    op.execute(
        f"CREATE VIEW my_listings AS SELECT * FROM listings "
        f"WHERE NOT is_held AND {_SCOPE}"
    )
    op.execute(
        f"CREATE VIEW my_sales AS SELECT * FROM sales "
        f"WHERE NOT is_relist AND {_SCOPE}"
    )
    op.execute(
        f"CREATE VIEW market_listings AS SELECT {_MARKET_LISTING_COLS} "
        f"FROM listings WHERE NOT is_held"
    )
    op.execute(
        f"CREATE VIEW market_sales AS SELECT {_MARKET_SALE_COLS} "
        f"FROM sales WHERE NOT is_relist"
    )


def upgrade() -> None:
    _rebuild()


def downgrade() -> None:
    # Nothing to undo meaningfully — the views are derived. Rebuild them as-is.
    _rebuild()
