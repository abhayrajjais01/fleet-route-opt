"""
metrics.py - Operational Metrics Calculation Engine (US-007, Week 13 · Track A)

Pure functions over completed-trip records, so the same maths serves the live dashboard, CSV/PDF exports
and unit tests. Definitions (also returned by the API so the dashboard can show them):

  OTIF %                 stops delivered inside the window AND in full, / all stops attempted
  On-time %              stops whose actual arrival <= window close (failed stops count as not on time)
  In-full %              delivered stops with the complete quantity
  Avg transit (min)      mean trip duration, hub departure to hub return
  Route efficiency index separate-trip km / actual km  (1.0 = no consolidation; higher is better)
  Fuel burn index        litres per 100 km driven
  Cost per ton-km        (fuel + driver cost) / tonne-km moved; tonne-km = load (t) x km x 0.5, because a
                         multi-drop van carries a full load at the start and none at the end (linear unload)
  Fleet utilisation %    mean of (trip load / vehicle payload)
  SLA breach rate %      stops arriving after the window closed

Cost inputs are assumptions with defaults (diesel ₹95/L, driver ₹250/h) that callers can override.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from statistics import mean
from typing import Callable, Dict, Iterable, List, Optional

DEFAULT_FUEL_PRICE_PER_L = 95.0
DEFAULT_DRIVER_COST_PER_HOUR = 250.0


@dataclass(frozen=True)
class StopRecord:
    shipment_id: str
    customer: str
    window_close: int          # minutes after midnight
    arrival: Optional[float]   # None if never reached
    delivered: bool
    in_full: bool = True
    weight_kg: float = 0.0
    priority: str = "STANDARD"

    @property
    def on_time(self) -> bool:
        return self.delivered and self.arrival is not None and self.arrival <= self.window_close

    @property
    def otif(self) -> bool:
        return self.on_time and self.in_full


@dataclass(frozen=True)
class TripRecord:
    trip_id: str
    date: str                  # YYYY-MM-DD
    hub: str
    vehicle_id: str
    vehicle_type: str
    driver: str
    distance_km: float
    separate_trips_km: float
    duration_min: float
    load_kg: float
    payload_kg: float
    fuel_kpl: float
    stops: List[StopRecord] = field(default_factory=list)

    @property
    def fuel_l(self) -> float:
        return self.distance_km / self.fuel_kpl if self.fuel_kpl else 0.0

    @property
    def ton_km(self) -> float:
        return self.load_kg / 1000 * self.distance_km * 0.5


@dataclass
class Metrics:
    trips: int
    stops: int
    otif_pct: float
    on_time_pct: float
    in_full_pct: float
    sla_breach_pct: float
    failed_pct: float
    avg_transit_min: float
    route_efficiency_index: float
    total_km: float
    fuel_l: float
    fuel_l_per_100km: float
    total_cost: float
    cost_per_ton_km: float
    fleet_utilisation_pct: float

    def as_dict(self) -> Dict[str, float]:
        return dict(self.__dict__)


def _pct(part: int, whole: int) -> float:
    return round(100.0 * part / whole, 1) if whole else 0.0


def compute_metrics(
    trips: Iterable[TripRecord],
    fuel_price_per_l: float = DEFAULT_FUEL_PRICE_PER_L,
    driver_cost_per_hour: float = DEFAULT_DRIVER_COST_PER_HOUR,
) -> Metrics:
    trips = list(trips)
    stops = [s for t in trips for s in t.stops]
    delivered = [s for s in stops if s.delivered]
    km = sum(t.distance_km for t in trips)
    fuel = sum(t.fuel_l for t in trips)
    cost = fuel * fuel_price_per_l + sum(t.duration_min for t in trips) / 60 * driver_cost_per_hour
    ton_km = sum(t.ton_km for t in trips)
    return Metrics(
        trips=len(trips),
        stops=len(stops),
        otif_pct=_pct(sum(s.otif for s in stops), len(stops)),
        on_time_pct=_pct(sum(s.on_time for s in stops), len(stops)),
        in_full_pct=_pct(sum(s.in_full for s in delivered), len(delivered)),
        sla_breach_pct=_pct(sum(1 for s in stops if s.arrival is not None and s.arrival > s.window_close), len(stops)),
        failed_pct=_pct(sum(not s.delivered for s in stops), len(stops)),
        avg_transit_min=round(mean(t.duration_min for t in trips), 1) if trips else 0.0,
        route_efficiency_index=round(sum(t.separate_trips_km for t in trips) / km, 2) if km else 0.0,
        total_km=round(km, 1),
        fuel_l=round(fuel, 1),
        fuel_l_per_100km=round(fuel / km * 100, 2) if km else 0.0,
        total_cost=round(cost, 0),
        cost_per_ton_km=round(cost / ton_km, 2) if ton_km else 0.0,
        fleet_utilisation_pct=round(mean(min(1.0, t.load_kg / t.payload_kg) for t in trips if t.payload_kg) * 100, 1) if trips else 0.0,
    )


def breakdown(trips: Iterable[TripRecord], key: Callable[[TripRecord], str], **kwargs) -> Dict[str, Metrics]:
    groups: Dict[str, List[TripRecord]] = defaultdict(list)
    for t in trips:
        groups[key(t)].append(t)
    return {k: compute_metrics(v, **kwargs) for k, v in sorted(groups.items())}


def filter_trips(trips: Iterable[TripRecord], hub: Optional[str] = None, vehicle_type: Optional[str] = None,
                 driver: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None) -> List[TripRecord]:
    out = []
    for t in trips:
        if hub and t.hub != hub:
            continue
        if vehicle_type and t.vehicle_type != vehicle_type:
            continue
        if driver and t.driver != driver:
            continue
        if date_from and t.date < date_from:
            continue
        if date_to and t.date > date_to:
            continue
        out.append(t)
    return out
