"""
distance_matrix.py - Haversine Distance & Travel Duration Engine (US-003 / US-004, Track A: Manthan Nimodiya)

Produces the pairwise cost matrices the VRPTW solver (Week 6) consumes:
    distance_km[i][j]  - estimated ROAD distance from point i to point j
    duration_min[i][j] - estimated driving time for the selected vehicle type

How the estimate is built (no paid routing API, fully deterministic):
1. Great-circle distance with the haversine formula on a spherical Earth (mean radius 6371.0088 km).
2. Road detour correction: roads are never straight, so the great-circle distance is multiplied by a
   circuity factor. Short urban hops wind through streets far more than long highway legs, so the factor
   falls with distance (1.45 below 5 km down to 1.20 above 100 km), within the 1.2-1.4+ range typically
   reported in road-circuity studies.
3. Travel time: road distance / average speed for that distance band (city traffic vs. highway),
   scaled down for heavier vehicle classes.

Matrices are vectorised with NumPy (a 200 x 200 matrix takes a few ms) and memoised in an LRU cache keyed by
the rounded coordinates, so repeated solver calls for the same stop set cost nothing.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, List, Sequence, Tuple

import numpy as np

EARTH_RADIUS_KM = 6371.0088  # IUGG mean Earth radius

# (upper bound of straight-line distance in km, circuity factor, average speed in km/h)
# Bands are evaluated in order; the last band covers everything longer.
DISTANCE_BANDS: Tuple[Tuple[float, float, float], ...] = (
    (5.0, 1.45, 22.0),           # dense urban streets (e.g. inner Mumbai)
    (25.0, 1.35, 32.0),          # city arterials and suburbs
    (100.0, 1.25, 45.0),         # regional roads / expressway links
    (float("inf"), 1.20, 55.0),  # inter-city highway
)

# Heavier vehicles are slower than a light van on the same road.
VEHICLE_SPEED_FACTOR: Dict[str, float] = {
    "VAN": 1.00,
    "EV": 1.00,
    "BOX_TRUCK": 0.90,
    "SEMI_TRUCK": 0.80,
}

COORD_PRECISION = 6  # ~0.1 m; rounding keeps cache keys stable across float noise


# ==================== SCALAR HELPERS ==================== #
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two WGS-84 coordinates in kilometres."""
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = phi2 - phi1
    dlmb = np.radians(lon2 - lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlmb / 2) ** 2
    return float(2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(min(1.0, a))))


def detour_factor(straight_km: float) -> float:
    """Circuity factor for a leg of the given great-circle length."""
    return next(factor for limit, factor, _ in DISTANCE_BANDS if straight_km < limit)


def band_speed_kmh(straight_km: float, vehicle_type: str = "VAN") -> float:
    base = next(speed for limit, _, speed in DISTANCE_BANDS if straight_km < limit)
    return base * VEHICLE_SPEED_FACTOR.get(vehicle_type, 1.0)


def road_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    straight = haversine_km(lat1, lon1, lat2, lon2)
    return straight * detour_factor(straight)


def travel_minutes(lat1: float, lon1: float, lat2: float, lon2: float, vehicle_type: str = "VAN") -> float:
    straight = haversine_km(lat1, lon1, lat2, lon2)
    return straight * detour_factor(straight) / band_speed_kmh(straight, vehicle_type) * 60.0


# ==================== MATRIX ENGINE ==================== #
@dataclass(frozen=True)
class DistanceMatrix:
    straight_km: np.ndarray   # n x n great-circle distances
    distance_km: np.ndarray   # n x n detour-corrected road distances
    duration_min: np.ndarray  # n x n driving minutes for the vehicle type
    vehicle_type: str

    @property
    def size(self) -> int:
        return self.distance_km.shape[0]


def _haversine_matrix(coords: np.ndarray) -> np.ndarray:
    """All-pairs haversine distances for an (n, 2) array of [lat, lon] degrees, vectorised."""
    lat = np.radians(coords[:, 0])[:, None]
    lon = np.radians(coords[:, 1])[:, None]
    dphi = lat.T - lat
    dlmb = lon.T - lon
    a = np.sin(dphi / 2) ** 2 + np.cos(lat) * np.cos(lat.T) * np.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def _band_lookup(straight: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    limits = np.array([limit for limit, _, _ in DISTANCE_BANDS[:-1]])
    idx = np.searchsorted(limits, straight, side="right")
    factors = np.array([f for _, f, _ in DISTANCE_BANDS])[idx]
    speeds = np.array([s for _, _, s in DISTANCE_BANDS])[idx]
    return factors, speeds


@lru_cache(maxsize=256)
def _cached_matrix(coord_key: Tuple[Tuple[float, float], ...], vehicle_type: str) -> DistanceMatrix:
    coords = np.array(coord_key, dtype=np.float64)
    straight = _haversine_matrix(coords)
    factors, speeds = _band_lookup(straight)
    road = straight * factors
    duration = road / (speeds * VEHICLE_SPEED_FACTOR.get(vehicle_type, 1.0)) * 60.0
    for m in (straight, road, duration):
        np.fill_diagonal(m, 0.0)
        m.setflags(write=False)  # cached arrays are shared, so make them read-only
    return DistanceMatrix(straight_km=straight, distance_km=road, duration_min=duration, vehicle_type=vehicle_type)


def build_distance_matrix(points: Sequence[Tuple[float, float]], vehicle_type: str = "VAN") -> DistanceMatrix:
    """
    Builds (or fetches from cache) the distance/duration matrices for an ordered list of (lat, lon) points.
    Row/column i always refers to points[i], so callers keep their own id <-> index mapping.
    """
    if len(points) < 1:
        raise ValueError("At least one point is required")
    key = tuple((round(float(lat), COORD_PRECISION), round(float(lon), COORD_PRECISION)) for lat, lon in points)
    return _cached_matrix(key, vehicle_type)


def cache_stats() -> Dict[str, int]:
    info = _cached_matrix.cache_info()
    return {"hits": info.hits, "misses": info.misses, "entries": info.currsize, "max_entries": info.maxsize or 0}


def clear_cache() -> None:
    _cached_matrix.cache_clear()


def nearest_neighbours(matrix: DistanceMatrix, origin: int, k: int | None = None) -> List[int]:
    """Indices of the other points ordered by road distance from `origin` (useful for map previews & seeding)."""
    order = [int(i) for i in np.argsort(matrix.distance_km[origin], kind="mergesort") if i != origin]
    return order[:k] if k is not None else order
