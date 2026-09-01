"""Engine codes and multi-engine trim disambiguation.

Ported from Jarvis (`_dispCode`, `_stripEng`, `_applyMultiEngine`). The rules here
are Matt's, worked out against this market over a long time — they are not
re-derived, and they should not be "improved" without evidence.

Two of them are smarter than the obvious implementation:

* `disp_code` uses explicit bands for the common displacements rather than
  rounding cc. 1996 and 2000 are both a 2.0; 2956-3000 are all a 3.0. Rounding
  alone splits one engine into several.

* `apply_multi_engine` only writes the engine into a trim when that trim actually
  has more than one engine. A model with a single engine keeps its clean name
  ("XLT", not "XLT 2.0"), and — more importantly — is never split apart by noisy
  cc values where there was no ambiguity to resolve in the first place.
"""

from __future__ import annotations

import re

# Below/above these a "displacement" is a data error, not an engine.
MIN_CC = 800
MAX_CC = 9000

_TRAILING_ENGINE = re.compile(r"\s*\b\d\.\d\s*[dp]\b\s*$", re.IGNORECASE)
_TRAILING_PHEV = re.compile(r"\s*\bphev\b\s*$", re.IGNORECASE)
_HAS_ENGINE_CODE = re.compile(r"\b\d\.\d\b|phev|\bev\b", re.IGNORECASE)
_DIGITS = re.compile(r"[^0-9]")


def to_cc(raw: object) -> int:
    """'1996cc' -> 1996."""
    if raw is None:
        return 0
    digits = _DIGITS.sub("", str(raw))
    return int(digits) if digits else 0


def disp_code(cc_raw: object, fuel_raw: object) -> str:
    """The engine label used to disambiguate a trim: '2.0 D', '3.0 P', 'PHEV'.

    Fuel comes first because a PHEV or EV has no meaningful displacement to
    quote. Unknown fuel is treated as petrol, never diesel — calling a petrol car
    a diesel is the more damaging error in this market.
    """
    fuel = (str(fuel_raw) if fuel_raw is not None else "").lower()

    if re.search(r"phev|plug", fuel):
        return "PHEV"
    if re.search(r"electric|^\s*ev\s*$|\bev\b", fuel):
        return "EV"

    cc = to_cc(cc_raw)
    if cc < MIN_CC or cc > MAX_CC:
        return ""

    # Explicit bands for the displacements that matter; everything else rounds.
    if 1996 <= cc <= 2000:
        disp = "2.0"
    elif 2956 <= cc <= 3000:
        disp = "3.0"
    elif 3198 <= cc <= 3200:
        disp = "3.2"
    else:
        disp = f"{round(cc / 100) / 10:.1f}"

    if "diesel" in fuel:
        suffix = "D"
    elif "hybrid" in fuel:
        suffix = "Hybrid"
    else:
        suffix = "P"

    return f"{disp} {suffix}"


def strip_engine(variant: str | None) -> str:
    """The trim with a trailing engine code removed. 'Wildtrak 2.0 D' -> 'Wildtrak'."""
    text = variant or ""
    text = _TRAILING_PHEV.sub("", text)
    text = _TRAILING_ENGINE.sub("", text)
    return text.strip()


def apply_multi_engine(rows: list[dict]) -> int:
    """Write the engine into the trim, but only where the trim is ambiguous.

    Groups on (make, model, engine-stripped trim). If a group turns out to hold
    more than one engine, every row in it gets the engine appended so a Wildtrak
    2.0 is never averaged with a 3.0. If the group has one engine, nothing is
    touched.

    Mutates `rows` in place, setting `variant`, and preserving the original in
    `_original_variant`. Returns how many rows were rewritten.
    """
    groups: dict[str, dict] = {}

    for row in rows:
        base = strip_engine(row.get("variant"))
        key = f"{row.get('make') or ''}|{row.get('model') or ''}|{base}".lower()
        group = groups.setdefault(key, {"codes": set(), "rows": []})
        code = disp_code(row.get("engine_cc"), row.get("fuel_type"))
        if code:
            group["codes"].add(code)
        group["rows"].append((row, base, code))

    rewritten = 0
    for group in groups.values():
        # One engine for this trim — there is nothing to disambiguate.
        if len(group["codes"]) < 2:
            continue

        for row, base, code in group["rows"]:
            if not code:
                continue
            variant = (row.get("variant") or "").strip()
            if _HAS_ENGINE_CODE.search(variant):
                continue  # already carries an engine code
            row.setdefault("_original_variant", variant)
            row["variant"] = f"{base} {code}".strip()
            row["_variant_cleaned"] = True
            rewritten += 1

    return rewritten
