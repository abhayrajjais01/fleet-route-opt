"""
routes.py - RESTful API Endpoints for Route Optimization (US-003 / US-004, Track A: Manthan Nimodiya)

Endpoints:
- POST /routes/distance-matrix: Pairwise haversine, detour-corrected road distance and travel-time matrices
  for up to 250 points (hubs + delivery stops). This is the cost input for the VRPTW solver (Week 6) and
  powers the distance panel on the Network Map.
"""

import time
from fastapi import APIRouter

from app.schemas.route import DistanceMatrixRequest, DistanceMatrixResponse
from app.services.optimizer.distance_matrix import build_distance_matrix, cache_stats

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
