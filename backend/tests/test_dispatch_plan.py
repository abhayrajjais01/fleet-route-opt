"""
test_dispatch_plan.py - Dispatches are saved on the server, all-or-nothing, and never overwrite another dispatcher
"""

import pytest

from app.models.audit import AuditLog
from app.models.fleet import Driver
from app.models.shipment import Shipment, ShipmentStatus
from tests.conftest import SIGNATURE, TestingSessionLocal, auth_headers

API = "/api/v1"


@pytest.fixture
def net(client):
    a = auth_headers(client, "plan-a@plan.io", "DISPATCHER")
    b = auth_headers(client, "plan-b@plan.io", "DISPATCHER")
    admin = auth_headers(client, "plan-admin@plan.io", "ADMIN")
    hub = client.post(f"{API}/fleet/hubs", headers=admin, json={"name": "Plan Hub", "code": "HUB-PLAN", "address": "1 Test Road", "latitude": 19.1,
                      "longitude": 72.9, "contact_phone": "+91 22 0000"}).json()["id"]
    vehicles, drivers, ships = [], [], []
    for i in range(2):
        vehicles.append(client.post(f"{API}/fleet/vehicles", headers=admin, json={"name": f"Van {i}", "plate_number": f"MH-02-PL-100{i}", "vehicle_type": "VAN",
                        "max_payload_kg": 1000, "max_volume_m3": 9, "fuel_efficiency_kpl": 10, "assigned_hub_id": hub}).json()["id"])
        drivers.append(client.post(f"{API}/fleet/drivers", headers=admin, json={"full_name": f"Driver {i}", "license_number": f"DL-PLAN-{i}", "license_type": "COMMERCIAL",
                       "phone_number": "+91 99999", "status": "ON_DUTY", "assigned_hub_id": hub}).json()["id"])
    for i in range(3):
        ships.append(client.post(f"{API}/shipments", headers=admin, json={"tracking_number": f"PLAN-{i}", "customer_name": "Acme", "destination_address": "22 Market Street",
                     "latitude": 19.05, "longitude": 72.85, "weight_kg": 5, "volume_m3": 0.1, "hub_id": hub}).json()["id"])
    return {"a": a, "b": b, "admin": admin, "v": vehicles, "d": drivers, "s": ships, "hub": hub}


def dispatch(net, ships, v=0, d=0):
    return {"reason": "Dispatched", "shipments": [{"id": net["s"][i], "expected_status": "UNASSIGNED", "expected_vehicle_id": None, "status": "ASSIGNED",
            "assigned_vehicle_id": net["v"][v], "route_sequence": n, "dispatch_time": "08:30"} for n, i in enumerate(ships)],
            "vehicles": [{"id": net["v"][v], "expected_status": "AVAILABLE", "current_status": "IN_TRANSIT"}],
            "drivers": [{"id": net["d"][d], "expected_status": "ON_DUTY", "expected_vehicle_id": None, "status": "ON_TRIP", "current_vehicle_id": net["v"][v]}]}


def save(client, net, body, who="a"):
    return client.post(f"{API}/shipments/plan", headers=net[who], json=body)


def edit(model, pk, **values):
    db = TestingSessionLocal()
    db.query(model).filter(model.id == pk).update(values)
    db.commit()
    db.close()


def test_dispatch_is_saved_for_everyone(client, net):
    assert save(client, net, dispatch(net, [1, 0])).status_code == 200
    seen = {s["id"]: s for s in client.get(f"{API}/shipments?limit=500", headers=net["b"]).json()}
    first, second = seen[net["s"][1]], seen[net["s"][0]]
    assert (first["status"], first["assigned_vehicle_id"], first["route_sequence"], first["dispatch_time"]) == ("ASSIGNED", net["v"][0], 0, "08:30")
    assert second["route_sequence"] == 1 and seen[net["s"][2]]["status"] == "UNASSIGNED"
    assert client.get(f"{API}/fleet/vehicles/{net['v'][0]}", headers=net["b"]).json()["current_status"] == "IN_TRANSIT"
    driver = client.get(f"{API}/fleet/drivers/{net['d'][0]}", headers=net["b"]).json()
    assert (driver["status"], driver["current_vehicle_id"]) == ("ON_TRIP", net["v"][0])
    checks = client.get(f"{API}/audit/report", headers=net["admin"]).json()["checks"]
    assert checks["coverage"]["ok"] and checks["snapshots"]["ok"]


def test_second_dispatcher_cannot_overwrite(client, net):
    assert save(client, net, dispatch(net, [0])).status_code == 200
    late = save(client, net, dispatch(net, [0, 1], v=1, d=1), who="b")              # still sees PLAN-0 as unassigned
    assert late.status_code == 409 and "PLAN-0" in late.json()["detail"]
    seen = {s["id"]: s for s in client.get(f"{API}/shipments", headers=net["b"]).json()}
    assert seen[net["s"][0]]["assigned_vehicle_id"] == net["v"][0]
    assert seen[net["s"][1]]["status"] == "UNASSIGNED"                              # all or nothing
    assert client.get(f"{API}/fleet/vehicles/{net['v'][1]}", headers=net["b"]).json()["current_status"] == "AVAILABLE"
    same_truck = save(client, net, dispatch(net, [1], v=0, d=1), who="b")           # different order, same truck
    assert same_truck.status_code == 409


@pytest.mark.parametrize("change, code, text", [
    (lambda b, n: b.update(drivers=[]), 422, "no driver"),
    (lambda b, n: b["vehicles"][0].update(current_status="MAINTENANCE"), 422, "maintenance"),
    (lambda b, n: b["shipments"][0].update(status="DELIVERED"), 422, "can't mark"),
    (lambda b, n: b["shipments"][0].update(status="IN_TRANSIT"), 422, "can't mark"),
    (lambda b, n: b["shipments"][0].update(assigned_vehicle_id=None), 422, "needs a vehicle"),
    (lambda b, n: b["shipments"].append(dict(b["shipments"][0])), 422, "twice"),
    (lambda b, n: b["shipments"][0].update(id=9999), 409, "no longer exists"),
    (lambda b, n: b["shipments"][0].update(dispatch_time="25:00"), 422, ""),
])
def test_unsafe_or_invalid_plans_change_nothing(client, net, change, code, text):
    body = dispatch(net, [0, 1])
    change(body, net)
    res = save(client, net, body)
    assert res.status_code == code and text in str(res.json()["detail"]).lower().replace("\u2019", "'")
    assert {s["status"] for s in client.get(f"{API}/shipments", headers=net["a"]).json()} == {"UNASSIGNED"}
    assert client.get(f"{API}/fleet/drivers/{net['d'][0]}", headers=net["a"]).json()["status"] == "ON_DUTY"


def test_hazmat_rules_apply_to_the_whole_load(client, net):
    edit(Shipment, net["s"][0], hazard_class="5.1")
    edit(Shipment, net["s"][1], hazard_class="3")
    unendorsed = save(client, net, dispatch(net, [0]))
    assert unendorsed.status_code == 422 and "endorsement" in unendorsed.json()["detail"]
    edit(Driver, net["d"][0], hazmat_endorsed=True)
    assert save(client, net, dispatch(net, [0])).status_code == 200
    body = dispatch(net, [1])                                                       # adds class 3 to a truck carrying 5.1
    body["vehicles"], body["drivers"] = [], []
    mixed = save(client, net, body)
    assert mixed.status_code == 422 and "SOP-HZ-001" in mixed.json()["detail"]


def test_breakdown_moves_stops_and_unassigns_the_rest(client, net):
    assert save(client, net, dispatch(net, [0, 1])).status_code == 200
    s0, s1 = net["s"][:2]
    v0, v1 = net["v"]
    d0, d1 = net["d"]
    body = {"reason": "MH-02-PL-1000 broke down", "shipments": [
        {"id": s0, "expected_status": "ASSIGNED", "expected_vehicle_id": v0, "status": "ASSIGNED", "assigned_vehicle_id": v1, "route_sequence": 0, "dispatch_time": "10:00"},
        {"id": s1, "expected_status": "ASSIGNED", "expected_vehicle_id": v0, "status": "UNASSIGNED", "assigned_vehicle_id": None}],
        "vehicles": [{"id": v0, "expected_status": "IN_TRANSIT", "current_status": "MAINTENANCE"}, {"id": v1, "expected_status": "AVAILABLE", "current_status": "IN_TRANSIT"}],
        "drivers": [{"id": d0, "expected_status": "ON_TRIP", "expected_vehicle_id": v0, "status": "ON_DUTY", "current_vehicle_id": None},
                    {"id": d1, "expected_status": "ON_DUTY", "expected_vehicle_id": None, "status": "ON_TRIP", "current_vehicle_id": v1}]}
    assert save(client, net, body).status_code == 200
    seen = {s["id"]: s for s in client.get(f"{API}/shipments", headers=net["b"]).json()}
    assert (seen[s0]["assigned_vehicle_id"], seen[s0]["dispatch_time"]) == (v1, "10:00")
    assert (seen[s1]["status"], seen[s1]["assigned_vehicle_id"], seen[s1]["route_sequence"]) == ("UNASSIGNED", None, None)
    assert client.get(f"{API}/audit/report", headers=net["admin"]).json()["checks"]["coverage"]["ok"]


def test_driver_manifest_follows_the_saved_order_and_closed_shipments_stay_closed(client, net):
    driver = auth_headers(client, "plan-driver@plan.io", "DRIVER", full_name="Driver 0")
    assert save(client, net, dispatch(net, [2, 0, 1])).status_code == 200
    stops = client.get(f"{API}/transit/driver/manifest", headers=driver).json()["stops"]
    assert [s["tracking_number"] for s in stops] == ["PLAN-2", "PLAN-0", "PLAN-1"]
    sid = net["s"][2]
    for step, body in (("depart", {}), ("arrive", {}), ("deliver", {"recipient_name": "R. Sharma", "signature": SIGNATURE})):
        assert client.post(f"{API}/transit/shipments/{sid}/{step}", headers=driver, json=body).status_code == 200
    body = {"reason": "Try again", "shipments": [{"id": sid, "expected_status": "DELIVERED", "expected_vehicle_id": net["v"][0], "status": "UNASSIGNED"}]}
    assert save(client, net, body).status_code == 409


def test_roles_and_order_edits(client, net):
    driver = auth_headers(client, "plan-nope@plan.io", "DRIVER", full_name="No Plan")
    assert client.post(f"{API}/shipments/plan", headers=driver, json=dispatch(net, [0])).status_code == 403
    url = f"{API}/shipments/{net['s'][0]}"
    assert client.patch(url, headers=driver, json={"customer_name": "Mine now"}).status_code == 403
    ok = client.patch(url, headers=net["a"], json={"customer_name": "Acme West", "hazard_class": "3"}).json()
    assert ok["customer_name"] == "Acme West" and ok["hazard_class"] == "3"
    assert client.patch(url, headers=net["a"], json={"hazard_class": None}).json()["hazard_class"] is None
    assert client.patch(url, headers=net["a"], json={"tracking_number": "PLAN-1"}).status_code == 409
    assert client.patch(url, headers=net["a"], json={"time_window_start": "18:00"}).status_code == 422
    sneaky = client.patch(url, headers=net["a"], json={"status": "DELIVERED", "assigned_vehicle_id": net["v"][0]}).json()
    assert sneaky["status"] == "UNASSIGNED" and sneaky["assigned_vehicle_id"] is None
    db = TestingSessionLocal()
    assert db.query(AuditLog).filter(AuditLog.entity_type == "Shipment", AuditLog.entity_id == net["s"][0]).count() >= 3
    assert db.get(Shipment, net["s"][0]).status == ShipmentStatus.UNASSIGNED
    db.close()


def test_driver_cannot_be_taken_off_a_loaded_truck(client, net):
    assert save(client, net, dispatch(net, [0])).status_code == 200
    body = dispatch(net, [1], v=1, d=0)                                             # driver 0 is already out with PLAN-0
    body["drivers"][0].update(expected_status="ON_TRIP", expected_vehicle_id=net["v"][0])
    res = save(client, net, body)
    assert res.status_code == 422 and "still has 1 stop" in res.json()["detail"]
    driver = client.get(f"{API}/fleet/drivers/{net['d'][0]}", headers=net["a"]).json()
    assert driver["current_vehicle_id"] == net["v"][0]
