"""Finding comparable cars, and widening the net when there aren't enough.

Ported from Jarvis (`findPricingWithExpansion`, `matchV`, `_trimTok`,
`getVehicleRegion`, `getAucklandFlag`). The ladder and the match rules are Matt's
and encode real market judgement:

* **The trim is never relaxed.** Every rung of the expansion widens kilometres or
  years; not one of them merges variants. Independently measured on this data:
  widening a year costs about 8% on a $60k car, merging engines costs 12-21%. So
  the ladder is right — a wrong engine is a worse comp than a wrong year.

* **Blank fuel is rejected, not treated as a wildcard.** An unknown fuel could be
  the diesel that costs $10k more; matching it in would quietly poison the comp
  set.

* **Geography widens before the vehicle does** — Auckland, then North Island,
  then national. A car is more comparable to the same car in another city than
  to a different car nearby.

The comp pool is deliberately narrow: cars currently for sale, plus cars sold in
the last three weeks. Stale comps misprice a moving market.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

MIN_COMPS = 3          # below this the rung has not found a real answer
SOLD_WEEKS = 3         # how far back a sold car still counts as a comp

# Tightest first. (km_range, year_range, relax_variant, label)
#
# `relax_variant` is False on every rung, deliberately — see module docstring.
#
# KM IS NOT A FILTER ANY MORE, and that is a deliberate change from Jarvis.
# Jarvis narrowed on the odometer (±5k, ±10k, ±20k, ±30k) *and* modelled it. Doing
# both means a different target odometer lands on a different rung with a
# different comp set, so the price level jumps between them — measured on a 2022
# Wildtrak 2.0: 20,000km priced at $54,800 but 50,000km at $55,800. More
# kilometres, more money, which cannot be right.
#
# Once the odometer is modelled by a monotonically non-increasing slope
# (value.km_slope) it does not need to be filtered as well. One comp set now
# serves every target odometer for a given spec, so price falls with kilometres
# by construction rather than by luck.
#
# There is no odometer guard rail either — that had to go too. A guard of "within
# 120,000km of the target" is still measured *from the target*, so a 10,000km car
# and a 30,000km car still see different comp sets and the level still jumps: the
# same bug in a smaller coat. Observed on a 2022 Wildtrak 3.0, $56,000 at
# 10,000km but $57,200 at 30,000km.
#
# So the odometer plays no part in choosing comps at all. A high-kilometre
# example of the same car is not an outlier to exclude; it is the evidence that
# anchors the top of the curve, and a median-of-slopes is robust to it.
EXPANSIONS: list[tuple[object, object, bool, str]] = [
    ("any", 0, False, "Same year"),
    ("any", 1, False, "Within 1 year"),
    ("any", 2, False, "Within 2 years"),
]

_NORTH = (
    "auckland", "north shore", "henderson", "manukau", "albany", "penrose", "hamilton",
    "tauranga", "rotorua", "whangarei", "new plymouth", "napier", "hastings",
    "palmerston north", "whanganui", "gisborne", "wellington", "lower hutt",
    "upper hutt", "porirua", "north island",
)
_SOUTH = (
    "christchurch", "rolleston", "nelson", "blenheim", "dunedin", "invercargill",
    "timaru", "oamaru", "greymouth", "westport", "queenstown", "wanaka", "south island",
)
_AUCKLAND = (
    "auckland", "north shore", "henderson", "manukau", "albany", "penrose", "newmarket",
    "parnell", "remuera", "takapuna", "botany", "howick", "east auckland",
    "west auckland", "south auckland",
)

_TRAILING_FUEL = re.compile(r"\s*\b\d\.\d\s*(d|p|hybrid|diesel|petrol)?\b\s*$", re.IGNORECASE)
_TRAILING_ELEC = re.compile(r"\s*\b(phev|ev)\b\s*$", re.IGNORECASE)
_PUNCT = re.compile(r"[-\s]")

_FOUR_WD = {"4wd", "4x4", "awd", "yes", "true"}
_TWO_WD = {"2wd", "rwd", "fwd"}


def trim_token(spec: str | None) -> str:
    """A trim reduced to a comparison token, engine removed.

    Strips a trailing engine/fuel code and flattens punctuation, so 'GLX-R' and
    'GLX R' are one trim rather than two. 'GR' means GR Sport.

    The engine is stripped on purpose: a listing with no cc data keeps a bare
    'Wildtrak', and it still has to be able to match a 'Wildtrak 2.0 D'. Engine
    separation is handled by `engine_token` instead — see `matches`.
    """
    text = (spec or "").lower().strip()
    text = _TRAILING_ELEC.sub("", text)
    text = _TRAILING_FUEL.sub("", text)
    token = _PUNCT.sub("", text)
    return "grsport" if token == "gr" else token


_ENGINE_IN_VARIANT = re.compile(r"\b(\d\.\d)\s*(d|p|hybrid)?\b|\b(phev|ev)\b", re.IGNORECASE)


def engine_token(spec: str | None) -> str:
    """The engine code inside a disambiguated variant, or '' if it carries none.

    DEVIATION FROM JARVIS, and a deliberate one. Jarvis ran `_applyMultiEngine`
    to write the engine into the variant, then matched with `_trimTok`, which
    strips that engine straight back off — so the disambiguation was undone at
    the point it mattered and engines were freely mixed as comps.

    Measured cost on real data: pricing a 2022 Ranger Wildtrak 2.0 pulled five
    3.0s at ~$55,000 against its own 2.0s at $45,990-$47,990, giving $51,500 —
    roughly $4,500 too high for the 2.0, and about $3,500 too low for the 3.0.
    Independently, the 3.0 carries a 12-21% premium over the 2.0 in every year
    tested, so this is not a rounding difference.
    """
    match = _ENGINE_IN_VARIANT.search(spec or "")
    if not match:
        return ""
    if match.group(3):
        return match.group(3).upper()
    return match.group(1)


def _haystack(vehicle: dict) -> str:
    return " ".join(
        str(vehicle.get(k) or "") for k in ("location", "region", "dealer_name")
    ).lower()


def region_of(vehicle: dict) -> str:
    text = _haystack(vehicle)
    if any(r in text for r in _NORTH):
        return "north"
    if any(r in text for r in _SOUTH):
        return "south"
    return "unknown"


def is_auckland(vehicle: dict) -> bool:
    text = _haystack(vehicle)
    return any(r in text for r in _AUCKLAND)


def scopes_for(vehicle: dict) -> list[str]:
    """Geographic ladder for this car — nearest market first."""
    if is_auckland(vehicle):
        return ["auckland", "north", "national"]
    region = region_of(vehicle)
    if region == "north":
        return ["north", "national"]
    if region == "south":
        return ["south", "national"]
    return ["national"]


def in_scope(vehicle: dict, scope: str) -> bool:
    if scope == "national":
        return True
    if scope == "auckland":
        return is_auckland(vehicle)
    return region_of(vehicle) == scope


def _yes_no(value: object) -> str:
    return str(value or "").lower()


def matches(
    candidate: dict,
    target: dict,
    km_range: object,
    year_range: object,
    relax_variant: bool = False,
) -> bool:
    """Is `candidate` a fair comparison for `target` at this rung?"""
    if (candidate.get("make") or "").lower() != (target.get("make") or "").lower():
        return False
    if (candidate.get("model") or "").lower() != (target.get("model") or "").lower():
        return False

    target_spec = target.get("variant") or target.get("spec")
    candidate_spec = candidate.get("variant") or candidate.get("spec")

    target_variant = trim_token(target_spec)
    if not relax_variant and target_variant:
        if trim_token(candidate_spec) != target_variant:
            return False

        # Same trim, but the engine still has to agree. Only enforced when BOTH
        # sides carry a code: a listing with no cc data keeps a bare variant, and
        # excluding it would throw away good comps for a data gap rather than a
        # real difference. See engine_token for why this exists at all.
        target_engine = engine_token(target_spec)
        candidate_engine = engine_token(candidate_spec)
        if target_engine and candidate_engine and target_engine != candidate_engine:
            return False

    # Fuel: strict. A blank on the candidate is unknown, and an unknown could be
    # the diesel that costs $10k more — reject rather than assume.
    target_fuel = (target.get("fuel_type") or "").lower()
    if target_fuel:
        candidate_fuel = (candidate.get("fuel_type") or "").lower()
        if not candidate_fuel or candidate_fuel != target_fuel:
            return False

    # NZ New vs Import, only when both sides state it.
    t_imp, c_imp = target.get("imp_history"), candidate.get("imp_history")
    if t_imp and c_imp:
        c_is_nz = "nz" in c_imp.lower() or "new zealand" in c_imp.lower()
        t_is_nz = t_imp == "NZ New"
        if c_is_nz != t_is_nz:
            return False

    # Drivetrain, only when both sides state it.
    t_4wd, c_4wd = _yes_no(target.get("fourwd")), _yes_no(candidate.get("fourwd"))
    if t_4wd and c_4wd:
        if (t_4wd in _FOUR_WD and c_4wd in _TWO_WD) or (t_4wd in _TWO_WD and c_4wd in _FOUR_WD):
            return False

    target_km = target.get("kms") or 0
    if km_range != "any" and target_km and candidate.get("kms"):
        if abs(candidate["kms"] - target_km) > km_range:
            return False

    target_year = target.get("year") or 0
    if year_range != "any" and target_year and candidate.get("year"):
        if abs(int(candidate["year"]) - int(target_year)) > year_range:
            return False

    return True


@dataclass
class CompResult:
    comps: list[dict] = field(default_factory=list)
    step: str = "No comparable vehicles found"
    scope: str = "Unknown"
    expanded: bool = False   # true when the net had to be widened — say so in the UI

    @property
    def count(self) -> int:
        return len(self.comps)


_SCOPE_LABEL = {
    "auckland": "Auckland",
    "north": "North Island",
    "south": "South Island",
    "national": "National",
}


def find_comps(target: dict, pool: list[dict]) -> CompResult:
    """Walk the geography then the expansion ladder, stopping at the first rung
    that finds enough comparable cars.

    `expanded` is set whenever anything beyond the tightest rung was needed. That
    flag has to reach the dealer — a price built from '±2 years, any km,
    national' deserves less weight than one built from five same-year cars in
    their own city, and hiding that difference is how a tool loses trust.
    """
    for scope in scopes_for(target):
        scoped = [v for v in pool if in_scope(v, scope)]
        if not scoped:
            continue

        for rung_index, (km_range, year_range, relax, label) in enumerate(EXPANSIONS):
            collected = [
                dict(
                    v,
                    km_diff=abs((v.get("kms") or 0) - (target.get("kms") or 0)),
                    year_diff=abs(int(v.get("year") or 0) - int(target.get("year") or 0)),
                )
                for v in scoped
                if (v.get("price") or 0) > 0
                and matches(v, target, km_range, year_range, relax)
            ]

            if len(collected) >= MIN_COMPS:
                collected.sort(key=lambda c: c["km_diff"])
                expanded = scope != scopes_for(target)[0] or rung_index > 0
                return CompResult(
                    comps=collected,
                    step=f"{_SCOPE_LABEL[scope]} · {label}",
                    scope=_SCOPE_LABEL[scope],
                    expanded=expanded,
                )

    return CompResult()
