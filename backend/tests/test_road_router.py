"""Road routing (OSRM): route paths, road distance matrix, timing model, circuit breaker and fallbacks. No network."""
import httpx
import numpy as np
import pytest

from app.core.config import settings
from app.services.optimizer import osrm_client, road_router
from app.services.optimizer.distance_matrix import build_distance_matrix, clear_cache, road_distance_km
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec, solve

HUB = (19.1136, 72.8697)
A = (19.0660, 72.8650)
B = (19.1176, 72.9060)


def _leg(km, minutes, coords):
    return {"distance": km * 1000, "duration": minutes * 60,
            "steps": [{"geometry": {"coordinates": [[lon, lat] for lat, lon in coords]}}]}


ROUTE = {
    "code": "Ok",
    "routes": [{"legs": [_leg(8.9, 10.0, [HUB, (19.09, 72.87), A]), _leg(9.6, 11.3, [A, (19.09, 72.89), B]), _leg(5.9, 7.0, [B, HUB])]}],
    "waypoints": [{"distance": 151.0}, {"distance": 85.0}, {"distance": 900.0}, {"distance": 151.0}],
}
# HUB, A, B. A -> B is longer than B -> A (one-way streets); B -> A is unroutable (null) to test the fallback.
TABLE = {
    "code": "Ok",
    "distances": [[0, 8900, 5900], [9100, 0, 9600], [6000, None, 0]],
    "durations": [[0, 600, 420], [610, 0, 680], [430, None, 0]],
}


class _Resp:
    def __init__(self, data, status=200):
        self._data, self.status_code = data, status

    def json(self):
        return self._data


@pytest.fixture
def osrm(monkeypatch):
    calls = []

    def fake_get(url, params=None):
        calls.append(url)
        return _Resp(TABLE if "/table/" in url else ROUTE)

    monkeypatch.setattr(settings, "ROAD_ROUTING", "osrm")
    monkeypatch.setattr(osrm_client, "_send", fake_get)
    osrm_client.reset()
    clear_cache()
    yield calls
    osrm_client.reset()
    clear_cache()


@pytest.fixture
def osrm_down(monkeypatch):
    calls = []

    def down(*a, **k):
        calls.append(1)
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(settings, "ROAD_ROUTING", "osrm")
    monkeypatch.setattr(osrm_client, "_send", down)
    osrm_client.reset()
    clear_cache()
    yield calls
    osrm_client.reset()
    clear_cache()


# ---------- road paths ----------
def test_route_uses_road_distance_and_geometry(osrm):
    r = road_router.road_route([HUB, A, B, HUB], "VAN")
    assert r.source == "osrm"
    assert [round(l.km, 1) for l in r.legs] == [8.9, 9.6, 5.9]
    assert r.legs[0].path[0] == HUB and r.legs[0].path[-1] == A and (19.09, 72.87) in r.legs[0].path
    assert "72.8697,19.1136" in osrm[0]  # OSRM takes lon,lat


def test_time_is_traffic_model_never_faster_than_free_flow(osrm):
    van = road_router.road_route([HUB, A, B, HUB], "VAN")
    truck = road_router.road_route([HUB, A, B, HUB], "SEMI_TRUCK")
    for leg, free_flow in zip(van.legs, (10.0, 11.3, 7.0)):
        assert leg.minutes >= free_flow
    assert all(t.minutes > v.minutes for t, v in zip(truck.legs, van.legs))


def test_route_is_fetched_once(osrm):
    road_router.road_route([HUB, A, HUB])
    road_router.road_route([HUB, A, HUB], "BOX_TRUCK")  # vehicle type changes timing, not the road
    assert len(osrm) == 1


def test_route_falls_back_to_estimate(osrm_down):
    r = road_router.road_route([HUB, A, HUB])
    assert r.source == "estimate"
    assert r.legs[0].path == [HUB, A]
    assert r.legs[0].km == pytest.approx(road_distance_km(*HUB, *A))


def test_routing_error_is_not_an_outage(monkeypatch):
    monkeypatch.setattr(settings, "ROAD_ROUTING", "osrm")
    monkeypatch.setattr(osrm_client, "_send", lambda *a, **k: _Resp({"code": "NoRoute"}, 400))
    osrm_client.reset()
    assert road_router.road_route([HUB, A]).source == "estimate"
    assert osrm_client.enabled()  # one unroutable request must not switch roads off for everyone


# ---------- road distance matrix ----------
def test_matrix_uses_directional_road_distances(osrm):
    m = build_distance_matrix([HUB, A, B])
    assert m.source == "osrm"
    assert m.distance_km[0][1] == pytest.approx(8.9) and m.distance_km[1][0] == pytest.approx(9.1)
    assert m.distance_km[1][2] == pytest.approx(9.6)
    assert np.all(np.diag(m.distance_km) == 0)


def test_unroutable_pair_keeps_the_estimate(osrm):
    m = build_distance_matrix([HUB, A, B])
    assert m.distance_km[2][1] == pytest.approx(road_distance_km(*B, *A))
    assert np.isfinite(m.duration_min).all()


def test_matrix_falls_back_when_osrm_is_down(osrm_down):
    m = build_distance_matrix([HUB, A, B])
    assert m.source == "estimate"
    assert m.distance_km[0][1] == pytest.approx(road_distance_km(*HUB, *A))


def test_circuit_breaker_stops_retrying(osrm_down):
    for _ in range(5):
        build_distance_matrix([HUB, A, B])
        road_router.road_route([HUB, B])
    assert len(osrm_down) == 1          # one timeout, then the breaker skips OSRM
    assert not osrm_client.enabled()


def test_offline_block_never_calls_osrm(osrm):
    with osrm_client.offline():
        assert build_distance_matrix([HUB, A, B]).source == "estimate"
        assert road_router.road_route([HUB, A]).source == "estimate"
    assert osrm == []
    assert build_distance_matrix([HUB, A, B]).source == "osrm"  # back on after the block


def test_solver_plans_on_road_distances(osrm):
    stops = [Stop("a", *A, 100, 1, 480, 1080), Stop("b", *B, 100, 1, 480, 1080)]
    sol = solve(HUB, stops, [VehicleSpec("v1", 1000, 10, "VAN", 600)], 480)
    assert sol.distance_source == "osrm"
    route = sol.routes[0]
    order = [HUB, *[{"a": A, "b": B}[s] for s in route.stops], HUB]
    expected = {(HUB, A): 8.9, (A, B): 9.6, (B, HUB): 6.0, (HUB, B): 5.9, (B, A): road_distance_km(*B, *A), (A, HUB): 9.1}
    assert route.distance_km == pytest.approx(sum(expected[(p, q)] for p, q in zip(order, order[1:])), abs=0.01)


# ---------- API ----------
def test_endpoint_flags_off_road_points(osrm, client):
    pts = [{"id": "hub", "latitude": HUB[0], "longitude": HUB[1]}, {"id": "a", "latitude": A[0], "longitude": A[1]},
           {"id": "b", "latitude": B[0], "longitude": B[1]}, {"id": "hub-back", "latitude": HUB[0], "longitude": HUB[1]}]
    body = client.post("/api/v1/routes/road-path", json={"points": pts, "vehicle_type": "VAN"}).json()
    assert body["source"] == "osrm" and len(body["legs"]) == 3
    assert body["total_km"] == pytest.approx(24.4, abs=0.05)
    assert body["off_road"] == ["b"]  # 900 m from the nearest road


def test_endpoint_works_offline(client):
    pts = [{"id": "hub", "latitude": HUB[0], "longitude": HUB[1]}, {"id": "a", "latitude": A[0], "longitude": A[1]}]
    body = client.post("/api/v1/routes/road-path", json={"points": pts}).json()
    assert body["source"] == "estimate" and body["legs"][0]["path"] == [list(HUB), list(A)]


def test_optimize_reports_distance_source(osrm, client):
    req = {"hub": {"id": "hub", "latitude": HUB[0], "longitude": HUB[1]},
           "stops": [{"id": sid, "latitude": p[0], "longitude": p[1], "weight_kg": 100, "volume_m3": 1, "window_start": "08:00", "window_end": "18:00"}
                     for sid, p in (("a", A), ("b", B))],
           "vehicles": [{"id": "v1", "capacity_kg": 1000, "capacity_m3": 10, "vehicle_type": "VAN"}]}
    body = client.post("/api/v1/routes/optimize", json=req).json()
    assert body["distance_source"] == "osrm"
    assert body["total_distance_km"] == pytest.approx(sum(r["distance_km"] for r in body["routes"]), abs=0.01)


def test_malformed_table_falls_back(monkeypatch):
    monkeypatch.setattr(settings, "ROAD_ROUTING", "osrm")
    monkeypatch.setattr(osrm_client, "_send", lambda *a, **k: _Resp(TABLE))  # 3x3 table for a 2-point request
    osrm_client.reset(); clear_cache()
    assert build_distance_matrix([HUB, A]).source == "estimate"
    osrm_client.reset(); clear_cache()


# ---------- turn-by-turn directions ----------
def _step(kind, name="", km=0.5, modifier=None, ref=None, exit_=None, bearing=0):
    m = {"type": kind, "bearing_after": bearing}
    if modifier: m["modifier"] = modifier
    if exit_: m["exit"] = exit_
    return {"maneuver": m, "name": name, "ref": ref, "distance": km * 1000}


def test_directions_are_condensed_for_drivers():
    leg = {"steps": [
        _step("depart", "", 0.18, "right", bearing=185),
        _step("end of road", "Vashi - Turbhe Link Road", 0.38, "left"),
        _step("rotary", "Vashi - Turbhe Link Road", 0.03, "left", exit_=2),
        _step("exit rotary", "Vashi - Turbhe Link Road", 1.2, "slight left"),
        _step("new name", "Turbhe Flyover", 0.78, "straight"),           # short renamed stretch: folded in
        _step("turn", "Sion-Panvel Highway", 1.5, "straight", ref="SPH; TBR"),
        _step("new name", "Nerul Flyover", 0.8, "straight", ref="SPH; TBR"),   # same highway (shared ref)
        _step("new name", "Sion Panvel Highway", 2.3, "straight"),        # same road, spelt differently
        _step("roundabout", "Palm Beach Road", 0.02, "left", exit_=3),
        _step("exit roundabout", "Palm Beach Road", 1.6, "left"),
        _step("turn", "", 0.05, "right"),                                  # unnamed link: folded in
        _step("arrive", "Palm Beach Road", 0, "left"),
    ]}
    assert road_router.leg_directions(leg) == [
        "Head south for 180 m",
        "Turn left onto Vashi - Turbhe Link Road for 2.4 km",
        "Continue onto Sion-Panvel Highway (SPH) for 4.6 km",
        "At the roundabout, take the 3rd exit onto Palm Beach Road for 1.7 km",
    ]


def test_long_legs_are_capped():
    leg = {"steps": [_step("depart", "A0", 1)] + [_step("turn", f"Road {i}", 2, "left" if i % 2 else "right") for i in range(12)]}
    lines = road_router.leg_directions(leg)
    assert len(lines) == road_router.MAX_STEPS_PER_LEG and lines[-1].startswith("Then follow the route for")


def test_directions_unavailable_offline():
    assert road_router.road_directions([HUB, A]) is None


def test_explain_endpoint_returns_street_directions(osrm, client):
    req = {"hub": {"id": "hub", "latitude": HUB[0], "longitude": HUB[1]}, "hub_name": "Hub",
           "vehicle": {"id": "v1", "capacity_kg": 1000, "capacity_m3": 10, "vehicle_type": "VAN"},
           "stops": [{"id": "a", "latitude": A[0], "longitude": A[1], "weight_kg": 100, "volume_m3": 1, "window_start": "08:00", "window_end": "18:00"},
                     {"id": "b", "latitude": B[0], "longitude": B[1], "weight_kg": 100, "volume_m3": 1, "window_start": "08:00", "window_end": "18:00"}],
           "departure": "12:00"}
    body = client.post("/api/v1/routes/explain", json=req).json()
    assert body["distance_source"] == "osrm" and body["directions_source"] == "osrm"
    assert len(body["legs"]) == 3 and all(leg["steps"] for leg in body["legs"])
    assert "saves" in body["summary"]  # baseline computed server-side on the same road distances
