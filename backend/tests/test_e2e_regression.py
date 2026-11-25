"""
test_e2e_regression.py - End-to-end regression across every user story (Week 15 · Track B: Abhayraj Jaiswal)

One operating day, driven only through the public HTTP API, in the order a real team works:

  US-001  fleet assets      admin sets up a hub, two vehicles and a driver
  US-002  shipment intake   dispatcher ingests a JSON batch (one bad row is rejected, the rest land)
  US-003  route planning    distance matrix + VRPTW plan for the batch, then a dispatcher-chosen order is timed
  US-004  live operations   SLA check across the planned routes
  US-005  AI copilot        a breakdown message becomes a proposal card; the dispatcher accepts it (audited)
  US-006  compliance        RAG answers a policy question with citations; the policy agent validates the manifest
  US-007  in-transit FSM    dispatcher releases two stops; the driver arrives, delivers one and fails the other
  US-008  reporting         reports, executive KPIs, telemetry and the audit compliance report all reconcile

Each stage asserts what the next one depends on, so a regression anywhere fails with the stage that broke.
"""

from app.models.user import UserRole
from tests.conftest import SIGNATURE, auth_headers

API = "/api/v1"
HUB = {"name": "Kurla Regression Hub", "code": "HUB-E2E-01", "address": "LBS Marg, Kurla West, Mumbai",
       "latitude": 19.0657, "longitude": 72.8792, "contact_phone": "+91 22 2650 1234"}
STOPS = [
    ("E2E-001", "Reliance Retail BKC", 19.0660, 72.8680, 120, "09:00", "12:00", "EXPRESS"),
    ("E2E-002", "TCS Logistics Andheri", 19.1197, 72.8468, 80, "09:00", "14:00", "HIGH"),
    ("E2E-003", "Flipkart Bhiwandi Gate", 19.2813, 73.0483, 300, "10:00", "17:00", "STANDARD"),
    ("E2E-004", "HDFC Bank Powai", 19.1176, 72.9060, 40, "09:00", "13:00", "HIGH"),
    ("E2E-005", "DMart Thane West", 19.2183, 72.9781, 220, "11:00", "18:00", "STANDARD"),
]


def _register(client, email, role, full_name=None):
    return auth_headers(client, email, role, full_name)


def test_full_operating_day(client):
    admin = _register(client, "admin@e2e.io", UserRole.ADMIN.value)
    dispatcher = _register(client, "dispatcher@e2e.io", UserRole.DISPATCHER.value)
    driver = _register(client, "driver@e2e.io", UserRole.DRIVER.value, full_name="Rajesh Kumar")

    # ── US-001: fleet assets ─────────────────────────────────────────────────────────────────
    hub = client.post(f"{API}/fleet/hubs", headers=admin, json=HUB)
    assert hub.status_code == 201, hub.text
    hub_id = hub.json()["id"]
    vehicles = []
    for plate, vtype, kg, m3 in [("MH-02-EQ-7001", "VAN", 1500, 12), ("MH-04-EZ-7002", "BOX_TRUCK", 3500, 24)]:
        v = client.post(f"{API}/fleet/vehicles", headers=admin, json={
            "name": f"{vtype.title()} {plate[-4:]}", "plate_number": plate, "vehicle_type": vtype, "max_payload_kg": kg,
            "max_volume_m3": m3, "fuel_efficiency_kpl": 11.0, "assigned_hub_id": hub_id})
        assert v.status_code == 201, v.text
        vehicles.append(v.json())
    drv = client.post(f"{API}/fleet/drivers", headers=admin, json={
        "full_name": "Rajesh Kumar", "license_number": "DL-MH-E2E-0001", "license_type": "COMMERCIAL",
        "phone_number": "+91 98765 43210", "status": "ON_DUTY", "assigned_hub_id": hub_id,
        "current_vehicle_id": vehicles[0]["id"], "hazmat_endorsed": False})
    assert drv.status_code == 201, drv.text
    assert client.get(f"{API}/fleet/overview", headers=admin).status_code == 200

    # ── US-002: shipment intake ──────────────────────────────────────────────────────────────
    rows = [{"tracking_number": t, "customer_name": c, "destination_address": f"{c}, Mumbai Metropolitan Region",
             "latitude": lat, "longitude": lon, "weight_kg": kg, "volume_m3": round(kg / 200, 2),
             "time_window_start": ws, "time_window_end": we, "priority": pr, "hub_id": hub_id}
            for t, c, lat, lon, kg, ws, we, pr in STOPS]
    bad = {**rows[0], "tracking_number": "E2E-BAD", "latitude": 123.0}
    batch = client.post(f"{API}/shipments/batch", headers=dispatcher, json={"shipments": rows + [bad]})
    assert batch.status_code == 200, batch.text
    body = batch.json()
    assert body["successful_count"] == 5 and body["failed_count"] == 1
    shipments = {s["tracking_number"]: s for s in client.get(f"{API}/shipments", params={"search": "E2E-"}, headers=dispatcher).json()}
    assert set(shipments) == {s[0] for s in STOPS}

    # ── US-003: route planning ───────────────────────────────────────────────────────────────
    hub_point = {"id": "hub", "latitude": HUB["latitude"], "longitude": HUB["longitude"], "label": HUB["code"]}
    matrix = client.post(f"{API}/routes/distance-matrix", headers=dispatcher, json={
        "points": [hub_point] + [{"id": t, "latitude": lat, "longitude": lon} for t, _, lat, lon, *_ in STOPS]})
    assert matrix.status_code == 200 and len(matrix.json()["distance_km"]) == 6
    stops_in = [{"id": t, "latitude": lat, "longitude": lon, "weight_kg": kg, "volume_m3": round(kg / 200, 2),
                 "window_start": ws, "window_end": we} for t, _, lat, lon, kg, ws, we, _ in STOPS]
    fleet_in = [{"id": v["plate_number"], "capacity_kg": v["max_payload_kg"], "capacity_m3": v["max_volume_m3"],
                 "vehicle_type": v["vehicle_type"]} for v in vehicles]
    plan = client.post(f"{API}/routes/optimize", headers=dispatcher, json={"hub": hub_point, "stops": stops_in,
                                                                           "vehicles": fleet_in, "departure": "08:30"})
    assert plan.status_code == 200, plan.text
    routes = [r for r in plan.json()["routes"] if r["stop_ids"]]
    planned = [sid for r in routes for sid in r["stop_ids"]]
    assert sorted(planned) == sorted(s[0] for s in STOPS), "every stop is planned exactly once"

    by_plate = {v["plate_number"]: v for v in vehicles}
    route_vehicle = {r["vehicle_id"]: r for r in routes}
    first_plate = routes[0]["vehicle_id"]
    evaluate = client.post(f"{API}/routes/evaluate", headers=dispatcher, json={
        "hub": hub_point, "vehicle": {**fleet_in[[v["id"] for v in fleet_in].index(first_plate)], "label": first_plate},
        "stops": [s for s in stops_in if s["id"] in route_vehicle[first_plate]["stop_ids"]][::-1], "departure": "08:30"})
    assert evaluate.status_code == 200, evaluate.text

    # Dispatch the plan: assign each shipment to its planned vehicle.
    for r in routes:
        for sid in r["stop_ids"]:
            res = client.patch(f"{API}/shipments/{shipments[sid]['id']}/status", headers=dispatcher, json={"status": "ASSIGNED", "notes": "Planned by VRPTW"})
            assert res.status_code == 200, res.text

    # ── US-004: live operations (SLA check over the planned routes) ──────────────────────────
    live_routes = [{"vehicle": {**fleet_in[[v["id"] for v in fleet_in].index(r["vehicle_id"])], "label": r["vehicle_id"]},
                    "stops": [{**next(s for s in stops_in if s["id"] == sid), "name": sid} for sid in r["stop_ids"]],
                    "departure": "08:30"} for r in routes]
    sla = client.post(f"{API}/routes/sla-check", headers=dispatcher, json={
        "routes": [{"hub": hub_point, **r, "now": "09:00"} for r in live_routes]})
    assert sla.status_code == 200, sla.text

    # ── US-005: AI copilot ───────────────────────────────────────────────────────────────────
    q = client.post(f"{API}/copilot/query", headers=dispatcher, json={"query": f"{first_plate} broke down near Sion"})
    assert q.status_code == 200 and q.json()["intent"] == "VEHICLE_BREAKDOWN"
    card = client.post(f"{API}/copilot/proposals", headers=dispatcher, json={
        "message": f"{first_plate} broke down near Sion", "hub": hub_point, "routes": live_routes, "now": "09:00", "use_llm": False,
        "spare_vehicles": [{**f, "label": f["id"]} for f in fleet_in if f["id"] not in route_vehicle]})
    assert card.status_code == 201, card.text
    card = card.json()
    assert card["tool_call"]["name"] == "reassign_stops" and card["status"] == "PROPOSED"
    decided = client.post(f"{API}/copilot/proposals/{card['card_id']}/decision", headers=dispatcher, json={"decision": "ACCEPT", "note": "E2E"})
    assert decided.status_code == 200 and decided.json()["status"] == "ACCEPTED"
    assert client.post(f"{API}/copilot/proposals/{card['card_id']}/decision", headers=dispatcher, json={"decision": "REJECT"}).status_code == 409

    # ── US-006: compliance ───────────────────────────────────────────────────────────────────
    rag = client.post(f"{API}/rag/search", headers=dispatcher, json={"query": "maximum driving hours before a mandatory rest break"})
    assert rag.status_code == 200 and rag.json()["results"], rag.text
    manifest = [shipments[sid]["id"] for sid in route_vehicle[routes[0]["vehicle_id"]]["stop_ids"]]
    policy = client.post(f"{API}/copilot/policy/validate-route", headers=dispatcher, json={
        "vehicle_id": by_plate[first_plate]["id"], "driver_id": drv.json()["id"], "shipment_ids": manifest,
        "estimated_duration_minutes": 240})
    assert policy.status_code == 200, policy.text
    assert "is_compliant" in policy.json()

    # ── US-007: in-transit FSM ──────────────────────────────────────────────────────────────
    delivered_id = shipments["E2E-001"]["id"]
    failed_id = shipments["E2E-004"]["id"]
    for sid in (delivered_id, failed_id):
        # the dispatcher releases each shipment on the driver's vehicle; drivers may not pick vehicles themselves
        dep = client.post(f"{API}/transit/shipments/{sid}/depart", headers=dispatcher, json={"vehicle_id": vehicles[0]["id"], "notes": "Left Kurla hub"})
        assert dep.status_code == 200, dep.text
    assert client.post(f"{API}/transit/shipments/{delivered_id}/arrive", headers=driver, json={"latitude": 19.066, "longitude": 72.868}).status_code == 200
    done = client.post(f"{API}/transit/shipments/{delivered_id}/deliver", headers=driver, json={"recipient_name": "Store Manager", "signature": SIGNATURE})
    assert done.status_code == 200 and done.json()["current_status"] == "DELIVERED", done.text
    fail = client.post(f"{API}/transit/shipments/{failed_id}/fail", headers=driver, json={"reason_code": "CONSIGNEE_UNAVAILABLE", "notes": "Branch closed for audit"})
    assert fail.status_code == 200, fail.text
    # DELIVERED is terminal: it cannot be turned into a failure afterwards (a repeated "deliver" is an idempotent replay)
    late_fail = client.post(f"{API}/transit/shipments/{delivered_id}/fail", headers=driver, json={"reason_code": "OTHER", "notes": "Changed my mind"})
    assert late_fail.status_code == 400 and "Illegal FSM transition" in late_fail.json()["detail"]

    # ── US-008: reporting reconciles ─────────────────────────────────────────────────────────
    assert client.get(f"{API}/reports/metrics", headers=admin).status_code == 200
    exec_board = client.get(f"{API}/analytics/executive", headers=admin).json()
    live = exec_board["live"]["shipments_by_status"]
    assert live.get("DELIVERED") == 1 and live.get("FAILED") == 1
    telemetry = client.get(f"{API}/copilot/telemetry", headers=admin).json()
    assert telemetry["by_endpoint"]["query"]["count"] >= 1 and telemetry["by_endpoint"]["proposal"]["count"] >= 1

    report = client.get(f"{API}/audit/report", headers=admin).json()
    assert all(c["ok"] for c in report["checks"].values()), report["checks"]
    actions = report["by_action"]
    assert actions["STATUS_CHANGE"] >= 9 and actions["COPILOT_OVERRIDE"] == 1
    assert report["by_entity"]["Hub"] == 1 and report["by_entity"]["Vehicle"] == 2 and report["by_entity"]["Driver"] == 1
    assert report["by_entity"]["ShipmentBatch"] == 1
    audited_shipments = {e["entity_id"] for e in client.get(f"{API}/audit", params={"entity_type": "Shipment", "limit": 100}, headers=admin).json()}
    assert {delivered_id, failed_id} <= audited_shipments
