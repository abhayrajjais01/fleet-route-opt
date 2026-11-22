"""
traffic.py - Time-of-Day Congestion Model (Track A: Manthan Nimodiya)

The distance engine gives each leg a base drive time for normal daytime traffic. Real city traffic depends on
when the truck leaves: a 30-minute leg at 09:00 or 18:30 in Mumbai takes far longer than the same leg at 14:00
or 22:00. This module turns a base time into the time for a given departure:

    travel_time(base_min, depart_min) -> minutes

Model: Ichoua, Gendreau & Potvin (2003) time-dependent travel speeds. The day is split into periods, each with
a congestion factor (travel time multiplier). A leg is "driven" through the periods: in each period the truck
covers base-minutes at 1/factor speed, and when a period ends the remaining distance continues at the next
period's speed. Unlike simply multiplying by the factor at departure, this guarantees FIFO: leaving later can
never mean arriving earlier, which the solver and ETA engine rely on.

Factors (relative to the base model, which is calibrated to midday traffic): night roads are clear, the
morning peak runs 08:00-11:00 and the evening peak 17:00-21:00, matching published TomTom / Uber Movement
patterns for Mumbai and Pune. Set TRAFFIC_MODEL=False to disable (factor 1 all day).
"""

from __future__ import annotations

from bisect import bisect_right
from typing import List, Tuple

from app.core.config import settings

DAY = 1440
# (period start minute, travel-time factor)
PROFILE: List[Tuple[int, float]] = [
    (0, 0.80),      # 00:00 night
    (360, 0.95),    # 06:00 early morning
    (480, 1.30),    # 08:00 morning peak
    (660, 1.00),    # 11:00 midday (base)
    (1020, 1.40),   # 17:00 evening peak
    (1260, 0.90),   # 21:00 late evening
]
_STARTS = [s for s, _ in PROFILE]


def factor_at(minute: float) -> float:
    """Congestion factor in force at a clock minute (any day; wraps every 24 h)."""
    if not settings.TRAFFIC_MODEL:
        return 1.0
    return PROFILE[bisect_right(_STARTS, minute % DAY) - 1][1]


def _period_end(minute: float) -> float:
    """Absolute minute at which the period containing `minute` ends."""
    day_start = (minute // DAY) * DAY
    i = bisect_right(_STARTS, minute - day_start)
    return day_start + (_STARTS[i] if i < len(_STARTS) else DAY)


def travel_time(base_min: float, depart_min: float) -> float:
    """Minutes to drive a leg whose midday time is `base_min`, leaving at clock minute `depart_min`."""
    if base_min <= 0 or not settings.TRAFFIC_MODEL:
        return max(0.0, float(base_min))
    t, remaining = float(depart_min), float(base_min)
    for _ in range(64):  # a leg never spans more than a few periods; the cap guards against bad input
        f = factor_at(t)
        end = _period_end(t)
        coverable = (end - t) / f          # base-minutes of driving this period allows
        if remaining <= coverable:
            return t + remaining * f - depart_min
        remaining -= coverable
        t = end
    return t + remaining * factor_at(t) - depart_min


def profile() -> List[dict]:
    """The active profile for clients (the frontend mirrors it for instant local estimates)."""
    return [{"from": f"{s // 60:02d}:{s % 60:02d}", "factor": f if settings.TRAFFIC_MODEL else 1.0} for s, f in PROFILE]
