"""CarJam plate lookup — plate in, the exact car out.

The point is the engine problem: a dealer typing 'Wildtrak' can't tell us if
it's the $55k 2.0 or the $70k 3.0. The plate can. One lookup fills make, model,
year, engine cc and fuel, and the valuation lands in the right comp cell.

Uses the platform key from admin settings. No key, or a miss, degrades to
manual entry — never an error in the dealer's face.
"""

from __future__ import annotations

import httpx
from sqlalchemy.orm import Session

from . import secrets_store


class CarJamUnavailable(RuntimeError):
    """No key configured, or CarJam itself failed."""


def lookup(db: Session, plate: str) -> dict:
    key = secrets_store.get(db, secrets_store.CARJAM_API_KEY)
    if not key:
        raise CarJamUnavailable("No CarJam key configured in admin settings.")

    plate = plate.strip().upper().replace(" ", "")
    try:
        r = httpx.get(
            "https://www.carjam.co.nz/api/car/",
            params={"plate": plate, "key": key, "f": "json"},
            timeout=12,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as exc:  # noqa: BLE001 — one message, manual entry follows
        raise CarJamUnavailable(f"CarJam lookup failed: {exc}") from exc

    # CarJam nests under idh/vehicle for most plans; be tolerant of both shapes.
    v = data.get("idh", {}).get("vehicle", data.get("vehicle", data)) or {}

    def _i(x):
        try:
            return int(float(x))
        except (TypeError, ValueError):
            return None

    out = {
        "plate": plate,
        "make": (v.get("make") or "").title() or None,
        "model": (v.get("model") or "").title() or None,
        "variant": v.get("submodel") or None,
        "year": _i(v.get("year_of_manufacture")),
        "engine_cc": _i(v.get("cc_rating")),
        "fuel_type": (v.get("fuel_type") or "").title() or None,
        "colour": (v.get("main_colour") or "").title() or None,
    }
    if not out["make"] or not out["model"]:
        raise CarJamUnavailable(f"CarJam returned no vehicle for {plate}.")
    return out
