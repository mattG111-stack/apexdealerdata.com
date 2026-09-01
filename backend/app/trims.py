"""Cleaning `spec` into a canonical trim — engine first.

The feed's spec is free text and fragments one trim across several strings. In a
single week Ford Ranger Wildtrak appears as 'Wildtrak' (257), 'Wildtrak 2.0 D'
(178) and 'Wildtrak 3.0 D' (85).

The obvious move — strip the engine, call them all WILDTRAK — is wrong, and the
data says so loudly:

    Wildtrak 2.0 D    n=178   median $54,990   1996cc
    Wildtrak 3.0 D    n= 85   median $69,995   2993cc
    Wildtrak (bare)   n=257   median $56,990   MIXED: 1996/2993/3198/3000

$15,005 apart. Merging them puts a 27% error into every Wildtrak benchmark and
every price this thing recommends. And the bare 'Wildtrak' rows are not a third
trim — they are both engines jumbled together, so leaving them alone poisons
whichever group they land in.

So the engine is resolved *before* anything else: from the spec string when it's
written there, from `engine_capacity` when it isn't. That dissolves the bare
group into the right buckets instead of creating a mixed one.

Displacements need normalising as well — 1996cc and 2000cc are the same engine,
as are 2993/3000 and 3198/3200. Rounding cc to one decimal litre does it.

Every derived mapping is written to `canonical_trims` unreviewed, so a human can
correct any single one and the correction wins from then on.
"""

from __future__ import annotations

import re

# A displacement written into the spec: '2.0 D', '3.0', '2.5 S'. The fuel code is
# an explicit list, never `[A-Z]{1,3}` — that looser pattern read Mazda's '2.0 S'
# as displacement-plus-code and threw away the S, which is the trim. 324 CX-5s in
# one week lost their trim to it.
_SPEC_ENGINE = re.compile(
    r"\b(\d\.\d)\s*(?:(?:TDCI|TFSI|TDI|CRD|HDI|DCI|TSI|TD|DT|D|T)\b)?",
    re.IGNORECASE,
)

# '4000cc', '1996 cc'
_CC = re.compile(r"(\d{3,5})\s*cc", re.IGNORECASE)

# Body/cab descriptors that aren't trim — they belong to body_style.
_BODY_WORDS = re.compile(
    r"\b(?:double\s*cab|dual\s*cab|extra\s*cab|single\s*cab|d/?cab|wagon|hatch"
    r"|sedan|coupe|convertible|ute)\b",
    re.IGNORECASE,
)

# 'SR 5' -> 'SR5', 'FX 4' -> 'FX4': a letter group split from its number.
_SPLIT_ALNUM = re.compile(r"\b([A-Z]{1,3})\s+(\d{1,2})\b")

_WHITESPACE = re.compile(r"\s+")

# Below this, a "displacement" is noise rather than an engine.
_MIN_CC = 600
_MAX_CC = 9000


def engine_litres(spec: str | None, engine_capacity: str | None) -> float | None:
    """The engine, normalised to litres — spec first, then the capacity field.

    Spec wins when it carries a displacement because it is what the seller chose
    to advertise, and it is the string that fragments the trim. `engine_capacity`
    is the fallback, and it is what resolves a bare 'Wildtrak' into 2.0 or 3.0.
    """
    if spec:
        m = _SPEC_ENGINE.search(spec)
        if m:
            try:
                litres = float(m.group(1))
            except ValueError:
                litres = 0.0
            if 0.6 <= litres <= 9.0:
                return round(litres, 1)

    if engine_capacity:
        m = _CC.search(engine_capacity)
        if m:
            cc = int(m.group(1))
            if _MIN_CC <= cc <= _MAX_CC:
                # 1996 -> 2.0, 2993 -> 3.0, 3198 -> 3.2
                return round(cc / 1000.0, 1)

    return None


def base_trim(spec: str | None) -> str | None:
    """The trim with engine and body descriptors removed.

    None when the spec was *entirely* engine or body — a bare 'Double cab' has no
    trim in it, and calling that an empty trim would group it with genuinely
    unspecified cars.
    """
    if not spec or not spec.strip():
        return None

    text = _SPEC_ENGINE.sub(" ", spec)
    text = _BODY_WORDS.sub(" ", text)
    text = _WHITESPACE.sub(" ", text).strip()
    if not text:
        return None

    text = _SPLIT_ALNUM.sub(r"\1\2", text.upper())
    text = _WHITESPACE.sub(" ", text).strip()
    return text or None


def canonicalise(spec: str | None, engine_capacity: str | None = None) -> str | None:
    """The comparison key for a trim: base trim plus normalised engine.

    'Wildtrak 2.0 D'          -> 'WILDTRAK 2.0'
    'Wildtrak' + 2993cc       -> 'WILDTRAK 3.0'    <- resolved from capacity
    '2.0 S' (Mazda)           -> 'S 2.0'
    'Double cab' + 1996cc     -> '2.0'             <- engine only, still useful
    '' + no capacity          -> None
    """
    trim = base_trim(spec)
    litres = engine_litres(spec, engine_capacity)

    if trim and litres:
        return f"{trim} {litres:.1f}"
    if trim:
        return trim
    if litres:
        return f"{litres:.1f}"
    return None
