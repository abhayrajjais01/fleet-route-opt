"""
executive_analytics.py - Executive KPI Analytics (US-008, Week 12 · Track B: Abhayraj Jaiswal)

Builds the executive dashboard from completed-trip records:
  - headline KPIs (on-time delivery %, OTIF %, total cost, fleet utilisation %, total distance, deliveries)
    with the change against the previous period of the same length
  - daily delivery volume and on-time trend
  - SLA compliance by time of day (hour of arrival)
  - driver efficiency comparison

The maths reuses the operational metrics engine (Track A, services/analytics/metrics.py) so the executive view,
the Reports page and the CSV/PDF exports always agree. Until completed trips are persisted, the data source is
the simulated dispatch history (services/analytics/history.py), and every response says so.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Dict, List, Optional, Sequence

from app.services.analytics.history import simulated_history
from app.services.analytics.metrics import (
    DEFAULT_DRIVER_COST_PER_HOUR,
    DEFAULT_FUEL_PRICE_PER_L,
    Metrics,
    TripRecord,
    compute_metrics,
    filter_trips,
)

MAX_RANGE_DAYS = 90
SOURCE = "Simulated dispatch history (replayed through the VRPTW solver and ETA engine)"

# KPI cards in display order, with whether a higher value is better (drives the up/down colouring).
KPI_FIELDS = {
    "on_time_pct": True,
    "otif_pct": True,
    "deliveries": True,
    "total_cost": False,
    "cost_per_delivery": False,
    "fleet_utilisation_pct": True,
    "total_km": False,
    "failed_pct": False,
}


class InvalidRange(ValueError):
    pass


@dataclass(frozen=True)
class Period:
    date_from: date
    date_to: date

    @property
    def days(self) -> int:
        return (self.date_to - self.date_from).days + 1

    def previous(self) -> "Period":
        end = self.date_from - timedelta(days=1)
        return Period(end - timedelta(days=self.days - 1), end)


def resolve_period(date_from: Optional[date], date_to: Optional[date], today: Optional[date] = None) -> Period:
    """Default: the 30 days ending yesterday. History exists up to yesterday, for at most 90 days per request."""
    yesterday = (today or date.today()) - timedelta(days=1)
    end = date_to or yesterday
    start = date_from or end - timedelta(days=29)
    if end > yesterday:
        raise InvalidRange(f"date_to must be on or before {yesterday.isoformat()} (history ends yesterday).")
    if start > end:
        raise InvalidRange("date_from must be on or before date_to.")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise InvalidRange(f"The date range can be at most {MAX_RANGE_DAYS} days.")
    return Period(start, end)


def period_trips(period: Period, hub: Optional[str] = None, vehicle_type: Optional[str] = None) -> List[TripRecord]:
    return filter_trips(simulated_history(period.days, period.date_to), hub=hub, vehicle_type=vehicle_type)


def _kpis(trips: Sequence[TripRecord], m: Metrics) -> Dict[str, float]:
    deliveries = sum(1 for t in trips for s in t.stops if s.delivered)
    return {
        "on_time_pct": m.on_time_pct,
        "otif_pct": m.otif_pct,
        "deliveries": float(deliveries),
        "total_cost": m.total_cost,
        "cost_per_delivery": round(m.total_cost / deliveries, 1) if deliveries else 0.0,
        "fleet_utilisation_pct": m.fleet_utilisation_pct,
        "total_km": m.total_km,
        "failed_pct": m.failed_pct,
    }


def kpi_cards(current: Sequence[TripRecord], previous: Sequence[TripRecord]) -> List[Dict]:
    now = _kpis(current, compute_metrics(current))
    before = _kpis(previous, compute_metrics(previous)) if previous else {}
    cards = []
    for key, higher_is_better in KPI_FIELDS.items():
        prev = before.get(key)
        change = round(now[key] - prev, 1) if prev is not None else None
        change_pct = round((now[key] - prev) / prev * 100, 1) if prev else None
        cards.append({"key": key, "value": now[key], "previous": prev, "change": change, "change_pct": change_pct,
                      "higher_is_better": higher_is_better})
    return cards


def daily_trend(trips: Sequence[TripRecord], period: Period) -> List[Dict]:
    by_day: Dict[str, List[TripRecord]] = defaultdict(list)
    for t in trips:
        by_day[t.date].append(t)
    out = []
    for i in range(period.days):                                   # every day, even ones with no trips
        day = (period.date_from + timedelta(days=i)).isoformat()
        ts = by_day.get(day, [])
        stops = [s for t in ts for s in t.stops]
        m = compute_metrics(ts)
        on_time = sum(s.on_time for s in stops)
        failed = sum(not s.delivered for s in stops)
        out.append({"date": day, "stops": len(stops), "deliveries": sum(s.delivered for s in stops),
                    "on_time": on_time, "late": len(stops) - on_time - failed, "failed": failed,
                    "on_time_pct": m.on_time_pct if stops else None,
                    "cost": m.total_cost, "km": m.total_km})
    return out


def sla_by_hour(trips: Sequence[TripRecord]) -> List[Dict]:
    """Stops grouped by the hour they were reached (or, if never reached, the hour their window closed)."""
    buckets: Dict[int, Dict[str, int]] = defaultdict(lambda: {"stops": 0, "on_time": 0, "late": 0, "failed": 0})
    for t in trips:
        for s in t.stops:
            minute = s.arrival if s.arrival is not None else s.window_close
            b = buckets[int(minute // 60) % 24]
            b["stops"] += 1
            if not s.delivered:
                b["failed"] += 1
            elif s.on_time:
                b["on_time"] += 1
            else:
                b["late"] += 1
    return [{"hour": h, **b, "on_time_pct": round(100.0 * b["on_time"] / b["stops"], 1) if b["stops"] else None}
            for h, b in sorted(buckets.items())]


def driver_efficiency(trips: Sequence[TripRecord],
                      fuel_price_per_l: float = DEFAULT_FUEL_PRICE_PER_L,
                      driver_cost_per_hour: float = DEFAULT_DRIVER_COST_PER_HOUR) -> List[Dict]:
    groups: Dict[str, List[TripRecord]] = defaultdict(list)
    for t in trips:
        groups[t.driver].append(t)
    rows = []
    for driver, ts in groups.items():
        m = compute_metrics(ts, fuel_price_per_l, driver_cost_per_hour)
        hours = sum(t.duration_min for t in ts) / 60
        delivered = sum(1 for t in ts for s in t.stops if s.delivered)
        rows.append({
            "driver": driver,
            "vehicle_types": sorted({t.vehicle_type for t in ts}),
            "hubs": sorted({t.hub for t in ts}),
            "trips": m.trips,
            "stops": m.stops,
            "deliveries": delivered,
            "on_time_pct": m.on_time_pct,
            "stops_per_hour": round(m.stops / hours, 2) if hours else 0.0,
            "km_per_stop": round(m.total_km / m.stops, 1) if m.stops else 0.0,
            "cost_per_delivery": round(m.total_cost / delivered, 1) if delivered else 0.0,
            "utilisation_pct": m.fleet_utilisation_pct,
        })
    rows.sort(key=lambda r: (-r["on_time_pct"], -r["stops_per_hour"]))
    for rank, r in enumerate(rows, 1):
        r["rank"] = rank
    return rows


def filter_options() -> Dict[str, List[str]]:
    everything = simulated_history(30)
    return {"hubs": sorted({t.hub for t in everything}), "vehicle_types": sorted({t.vehicle_type for t in everything})}


def executive_report(period: Period, hub: Optional[str] = None, vehicle_type: Optional[str] = None) -> Dict:
    current = period_trips(period, hub, vehicle_type)
    prev_period = period.previous()
    previous = period_trips(prev_period, hub, vehicle_type)
    return {
        "source": SOURCE,
        "period": {"date_from": period.date_from.isoformat(), "date_to": period.date_to.isoformat(), "days": period.days},
        "previous_period": {"date_from": prev_period.date_from.isoformat(), "date_to": prev_period.date_to.isoformat(), "days": prev_period.days},
        "filters": {"hub": hub, "vehicle_type": vehicle_type},
        "kpis": kpi_cards(current, previous),
        "daily": daily_trend(current, period),
        "sla_by_hour": sla_by_hour(current),
        "drivers": driver_efficiency(current),
        "options": filter_options(),
        "assumptions": {"fuel_price_per_l": DEFAULT_FUEL_PRICE_PER_L, "driver_cost_per_hour": DEFAULT_DRIVER_COST_PER_HOUR},
    }
