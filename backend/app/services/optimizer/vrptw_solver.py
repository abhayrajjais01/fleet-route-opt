"""
vrptw_solver.py - Deterministic VRPTW Solver (US-003, Week 6, Track A: Manthan Nimodiya)

Vehicle Routing Problem with Time Windows: assign delivery stops to vehicles and order them so total road
distance is minimised, while HARD constraints always hold:
  - payload (kg) and volume (m³) never exceed the vehicle's capacity
  - every stop is reached before its window closes (arriving early means waiting until it opens)
  - each route returns to the hub within the driver's shift limit

Algorithm (classic construction + improvement heuristics; VRPTW is NP-hard, so no exact search):
  1. Clarke-Wright savings: start with one route per stop and repeatedly merge the pair of routes with the
     largest saving  s(i,j) = d(hub,i) + d(hub,j) - d(i,j)  whenever the merged route stays feasible.
  2. Fleet fitting: routes are matched to vehicles largest-load-first (best-fit). If there are more routes than
     vehicles, stops from leftover routes are re-inserted at their cheapest feasible position; anything that
     still cannot fit is reported as unassigned with a reason (PRD state OPTIMIZATION_FAILED for that stop).
  3. 2-opt: inside each route, reverse a segment whenever it lowers the route cost and stays feasible.

Route cost = road km + TIME_WEIGHT x route minutes (waiting included). Distance alone treats idle time as free,
so a van would happily wait an hour outside a closed window; charging for driver time prevents that.

Distances and drive times come from the cached distance-matrix engine, so the solver itself only does
integer index work. The separate-trips baseline (one round trip per stop) is reported for comparison.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from app.services.optimizer.distance_matrix import build_distance_matrix

TIME_WEIGHT = 0.3  # km-equivalent cost per route minute (driver time); 1 h idle ≈ 18 km of driving


@dataclass(frozen=True)
class Stop:
    id: str
    lat: float
    lon: float
    weight_kg: float
    volume_m3: float
    window_open: int        # minutes after midnight
    window_close: int
    service_min: int = 10


@dataclass(frozen=True)
class VehicleSpec:
    id: str
    capacity_kg: float
    capacity_m3: float
    vehicle_type: str = "VAN"
    max_shift_min: int = 600


@dataclass
class Visit:
    stop_id: str
    arrival: float
    start: float            # service start (after any wait)
    departure: float
    wait: float


@dataclass
class Route:
    vehicle_id: str
    stops: List[str]
    visits: List[Visit]
    distance_km: float
    duration_min: float
    return_min: float
    load_kg: float
    load_m3: float
    utilisation: float      # max(weight, volume) share of capacity


@dataclass
class Solution:
    routes: List[Route]
    unassigned: Dict[str, str]
    total_distance_km: float
    baseline_distance_km: float   # every stop as its own round trip
    compute_ms: float
    stats: Dict[str, int] = field(default_factory=dict)


class _Problem:
    """Index-based view: node 0 is the hub, nodes 1..n are stops."""

    def __init__(self, hub: Tuple[float, float], stops: Sequence[Stop], vehicles: Sequence[VehicleSpec], depart_min: int):
        self.stops = list(stops)
        self.vehicles = list(vehicles)
        self.depart = depart_min
        points = [hub] + [(s.lat, s.lon) for s in stops]
        self.dist = np.asarray(build_distance_matrix(points, "VAN").distance_km)
        self._dur: Dict[str, np.ndarray] = {}
        self._points = points

    def dur(self, vehicle_type: str) -> np.ndarray:
        if vehicle_type not in self._dur:
            self._dur[vehicle_type] = np.asarray(build_distance_matrix(self._points, vehicle_type).duration_min)
        return self._dur[vehicle_type]

    def load(self, route: Sequence[int]) -> Tuple[float, float]:
        return (sum(self.stops[i - 1].weight_kg for i in route), sum(self.stops[i - 1].volume_m3 for i in route))

    def length(self, route: Sequence[int]) -> float:
        path = [0, *route, 0]
        return float(sum(self.dist[a, b] for a, b in zip(path, path[1:])))

    def schedule(self, route: Sequence[int], vehicle_type: str, max_shift: int) -> Optional[Tuple[List[Visit], float]]:
        """Simulates the route; returns visits and return time, or None if any time constraint breaks."""
        d = self.dur(vehicle_type)
        t, prev, visits = float(self.depart), 0, []
        for node in route:
            s = self.stops[node - 1]
            arrival = t + d[prev, node]
            if arrival > s.window_close:
                return None
            start = max(arrival, s.window_open)
            t = start + s.service_min
            visits.append(Visit(s.id, arrival, start, t, start - arrival))
            prev = node
        back = t + d[prev, 0]
        if back - self.depart > max_shift:
            return None
        return visits, back

    def cost(self, route: Sequence[int], v: "VehicleSpec") -> float:
        sched = self.schedule(route, v.vehicle_type, v.max_shift_min)
        if sched is None:
            return float("inf")
        return self.length(route) + TIME_WEIGHT * (sched[1] - self.depart)

    def fits(self, route: Sequence[int], v: VehicleSpec) -> bool:
        kg, m3 = self.load(route)
        return kg <= v.capacity_kg + 1e-9 and m3 <= v.capacity_m3 + 1e-9 and self.schedule(route, v.vehicle_type, v.max_shift_min) is not None


def _clarke_wright(p: _Problem, nodes: List[int], cap: VehicleSpec) -> List[List[int]]:
    routes: Dict[int, List[int]] = {i: [i] for i in nodes}   # route id = first node it was created for
    where = {i: i for i in nodes}                            # node -> route id
    savings = sorted(
        ((p.dist[0, i] + p.dist[0, j] - p.dist[i, j], i, j) for a, i in enumerate(nodes) for j in nodes[a + 1:]),
        key=lambda x: (-x[0], x[1], x[2]),
    )
    for s, i, j in savings:
        if s <= 0:
            break
        ri, rj = where[i], where[j]
        if ri == rj:
            continue
        a, b = routes[ri], routes[rj]
        # i and j must be route endpoints; try the orientations that make them adjacent.
        candidates = []
        if a[-1] == i and b[0] == j: candidates.append(a + b)
        if b[-1] == j and a[0] == i: candidates.append(b + a)
        if a[-1] == i and b[-1] == j: candidates.append(a + b[::-1])
        if a[0] == i and b[0] == j: candidates.append(a[::-1] + b)
        for merged in candidates:
            if p.fits(merged, cap):
                routes[ri] = merged
                del routes[rj]
                for n in merged:
                    where[n] = ri
                break
    return list(routes.values())


def _two_opt(p: _Problem, route: List[int], v: VehicleSpec) -> List[int]:
    best, best_cost, improved = route, p.cost(route, v), True
    while improved:
        improved = False
        for i in range(len(best) - 1):
            for k in range(i + 1, len(best)):
                cand = best[:i] + best[i:k + 1][::-1] + best[k + 1:]
                cand_cost = p.cost(cand, v)  # inf when infeasible
                if cand_cost < best_cost - 1e-9:
                    best, best_cost, improved = cand, cand_cost, True
    return best


def _cheapest_insertion(p: _Problem, node: int, routes: List[Tuple[VehicleSpec, List[int]]]) -> bool:
    best: Optional[Tuple[float, int, List[int]]] = None
    for r_idx, (v, route) in enumerate(routes):
        base = p.cost(route, v)
        options = [route[:pos] + [node] + route[pos:] for pos in range(len(route) + 1)]
        # Also try re-sequencing the whole route by deadline (earliest window close first), which often
        # opens room that no single insertion position can.
        options.append(sorted(route + [node], key=lambda n: (p.stops[n - 1].window_close, p.stops[n - 1].window_open, n)))
        for cand in options:
            if p.fits(cand, v):
                delta = p.cost(cand, v) - base
                if best is None or delta < best[0]:
                    best = (delta, r_idx, cand)
    if best is None:
        return False
    _, r_idx, cand = best
    routes[r_idx] = (routes[r_idx][0], cand)
    return True


def _separate_trips_km(p: _Problem, nodes: List[int]) -> float:
    """Clarke-Wright's reference point: every stop served by its own hub round trip."""
    return float(sum(p.dist[0, n] + p.dist[n, 0] for n in nodes))


def solve(hub: Tuple[float, float], stops: Sequence[Stop], vehicles: Sequence[VehicleSpec], depart_min: int = 8 * 60) -> Solution:
    started = time.perf_counter()
    if not vehicles:
        raise ValueError("At least one vehicle is required")
    p = _Problem(hub, stops, vehicles, depart_min)
    unassigned: Dict[str, str] = {}

    # Stops no vehicle could ever serve alone are rejected up front with a concrete reason.
    biggest = max(vehicles, key=lambda v: (v.capacity_kg, v.capacity_m3))
    nodes: List[int] = []
    for idx, s in enumerate(stops, start=1):
        if not any(s.weight_kg <= v.capacity_kg and s.volume_m3 <= v.capacity_m3 for v in vehicles):
            unassigned[s.id] = f"{s.weight_kg:g} kg / {s.volume_m3:g} m³ exceeds every vehicle's capacity"
        elif not any(p.schedule([idx], v.vehicle_type, v.max_shift_min) for v in vehicles):
            unassigned[s.id] = "cannot be reached before its window closes"
        else:
            nodes.append(idx)

    # 1. Savings construction against the largest vehicle, 2. fit routes onto the actual fleet.
    candidate_routes = sorted(_clarke_wright(p, nodes, biggest), key=lambda r: (-p.load(r)[0], r))
    free = sorted(vehicles, key=lambda v: (v.capacity_kg, v.capacity_m3))
    assigned: List[Tuple[VehicleSpec, List[int]]] = []
    leftovers: List[int] = []
    for r in candidate_routes:
        v = next((v for v in free if p.fits(r, v)), None)   # best fit: smallest vehicle that works
        if v is None:
            leftovers.extend(r)
            continue
        free.remove(v)
        assigned.append((v, r))
    for node in sorted(leftovers, key=lambda n: -stops[n - 1].weight_kg):
        if not _cheapest_insertion(p, node, assigned):
            if free:
                v = next((v for v in free if p.fits([node], v)), None)
                if v:
                    free.remove(v)
                    assigned.append((v, [node]))
                    continue
            unassigned[stops[node - 1].id] = "no vehicle left with capacity and time to serve it"

    # 3. 2-opt polish and final schedule.
    routes: List[Route] = []
    for v, r in assigned:
        r = _two_opt(p, r, v)
        visits, back = p.schedule(r, v.vehicle_type, v.max_shift_min)  # type: ignore[misc]
        kg, m3 = p.load(r)
        routes.append(Route(
            vehicle_id=v.id, stops=[stops[n - 1].id for n in r], visits=visits,
            distance_km=round(p.length(r), 3), duration_min=round(back - depart_min, 1), return_min=round(back, 1),
            load_kg=kg, load_m3=m3, utilisation=round(max(kg / v.capacity_kg, m3 / v.capacity_m3), 4),
        ))
    routes.sort(key=lambda r: r.vehicle_id)
    served = [i for i in nodes if stops[i - 1].id not in unassigned]
    return Solution(
        routes=routes,
        unassigned=unassigned,
        total_distance_km=round(sum(r.distance_km for r in routes), 3),
        baseline_distance_km=round(_separate_trips_km(p, served), 3),
        compute_ms=round((time.perf_counter() - started) * 1000, 2),
        stats={"stops": len(stops), "vehicles": len(vehicles), "routes": len(routes), "unassigned": len(unassigned)},
    )
