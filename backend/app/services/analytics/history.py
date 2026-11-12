"""
history.py - Historical Dispatch Simulation (US-007, Weeks 13-14 · Track A)

The system does not yet store completed trips, so the analytics dashboard needs history to show. This module
replays past days through the REAL planning stack instead of inventing numbers:

  for each day and hub: generate that day's orders (seeded by the date, so every run gives the same history)
    -> plan them with the VRPTW solver on the hub's fleet
    -> execute each route with the ETA engine, injecting realistic disruptions
       (30% of routes hit a 10-45 min delay at a random stop; 3% of deliveries fail; 3% arrive short)
    -> record actual arrivals as TripRecords for the metrics engine

Everything is labelled "simulated history" in the API so it is never mistaken for real operations data.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import date, timedelta
from functools import lru_cache
from typing import List, Tuple

from app.services.analytics.metrics import StopRecord, TripRecord
from app.services.optimizer.distance_matrix import build_distance_matrix
from app.services.optimizer.eta_engine import recalculate
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec, solve


@dataclass(frozen=True)
class DemoVehicle:
    spec: VehicleSpec
    plate: str
    driver: str
    fuel_kpl: float


@dataclass(frozen=True)
class DemoHub:
    code: str
    lat: float
    lon: float
    radius_deg: float
    vehicles: Tuple[DemoVehicle, ...]


# Mirrors the demo fleet in the frontend seed data.
NETWORK: Tuple[DemoHub, ...] = (
    DemoHub("HUB-MUM-01", 19.1136, 72.8697, 0.11, (
        DemoVehicle(VehicleSpec("1", 1500, 12, "VAN", 480), "MH-02-EE-1001", "Rajesh Kumar", 14.2),
        DemoVehicle(VehicleSpec("2", 3500, 24.5, "BOX_TRUCK", 600), "MH-04-AB-2045", "Vikramjit Singh", 8.5),
    )),
    DemoHub("HUB-NV-02", 19.0760, 72.9986, 0.08, (
        DemoVehicle(VehicleSpec("3", 950, 8, "EV", 480), "MH-01-EV-8822", "Priya Mehta", 18.0),
        DemoVehicle(VehicleSpec("5", 2500, 18, "BOX_TRUCK", 540), "MH-43-BX-3310", "Neha Kulkarni", 9.2),
    )),
    DemoHub("HUB-PNQ-03", 18.5913, 73.7389, 0.09, (
        DemoVehicle(VehicleSpec("4", 8500, 55, "SEMI_TRUCK", 540), "MH-12-QQ-4001", "Suresh Reddy", 5.8),
    )),
)

WINDOWS = [(480, 660), (540, 720), (600, 840), (660, 900), (720, 1020), (540, 1080)]
PRIORITIES = ["LOW", "STANDARD", "STANDARD", "STANDARD", "HIGH", "EXPRESS"]
CUSTOMERS = ["Reliance Retail", "TCS Logistics", "Flipkart", "Amazon India", "HDFC Bank", "DMart", "Myntra", "Tata CLiQ",
             "Nykaa", "Godrej", "Big Basket", "Croma", "Decathlon", "Asian Paints", "Zepto", "Blinkit"]


def _day_orders(rng: random.Random, hub: DemoHub, day: str) -> List[Tuple[Stop, str, str]]:
    n = rng.randint(6, 11) if hub.code != "HUB-PNQ-03" else rng.randint(3, 6)
    out = []
    for i in range(n):
        open_, close = rng.choice(WINDOWS)
        stop = Stop(f"{day}-{hub.code[-2:]}-{i:02d}", hub.lat + rng.uniform(-hub.radius_deg, hub.radius_deg),
                    hub.lon + rng.uniform(-hub.radius_deg, hub.radius_deg), rng.randint(40, 450), round(rng.uniform(0.2, 3.5), 1), open_, close)
        out.append((stop, rng.choice(CUSTOMERS), rng.choice(PRIORITIES)))
    return out


def simulate_day(day: date) -> List[TripRecord]:
    key = day.isoformat()
    rng = random.Random(day.toordinal())
    trips: List[TripRecord] = []
    for hub in NETWORK:
        orders = _day_orders(rng, hub, key)
        stops = [o[0] for o in orders]
        meta = {o[0].id: o for o in orders}
        vehicles = {v.spec.id: v for v in hub.vehicles}
        depart = rng.choice([480, 495, 510])
        sol = solve((hub.lat, hub.lon), stops, [v.spec for v in hub.vehicles], depart)
        by_id = {s.id: s for s in stops}
        for route in sol.routes:
            v = vehicles[route.vehicle_id]
            seq = [by_id[sid] for sid in route.stops]
            plan = recalculate((hub.lat, hub.lon), seq, v.spec, depart)
            actual = plan
            if rng.random() < 0.30 and len(seq) > 1:
                k = rng.randrange(1, len(seq))            # delay strikes after stop k-1 is served
                done = {e.stop_id: e.departure for e in plan.stops[:k]}
                actual = recalculate((hub.lat, hub.lon), seq, v.spec, depart, now_min=plan.stops[k - 1].departure,
                                     completed=done, delay_min=rng.randint(10, 45))
            m = build_distance_matrix([(hub.lat, hub.lon)] + [(s.lat, s.lon) for s in seq], "VAN").distance_km
            separate = float(sum(m[0][i] + m[i][0] for i in range(1, len(seq) + 1)))
            records = []
            for e in actual.stops:
                s = by_id[e.stop_id]
                delivered = rng.random() >= 0.03
                records.append(StopRecord(
                    shipment_id=s.id, customer=meta[s.id][1], window_close=s.window_close, arrival=e.arrival,
                    delivered=delivered, in_full=delivered and rng.random() >= 0.03, weight_kg=s.weight_kg, priority=meta[s.id][2],
                ))
            trips.append(TripRecord(
                trip_id=f"{key}-{v.plate}", date=key, hub=hub.code, vehicle_id=v.plate, vehicle_type=v.spec.vehicle_type,
                driver=v.driver, distance_km=actual.distance_km, separate_trips_km=round(separate, 2),
                duration_min=actual.duration_min, load_kg=actual.load_kg, payload_kg=v.spec.capacity_kg, fuel_kpl=v.fuel_kpl,
                stops=records,
            ))
    return trips


@lru_cache(maxsize=32)
def simulated_history(days: int = 30, end: date | None = None) -> Tuple[TripRecord, ...]:
    """Trips for the `days` days ending yesterday (or `end`), oldest first. Cached: the history is deterministic."""
    end = end or (date.today() - timedelta(days=1))
    out: List[TripRecord] = []
    for i in range(days - 1, -1, -1):
        out.extend(simulate_day(end - timedelta(days=i)))
    return tuple(out)
