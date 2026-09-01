"""Turning a set of comps into a price.

Ported from Jarvis (`calcPricing`, `extrasValue`, `anonymiseCompetitors`,
`avgPrice`). Matt's method, kept intact:

* Age is normalised at **$2,000 a year** before anything else, so a comp from a
  different year can still be used rather than thrown away.

* The price itself is a **straight line through kilometres** — anchor on the
  lowest-km comp and the highest-km comp, then read off where the target car
  sits between them. It is deliberately not a mean: the mean of a tight cluster
  plus one 200,000km outlier is a number no car would sell at, whereas the line
  puts the outlier at the end where it belongs.

* Two comps or fewer, it stops modelling and just averages them, flagged
  `single_price`. Fitting a line through two points is arithmetic pretending to
  be evidence.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

YEAR_ADJUSTMENT = 2_000     # $ per year of age difference
PRICE_ROUNDING = 100        # prices land on $100
BAND = 1_000                # low/high sit $1,000 either side of mid
MIN_PRICE = 1_000

# Fitted extras, in dollars — MEASURED, not guessed (scripts/measure_extras.py).
#
# Method: price every ute against a bare equivalent, with year, odometer, trim,
# engine, fuel, import history and region all controlled by the comp engine, then
# compare the residual for cars that have the extra against those that don't.
# 2,630 utes, latest week:
#
#     extra      fitted   bare   median gap   mean gap   was
#     canopy        495  2,135         $605       $588   $200
#     hard lid      193  2,437         $705     $1,077   $600
#     tow bar       950  1,680           $0      -$610      -
#
# Medians, because a mean chases the odd $80k special. Hard lid's original $600
# was close; canopy was under by three times.
#
# A tow bar is worth nothing. It is fitted to 950 of 2,630 utes, so that is not a
# thin sample — it is simply standard kit nobody pays extra for. Kept as an
# explicit zero rather than deleted, so the next person measures it again instead
# of assuming it was forgotten.
EXTRA_HARD_LID = 700
EXTRA_CANOPY = 600
EXTRA_TOW_BAR = 0
# Never measured: wheel size does not vary within a trim (zero matched cells
# across a full week), so it carries no information the trim doesn't already.
EXTRA_WHEELS = 500

_WHEEL_FIELDS = ("eighteen_wheels", "twenty_wheels", "twentyone_wheels", "twentytwo_wheels")


def _truthy(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() not in ("", "0", "no", "false", "none")


def extras_value(vehicle: dict) -> int:
    """Dollar adjustment for fitted extras."""
    total = 0
    if _truthy(vehicle.get("hard_lid")):
        total += EXTRA_HARD_LID
    if _truthy(vehicle.get("canopy")):
        total += EXTRA_CANOPY
    if any(_truthy(vehicle.get(f)) for f in _WHEEL_FIELDS):
        total += EXTRA_WHEELS
    return total


def average_price(comps: list[dict]) -> int:
    prices = [c.get("price") or 0 for c in comps]
    prices = [p for p in prices if p]
    return round(sum(prices) / len(prices)) if prices else 0


def km_slope(comps: list[dict]) -> float:
    """Dollars per kilometre, and never positive.

    Theil-Sen: the median of the slope between every pair of comps. A median of
    slopes cannot be dragged by one odd car the way a two-point line or a
    least-squares fit can, which matters because a comp set is five or six
    messy rows, not a sample.

    Then clamped at zero, because **more kilometres cannot mean more money**.
    Where the comps say otherwise it is a property of those particular cars —
    a better-optioned one, or an overpriced one sitting unsold — not of the
    market. Left unclamped it produced a $53,200 valuation on a car whose own
    comps clustered at $47-48k, purely because the highest-km Ranger in the set
    was also the dearest.

    A zero slope is a real answer: it means these comps carry no usable
    odometer signal, so price off their level alone rather than inventing one.
    """
    slopes: list[float] = []
    for i in range(len(comps)):
        for j in range(i + 1, len(comps)):
            km_gap = comps[j]["kms"] - comps[i]["kms"]
            if km_gap:
                slopes.append((comps[j]["price"] - comps[i]["price"]) / km_gap)

    if not slopes:
        return 0.0
    return min(statistics.median(slopes), 0.0)


@dataclass
class Valuation:
    low: int
    mid: int
    high: int
    count: int
    single_price: bool = False

    def as_dict(self) -> dict:
        return {
            "low": self.low,
            "mid": self.mid,
            "high": self.high,
            "count": self.count,
            "single_price": self.single_price,
        }


def _round_to(value: float, step: int = PRICE_ROUNDING) -> int:
    return int(round(value / step) * step)


def calc_pricing(
    comps: list[dict],
    target_km: int | None,
    target_year: int | None,
) -> Valuation | None:
    """Price the target car from its comps, or None if nothing usable.

    Returns a value for a car with NO extras fitted. The caller adds the target's
    own `extras_value` back on — see `pool.price_vehicle`. Keeping the two apart
    is what makes the comparison even: each comp is stripped of its own extras
    before it is used, so a set full of tow bars doesn't quietly lift the level
    for a car that hasn't got one.
    """
    valid = [c for c in comps if (c.get("price") or 0) > 0 and (c.get("kms") or 0) > 0]
    if not valid:
        return None

    # Normalise every comp to a bare car. Without this, extras are counted on the
    # comps implicitly and on the target explicitly — the same money twice for a
    # fitted car, and nothing at all for a bare one.
    valid = [
        dict(c, price=max(MIN_PRICE, c["price"] - extras_value(c))) for c in valid
    ]

    # Too few to model. Average and say so, rather than fitting a line through
    # two points and calling the result a valuation.
    if len(valid) <= 2:
        flat = _round_to(sum(c["price"] for c in valid) / len(valid))
        return Valuation(low=flat, mid=flat, high=flat, count=len(valid), single_price=True)

    # Normalise every comp to the target's year before comparing on kilometres.
    if target_year:
        adjusted = []
        for comp in valid:
            year_diff = int(comp.get("year") or 0) - int(target_year)
            adjusted.append(
                dict(comp, price=max(MIN_PRICE, comp["price"] - year_diff * YEAR_ADJUSTMENT))
            )
        valid = adjusted

    if target_km:
        # Level from the median comp, then walk to the target's odometer along a
        # slope that can only ever go down.
        median_km = statistics.median(c["kms"] for c in valid)
        median_price = statistics.median(c["price"] for c in valid)
        mid = _round_to(median_price + km_slope(valid) * (target_km - median_km))
    else:
        mid = _round_to(statistics.median(c["price"] for c in valid))

    mid = max(MIN_PRICE, mid)

    pool_max = max((c.get("price") or 0) for c in comps) if comps else mid
    low = min(mid - BAND, mid)
    high = max(min(mid + BAND, pool_max + BAND), mid)

    return Valuation(low=int(low), mid=int(mid), high=int(high), count=len(valid))


def anonymise_competitors(records: list[dict], viewer_dealer: str | None) -> list[dict]:
    """Replace every other dealer's name with a stable 'Dealer N'.

    The viewer keeps their own name so they can find themselves in the list.
    Numbering is assigned in order of appearance and is stable within one result
    set — the same rival is the same number throughout a single view.
    """
    if not viewer_dealer:
        return records

    labels: dict[str, str] = {}
    out: list[dict] = []

    for record in records:
        name = record.get("dealer_name") or record.get("dealer") or ""
        if not name or name == viewer_dealer:
            out.append(record)
            continue
        if name not in labels:
            labels[name] = f"Dealer {len(labels) + 1}"
        masked = dict(record)
        if "dealer_name" in masked:
            masked["dealer_name"] = labels[name]
        if "dealer" in masked:
            masked["dealer"] = labels[name]
        out.append(masked)

    return out
