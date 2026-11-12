"""
test_route_operations.py - Weeks 8-12 (Track A): resequencing evaluation, downstream ETA recalculation,
optimization agent, route explanations and SLA monitoring.
"""

import pytest

from app.services.copilot.optimization_agent import AgentError, FleetContext, RouteState, handle_disruption, plan_deterministic
from app.services.optimizer.eta_engine import AT_RISK_MARGIN_MIN, classify_sla, evaluate, recalculate
from app.services.optimizer.route_explainer import StopInfo, bearing, explain_route
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec

HUB = (19.1136, 72.8697)
VAN = VehicleSpec("1", 1500, 12, "VAN", 480)
BOX = VehicleSpec("2", 3500, 24.5, "BOX_TRUCK", 600)
MYNTRA = Stop("9", 19.0596, 72.8295, 140, 1.1, 540, 750)
TCS = Stop("2", 19.1176, 72.906, 180, 1.5, 600, 840)
NYKAA = Stop("11", 19.086, 72.9081, 160, 1.0, 690, 960)
RELIANCE = Stop("1", 19.066, 72.865, 450, 3.2, 540, 720)
TATA = Stop("10", 18.998, 72.83, 220, 1.6, 600, 780)
HDFC = Stop("5", 18.9256, 72.8242, 120, 0.8, 570, 660)


# ==================== Week 8: evaluate a chosen order ==================== #
def test_evaluate_keeps_order_and_reports_late_stops_instead_of_refusing():
    bad_order = [NYKAA, TCS, MYNTRA]   # Myntra's window (closes 12:30) is now last
    ev = evaluate(HUB, bad_order, VAN, 510)
    assert [e.stop_id for e in ev.stops] == ["11", "2", "9"]
    good = evaluate(HUB, [MYNTRA, TCS, NYKAA], VAN, 510)
    assert good.feasible and good.route_state == "ROUTE_PROPOSED"
    assert ev.return_min > good.return_min  # worse order costs time


def test_evaluate_flags_overload_and_shift_overrun():
    tiny = VehicleSpec("t", 300, 2, "VAN", 60)
    ev = evaluate(HUB, [MYNTRA, TCS, NYKAA], tiny, 510)
    text = " ".join(ev.violations)
    assert "Over payload" in text and "Over volume" in text and "shift limit" in text
    assert not ev.feasible


def test_late_arrival_is_reported_as_predicted_breach():
    early_close = Stop("x", 19.03, 72.85, 50, 0.5, 480, 520)   # closes 08:40, cannot be reached in time from 08:30
    ev = evaluate(HUB, [early_close], VAN, 510)
    assert ev.stops[0].sla == "PREDICTED_BREACH" and ev.stops[0].minutes_late > 0
    assert any("after its window closes" in v for v in ev.violations)


# ==================== Week 10: downstream recalculation ==================== #
def test_recalculate_keeps_completed_stops_and_shifts_only_downstream():
    route = [RELIANCE, TATA, HDFC]
    plan = evaluate(HUB, route, BOX, 510)
    prev = {e.stop_id: e.arrival for e in plan.stops}
    done_at = plan.stops[0].departure
    after = recalculate(HUB, route, BOX, 510, now_min=done_at, completed={"1": done_at}, delay_min=30, previous_arrivals=prev)
    first, rest = after.stops[0], after.stops[1:]
    assert first.completed and first.departure == done_at
    assert rest[0].shift_min == pytest.approx(30, abs=0.5)          # next arrival moves by the full delay
    assert all(-0.5 <= e.shift_min <= 30.5 for e in rest)            # later stops can absorb it in window waits


def test_delay_can_push_a_stop_past_its_window():
    route = [RELIANCE, TATA, HDFC]
    plan = evaluate(HUB, route, BOX, 510)
    after = recalculate(HUB, route, BOX, 510, now_min=plan.stops[0].departure, completed={"1": plan.stops[0].departure}, delay_min=90)
    hdfc = next(e for e in after.stops if e.stop_id == "5")
    assert hdfc.sla == "PREDICTED_BREACH"


def test_current_position_starts_the_next_leg_there():
    route = [MYNTRA, TCS]
    at_hub = recalculate(HUB, route, VAN, 510, now_min=520)
    near_tcs = recalculate(HUB, route, VAN, 510, now_min=520, current_position=(19.11, 72.90))
    assert near_tcs.stops[0].leg_km != at_hub.stops[0].leg_km


# ==================== Week 12: SLA classification ==================== #
@pytest.mark.parametrize("arrival, close, completed, failed, expected", [
    (600, 700, False, False, "ON_TIME"),
    (700 - AT_RISK_MARGIN_MIN + 1, 700, False, False, "AT_RISK"),
    (710, 700, False, False, "PREDICTED_BREACH"),
    (710, 700, True, False, "SLA_BREACHED"),
    (600, 700, False, True, "FAILED"),
])
def test_classify_sla(arrival, close, completed, failed, expected):
    assert classify_sla(arrival, close, completed, failed)[0] == expected


def test_blocked_route_state():
    assert recalculate(HUB, [MYNTRA], VAN, 510, blocked=True).route_state == "ROUTE_BLOCKED"


# ==================== Week 11: explanations ==================== #
def test_bearing_compass_points():
    assert bearing((19.0, 72.8), (19.5, 72.8)) == "north"
    assert bearing((19.0, 72.8), (19.0, 73.3)) == "east"
    assert bearing((19.0, 72.8), (18.5, 72.3)) == "south-west"


def test_explanation_is_grounded_and_complete():
    route = [MYNTRA, TCS, NYKAA]
    ev = evaluate(HUB, route, VAN, 510)
    info = {"9": StopInfo("Myntra", "Bandra West", "HIGH"), "2": StopInfo("TCS"), "11": StopInfo("Nykaa", priority="LOW")}
    ex = explain_route("Mumbai Central Depot", HUB, route, info, VAN, "MH-02-EE-1001", ev, 510, separate_trips_km=60)
    assert "MH-02-EE-1001 leaves Mumbai Central Depot at 08:30" in ex.summary
    assert "saves" in ex.summary
    assert len(ex.stop_reasons) == 3 and "high priority" in ex.stop_reasons[0][1]
    assert len(ex.driver_instructions) == 5   # load + 3 stops + return
    assert ex.driver_instructions[1].startswith("1. Head ")
    assert ex.citations and all(c.doc_id.startswith("SOP-") for c in ex.citations)


# ==================== Week 9: optimization agent ==================== #
def fleet(now=555):
    return FleetContext(
        hub=HUB,
        routes=[
            RouteState(VAN, "MH-02-EE-1001", [MYNTRA, TCS, NYKAA], 510, names={"9": "Myntra", "2": "TCS", "11": "Nykaa"}),
            RouteState(BOX, "MH-04-AB-2045", [RELIANCE, TATA, HDFC], 510, completed={"1": 550}, names={"1": "Reliance", "10": "Tata CLiQ", "5": "HDFC"}),
        ],
        spare_vehicles=[VehicleSpec("5", 2500, 18, "BOX_TRUCK", 540)],
        now_min=now,
    )


@pytest.mark.parametrize("message, tool", [
    ("MH-04-AB-2045 broke down near Sion", "reassign_stops"),
    ("Vehicle V-101 breakdown on the expressway", "reassign_stops"),
    ("MH-02-EE-1001 stuck in traffic, 45 min delay", "apply_delay"),
    ("please reroute MH-04-AB-2045", "reoptimize_route"),
])
def test_deterministic_planner_picks_the_right_tool(message, tool):
    assert plan_deterministic(message)[1] == tool


def test_planner_rejects_unrelated_messages():
    with pytest.raises(AgentError):
        plan_deterministic("what is the weather today")


def test_breakdown_moves_every_remaining_stop_and_keeps_completed_ones():
    p = handle_disruption("MH-04-AB-2045 broke down", fleet(), use_llm=False)
    assert p.tool == "reassign_stops" and p.planner == "deterministic" and p.requires_approval
    moved = {c.stop_id for c in p.changes}
    assert moved | set(p.unassigned) == {"10", "5"}      # Reliance (done) is not touched
    assert "1" not in moved
    assert all(c.to_vehicle != "MH-04-AB-2045" for c in p.changes)


def test_delay_shifts_etas_and_reports_lateness():
    p = handle_disruption("MH-02-EE-1001 delayed 45 min", fleet(), use_llm=False)
    assert p.tool == "apply_delay" and p.arguments["minutes"] == 45
    assert p.changes and all((c.new_eta or 0) >= (c.old_eta or 0) for c in p.changes)


def test_unknown_vehicle_is_an_error():
    with pytest.raises(AgentError):
        handle_disruption("MH-99-ZZ-9999 broke down", fleet(), use_llm=False)


def test_llm_planner_is_skipped_without_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert handle_disruption("MH-04-AB-2045 broke down", fleet(), use_llm=True).planner == "deterministic"


# ==================== API ==================== #
def _stop(s: Stop, name: str):
    hh = lambda m: f"{m // 60:02d}:{m % 60:02d}"  # noqa: E731
    return {"id": s.id, "name": name, "latitude": s.lat, "longitude": s.lon, "weight_kg": s.weight_kg, "volume_m3": s.volume_m3,
            "window_start": hh(s.window_open), "window_end": hh(s.window_close)}


HUB_JSON = {"id": "hub", "latitude": HUB[0], "longitude": HUB[1]}
VAN_JSON = {"id": "1", "label": "MH-02-EE-1001", "capacity_kg": 1500, "capacity_m3": 12, "vehicle_type": "VAN", "max_shift_hours": 8}
BOX_JSON = {"id": "2", "label": "MH-04-AB-2045", "capacity_kg": 3500, "capacity_m3": 24.5, "vehicle_type": "BOX_TRUCK"}
VAN_STOPS = [_stop(MYNTRA, "Myntra"), _stop(TCS, "TCS"), _stop(NYKAA, "Nykaa")]
BOX_STOPS = [_stop(RELIANCE, "Reliance"), _stop(TATA, "Tata CLiQ"), _stop(HDFC, "HDFC")]


def test_evaluate_and_recalculate_endpoints(client):
    ev = client.post("/api/v1/routes/evaluate", json={"hub": HUB_JSON, "vehicle": VAN_JSON, "stops": VAN_STOPS, "departure": "08:30"})
    assert ev.status_code == 200 and [s["stop_id"] for s in ev.json()["stops"]] == ["9", "2", "11"]
    etas = {s["stop_id"]: s["arrival"] for s in ev.json()["stops"]}
    rc = client.post("/api/v1/routes/recalculate", json={"hub": HUB_JSON, "vehicle": VAN_JSON, "stops": VAN_STOPS, "departure": "08:30",
                                                         "now": "09:10", "completed": {"9": "09:10"}, "delay_min": 20, "previous_etas": etas})
    body = rc.json()
    assert body["stops"][0]["completed"] and body["stops"][1]["eta_shift_min"] > 0
    bad = client.post("/api/v1/routes/recalculate", json={"hub": HUB_JSON, "vehicle": VAN_JSON, "stops": VAN_STOPS, "completed": {"nope": "09:00"}})
    assert bad.status_code == 422


def test_sla_check_orders_alerts_worst_first(client):
    res = client.post("/api/v1/routes/sla-check", json={"routes": [
        {"hub": HUB_JSON, "vehicle": BOX_JSON, "stops": BOX_STOPS, "departure": "08:30", "now": "09:10", "completed": {"1": "09:10"}, "delay_min": 90},
        {"hub": HUB_JSON, "vehicle": VAN_JSON, "stops": VAN_STOPS, "departure": "08:30", "blocked": True},
    ]}).json()
    levels = [a["level"] for a in res["alerts"]]
    assert levels[0] == "ROUTE_BLOCKED" and "PREDICTED_BREACH" in levels
    assert res["counts"]["ROUTE_BLOCKED"] == 1


def test_explain_endpoint(client):
    res = client.post("/api/v1/routes/explain", json={"hub": HUB_JSON, "hub_name": "Mumbai Central Depot", "vehicle": VAN_JSON,
                                                      "stops": VAN_STOPS, "departure": "08:30"}).json()
    assert res["summary"] and len(res["driver_instructions"]) == 5 and res["citations"]


def test_disruption_endpoint_returns_proposal(client):
    res = client.post("/api/v1/routes/disruption", json={
        "message": "MH-04-AB-2045 broke down", "hub": HUB_JSON, "now": "09:15", "use_llm": False,
        "routes": [{"vehicle": VAN_JSON, "stops": VAN_STOPS, "departure": "08:30"},
                   {"vehicle": BOX_JSON, "stops": BOX_STOPS, "departure": "08:30", "completed": {"1": "09:10"}}]})
    assert res.status_code == 200
    body = res.json()
    assert body["tool_call"]["name"] == "reassign_stops" and body["requires_approval"]
    assert set(body["affected_stops"]) | set(body["unassigned"]) == {"10", "5"}
    unknown = client.post("/api/v1/routes/disruption", json={"message": "hello there", "hub": HUB_JSON, "use_llm": False,
                                                             "routes": [{"vehicle": VAN_JSON, "stops": VAN_STOPS}]})
    assert unknown.status_code == 422
