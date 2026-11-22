"""Optimization Agent: understanding dispatcher messages against the live fleet (no LLM). Nov 2026."""
import json
from pathlib import Path

import pytest

from app.services.copilot import optimization_agent as oa
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec

VAN = VehicleSpec("1", 1200, 10, "VAN", 600)
BOX = VehicleSpec("2", 3500, 24, "BOX_TRUCK", 600)
MESSAGES = json.loads((Path(__file__).parent / "data" / "agent_messages.json").read_text())["messages"]


def _stop(i):
    return Stop(str(i), 19.07 + i * 0.005, 72.87, 100, 1, 480, 1080)


def fleet():
    return oa.FleetContext(
        hub=(19.1136, 72.8697),
        routes=[oa.RouteState(VAN, "MH-02-EE-1001", [_stop(1), _stop(2)], 510, driver="Rajesh Kumar"),
                oa.RouteState(BOX, "MH-04-AB-2045", [_stop(3), _stop(4)], 510, driver="Vikram Singh")],
        spare_vehicles=[VehicleSpec("5", 2500, 18, "BOX_TRUCK", 540)],
        now_min=600,
    )


@pytest.mark.parametrize("m", MESSAGES, ids=[m["text"][:40] for m in MESSAGES])
def test_message_is_understood(m):
    ctx = fleet()
    if m["tool"] is None:
        with pytest.raises(oa.AgentError):
            oa.understand(m["text"], ctx)
        return
    _, tool, args = oa.understand(m["text"], ctx)
    assert tool == m["tool"]
    assert oa.resolve_vehicle(args["vehicle_id"], ctx).label == m["vehicle"]
    if "minutes" in m:
        assert args["minutes"] == m["minutes"]


@pytest.mark.parametrize("text,minutes", [
    ("half an hour", 30), ("an hour", 60), ("1h30", 90), ("2 hours and 15 minutes", 135), ("1.5 hours", 90),
    ("forty five minutes", 45), ("running 25 late", 25), ("delayed by 45", 45), ("quarter of an hour", 15),
    ("3 stops affected", None), ("delayed, 2 km of jam", None),
])
def test_parse_minutes(text, minutes):
    assert oa.parse_minutes(text) == minutes


def test_short_vehicle_id_never_matches_inside_another_plate():
    """Regression: id '2' used to match inside 'MH-02-EE-1001', re-routing the wrong truck."""
    ctx = fleet()
    assert oa.resolve_vehicle("2", ctx).label == "MH-04-AB-2045"
    assert oa.resolve_vehicle("1", ctx).label == "MH-02-EE-1001"
    with pytest.raises(oa.AgentError):
        oa.resolve_vehicle("02", ctx)  # too short for a partial match, not an exact id


def test_ambiguous_vehicle_is_asked_not_guessed():
    ctx = fleet()
    ctx.routes.append(oa.RouteState(VehicleSpec("3", 3500, 24, "BOX_TRUCK", 600), "MH-04-AB-3100", [_stop(5)], 510))
    with pytest.raises(oa.AgentError, match="Which vehicle"):
        oa.understand("the box truck broke down", ctx)


def test_breakdown_message_produces_a_reassignment_proposal():
    p = oa.handle_disruption("2045 engine died on the expressway", fleet(), use_llm=False)
    assert p.tool == "reassign_stops" and p.intent == "VEHICLE_BREAKDOWN" and p.requires_approval
    assert {c.stop_id for c in p.changes} == {"3", "4"} and all(c.from_vehicle == "MH-04-AB-2045" for c in p.changes)


def test_api_resolves_driver_names(client):
    def route(vid, plate, vtype, driver, stops):
        return {"vehicle": {"id": vid, "label": plate, "capacity_kg": 3000, "capacity_m3": 20, "vehicle_type": vtype, "driver_name": driver},
                "stops": [{"id": str(i), "latitude": 19.07 + i * 0.005, "longitude": 72.87, "weight_kg": 100, "volume_m3": 1,
                           "window_start": "08:00", "window_end": "18:00"} for i in stops], "departure": "08:30"}
    body = {"message": "Vikram is stuck in traffic, half an hour", "hub": {"id": "hub", "latitude": 19.1136, "longitude": 72.8697},
            "routes": [route("1", "MH-02-EE-1001", "VAN", "Rajesh Kumar", [1, 2]), route("2", "MH-04-AB-2045", "BOX_TRUCK", "Vikram Singh", [3, 4])],
            "now": "10:00", "use_llm": False}
    res = client.post("/api/v1/routes/disruption", json=body)
    assert res.status_code == 200, res.text
    assert res.json()["tool_call"] == {"name": "apply_delay", "arguments": {"vehicle_id": "MH-04-AB-2045", "minutes": 30}}
