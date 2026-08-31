"""dealer access and multi dealer scoping

Two changes that belong together:

1. `dealer_access` — an admin-granted list of the dealerships a user may see.
   Users never choose their own. A principal with three branches is granted all
   three; a bug in signup can then never hand someone a rival's book.

2. The scoped views now match a *set* of dealer ids rather than one, read from
   `apex.dealer_ids` as a comma-separated string. An empty or unset value still
   yields no rows — failing closed matters more here than anywhere else.

Revision ID: 56e65bed0eef
"""

import sqlalchemy as sa
from alembic import op

revision = "56e65bed0eef"
down_revision = "9722c52279df"
branch_labels = None
depends_on = None

# Two ways to see a row.
#
# NULLIF(...,'') keeps an unset or blank setting from becoming ARRAY[''] (which
# would fail the ::int[] cast); string_to_array of NULL is NULL, and
# `x = ANY(NULL)` is NULL — not true — so the row is excluded. Fails closed.
#
# The admin bypass is a flag rather than a list of every dealer id: there are
# 800+ dealers and stuffing them into a session variable to express "all" would
# be both slow and easy to truncate silently. It must be set explicitly to the
# string '1' — anything else, including unset, is not an admin.
_SCOPE = (
    "(current_setting('apex.is_admin', true) = '1'"
    " OR dealer_id = ANY(string_to_array("
    "NULLIF(current_setting('apex.dealer_ids', true), ''), ',')::int[]))"
)


def upgrade() -> None:
    op.create_table(
        "dealer_access",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("dealer_id", sa.Integer(), nullable=False),
        sa.Column("granted_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["dealer_id"], ["dealers.id"]),
        sa.ForeignKeyConstraint(["granted_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "dealer_id", name="uq_dealer_access"),
    )
    op.create_index("ix_dealer_access_user_id", "dealer_access", ["user_id"])
    op.create_index("ix_dealer_access_dealer_id", "dealer_access", ["dealer_id"])

    # Seed grants from the single-dealer column so nobody loses access.
    op.execute(
        """
        INSERT INTO dealer_access (user_id, dealer_id)
        SELECT id, dealer_id FROM users WHERE dealer_id IS NOT NULL
        ON CONFLICT DO NOTHING
        """
    )

    op.execute("DROP VIEW IF EXISTS my_listings")
    op.execute("DROP VIEW IF EXISTS my_sales")
    op.execute(f"CREATE VIEW my_listings AS SELECT * FROM listings WHERE NOT is_held AND {_SCOPE}")
    op.execute(f"CREATE VIEW my_sales AS SELECT * FROM sales WHERE NOT is_relist AND {_SCOPE}")


def downgrade() -> None:
    single = (
        "dealer_id = NULLIF(current_setting('apex.dealer_id', true), '')::int"
    )
    op.execute("DROP VIEW IF EXISTS my_listings")
    op.execute("DROP VIEW IF EXISTS my_sales")
    op.execute(f"CREATE VIEW my_listings AS SELECT * FROM listings WHERE NOT is_held AND {single}")
    op.execute(f"CREATE VIEW my_sales AS SELECT * FROM sales WHERE NOT is_relist AND {single}")

    op.drop_index("ix_dealer_access_dealer_id", table_name="dealer_access")
    op.drop_index("ix_dealer_access_user_id", table_name="dealer_access")
    op.drop_table("dealer_access")
