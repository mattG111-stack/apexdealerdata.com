"""Recognising the same car across two weekly snapshots.

This is the load-bearing piece of the whole product: a car present last week and
absent this week is a sale, so anything that fails to recognise a still-live car
books a sale that never happened.

Measured on three real consecutive snapshots (12-07 → 19-07 → 25-07-2026):

    key      present on   caught still-live
    vin          88.9%         78.7%
    plate        55.8%          3.1%
    link        100.0%          7.8%
    attrs       100.0%          0.5%
                             -------
                              90.0%   (10.0% booked sold)

VIN alone would miss ~11 points of cars that plate and link do catch — i.e. it
would overstate weekly sales by more than the relist error. The cascade is not
belt-and-braces, it is the difference between a usable number and a wrong one.

`attrs` is deliberately last: 2.4% of attribute hashes collide within a single
week, so it can match the wrong car. It contributes only 0.5% of matches, and
dropping it entirely would be defensible.
"""

from __future__ import annotations

# Tightest first. Order matters — see module docstring.
CASCADE = ("vin", "plate", "link", "attrs")

# A VIN is 17 chars, but the feed carries some short/partial ones. Below this
# length a "VIN" is too weak to be an identity.
MIN_VIN_LEN = 11
MIN_PLATE_LEN = 4

_ATTR_FIELDS = ("make", "model", "year", "spec", "kms", "dealer_name", "ext_color")


def _norm(v: object) -> str:
    return str(v).strip().upper() if v is not None else ""


def keys_of(row: dict) -> dict[str, str]:
    """The four identities a listing can be recognised by.

    An empty string means "this row has no usable value for that key" — never a
    match candidate, so two cars both missing a VIN never match on it.
    """
    vin = _norm(row.get("vin"))
    plate = _norm(row.get("number_plate"))
    link = _norm(row.get("link"))

    make, model = _norm(row.get("make")), _norm(row.get("model"))
    attrs = "|".join(_norm(row.get(f)) for f in _ATTR_FIELDS)

    return {
        "vin": vin if len(vin) >= MIN_VIN_LEN else "",
        "plate": plate if len(plate) >= MIN_PLATE_LEN else "",
        "link": link,
        # Worthless without at least a make and model to anchor it.
        "attrs": attrs if make and model else "",
    }


def build_index(rows: list[dict]) -> dict[str, set[str]]:
    """One lookup set per key type, for the week we're matching *into*."""
    index: dict[str, set[str]] = {k: set() for k in CASCADE}
    for row in rows:
        for key, value in keys_of(row).items():
            if value:
                index[key].add(value)
    return index


def match(row: dict, index: dict[str, set[str]]) -> str | None:
    """Which key proves this row is still live in the indexed week, if any.

    Returns the key name for traceability (stored on the sale as `sold_via`), or
    None if no key matched — which is what makes it a sale.
    """
    row_keys = keys_of(row)
    for key in CASCADE:
        value = row_keys[key]
        if value and value in index[key]:
            return key
    return None


def is_unidentifiable(row: dict) -> bool:
    """No usable key at all — such a row can never match and would book as sold
    every single week. Measured at zero on real snapshots; if this ever fires,
    the feed has changed and the sales figures are wrong."""
    return not any(keys_of(row).values())
