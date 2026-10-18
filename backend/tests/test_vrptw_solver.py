"""
test_vrptw_solver.py - VRPTW Solver Tests (US-003, Week 6, Track A: Manthan Nimodiya)

Every hard constraint is re-checked independently of the solver's own feasibility code:
capacity (kg and m³), time windows, shift limit, each stop served exactly once, plus the < 5 s / 50-stop
PRD target, determinism, 2-opt improvement, infeasible-stop reporting and the /routes/optimize API.
"""

import random
import time

import pytest

from app.services.optimizer.distance_matrix import build_distance_matrix, clear_cache
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec, _Problem, _two_opt, solve

HUB = (19.1136, 72.8697)


def random_stops(n, seed=7):
    rng = random.Random(seed)
    return [
        Stop(f"s{i}", 19.0 + rng.random() * 0.25, 72.82 + rng.random() * 0.2, rng.randint(50, 400),
             round(rng.uniform(0.3, 3.0), 1), rng.choice([480, 540, 600]), rng.choice([720, 840, 960, 1080]))
        for i in range(n)
    ]


def fleet(n=5, kg=2500, m3=18, vtype="BOX_TRUCK", shift=600):
    return [VehicleSpec(f"v{i}", kg, m3, vtype, shift) for i in range(n)]


@pytest.fixture(autouse=True)
def fresh_cache():
    clear_cache()
    yield


def assert_feasible(solution, stops, vehicles, depart=480):
    by_id = {s.id: s for s in stops}
    vmap = {v.id: v for v in vehicles}
    seen = []
    for r in solution.routes:
        v = vmap[r.vehicle_id]
        assert sum(by_id[s].weight_kg for s in r.stops) <= v.capacity_kg + 1e-6
        assert sum(by_id[s].volume_m3 for s in r.stops) <= v.capacity_m3 + 1e-6
        # Re-simulate with the raw matrix, independent of the solver's schedule().
        pts = [HUB] + [(by_id[s].lat, by_id[s].lon) for s in r.stops]
        dur = build_distance_matrix(pts, v.vehicle_type).duration_min
        t = depart
        for k, sid in enumerate(r.stops, start=1):
            t += dur[k - 1][k]
            assert t <= by_id[sid].window_close + 1e-6, f"{sid} arrives after its window"
            t = max(t, by_id[sid].window_open) + by_id[sid].service_min
        t += dur[len(r.stops)][0]
        assert t - depart <= v.max_shift_min + 1e-6
        seen += r.stops
    assert len(seen) == len(set(seen)), "a stop was served twice"
    assert set(seen) | set(solution.unassigned) == set(by_id), "a stop went missing"


def test_50_stops_feasible_and_under_five_seconds():
    # 5 vehicles with ~20% spare capacity: a realistic fleet for 50 stops (PRD target: < 5 s)
    stops, vehicles = random_stops(50), fleet(kg=3000, m3=22)
    started = time.perf_counter()
    sol = solve(HUB, stops, vehicles, 480)
    assert time.perf_counter() - started < 5.0
    assert not sol.unassigned
    assert_feasible(sol, stops, vehicles)


def test_consolidation_beats_separate_trips_by_a_wide_margin():
    sol = solve(HUB, random_stops(40), fleet(), 480)
    assert sol.total_distance_km < 0.5 * sol.baseline_distance_km


def test_results_are_deterministic():
    a = solve(HUB, random_stops(30), fleet(4), 480)
    clear_cache()
    b = solve(HUB, random_stops(30), fleet(4), 480)
    assert [r.stops for r in a.routes] == [r.stops for r in b.routes]


def test_tight_capacity_forces_more_routes_but_never_overloads():
    stops = random_stops(20)
    vehicles = fleet(10, kg=600, m3=6, vtype="VAN")
    sol = solve(HUB, stops, vehicles, 480)
    assert len(sol.routes) >= 2
    assert_feasible(sol, stops, vehicles)


def test_time_window_order_is_respected():
    near_late = Stop("near_late", 19.11, 72.88, 100, 1, 900, 960)    # close but only open 15:00–16:00
    far_early = Stop("far_early", 19.03, 72.85, 100, 1, 480, 600)    # farther but must be served by 10:00
    sol = solve(HUB, [near_late, far_early], fleet(1, vtype="VAN"), 480)
    assert sol.routes[0].stops == ["far_early", "near_late"]
    assert_feasible(sol, [near_late, far_early], fleet(1, vtype="VAN"))


def test_infeasible_stops_are_reported_with_reasons():
    too_heavy = Stop("heavy", 19.07, 72.87, 9000, 2, 480, 1080)
    too_late = Stop("late", 18.52, 73.85, 50, 0.5, 480, 500)   # Pune, window closes 08:20
    ok = Stop("ok", 19.07, 72.87, 100, 1, 480, 1080)
    sol = solve(HUB, [too_heavy, too_late, ok], fleet(1, vtype="VAN"), 480)
    assert "exceeds every vehicle" in sol.unassigned["heavy"]
    assert "window" in sol.unassigned["late"]
    assert sol.routes[0].stops == ["ok"]


def test_not_enough_vehicles_reports_leftovers():
    stops = random_stops(30)
    vehicles = fleet(1, kg=800, m3=8, vtype="VAN")
    sol = solve(HUB, stops, vehicles, 480)
    assert sol.unassigned
    assert_feasible(sol, stops, vehicles)


def test_two_opt_removes_a_crossing():
    # A square visited in crossing order (diagonals) must be uncrossed by 2-opt.
    sq = [Stop("a", 19.20, 72.80, 10, .1, 0, 1439), Stop("b", 19.20, 72.90, 10, .1, 0, 1439),
          Stop("c", 19.30, 72.90, 10, .1, 0, 1439), Stop("d", 19.30, 72.80, 10, .1, 0, 1439)]
    v = VehicleSpec("v", 1000, 10, "VAN", 900)
    p = _Problem((19.15, 72.85), sq, [v], 0)
    crossing = [1, 3, 2, 4]
    improved = _two_opt(p, crossing, v)
    assert p.length(improved) < p.length(crossing)


def test_requires_a_vehicle():
    with pytest.raises(ValueError):
        solve(HUB, random_stops(3), [], 480)


# ---------------- API ---------------- #
def payload(n=12, vehicles=3):
    return {
        "hub": {"id": "hub", "latitude": HUB[0], "longitude": HUB[1]},
        "departure": "08:00",
        "stops": [{"id": s.id, "latitude": s.lat, "longitude": s.lon, "weight_kg": s.weight_kg, "volume_m3": s.volume_m3,
                   "window_start": "09:00", "window_end": "17:00"} for s in random_stops(n)],
        "vehicles": [{"id": f"v{i}", "capacity_kg": 2000, "capacity_m3": 15, "vehicle_type": "BOX_TRUCK"} for i in range(vehicles)],
    }


def test_optimize_endpoint_returns_sequenced_routes(client):
    res = client.post("/api/v1/routes/optimize", json=payload())
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ROUTE_PROPOSED"
    assert sum(len(r["stop_ids"]) for r in data["routes"]) == 12
    assert 0 < data["saving_pct"] < 100
    first = data["routes"][0]["visits"][0]
    assert first["service_start"] >= "09:00"


def test_optimize_endpoint_flags_failures_and_validates(client):
    body = payload(3, 1)
    body["stops"][0]["weight_kg"] = 99999
    res = client.post("/api/v1/routes/optimize", json=body)
    assert res.json()["status"] == "OPTIMIZATION_FAILED"
    assert body["stops"][0]["id"] in res.json()["unassigned"]

    bad = payload(2, 1)
    bad["stops"][1]["id"] = bad["stops"][0]["id"]
    assert client.post("/api/v1/routes/optimize", json=bad).status_code == 422
    bad = payload(2, 1)
    bad["stops"][0]["window_end"] = "25:00"
    assert client.post("/api/v1/routes/optimize", json=bad).status_code == 422
