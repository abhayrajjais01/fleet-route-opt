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
  Driver cost            ordinary hours x wage + overtime hours x 2 x wage; overtime = trip time beyond an
                         8-hour shift (Motor Transport Workers Act, 1961 s.27: overtime at twice the ordinary rate)
  Energy                 diesel vehicles: litres = km / km-per-litre; EVs use electricity, not diesel:
                         kWh = km x 0.17 kWh/km (light commercial EV)
  CO2 (kg)               diesel 2.68 kg/L (combustion factor); EV 0.716 kg/kWh (India grid, CEA CO2 baseline)
  Savings vs separate    the same deliveries as one round trip per customer: separate-trip km at the same
                         km-per-litre and average speed as the real trip, minus the real trip

Cost inputs are assumptions with defaults (diesel ₹95/L, electricity ₹9/kWh, driver ₹250/h) that callers can
override.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from statistics import mean
from typing import Callable, Dict, Iterable, List, Optional

DEFAULT_FUEL_PRICE_PER_L = 95.0
DEFAULT_DRIVER_COST_PER_HOUR = 250.0
DEFAULT_ELECTRICITY_PER_KWH = 9.0
STANDARD_SHIFT_H = 8.0          # ordinary hours; beyond this is overtime
OVERTIME_MULTIPLIER = 2.0       # Motor Transport Workers Act, 1961 s.27
DIESEL_CO2_KG_PER_L = 2.68
EV_KWH_PER_KM = 0.17
GRID_CO2_KG_PER_KWH = 0.716


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
    latitude: Optional[float] = None   # delivery point (Week 13 Track B: density heatmap)
    longitude: Optional[float] = None

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
    def is_ev(self) -> bool:
        return self.vehicle_type == "EV"

    @property
    def fuel_l(self) -> float:
        """Diesel burnt; EVs burn none."""
        return 0.0 if self.is_ev else (self.distance_km / self.fuel_kpl if self.fuel_kpl else 0.0)

    @property
    def energy_kwh(self) -> float:
        return self.distance_km * EV_KWH_PER_KM if self.is_ev else 0.0

    @property
    def co2_kg(self) -> float:
        return self.fuel_l * DIESEL_CO2_KG_PER_L + self.energy_kwh * GRID_CO2_KG_PER_KWH

    @property
    def overtime_h(self) -> float:
        return max(0.0, self.duration_min / 60 - STANDARD_SHIFT_H)

    def costs(self, fuel_price_per_l: float, driver_cost_per_hour: float, electricity_per_kwh: float = DEFAULT_ELECTRICITY_PER_KWH) -> Dict[str, float]:
        hours = self.duration_min / 60
        driver = (hours - self.overtime_h) * driver_cost_per_hour + self.overtime_h * OVERTIME_MULTIPLIER * driver_cost_per_hour
        energy = self.fuel_l * fuel_price_per_l + self.energy_kwh * electricity_per_kwh
        # Baseline: one round trip per customer, same vehicle efficiency and average speed as this trip.
        scale = self.separate_trips_km / self.distance_km if self.distance_km else 0.0
        base_minutes = self.duration_min * scale
        base_ot = max(0.0, base_minutes / 60 - STANDARD_SHIFT_H)
        base_driver = (base_minutes / 60 - base_ot) * driver_cost_per_hour + base_ot * OVERTIME_MULTIPLIER * driver_cost_per_hour
        return {"energy": energy, "driver": driver, "total": energy + driver, "baseline_total": energy * scale + base_driver,
                "co2": self.co2_kg, "baseline_co2": self.co2_kg * scale}

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
    energy_cost: float = 0.0
    driver_cost: float = 0.0
    overtime_hours: float = 0.0
    overtime_cost: float = 0.0
    co2_kg: float = 0.0
    co2_kg_per_100km: float = 0.0
    saving_vs_separate: float = 0.0        # ₹ saved by consolidating versus one trip per customer
    co2_saved_kg: float = 0.0

    def as_dict(self) -> Dict[str, float]:
        return dict(self.__dict__)


def _pct(part: int, whole: int) -> float:
    return round(100.0 * part / whole, 1) if whole else 0.0


def compute_metrics(
    trips: Iterable[TripRecord],
    fuel_price_per_l: float = DEFAULT_FUEL_PRICE_PER_L,
    driver_cost_per_hour: float = DEFAULT_DRIVER_COST_PER_HOUR,
    electricity_per_kwh: float = DEFAULT_ELECTRICITY_PER_KWH,
) -> Metrics:
    trips = list(trips)
    stops = [s for t in trips for s in t.stops]
    delivered = [s for s in stops if s.delivered]
    km = sum(t.distance_km for t in trips)
    fuel = sum(t.fuel_l for t in trips)
    per_trip = [t.costs(fuel_price_per_l, driver_cost_per_hour, electricity_per_kwh) for t in trips]
    cost = sum(c["total"] for c in per_trip)
    ot_h = sum(t.overtime_h for t in trips)
    co2 = sum(c["co2"] for c in per_trip)
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
        energy_cost=round(sum(c["energy"] for c in per_trip), 0),
        driver_cost=round(sum(c["driver"] for c in per_trip), 0),
        overtime_hours=round(ot_h, 1),
        overtime_cost=round(ot_h * (OVERTIME_MULTIPLIER - 1) * driver_cost_per_hour, 0),
        co2_kg=round(co2, 1),
        co2_kg_per_100km=round(co2 / km * 100, 2) if km else 0.0,
        saving_vs_separate=round(sum(c["baseline_total"] - c["total"] for c in per_trip), 0),
        co2_saved_kg=round(sum(c["baseline_co2"] - c["co2"] for c in per_trip), 1),
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
