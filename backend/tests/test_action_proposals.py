"""
test_action_proposals.py - Structured Action Proposals & Route Diff (US-005, Week 11 · Track B)

Verifies:
1. The route diff marks every stop as SAME / MOVED / ADDED / REMOVED / COMPLETED correctly for a breakdown
   (stops move between vehicles) and a delay (stops re-sequenced on one vehicle).
2. The impact summary (km, minutes, cost, lateness) is computed by the ETA engine and its deltas add up.
3. Accept / reject happen once, are recorded in the audit log, and are restricted by role.
"""

import pytest

from app.services.copilot.optimization_agent import FleetContext, RouteState, handle_disruption
from app.services.copilot.proposal_service import build_card, registry, route_cost
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec
from tests.conftest import auth_headers

HUB = (19.1136, 72.8697)
VAN = VehicleSpec("1", 1500, 12, "VAN", 480)
BOX = VehicleSpec("2", 3500, 24.5, "BOX_TRUCK", 600)
MYNTRA = Stop("9", 19.0596, 72.8295, 140, 1.1, 540, 750)
TCS = Stop("2", 19.1176, 72.906, 180, 1.5, 600, 840)
NYKAA = Stop("11", 19.086, 72.9081, 160, 1.0, 690, 960)
RELIANCE = Stop("1", 19.066, 72.865, 450, 3.2, 540, 720)
TATA = Stop("10", 18.998, 72.83, 220, 1.6, 600, 780)
HDFC = Stop("5", 18.9256, 72.8242, 120, 0.8, 570, 660)


def fleet(now=555):
    return FleetContext(
        hub=HUB,
        routes=[
            RouteState(VAN, "MH-02-EE-1001", [MYNTRA, TCS, NYKAA], 510, names={"9": "Myntra", "2": "TCS", "11": "Nykaa"}),
            RouteState(BOX, "MH-04-AB-2045", [RELIANCE, TATA, HDFC], 510, completed={"1": 550},
                       names={"1": "Reliance", "10": "Tata CLiQ", "5": "HDFC"}),
        ],
        spare_vehicles=[VehicleSpec("5", 2500, 18, "BOX_TRUCK", 540)],
        now_min=now,
    )


@pytest.fixture(autouse=True)
def _clean_registry():
    registry.clear()
    yield
    registry.clear()


# ==================== Route diff ==================== #
def test_breakdown_diff_moves_pending_stops_off_the_broken_vehicle():
    ctx = fleet()
    card = build_card(ctx, handle_disruption("MH-04-AB-2045 broke down near Sion", ctx, use_llm=False))
    by_vehicle = {v.vehicle: v for v in card.vehicles}

    broken = by_vehicle["MH-04-AB-2045"]
    assert broken.status == "OUT_OF_SERVICE"
    before = {e.stop_id: e for e in broken.before}
    assert before["1"].change == "COMPLETED"                      # already delivered: stays put
    assert before["10"].change == "REMOVED" and before["5"].change == "REMOVED"
    assert [e.stop_id for e in broken.after] == ["1"]

    # Every removed stop shows up as ADDED somewhere else (or is reported unassigned), and points back.
    added = {e.stop_id: (v.vehicle, e) for v in card.vehicles for e in v.after if e.change == "ADDED"}
    for sid in ("10", "5"):
        assert sid in added or sid in card.proposal.unassigned
        if sid in added:
            assert added[sid][1].moved_from == "MH-04-AB-2045"
            assert before[sid].moved_to == added[sid][0]
    assert broken.status == card.vehicles[0].status                # changed vehicles are listed first


def test_delay_diff_keeps_stops_on_the_same_vehicle():
    ctx = fleet()
    card = build_card(ctx, handle_disruption("MH-02-EE-1001 stuck in traffic, 60 min delay", ctx, use_llm=False))
    assert [v.vehicle for v in card.vehicles] == ["MH-02-EE-1001"]
    van = card.vehicles[0]
    assert van.status in {"RESEQUENCED", "UNCHANGED"}
    assert {e.change for e in van.after} <= {"SAME", "MOVED"}
    assert sorted(e.stop_id for e in van.after) == ["11", "2", "9"]
    # The "current" side already includes the delay, so ETAs on both sides are comparable.
    assert van.current.late_min >= van.proposed.late_min
    # ...and each stop also carries its originally planned ETA, 60 min earlier than the delayed one.
    myntra = next(e for e in van.before if e.stop_id == "9")
    assert myntra.before_eta - myntra.planned_eta == pytest.approx(60, abs=1)


def test_impact_totals_and_cost_model():
    ctx = fleet()
    card = build_card(ctx, handle_disruption("MH-04-AB-2045 broke down", ctx, use_llm=False))
    assert card.current.distance_km == pytest.approx(sum(v.current.distance_km for v in card.vehicles if v.current), abs=0.2)
    assert card.proposed.cost == pytest.approx(sum(v.proposed.cost for v in card.vehicles if v.proposed), abs=2)
    # A van's 100 km and 2 h: 100/14 L of diesel at ₹95 plus 2 h of driver time at ₹250
    assert route_cost(100, 120, "VAN") == pytest.approx(100 / 14 * 95 + 500, rel=1e-6)
    assert route_cost(100, 120, "EV") < route_cost(100, 120, "VAN")


# ==================== REST API ==================== #
def _stop(s: Stop, name: str):
    hh = lambda m: f"{m // 60:02d}:{m % 60:02d}"  # noqa: E731
    return {"id": s.id, "name": name, "latitude": s.lat, "longitude": s.lon, "weight_kg": s.weight_kg, "volume_m3": s.volume_m3,
            "window_start": hh(s.window_open), "window_end": hh(s.window_close)}


REQUEST = {
    "message": "MH-04-AB-2045 broke down", "hub": {"id": "hub", "latitude": HUB[0], "longitude": HUB[1]}, "now": "09:15", "use_llm": False,
    "routes": [
        {"vehicle": {"id": "1", "label": "MH-02-EE-1001", "capacity_kg": 1500, "capacity_m3": 12, "vehicle_type": "VAN", "max_shift_hours": 8},
         "stops": [_stop(MYNTRA, "Myntra"), _stop(TCS, "TCS"), _stop(NYKAA, "Nykaa")], "departure": "08:30"},
        {"vehicle": {"id": "2", "label": "MH-04-AB-2045", "capacity_kg": 3500, "capacity_m3": 24.5, "vehicle_type": "BOX_TRUCK"},
         "stops": [_stop(RELIANCE, "Reliance"), _stop(TATA, "Tata CLiQ"), _stop(HDFC, "HDFC")], "departure": "08:30",
         "completed": {"1": "09:10"}},
    ],
    "spare_vehicles": [{"id": "5", "label": "MH-43-BX-3310", "capacity_kg": 2500, "capacity_m3": 18, "vehicle_type": "BOX_TRUCK"}],
}


def _token(client, email, role):
    return auth_headers(client, email, role)


def test_create_accept_and_audit_proposal(client):
    admin = _token(client, "admin@w11.io", "ADMIN")       # first user becomes ADMIN
    res = client.post("/api/v1/copilot/proposals", json=REQUEST, headers=admin)
    assert res.status_code == 201
    card = res.json()
    assert card["status"] == "PROPOSED" and card["tool_call"]["name"] == "reassign_stops"
    assert card["vehicles"][0]["vehicle"] == "MH-04-AB-2045" and card["vehicles"][0]["status"] == "OUT_OF_SERVICE"
    imp = card["impact"]
    assert imp["delta_km"] == pytest.approx(imp["proposed"]["distance_km"] - imp["current"]["distance_km"], abs=0.11)
    assert all(e["before_eta"] is None or len(e["before_eta"]) == 5 for v in card["vehicles"] for e in v["before"])

    decided = client.post(f"/api/v1/copilot/proposals/{card['card_id']}/decision", json={"decision": "ACCEPT", "note": "OK"}, headers=admin)
    assert decided.status_code == 200 and decided.json()["status"] == "ACCEPTED"
    assert client.get(f"/api/v1/copilot/proposals/{card['card_id']}", headers=admin).json()["decided_by"] == "admin"

    again = client.post(f"/api/v1/copilot/proposals/{card['card_id']}/decision", json={"decision": "REJECT"}, headers=admin)
    assert again.status_code == 409

    logs = client.get("/api/v1/audit", headers=admin).json()
    items = logs["items"] if isinstance(logs, dict) else logs
    assert any("Accepted copilot proposal" in (row.get("details") or "") for row in items)


def test_reject_unknown_and_driver_forbidden(client):
    admin = _token(client, "admin2@w11.io", "ADMIN")
    driver = _token(client, "driver@w11.io", "DRIVER")
    assert client.post("/api/v1/copilot/proposals", json=REQUEST, headers=driver).status_code == 403

    card = client.post("/api/v1/copilot/proposals", json=REQUEST, headers=admin).json()
    rejected = client.post(f"/api/v1/copilot/proposals/{card['card_id']}/decision", json={"decision": "REJECT"}, headers=admin)
    assert rejected.json()["status"] == "REJECTED"
    assert client.post("/api/v1/copilot/proposals/nope/decision", json={"decision": "ACCEPT"}, headers=admin).status_code == 404

    vague = dict(REQUEST, message="hello there")
    assert client.post("/api/v1/copilot/proposals", json=vague, headers=admin).status_code == 422


@pytest.mark.parametrize("message", ["MH-02-EE-1001 broke down near Sion", "V-101 had an accident on NH-48", "Truck is out of service"])
def test_router_recognises_everyday_breakdown_phrasing(message):
    """The Copilot drawer only asks for a proposal when the Router Agent sees a disruption intent."""
    from app.schemas.copilot import AgentIntent
    from app.services.copilot.router_agent import get_router_agent
    assert get_router_agent().classify_intent(message)[0] == AgentIntent.VEHICLE_BREAKDOWN


def test_failed_audit_write_leaves_proposal_open_for_retry(client, monkeypatch):
    """If the audit record can't be saved, the decision is not locked in: the retry succeeds instead of 409."""
    import app.api.v1.copilot as copilot_api

    admin = _token(client, "admin3@w11.io", "ADMIN")
    card = client.post("/api/v1/copilot/proposals", json=REQUEST, headers=admin).json()
    real = copilot_api.record_audit_event

    def broken(*args, **kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(copilot_api, "record_audit_event", broken)
    failed = client.post(f"/api/v1/copilot/proposals/{card['card_id']}/decision", json={"decision": "ACCEPT"}, headers=admin)
    assert failed.status_code == 503
    assert client.get(f"/api/v1/copilot/proposals/{card['card_id']}", headers=admin).json()["status"] == "PROPOSED"

    monkeypatch.setattr(copilot_api, "record_audit_event", real)
    retried = client.post(f"/api/v1/copilot/proposals/{card['card_id']}/decision", json={"decision": "ACCEPT"}, headers=admin)
    assert retried.status_code == 200 and retried.json()["status"] == "ACCEPTED"


def test_claim_blocks_a_concurrent_second_decision():
    ctx = fleet()
    card = registry.add(build_card(ctx, handle_disruption("MH-04-AB-2045 broke down", ctx, use_llm=False)))
    registry.claim(card.card_id)
    from app.services.copilot.proposal_service import ProposalAlreadyDecided
    with pytest.raises(ProposalAlreadyDecided):
        registry.claim(card.card_id)                 # second request while the first is still saving
    registry.release(card.card_id)
    assert registry.decide(card.card_id, False, "dispatcher").status == "REJECTED"
