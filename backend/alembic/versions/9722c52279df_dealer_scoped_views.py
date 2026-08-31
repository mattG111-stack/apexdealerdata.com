"""dealer scoped views

The assistant writes its own SQL, so the guardrail that a dealer never sees a
rival's stock cannot live in a prompt — the model would eventually be talked out
of it, or simply make a mistake. It has to be structural.

Four views, and the assistant may touch nothing else:

  my_listings / my_sales      filtered to the caller's dealer, set per-request via
                              a Postgres session variable inside the same
                              read-only transaction as the query.
  market_listings / market_sales
                              the whole market with dealer_id, dealer_name_raw and
                              dealer_address REMOVED. Not filtered — *absent*. The
                              model cannot name a rival because the column does not
                              exist to select.

The session variable is read with current_setting('apex.dealer_id', true); the
`true` makes it return NULL rather than erroring when unset, so a request that
forgot to set it returns no rows instead of everyone's.

Revision ID: 9722c52279df
"""

from alembic import op

revision = "9722c52279df"
down_revision = "bde55186375a"
branch_labels = None
depends_on = None


# Columns a dealer must never see about anyone else.
_IDENTIFYING = ("dealer_id", "dealer_name_raw", "dealer_address")

_MARKET_LISTING_COLS = """
    id, snapshot_id, week_ending,
    link, vin, number_plate, name, make, model, year, spec, spec_canonical,
    engine_litres, body_style, seats, engine_cc, fuel_type, transmission, fourwd,
    ext_color, kms, kms_category, imp_history, location, region,
    price, price_type, est_price, number_of_days_listed, listed_category,
    views, watchlisted, overseas, quick_sale, upgrading,
    hard_lid, canopy, tow_bar, eighteen_wheels, twenty_wheels,
    twentyone_wheels, twentytwo_wheels
"""

_MARKET_SALE_COLS = """
    id, last_seen_snapshot_id, sold_week, sold_via, is_provisional, is_relist,
    relisted_week,
    link, vin, number_plate, name, make, model, year, spec, spec_canonical,
    engine_litres, body_style, seats, engine_cc, fuel_type, transmission, fourwd,
    ext_color, kms, kms_category, imp_history, location, region,
    price, price_type, est_price, number_of_days_listed, listed_category,
    views, watchlisted, overseas, quick_sale, upgrading,
    hard_lid, canopy, tow_bar, eighteen_wheels, twenty_wheels,
    twentyone_wheels, twentytwo_wheels
"""


def upgrade() -> None:
    # Held rows are excluded everywhere: they are the ones we think are wrong,
    # and a $1 Ranger left in the pool drags a whole model's benchmark down.
    op.execute(
        f"""
        CREATE VIEW my_listings AS
        SELECT * FROM listings
        WHERE NOT is_held
          AND dealer_id = NULLIF(current_setting('apex.dealer_id', true), '')::int
        """
    )
    op.execute(
        f"""
        CREATE VIEW my_sales AS
        SELECT * FROM sales
        WHERE NOT is_relist
          AND dealer_id = NULLIF(current_setting('apex.dealer_id', true), '')::int
        """
    )
    op.execute(
        f"""
        CREATE VIEW market_listings AS
        SELECT {_MARKET_LISTING_COLS}
        FROM listings
        WHERE NOT is_held
        """
    )
    op.execute(
        f"""
        CREATE VIEW market_sales AS
        SELECT {_MARKET_SALE_COLS}
        FROM sales
        WHERE NOT is_relist
        """
    )


def downgrade() -> None:
    for view in ("market_sales", "market_listings", "my_sales", "my_listings"):
        op.execute(f"DROP VIEW IF EXISTS {view}")
