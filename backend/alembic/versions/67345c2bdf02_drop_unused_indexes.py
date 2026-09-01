"""drop unused indexes

`index=True` went onto nearly every column in the models without asking whether
anything would ever filter on it. Measured on the real database: 25 indexes had
never been scanned once, holding 624 MB.

Disk is the smaller half of the cost. Every index has to be maintained on every
insert, so a 50,000-row weekly ingest was updating two dozen indexes nothing
reads.

WHAT IS DELIBERATELY KEPT, despite also showing zero scans:
  margin, is_underpriced, confidence — the stock and deals screens that query
  these were written hours ago and have barely run. Unused is not the same as
  useless when the feature is new.

WHAT GOES, and why each one is genuinely dead:
  *_snap_plate, *_number_plate, *_vin — week-to-week identity matching happens
      in Python over in-memory sets (app.vehicle_keys), never as a SQL lookup.
  *_engine_litres, *_body_style, *_fuel_type, *_region, *_listed_category,
  *_year, *_number_of_days_listed — nothing filters on these alone; they are
      returned, not searched.
  *_make, *_model — the comp pool matches with ILIKE, which a plain btree
      can't serve anyway.
  *_dealer_id — already covered by the (dealer_id, week_ending) composite,
      which is the query path that actually runs.
  ix_sales_comp — a (sold_week, make, model, year) composite built for a comp
      query that ended up being done in Python instead.

Revision ID: 67345c2bdf02
"""

from alembic import op

revision = "67345c2bdf02"
down_revision = "ff6d92fd0ccf"
branch_labels = None
depends_on = None

_LISTINGS = [
    "ix_listings_snap_plate",
    "ix_listings_engine_litres",
    "ix_listings_number_plate",
    "ix_listings_dealer_id",
    "ix_listings_model",
    "ix_listings_make",
    "ix_listings_region",
    "ix_listings_listed_category",
    "ix_listings_body_style",
    "ix_listings_fuel_type",
    "ix_listings_snap_vin",
    "ix_listings_vin",
    "ix_listings_year",
    "ix_listings_kms",
    "ix_listings_number_of_days_listed",
]

_SALES = [
    "ix_sales_comp",
    "ix_sales_engine_litres",
    "ix_sales_number_plate",
    "ix_sales_vin",
    "ix_sales_last_seen_snapshot_id",
    "ix_sales_dealer_id",
    "ix_sales_number_of_days_listed",
    "ix_sales_year",
    "ix_sales_region",
    "ix_sales_listed_category",
    "ix_sales_fuel_type",
    "ix_sales_body_style",
    "ix_sales_kms",
    "ix_sales_make",
    "ix_sales_model",
]


def upgrade() -> None:
    for name in _LISTINGS + _SALES:
        op.execute(f"DROP INDEX IF EXISTS {name}")


def downgrade() -> None:
    # Rebuilding these would take minutes and reinstate 600 MB nothing reads.
    # If a query later needs one, add it deliberately with the query in hand.
    pass
