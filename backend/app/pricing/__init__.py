"""Apex pricing — ported from Jarvis.

The comp ladder, the engine disambiguation, the $2,000-a-year age adjustment and
the kilometre line are Matt's, developed against this market. They are ported
rather than reinvented, and the constants should only move with evidence.

What Apex adds around them is the durable Postgres history (84 weeks vs a single
uploaded file), derived sales with relist correction, dealer tenancy, and the
assistant that can reach all of it.

    from app.pricing import price_vehicle

    result = price_vehicle(db, {"make": "Ford", "model": "Ranger",
                               "variant": "Wildtrak", "year": 2022,
                               "kms": 68000, "fuel_type": "Diesel",
                               "region": "Auckland"})
"""

from .comps import CompResult, MIN_COMPS, SOLD_WEEKS, find_comps, trim_token
from .engine import apply_multi_engine, disp_code, strip_engine
from .pool import build_comp_pool, price_vehicle
from .value import Valuation, anonymise_competitors, calc_pricing, extras_value

__all__ = [
    "CompResult",
    "MIN_COMPS",
    "SOLD_WEEKS",
    "Valuation",
    "anonymise_competitors",
    "apply_multi_engine",
    "build_comp_pool",
    "calc_pricing",
    "disp_code",
    "extras_value",
    "find_comps",
    "price_vehicle",
    "strip_engine",
    "trim_token",
]
