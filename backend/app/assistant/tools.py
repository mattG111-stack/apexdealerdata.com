"""Tools the dealer assistant can call.

`query_data` can answer almost anything, so the curated tools here earn their
place only by encoding judgement the model would otherwise have to rediscover
every time — which comparisons are fair, which are misleading, and what sample
size is too thin to speak from.

`variants_for` is the most important of them. Without it the model happily
averages a $55k Wildtrak 2.0 with a $70k 3.0 and reports a number describing no
car that exists.
"""

from __future__ import annotations

import json

from . import sql as sqltool
from .sql import Scope

# A benchmark below this is shown WITH its n, never silently. Hiding thin
# segments was the original design; it hid exactly the premium and niche models
# a dealer most wants a read on. Showing n and labelling it is more useful and
# more honest.
THIN_SAMPLE = 15


def _q(sql: str, scope: "Scope | None") -> str:
    return sqltool.run(sql, scope)


# --- disambiguation ---------------------------------------------------------


def variants_for(make: str, model: str, scope: "Scope | None") -> str:
    """The engine/trim variants of a model, with price spread and sample size.

    Call this BEFORE answering any model-level question. If the variants differ
    materially in price, ask the user which one rather than averaging them —
    an average across a Wildtrak 2.0 and 3.0 describes no car on any yard.
    """
    return _q(
        f"""
        SELECT spec_canonical, engine_litres,
               COUNT(*) AS live_now,
               ROUND(MIN(price)) AS min_price,
               ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)) AS median_price,
               ROUND(MAX(price)) AS max_price,
               MIN(year) AS oldest_year, MAX(year) AS newest_year
        FROM market_listings
        WHERE make ILIKE '%{make}%' AND model ILIKE '%{model}%'
          AND price IS NOT NULL
          AND week_ending = (SELECT MAX(week_ending) FROM market_listings)
        GROUP BY spec_canonical, engine_litres
        HAVING COUNT(*) >= 3
        ORDER BY live_now DESC
        LIMIT 25
        """,
        scope,
    )


# --- the dealer's own position ----------------------------------------------


def my_stock_health(scope: "Scope | None") -> str:
    """This dealer's current stock by age band, with money tied up in each."""
    return _q(
        """
        SELECT listed_category AS age_band,
               COUNT(*) AS cars,
               ROUND(SUM(price)) AS asking_total,
               ROUND(AVG(price)) AS avg_price,
               ROUND(AVG(number_of_days_listed)) AS avg_days_listed
        FROM my_listings
        WHERE week_ending = (SELECT MAX(week_ending) FROM my_listings)
        GROUP BY listed_category
        ORDER BY age_band
        """,
        scope,
    )


def my_sales_vs_market(weeks: int, scope: "Scope | None") -> str:
    """This dealer's sales and speed over recent weeks, beside the market's.

    Reported per week so a trend is visible; a single blended figure hides the
    only thing a dealer actually wants to know, which is the direction.
    """
    weeks = max(1, min(int(weeks or 4), 26))
    return _q(
        f"""
        WITH recent AS (
            SELECT DISTINCT sold_week FROM market_sales
            ORDER BY sold_week DESC LIMIT {weeks}
        )
        SELECT m.sold_week,
               COUNT(*) FILTER (WHERE mine.id IS NOT NULL) AS my_sales,
               ROUND(AVG(mine.number_of_days_listed)) AS my_avg_days,
               COUNT(*) AS market_sales,
               ROUND(AVG(m.number_of_days_listed)) AS market_avg_days
        FROM market_sales m
        JOIN recent r ON r.sold_week = m.sold_week
        LEFT JOIN my_sales mine ON mine.id = m.id
        GROUP BY m.sold_week
        ORDER BY m.sold_week DESC
        """,
        scope,
    )


# Fitted extras the feed reports. Wheel sizes are excluded deliberately: they
# never vary within a spec, so they carry no information the trim doesn't.
_EXTRAS = ("canopy", "hard_lid", "tow_bar")
_EXTRAS_COUNT = " + ".join(f"(CASE WHEN {f} THEN 1 ELSE 0 END)" for f in _EXTRAS)


def my_price_position(scope: "Scope | None", limit: int = 25) -> str:
    """Where each of this dealer's cars sits against the same car in the market.

    Matched on make/model/year/spec_canonical/kms band, so the comparison is the
    pricing decision and not the vehicle. `comps` is on every row — a position
    computed from two comps is a hint, not a finding.

    Also returns fitted extras on the car beside the share of comps carrying
    them. Extras showed no reliable price premium market-wide, so this is not a
    valuation adjustment; it is there to explain a gap. A car sitting 12% over
    with a canopy and tow bar the comps lack is a different conversation from one
    that is simply overpriced.
    """
    limit = max(1, min(int(limit or 25), 100))
    return _q(
        f"""
        WITH cell AS (
            SELECT make, model, year, spec_canonical, kms_category,
                   PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS market_median,
                   COUNT(*) AS comps,
                   ROUND(AVG({_EXTRAS_COUNT})::numeric, 1) AS comp_avg_extras
            FROM market_listings
            WHERE week_ending = (SELECT MAX(week_ending) FROM market_listings)
              AND price IS NOT NULL
            GROUP BY make, model, year, spec_canonical, kms_category
        )
        SELECT mine.make, mine.model, mine.year, mine.spec_canonical,
               mine.kms, mine.price AS my_ask,
               ROUND(c.market_median) AS market_median,
               ROUND(((mine.price / NULLIF(c.market_median, 0) - 1) * 100)::numeric, 1)
                   AS pct_vs_market,
               c.comps,
               mine.number_of_days_listed AS days_listed,
               NULLIF(CONCAT_WS(', ',
                   CASE WHEN mine.canopy   THEN 'canopy'   END,
                   CASE WHEN mine.hard_lid THEN 'hard lid' END,
                   CASE WHEN mine.tow_bar  THEN 'tow bar'  END), '') AS my_extras,
               ({" + ".join(f"(CASE WHEN mine.{f} THEN 1 ELSE 0 END)" for f in _EXTRAS)})
                   AS my_extras_count,
               c.comp_avg_extras
        FROM my_listings mine
        JOIN cell c
          ON c.make = mine.make AND c.model = mine.model AND c.year = mine.year
         AND c.spec_canonical = mine.spec_canonical
         AND c.kms_category = mine.kms_category
        WHERE mine.week_ending = (SELECT MAX(week_ending) FROM my_listings)
          AND mine.price IS NOT NULL
        ORDER BY ABS(mine.price / NULLIF(c.market_median, 0) - 1) DESC
        LIMIT {limit}
        """,
        scope,
    )


# --- the market -------------------------------------------------------------


def fastest_movers(scope: "Scope | None", weeks: int = 4, min_sales: int = 10) -> str:
    """What is turning quickest in the market, and whether this dealer holds it.

    `i_hold` is the buying signal: a fast-moving model with i_hold = 0 is a gap.
    """
    weeks = max(1, min(int(weeks or 4), 26))
    min_sales = max(3, min(int(min_sales or 10), 100))
    return _q(
        f"""
        WITH recent AS (
            SELECT DISTINCT sold_week FROM market_sales
            ORDER BY sold_week DESC LIMIT {weeks}
        ),
        sold AS (
            SELECT s.make, s.model, s.spec_canonical,
                   COUNT(*) AS sales,
                   ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP
                         (ORDER BY s.number_of_days_listed)) AS median_days,
                   ROUND(AVG(s.price)) AS avg_ask
            FROM market_sales s
            JOIN recent r ON r.sold_week = s.sold_week
            WHERE s.number_of_days_listed IS NOT NULL
            GROUP BY s.make, s.model, s.spec_canonical
            HAVING COUNT(*) >= {min_sales}
        )
        SELECT sold.*,
               (SELECT COUNT(*) FROM my_listings m
                WHERE m.make = sold.make AND m.model = sold.model
                  AND m.spec_canonical IS NOT DISTINCT FROM sold.spec_canonical
                  AND m.week_ending = (SELECT MAX(week_ending) FROM my_listings)
               ) AS i_hold
        FROM sold
        ORDER BY median_days ASC
        LIMIT 30
        """,
        scope,
    )


def days_to_sell_by_price(make: str, model: str, spec_canonical: str | None,
                          scope: "Scope | None") -> str:
    """How long this car takes to sell at each position against market median.

    The answer a dealer actually wants when deciding a price. Note the known
    limit: this counts only cars that SOLD, so the over-market rows understate
    how long overpriced stock really sits — say so when quoting them.
    """
    spec_filter = (
        f"AND s.spec_canonical = '{spec_canonical}'" if spec_canonical else ""
    )
    return _q(
        f"""
        WITH cell AS (
            SELECT make, model, year, spec_canonical, kms_category,
                   PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS med
            FROM market_listings
            WHERE price IS NOT NULL
            GROUP BY make, model, year, spec_canonical, kms_category
            HAVING COUNT(*) >= 5
        )
        SELECT CASE
                 WHEN s.price / c.med < 0.95 THEN 'more than 5% under'
                 WHEN s.price / c.med < 0.98 THEN '2-5% under'
                 WHEN s.price / c.med <= 1.02 THEN 'at market'
                 WHEN s.price / c.med <= 1.05 THEN '2-5% over'
                 ELSE 'more than 5% over'
               END AS position,
               COUNT(*) AS sold,
               ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP
                     (ORDER BY s.number_of_days_listed)) AS median_days
        FROM market_sales s
        JOIN cell c
          ON c.make = s.make AND c.model = s.model AND c.year = s.year
         AND c.spec_canonical = s.spec_canonical AND c.kms_category = s.kms_category
        WHERE s.make ILIKE '%{make}%' AND s.model ILIKE '%{model}%'
          {spec_filter}
          AND s.number_of_days_listed IS NOT NULL AND s.price IS NOT NULL
        GROUP BY position
        ORDER BY position
        """,
        scope,
    )


def price_a_car(args: dict, scope: "Scope | None") -> str:
    """The real pricing engine — the same one the yard page and back-test use.

    Ollie must never estimate a price itself; this is the only legitimate
    source. Returns the range AND the evidence (comp count, ladder rung,
    whether the net was widened) so the answer can carry its own caveats.
    """
    import json as _json

    from ..db import SessionLocal
    from ..pricing import price_vehicle

    db = SessionLocal()
    try:
        return _json.dumps(price_vehicle(db, {k: v for k, v in args.items() if v is not None}))
    finally:
        db.close()


def market_opportunities(scope: "Scope | None") -> str:
    """The plays: BUY (tight supply, fast mover), EXIT (saturated, slow), and
    price-spread margin calls. Jarvis's rules — weeks of supply is the pivot."""
    import json as _json

    from ..db import SessionLocal
    from .opportunities_bridge import compute_as_dicts

    db = SessionLocal()
    try:
        return _json.dumps({"opportunities": compute_as_dicts(db)})
    finally:
        db.close()


# --- raw access -------------------------------------------------------------


def query_data(sql: str, scope: "Scope | None") -> str:
    return sqltool.run(sql, scope)


def distinct_values(table: str, column: str, scope: "Scope | None", limit: int = 40) -> str:
    return sqltool.distinct_values(table, column, scope, limit)


# --- specs ------------------------------------------------------------------


def _t(name, description, properties=None, required=None):
    return {
        "name": name,
        "description": description,
        "input_schema": {
            "type": "object",
            "properties": properties or {},
            "required": required or [],
        },
    }


TOOL_SPECS = [
    _t(
        "variants_for",
        "The engine/trim variants of a model with price spread and sample size. "
        "Call this FIRST for any model-level question — if variants differ "
        "materially in price, ask which engine instead of averaging them.",
        {"make": {"type": "string"}, "model": {"type": "string"}},
        ["make", "model"],
    ),
    _t(
        "my_stock_health",
        "This dealer's current stock by age band, with money tied up in each. "
        "Use for 'what am I holding', 'what's old', 'what's at risk'.",
    ),
    _t(
        "my_sales_vs_market",
        "This dealer's weekly sales and speed beside the market's, per week so a "
        "trend is visible.",
        {"weeks": {"type": "integer", "description": "How many recent weeks (default 4)."}},
    ),
    _t(
        "my_price_position",
        "Where each of this dealer's cars sits against the same car in the market, "
        "worst mispricing first. Every row reports the comp count behind it.",
        {"limit": {"type": "integer"}},
    ),
    _t(
        "fastest_movers",
        "What is turning quickest market-wide, with whether this dealer holds it. "
        "A fast mover with i_hold = 0 is a buying gap.",
        {
            "weeks": {"type": "integer"},
            "min_sales": {"type": "integer", "description": "Minimum sales to include (default 10)."},
        },
    ),
    _t(
        "days_to_sell_by_price",
        "How long a given car takes to sell at each price position vs market. "
        "The core pricing answer.",
        {
            "make": {"type": "string"},
            "model": {"type": "string"},
            "spec_canonical": {
                "type": "string",
                "description": "Trim plus engine, e.g. 'WILDTRAK 2.0'. Strongly preferred.",
            },
        },
        ["make", "model"],
    ),
    _t(
        "price_a_car",
        "Price a specific car with the real pricing engine — the ONLY legitimate "
        "source for a price. Give make and model at minimum; year, kms, variant, "
        "engine_cc, fuel_type, region sharpen it. Quote the range and the comp "
        "count, and say if the net was widened.",
        {
            "make": {"type": "string"}, "model": {"type": "string"},
            "variant": {"type": "string"}, "year": {"type": "integer"},
            "kms": {"type": "integer"}, "engine_cc": {"type": "integer"},
            "fuel_type": {"type": "string"}, "region": {"type": "string"},
        },
        ["make", "model"],
    ),
    _t(
        "market_opportunities",
        "The current plays market-wide: BUY (under 4 weeks' supply, selling "
        "under 25 days), EXIT (over 15 weeks' supply, over 50 days), and price-"
        "spread margin opportunities. Use for 'what's the play', 'where's the "
        "money', 'what should I buy'.",
    ),
    _t(
        "query_data",
        "Run read-only SQL against my_listings, my_sales, market_listings, "
        "market_sales. Use for anything the other tools don't cover.",
        {"sql": {"type": "string"}},
        ["sql"],
    ),
    _t(
        "distinct_values",
        "The real distinct values of a column, with counts. Use before guessing "
        "how a make, model or region is spelled.",
        {
            "table": {"type": "string"},
            "column": {"type": "string"},
            "limit": {"type": "integer"},
        },
        ["table", "column"],
    ),
]

_HANDLERS = {
    "variants_for": lambda a, s: variants_for(a["make"], a["model"], s),
    "my_stock_health": lambda a, s: my_stock_health(s),
    "my_sales_vs_market": lambda a, s: my_sales_vs_market(a.get("weeks", 4), s),
    "my_price_position": lambda a, s: my_price_position(s, a.get("limit", 25)),
    "fastest_movers": lambda a, s: fastest_movers(s, a.get("weeks", 4), a.get("min_sales", 10)),
    "days_to_sell_by_price": lambda a, s: days_to_sell_by_price(
        a["make"], a["model"], a.get("spec_canonical"), d
    ),
    "price_a_car": lambda a, s: price_a_car(a, s),
    "market_opportunities": lambda a, s: market_opportunities(s),
    "query_data": lambda a, s: query_data(a["sql"], s),
    "distinct_values": lambda a, s: distinct_values(
        a["table"], a["column"], d, a.get("limit", 40)
    ),
}


def dispatch(name: str, args: dict, scope: "Scope | None" = None) -> str:
    handler = _HANDLERS.get(name)
    if handler is None:
        return json.dumps({"error": f"Unknown tool '{name}'."})
    try:
        return handler(args, scope)
    except KeyError as exc:
        return json.dumps({"error": f"Missing argument {exc}."})
    except Exception as exc:  # noqa: BLE001 — returned so the model can retry
        return json.dumps({"error": f"{type(exc).__name__}: {str(exc)[:300]}"})
