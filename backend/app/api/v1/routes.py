"""
routes.py - RESTful API Endpoints for Route Optimization (US-003 / US-004, Track A: Manthan Nimodiya)

Endpoints:
- POST /routes/optimize: VRPTW solver (Clarke-Wright savings + 2-opt) with capacity, time-window and
  shift-limit hard constraints; returns sequenced routes with ETAs (Week 6).
- POST /routes/distance-matrix: Pairwise haversine, detour-corrected road distance and travel-time matrices
  for up to 250 points (hubs + delivery stops). This is the cost input for the VRPTW solver (Week 6) and
  powers the distance panel on the Network Map.
"""

import time
from fastapi import APIRouter

from app.schemas.route import (
    DistanceMatrixRequest,
    DistanceMatrixResponse,
    OptimizeRequest,
    OptimizeResponse,
    RouteResponse,
    VisitResponse,
)
from app.services.optimizer.distance_matrix import build_distance_matrix, cache_stats
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec, solve

router = APIRouter()


@router.post("/distance-matrix", response_model=DistanceMatrixResponse, summary="Compute distance & duration matrix")
def compute_distance_matrix(request: DistanceMatrixRequest):
    """
    Returns three n x n matrices ordered like `points`: straight-line km, estimated road km and driving minutes.
    Identical point sets are served from the in-memory LRU cache (see `cache.hits`).
    """
    started = time.perf_counter()
    matrix = build_distance_matrix(
        [(p.latitude, p.longitude) for p in request.points], vehicle_type=request.vehicle_type.value
    )
    computed_ms = (time.perf_counter() - started) * 1000

    return DistanceMatrixResponse(
        ids=[p.id for p in request.points],
        vehicle_type=request.vehicle_type,
        straight_km=matrix.straight_km.round(3).tolist(),
        distance_km=matrix.distance_km.round(3).tolist(),
        duration_min=matrix.duration_min.round(1).tolist(),
        computed_ms=round(computed_ms, 3),
        cache=cache_stats(),
    )


def _hhmm(text: str) -> int:
    h, m = text.split(":")
    return int(h) * 60 + int(m)


def _clock(minutes: float) -> str:
    m = int(round(minutes)) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


@router.post("/optimize", response_model=OptimizeResponse, summary="Solve VRPTW for a batch of stops")
def optimize_routes(request: OptimizeRequest):
    """
    Builds vehicle routes that never exceed payload/volume, reach every stop inside its time window and return
    within the driver's shift. Stops that cannot be served are listed in `unassigned` with the reason.
    """
    solution = solve(
        hub=(request.hub.latitude, request.hub.longitude),
        stops=[Stop(s.id, s.latitude, s.longitude, s.weight_kg, s.volume_m3, _hhmm(s.window_start), _hhmm(s.window_end), s.service_min) for s in request.stops],
        vehicles=[VehicleSpec(v.id, v.capacity_kg, v.capacity_m3, v.vehicle_type.value, int(v.max_shift_hours * 60)) for v in request.vehicles],
        depart_min=_hhmm(request.departure),
    )
    baseline = solution.baseline_distance_km
    return OptimizeResponse(
        status="OPTIMIZATION_FAILED" if solution.unassigned else "ROUTE_PROPOSED",
        routes=[
            RouteResponse(
                vehicle_id=r.vehicle_id, stop_ids=r.stops,
                visits=[VisitResponse(stop_id=v.stop_id, arrival=_clock(v.arrival), service_start=_clock(v.start), departure=_clock(v.departure), wait_min=round(v.wait, 1)) for v in r.visits],
                distance_km=r.distance_km, duration_min=r.duration_min, return_time=_clock(r.return_min),
                load_kg=r.load_kg, load_m3=round(r.load_m3, 3), utilisation=r.utilisation,
            )
            for r in solution.routes
        ],
        unassigned=solution.unassigned,
        total_distance_km=solution.total_distance_km,
        separate_trips_km=baseline,
        saving_pct=round((1 - solution.total_distance_km / baseline) * 100, 1) if baseline else 0.0,
        compute_ms=solution.compute_ms,
    )
