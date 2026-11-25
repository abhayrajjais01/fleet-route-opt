"""SOP-HZ-001 dangerous-goods rules in route planning: segregation is a hard constraint in the solver."""
import pytest

from app.services.optimizer.eta_engine import recalculate
from app.services.optimizer.hazmat import needs_endorsed_driver, normalise, segregation_conflict
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec, solve

HUB = (19.1136, 72.8697)


@pytest.mark.parametrize("classes,conflict", [
    (["3", "8"], False),            # allowed by the SOP (only 5.1/3, 5.1/4.1, 8/6.1 and Class 1 are listed)
    (["1", "3"], True), (["1.4", "2.1"], True), (["1", None], False),
    (["5.1", "3"], True), (["5.1", "4.1"], True), (["5.1", "4.2"], False),
    (["8", "6.1"], True), (["8", "6.2"], False),
    ([None, None], False), (["3", "3"], False),
])
def test_segregation_rules(classes, conflict):
    assert bool(segregation_conflict(classes)) is conflict


def test_normalise_and_endorsement():
    assert normalise("2.1") == "2" and normalise("5.1") == "5.1" and normalise(" 3 ") == "3" and normalise("") is None
    assert needs_endorsed_driver([None, "3"]) and not needs_endorsed_driver([None, ""])


def _stop(i, hc=None):
    return Stop(f"s{i}", 19.07 + i * 0.004, 72.87 + i * 0.003, 100, 1, 480, 1080, 10, hc)


def test_solver_never_co_loads_incompatible_classes():
    stops = [_stop(1, "5.1"), _stop(2, "3"), _stop(3), _stop(4)]
    vans = [VehicleSpec("v1", 2000, 20, "VAN", 600), VehicleSpec("v2", 2000, 20, "VAN", 600)]
    sol = solve(HUB, stops, vans, 480)
    assert not sol.unassigned
    for r in sol.routes:
        assert segregation_conflict(next(s for s in stops if s.id == sid).hazard_class for sid in r.stops) is None
    # Without the rule one van would take everything (it has the room); with it the oxidizer and the flammable split.
    assert len(sol.routes) == 2


def test_unplaceable_hazmat_gets_a_clear_reason():
    stops = [_stop(1, "5.1"), _stop(2, "3")]
    sol = solve(HUB, stops, [VehicleSpec("v1", 2000, 20, "VAN", 600)], 480)
    assert len(sol.unassigned) == 1 and "SOP-HZ-001" in next(iter(sol.unassigned.values()))


def test_eta_engine_flags_a_manual_co_load():
    ev = recalculate(HUB, [_stop(1, "8"), _stop(2, "6.1")], VehicleSpec("v", 2000, 20, "VAN", 600), 480)
    assert any("SOP-HZ-001" in v for v in ev.violations) and not ev.feasible


def test_optimize_api_accepts_hazard_class(client):
    stop = lambda sid, hc: {"id": sid, "latitude": 19.07, "longitude": 72.87, "weight_kg": 100, "volume_m3": 1,
                            "window_start": "08:00", "window_end": "18:00", "hazard_class": hc}
    body = {"hub": {"id": "hub", "latitude": HUB[0], "longitude": HUB[1]},
            "stops": [stop("a", "1"), stop("b", "3")],
            "vehicles": [{"id": "v1", "capacity_kg": 2000, "capacity_m3": 20, "vehicle_type": "VAN"}]}
    res = client.post("/api/v1/routes/optimize", json=body).json()
    assert len(res["unassigned"]) == 1
    assert client.post("/api/v1/routes/optimize", json={**body, "stops": [stop("a", "X9")]}).status_code == 422
