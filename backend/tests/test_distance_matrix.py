"""
test_distance_matrix.py - Haversine Distance & Travel Duration Engine Tests (US-003 / US-004, Track A: Manthan Nimodiya)

Covers:
- Haversine accuracy against known geodesic reference values
- Detour (circuity) factor bands and vehicle-specific travel times
- Matrix properties: zero diagonal, symmetry, triangle inequality, agreement with the scalar functions
- LRU caching behaviour and the < 5 s solver budget (matrix build must be a tiny fraction of it)
- REST API: /routes/distance-matrix response shape and validation
"""

import time

import numpy as np
import pytest

from app.services.optimizer.distance_matrix import (
    EARTH_RADIUS_KM,
    average_speed_kmh,
    build_distance_matrix,
    cache_stats,
    clear_cache,
    detour_factor,
    haversine_km,
    nearest_neighbours,
    road_distance_km,
    travel_minutes,
)

MUMBAI_HUB = (19.1136, 72.8697)
NAVI_MUMBAI_HUB = (19.0760, 72.9986)
PUNE_HUB = (18.5913, 73.7389)
BKC = (19.0660, 72.8650)
NARIMAN_POINT = (18.9256, 72.8242)


@pytest.fixture(autouse=True)
def fresh_cache():
    clear_cache()
    yield
    clear_cache()


# ==================== HAVERSINE ==================== #
def test_one_degree_of_latitude_matches_spherical_arc_length():
    assert haversine_km(0, 0, 1, 0) == pytest.approx(EARTH_RADIUS_KM * np.pi / 180, rel=1e-9)


def test_london_to_paris_reference_distance():
    assert haversine_km(51.5074, -0.1278, 48.8566, 2.3522) == pytest.approx(343.6, abs=0.5)


def test_haversine_is_symmetric_and_zero_for_same_point():
    assert haversine_km(*MUMBAI_HUB, *PUNE_HUB) == pytest.approx(haversine_km(*PUNE_HUB, *MUMBAI_HUB))
    assert haversine_km(*BKC, *BKC) == 0.0


def test_antipodal_points_do_not_break_the_formula():
    assert haversine_km(0, 0, 0, 180) == pytest.approx(np.pi * EARTH_RADIUS_KM, rel=1e-9)


# ==================== DETOUR & DURATION ==================== #
@pytest.mark.parametrize("km, factor", [(0, 1.45), (5, 1.38), (15, 1.34), (100, 1.22), (300, 1.18), (900, 1.18)])
def test_detour_factor_interpolates_between_anchors(km, factor):
    assert detour_factor(km) == pytest.approx(factor)


def test_longer_legs_never_get_shorter_road_distance_or_drive_time():
    """Regression: stepped bands made a 5.3 km leg faster than a 3.8 km one. Interpolation must stay monotonic."""
    legs = np.arange(0.0, 1000.0, 0.05)
    road = [km * detour_factor(km) for km in legs]
    minutes = [km * detour_factor(km) / average_speed_kmh(km) for km in legs]
    assert np.all(np.diff(road) >= 0)
    assert np.all(np.diff(minutes) >= 0)


def test_road_distance_is_longer_than_straight_line():
    straight = haversine_km(*MUMBAI_HUB, *PUNE_HUB)
    assert road_distance_km(*MUMBAI_HUB, *PUNE_HUB) == pytest.approx(straight * detour_factor(straight))


def test_heavier_vehicles_take_longer_on_the_same_leg():
    van = travel_minutes(*MUMBAI_HUB, *PUNE_HUB, vehicle_type="VAN")
    semi = travel_minutes(*MUMBAI_HUB, *PUNE_HUB, vehicle_type="SEMI_TRUCK")
    assert semi > van
    assert average_speed_kmh(200, "SEMI_TRUCK") < average_speed_kmh(200, "VAN")


def test_mumbai_to_pune_estimate_is_realistic():
    """~108 km great-circle; a plausible road estimate is 120-160 km and 2-3.5 hours for a van."""
    assert 120 <= road_distance_km(*MUMBAI_HUB, *PUNE_HUB) <= 160
    assert 120 <= travel_minutes(*MUMBAI_HUB, *PUNE_HUB) <= 210


# ==================== MATRIX ==================== #
def test_matrix_properties_and_agreement_with_scalar_functions():
    points = [MUMBAI_HUB, NAVI_MUMBAI_HUB, PUNE_HUB, BKC, NARIMAN_POINT]
    m = build_distance_matrix(points, vehicle_type="BOX_TRUCK")
    assert m.size == 5
    for grid in (m.straight_km, m.distance_km, m.duration_min):
        assert np.all(np.diag(grid) == 0)
        assert np.allclose(grid, grid.T)
    # triangle inequality holds for the geodesic metric
    n = m.size
    for i in range(n):
        for j in range(n):
            assert np.all(m.straight_km[i, j] <= m.straight_km[i, :] + m.straight_km[:, j] + 1e-9)
    assert m.distance_km[0, 2] == pytest.approx(road_distance_km(*MUMBAI_HUB, *PUNE_HUB))
    assert m.duration_min[0, 2] == pytest.approx(travel_minutes(*MUMBAI_HUB, *PUNE_HUB, vehicle_type="BOX_TRUCK"))


def test_nearest_neighbours_orders_by_road_distance():
    points = [MUMBAI_HUB, PUNE_HUB, BKC, NAVI_MUMBAI_HUB]
    m = build_distance_matrix(points)
    assert nearest_neighbours(m, 0) == [2, 3, 1]  # BKC, Navi Mumbai, then Pune
    assert nearest_neighbours(m, 0, k=1) == [2]


def test_identical_point_sets_are_served_from_cache():
    points = [MUMBAI_HUB, BKC, NARIMAN_POINT]
    first = build_distance_matrix(points)
    second = build_distance_matrix([(lat + 1e-9, lon) for lat, lon in points])  # float noise rounds away
    assert second is first
    assert cache_stats()["hits"] == 1 and cache_stats()["misses"] == 1
    assert build_distance_matrix(points, vehicle_type="SEMI_TRUCK") is not first  # vehicle type is part of the key
    with pytest.raises(ValueError):
        first.distance_km[0, 1] = 0.0  # cached matrices are read-only


def test_200_point_matrix_builds_well_within_solver_budget():
    rng = np.random.default_rng(42)
    points = [(19.0 + rng.random() * 0.5, 72.8 + rng.random() * 0.5) for _ in range(200)]
    started = time.perf_counter()
    build_distance_matrix(points)
    assert (time.perf_counter() - started) < 0.5


# ==================== REST API ==================== #
def _payload(points, vehicle_type="VAN"):
    return {
        "vehicle_type": vehicle_type,
        "points": [{"id": f"p{i}", "latitude": lat, "longitude": lon} for i, (lat, lon) in enumerate(points)],
    }


def test_distance_matrix_endpoint_returns_square_matrices(client):
    response = client.post("/api/v1/routes/distance-matrix", json=_payload([MUMBAI_HUB, BKC, PUNE_HUB]))
    assert response.status_code == 200
    data = response.json()
    assert data["ids"] == ["p0", "p1", "p2"]
    for key in ("straight_km", "distance_km", "duration_min"):
        assert len(data[key]) == 3 and all(len(row) == 3 for row in data[key])
        assert data[key][0][0] == 0
    assert data["distance_km"][0][2] > data["straight_km"][0][2]
    assert data["cache"]["misses"] >= 1


def test_distance_matrix_endpoint_validation(client):
    url = "/api/v1/routes/distance-matrix"
    assert client.post(url, json=_payload([MUMBAI_HUB])).status_code == 422  # needs at least 2 points
    assert client.post(url, json=_payload([MUMBAI_HUB, (95.0, 72.0)])).status_code == 422  # invalid latitude
    assert client.post(url, json=_payload([MUMBAI_HUB, BKC], vehicle_type="BICYCLE")).status_code == 422
    duplicate = _payload([MUMBAI_HUB, BKC])
    duplicate["points"][1]["id"] = "p0"
    assert client.post(url, json=duplicate).status_code == 422
