"""Let the model write its own read-only SQL, safely and scoped to one dealer.

A handful of hand-written tools can only answer the questions we thought of.
"Which 7-seat diesel under $40k is turning fastest in Canterbury that I don't
stock" is a perfectly reasonable question no curated tool covers. Giving the
model the schema and letting it query is the only way to answer arbitrary ones.

So the safety has to be real, not a keyword blocklist. Five layers:

1. READ ONLY TRANSACTION — Postgres itself rejects any write. This is the
   load-bearing control; string matching alone would be a sieve.
2. Dealer scoping in the DATABASE, not the prompt. `my_listings` / `my_sales`
   filter on a session variable set per request inside this same transaction;
   `market_listings` / `market_sales` have the dealer columns removed entirely.
   The model cannot name a rival because the column does not exist to select.
   A prompt instruction would eventually be argued around or simply forgotten.
3. View allowlist — a read-only transaction still permits `SELECT * FROM users`,
   which holds password hashes, and `SELECT * FROM listings`, which holds every
   dealer's stock. Only the four scoped views are reachable.
4. statement_timeout — a runaway cross join can't wedge the connection pool.
5. Row cap — a LIMIT is appended when absent, so nothing returns 200k rows.

Anything rejected comes back to the model as an error string, so it can correct
its own query rather than the request failing.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from sqlalchemy import text

from ..db import engine


@dataclass(frozen=True)
class Scope:
    """Who is asking, in the form the database understands.

    Built once per request by app.scoping and threaded through unchanged — the
    model never sees it and cannot influence it.
    """
    dealer_ids: str   # comma-separated; '' means none
    is_admin: str     # the literal '1' for the admin bypass, else '0'

STATEMENT_TIMEOUT_MS = 15_000
MAX_ROWS = 200

# Only these are reachable. The base tables are NOT — `listings` and `sales`
# carry dealer_id, so exposing them would undo the scoping entirely.
ALLOWED_TABLES = {
    "my_listings",
    "my_sales",
    "market_listings",
    "market_sales",
}

_TABLE_REF = re.compile(
    r"\b(?:from|join)\s+(?:only\s+)?([a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)?)",
    re.IGNORECASE,
)
_LIMIT = re.compile(r"\blimit\s+\d+", re.IGNORECASE)


def _strip_sql_comments(sql: str) -> str:
    """Comments can hide a second statement or a blocked identifier."""
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    sql = re.sub(r"--[^\n]*", " ", sql)
    return sql


# `a IS NOT DISTINCT FROM b` contains the word FROM, and the table scanner below
# would read `b` as a table and reject a perfectly good query. Neutralise the
# operator before scanning. This only ever loosens a false rejection — the
# operand is still an ordinary expression, not a table reference.
_DISTINCT_FROM = re.compile(r"\bis\s+(?:not\s+)?distinct\s+from\b", re.IGNORECASE)


class UnsafeQuery(ValueError):
    """The query was rejected before it reached the database."""


def validate(sql: str) -> str:
    """Reject anything that isn't a single, read-only, allowlisted SELECT."""
    cleaned = _strip_sql_comments(sql).strip().rstrip(";").strip()
    if not cleaned:
        raise UnsafeQuery("Empty query.")

    # Scanned separately from what we execute: the query that runs is the
    # original, this copy only exists to find table references.
    scannable = _DISTINCT_FROM.sub(" <> ", cleaned)

    if ";" in cleaned:
        raise UnsafeQuery("Only one statement per query. Remove the semicolon.")

    lowered = cleaned.lower()
    if not (lowered.startswith("select") or lowered.startswith("with")):
        raise UnsafeQuery("Only SELECT (or WITH ... SELECT) queries are allowed.")

    # CTE names are legitimate FROM targets; collect them so they aren't
    # mistaken for real tables.
    cte_names = {
        m.group(1).lower()
        for m in re.finditer(r"\b([a-zA-Z_][\w$]*)\s+as\s*\(", scannable, re.IGNORECASE)
    }

    for match in _TABLE_REF.finditer(scannable):
        ref = match.group(1).lower()
        bare = ref.split(".")[-1]
        if bare in cte_names or ref in cte_names:
            continue
        if bare not in ALLOWED_TABLES:
            raise UnsafeQuery(
                f"'{ref}' is not queryable. Available: " + ", ".join(sorted(ALLOWED_TABLES))
            )

    if not _LIMIT.search(cleaned):
        cleaned = f"{cleaned} LIMIT {MAX_ROWS}"
    return cleaned


def run(sql: str, scope: "Scope | None") -> str:
    """Validate, then execute read-only and scoped to this caller.

    The scope is set as Postgres session variables inside the same transaction as
    the query — that is what makes `my_listings` mean *this* dealer. Passing None
    leaves them unset, and the views return nothing rather than everything.
    """
    try:
        safe = validate(sql)
    except UnsafeQuery as exc:
        return f"Query rejected: {exc}"

    dealer_ids, admin_flag = (scope.dealer_ids, scope.is_admin) if scope else ("", "0")

    try:
        with engine.connect() as conn:
            # All of these must share one transaction with the query.
            conn.execute(text("SET TRANSACTION READ ONLY"))
            conn.execute(text(f"SET LOCAL statement_timeout = {STATEMENT_TIMEOUT_MS}"))
            conn.execute(
                text(
                    "SELECT set_config('apex.dealer_ids', :d, true), "
                    "       set_config('apex.is_admin', :a, true)"
                ),
                {"d": dealer_ids, "a": admin_flag},
            )
            result = conn.execute(text(safe))
            cols = list(result.keys())
            rows = [dict(zip(cols, r)) for r in result.fetchmany(MAX_ROWS)]
    except Exception as exc:  # noqa: BLE001 — returned to the model to self-correct
        return f"Query failed: {type(exc).__name__}: {str(exc)[:400]}"

    return json.dumps(
        {
            "sql": safe,
            "row_count": len(rows),
            "truncated": len(rows) >= MAX_ROWS,
            "rows": rows,
        },
        default=str,
    )


def distinct_values(table: str, column: str, scope: "Scope | None", limit: int = 40) -> str:
    """The actual distinct values of a column, with counts.

    The biggest single cause of a wrong answer is the model guessing a value that
    isn't spelled the way the data stores it — 'CX5' vs 'CX-5', 'Wildtrak' vs
    'WILDTRAK 2.0'. This lets it check first.
    """
    if table not in ALLOWED_TABLES:
        return f"'{table}' is not queryable."
    if not re.fullmatch(r"[a-zA-Z_][\w]*", column or ""):
        return "Invalid column name."

    sql = (
        f"SELECT {column} AS value, COUNT(*) AS n FROM {table} "
        f"WHERE {column} IS NOT NULL GROUP BY {column} "
        f"ORDER BY n DESC LIMIT {min(int(limit), 100)}"
    )
    return run(sql, scope)


SCHEMA = """You can query these four Postgres views directly with read-only SQL.
There are no other tables.

  my_listings      this dealer's live stock, one row per car per week
  my_sales         this dealer's sales
  market_listings  the whole market's live stock (no dealer identity)
  market_sales     the whole market's sales (no dealer identity)

The 'my_' views are already filtered to the dealer asking — never add a dealer
filter yourself. The 'market_' views have no dealer columns at all, so you cannot
identify or name another dealership; don't try, and don't tell the user you can.

SHARED VEHICLE COLUMNS (on all four)
  make, model, year, spec, spec_canonical, engine_litres, engine_cc
  body_style, seats, fuel_type, transmission, fourwd, ext_color
  kms, kms_category, imp_history ('NZ New' | 'Imported')
  location, region, price, est_price
  number_of_days_listed, listed_category ('0-45'|'45-90'|'90-120'|'>120')
  views, watchlisted            demand signal on the listing
  vin, number_plate, link, name
  hard_lid, canopy, tow_bar, eighteen_wheels, twenty_wheels,
  twentyone_wheels, twentytwo_wheels     booleans

LISTINGS ONLY:  week_ending (date of that weekly snapshot), snapshot_id
SALES ONLY:     sold_week (date), sold_via, is_provisional, relisted_week

THINGS THAT WILL OTHERWISE GIVE YOU A WRONG ANSWER

- `price` is an ASKING price, on every row, always. There is no transacted price
  anywhere in this data. Say "sells at", never "sold for".
- LISTINGS ARE PER WEEK. A car live for 12 weeks has 12 rows. Counting stock
  without filtering to one week_ending inflates everything several-fold. For
  current stock use:
      WHERE week_ending = (SELECT MAX(week_ending) FROM market_listings)
- Relists are already excluded from the sales views.
- Sales in the newest week are PROVISIONAL (is_provisional = true): about 4% turn
  out to be relists once the following week lands. Say so when quoting them.
- `spec_canonical` is trim PLUS engine, e.g. 'WILDTRAK 2.0'. Use it, not `spec`.
  Raw `spec` splits one trim across several strings.
- ENGINE MATTERS ENORMOUSLY and is easy to miss. A Ranger Wildtrak 2.0 is a
  $55k car; a 3.0 is a $70k car; a 3.2 is an older generation at $31k. Never
  average across engines. If the user names a model without an engine and the
  variants differ materially in price, ASK which engine before answering.
- YEAR MATTERS TOO — roughly $4,700 a year on a Ranger. Never compare across
  years without saying so, and never compare engines without holding year fixed
  (a 3.2 looks cheap only because it exists solely in old model years).
- `number_of_days_listed` is only observed for cars that SOLD. Cars still sitting
  are not in the sales views, so average days-to-sell understates how long
  overpriced stock really takes.
- Matching is accurate to the 7-day snapshot gap. Anything showing 0-1 days sold
  sometime inside that week.

CATEGORICAL VALUES — check rather than guess. Call distinct_values(view, column)
when a name might not match exactly, or match loosely with ILIKE '%name%'.
- make/model are free text ('CX-5' has a hyphen, 'Ranger' does not have a trim in
  it). Prefer ILIKE.
- region has 18 values (Auckland, Canterbury, Waikato, Wellington, ...).
- kms_category is banded text like '70,001 to 80,000' and '> 200,000' — band
  boundaries are strings, so filter on the numeric `kms` column for ranges.

POSTGRES GOTCHA
- `price` is double precision, and ROUND(double precision, int) does not exist.
  Cast first: ROUND(x::numeric, 1). Plain ROUND(x) with no decimals is fine."""
