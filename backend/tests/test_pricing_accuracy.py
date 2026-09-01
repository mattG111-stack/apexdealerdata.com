"""Accuracy and sanity guards for the pricing engine.

Two kinds of test here, and the second matters more than the first.

**Invariants** hold on any data, need no database, and encode rules that are true
about the world rather than about our current sample — chiefly that price falls
as kilometres rise. A change that breaks one of these is wrong regardless of what
it does to the error rate.

**Accuracy** is a walk-forward back-test against real sales, priced using only
what was known the week before each car sold. It is skipped when no database is
configured, so the invariants still run in a bare checkout.

Thresholds are set a little looser than measured so ordinary week-to-week
movement doesn't fail the build. They are a ratchet against regression, not a
target: if the engine improves, tighten them.
"""

from __future__ import annotations

import os
import statistics
from datetime import timedelta

import pytest

from app.pricing.comps import find_comps, trim_token
from app.pricing.engine import apply_multi_engine, disp_code
from app.pricing.value import calc_pricing, km_slope

# Measured with self-matching excluded (an earlier 4.7% was fiction — each
# car's own prior-week listing sat in its comp pool). The honest number moves
# with the week and the sample: 7.6% on week 2026-07-25 at n=500, 8.9% at
# n=400, 9.8% on week 2026-08-03. A 300-car draw once hit 11.0% on an engine
# that had not changed — so the ratchet uses a larger sample and a ceiling set
# above ordinary variance. Real regressions here have historically moved the
# median by 1.5+ points (leakage: +2.9; the two-anchor line: +0.6), which this
# still catches.
MAX_MEDIAN_ERROR_PCT = 10.5
MAX_P90_ERROR_PCT = 32.0
MIN_PRICED_SHARE = 0.80
BACKTEST_SAMPLE = 500


# --------------------------------------------------------------------------
# Invariants — no database needed
# --------------------------------------------------------------------------


def test_price_never_rises_with_kilometres():
    """The rule the engine exists to respect.

    These comps are the real ones that broke it: the dearest car in the set is
    also the highest-kilometre one, which made a two-anchor line slope upward
    and priced a 68,000km Ranger at $53,200 against comps clustered at $47-48k.
    """
    comps = [
        {"kms": 55_000, "price": 51_990},
        {"kms": 57_000, "price": 47_888},
        {"kms": 74_600, "price": 47_990},
        {"kms": 78_000, "price": 45_990},
        {"kms": 86_000, "price": 54_990},
    ]
    assert km_slope(comps) <= 0

    prices = [calc_pricing(comps, km, 2022).mid for km in (20_000, 60_000, 100_000, 160_000)]
    assert prices == sorted(prices, reverse=True), prices


def test_km_slope_is_never_positive_on_any_ordering():
    rising = [{"kms": 10_000 * i, "price": 20_000 + 1_000 * i} for i in range(1, 8)]
    assert km_slope(rising) <= 0


def test_engine_code_bands():
    """1996 and 2000cc are one engine, not two. Unknown fuel is petrol, never
    diesel — mislabelling a petrol as a diesel is the costlier error here."""
    assert disp_code(1996, "Diesel") == disp_code(2000, "Diesel") == "2.0 D"
    assert disp_code(2993, "Diesel") == disp_code(3000, "Diesel") == "3.0 D"
    assert disp_code(2000, "") == "2.0 P"
    assert disp_code(0, "Electric") == "EV"
    assert disp_code(50, "Petrol") == ""       # implausible displacement


def test_multi_engine_only_disambiguates_when_ambiguous():
    """A trim with one engine keeps its clean name; only a genuinely split trim
    gets the engine written in."""
    single = [
        {"make": "Ford", "model": "Ranger", "variant": "XL", "engine_cc": 2198, "fuel_type": "Diesel"},
        {"make": "Ford", "model": "Ranger", "variant": "XL", "engine_cc": 2198, "fuel_type": "Diesel"},
    ]
    apply_multi_engine(single)
    assert [r["variant"] for r in single] == ["XL", "XL"]

    split = [
        {"make": "Ford", "model": "Ranger", "variant": "Wildtrak", "engine_cc": 1996, "fuel_type": "Diesel"},
        {"make": "Ford", "model": "Ranger", "variant": "Wildtrak", "engine_cc": 2993, "fuel_type": "Diesel"},
    ]
    apply_multi_engine(split)
    assert split[0]["variant"] == "Wildtrak 2.0 D"
    assert split[1]["variant"] == "Wildtrak 3.0 D"


def test_engines_are_not_mixed_as_comps():
    """The regression that started all this: Jarvis wrote the engine into the
    variant and then stripped it back off to match, so a 2.0 was priced off
    3.0s — about $4,500 too high."""
    target = {"make": "Ford", "model": "Ranger", "variant": "Wildtrak",
              "engine_cc": 1996, "fuel_type": "Diesel", "year": 2022, "kms": 68_000}
    pool = [
        {"make": "Ford", "model": "Ranger", "variant": "Wildtrak", "engine_cc": 2993,
         "fuel_type": "Diesel", "year": 2022, "kms": 64_000, "price": 54_995},
        {"make": "Ford", "model": "Ranger", "variant": "Wildtrak", "engine_cc": 2993,
         "fuel_type": "Diesel", "year": 2022, "kms": 63_000, "price": 54_995},
        {"make": "Ford", "model": "Ranger", "variant": "Wildtrak", "engine_cc": 1996,
         "fuel_type": "Diesel", "year": 2022, "kms": 74_600, "price": 47_990},
        {"make": "Ford", "model": "Ranger", "variant": "Wildtrak", "engine_cc": 1996,
         "fuel_type": "Diesel", "year": 2022, "kms": 78_000, "price": 45_990},
        {"make": "Ford", "model": "Ranger", "variant": "Wildtrak", "engine_cc": 1996,
         "fuel_type": "Diesel", "year": 2022, "kms": 57_000, "price": 47_888},
    ]
    apply_multi_engine([target, *pool])
    found = find_comps(target, pool)
    assert found.comps, "the 2.0 should still find its own comps"
    assert all(c["engine_cc"] == 1996 for c in found.comps), \
        [c["variant"] for c in found.comps]


def test_blank_fuel_is_rejected_not_treated_as_a_wildcard():
    """An unknown fuel could be the diesel that costs $10k more."""
    target = {"make": "Toyota", "model": "Hilux", "variant": "SR5",
              "fuel_type": "Diesel", "year": 2021, "kms": 90_000}
    pool = [
        {"make": "Toyota", "model": "Hilux", "variant": "SR5", "fuel_type": "",
         "year": 2021, "kms": 88_000, "price": 50_000}
        for _ in range(5)
    ]
    assert not find_comps(target, pool).comps


def test_trim_token_flattens_punctuation():
    assert trim_token("GLX-R") == trim_token("GLX R") == "glxr"
    assert trim_token("GR") == "grsport"
    assert trim_token("Wildtrak 2.0 D") == "wildtrak"


# --------------------------------------------------------------------------
# Accuracy — needs a loaded database
# --------------------------------------------------------------------------


needs_db = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL") and not os.path.exists(".env"),
    reason="no database configured",
)


def _same_car(candidate: dict, target: dict) -> bool:
    for key in ("vin", "number_plate", "link"):
        a, b = candidate.get(key), target.get(key)
        if a and b and a == b:
            return True
    return False


@needs_db
def test_backtest_accuracy_has_not_regressed():
    """Price real sales using only what was known the week before they sold."""
    from sqlalchemy import text

    from app.db import SessionLocal
    from app.pricing.comps import SOLD_WEEKS
    from app.pricing.value import extras_value

    db = SessionLocal()
    try:
        week = db.execute(
            text("SELECT MAX(sold_week) FROM sales WHERE NOT is_provisional")
        ).scalar()
        if week is None:
            pytest.skip("no confirmed sold week loaded")

        prior = db.execute(
            text("SELECT MAX(week_ending) FROM listings WHERE week_ending < :w"), {"w": week}
        ).scalar()
        if prior is None:
            pytest.skip("no listings snapshot before the scored week")

        cols = """vin, number_plate, link, make, model, spec AS variant, year,
                  kms, price, fuel_type, fourwd, imp_history, engine_cc,
                  location, region, hard_lid, canopy, tow_bar"""

        def rows(sql, **kw):
            res = db.execute(text(sql), kw)
            keys = list(res.keys())
            return [dict(zip(keys, r)) for r in res]

        targets = rows(
            f"SELECT {cols} FROM sales WHERE NOT is_relist AND sold_week = :w "
            "AND price > 0 AND kms > 0 AND make IS NOT NULL AND model IS NOT NULL "
            f"AND year IS NOT NULL ORDER BY id LIMIT {BACKTEST_SAMPLE}",
            w=week,
        )
        if len(targets) < 50:
            pytest.skip("not enough sales in the scored week")

        pool = rows(
            f"SELECT {cols}, 'forsale' AS src FROM listings "
            "WHERE NOT is_held AND week_ending = :p AND price > 0 AND kms > 0",
            p=prior,
        )
        pool += rows(
            f"SELECT {cols}, 'sold' AS src FROM sales WHERE NOT is_relist "
            "AND sold_week < :w AND sold_week >= :f AND price > 0 AND kms > 0",
            w=week, f=week - timedelta(weeks=SOLD_WEEKS),
        )

        by_model: dict[tuple, list[dict]] = {}
        for row in pool:
            by_model.setdefault(
                ((row["make"] or "").lower(), (row["model"] or "").lower()), []
            ).append(row)

        errors = []
        for target in targets:
            candidates = [
                c for c in by_model.get(
                    ((target["make"] or "").lower(), (target["model"] or "").lower()), []
                )
                # A car sold in week W was listed in week W-1, so its own listing
                # is in the pool. Left in, the engine prices it off itself and the
                # whole test becomes theatre.
                if not _same_car(c, target)
            ]
            if not candidates:
                continue
            apply_multi_engine([target, *candidates])
            found = find_comps(target, candidates)
            if not found.comps:
                continue
            valuation = calc_pricing(found.comps, target["kms"], target["year"])
            if valuation is None:
                continue
            predicted = valuation.mid + extras_value(target)
            errors.append(abs(predicted - target["price"]) / target["price"] * 100)

        priced_share = len(errors) / len(targets)
        assert priced_share >= MIN_PRICED_SHARE, f"only priced {priced_share:.0%}"

        errors.sort()
        median = statistics.median(errors)
        p90 = errors[min(int(len(errors) * 0.9), len(errors) - 1)]

        assert median <= MAX_MEDIAN_ERROR_PCT, f"median error {median:.1f}%"
        assert p90 <= MAX_P90_ERROR_PCT, f"90th percentile {p90:.1f}%"
    finally:
        db.close()
