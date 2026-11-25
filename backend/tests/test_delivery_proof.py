"""
test_delivery_proof.py - A shipment is only DELIVERED with real proof: a verified delivery code or a drawn signature
"""

import pytest

from app.models.delivery import DeliveryProof
from app.models.fleet import Driver
from app.models.shipment import Shipment, ShipmentStatus
from app.services.delivery_proof import check_strokes
from tests.conftest import SIGNATURE, TestingSessionLocal, auth_headers

API = "/api/v1"


@pytest.fixture
def trip(client):
    admin = auth_headers(client, "pod-admin@pod.io", "ADMIN")
    driver = auth_headers(client, "pod-driver@pod.io", "DRIVER", full_name="Pod Driver")
    hub = client.post(f"{API}/fleet/hubs", headers=admin, json={"name": "Pod Hub", "code": "HUB-POD", "address": "1 Test Road", "latitude": 19.1,
                      "longitude": 72.9, "contact_phone": "+91 22 0000"}).json()["id"]
    vehicle = client.post(f"{API}/fleet/vehicles", headers=admin, json={"name": "Van", "plate_number": "MH-02-PD-1000", "vehicle_type": "VAN",
                          "max_payload_kg": 1000, "max_volume_m3": 9, "fuel_efficiency_kpl": 10, "assigned_hub_id": hub}).json()["id"]
    client.post(f"{API}/fleet/drivers", headers=admin, json={"full_name": "Pod Driver", "license_number": "DL-POD", "license_type": "COMMERCIAL",
                "phone_number": "+91 99999", "status": "ON_DUTY", "assigned_hub_id": hub, "current_vehicle_id": vehicle})
    ids = []
    for i in range(2):
        ids.append(client.post(f"{API}/shipments", headers=admin, json={"tracking_number": f"POD-{i}", "customer_name": "Acme", "destination_address": "22 Market Street",
                   "latitude": 19.05, "longitude": 72.85, "weight_kg": 5, "volume_m3": 0.1, "hub_id": hub}).json()["id"])
    db = TestingSessionLocal()
    db.query(Shipment).update({"status": ShipmentStatus.ARRIVED, "assigned_vehicle_id": vehicle})
    db.commit()
    db.close()
    return {"admin": admin, "driver": driver, "ids": ids, "vehicle": vehicle}


def _deliver(client, trip, i=0, who="driver", **proof):
    return client.post(f"{API}/transit/shipments/{trip['ids'][i]}/deliver", headers=trip[who], json={"recipient_name": "R. Sharma", **proof})


def _status(client, trip, i=0):
    return client.get(f"{API}/shipments/{trip['ids'][i]}", headers=trip["admin"]).json()["status"]


@pytest.mark.parametrize("proof", [
    {}, {"signature_text": "SIG-VERIFIED"}, {"signature_text": "OTP-VERIFIED"}, {"signature": []}, {"signature": [[]]},
    {"signature": [[[0.5, 0.5]]]},                                   # a dot
    {"signature": [[[0.5, 0.5]] * 20]},                              # a long press
    {"signature": [[[9, 9], [8, 8]] * 10]},                          # off the pad
    {"signature": "SIGNED"}, {"delivery_code": "12345"}, {"delivery_code": "OTP-VERIFIED"},
])
def test_placeholders_are_not_proof(client, trip, proof):
    for who in ("driver", "admin"):
        assert _deliver(client, trip, who=who, **proof).status_code == 422
    assert _status(client, trip) == "ARRIVED"


def test_signature_delivers_and_is_kept(client, trip):
    res = _deliver(client, trip, signature=SIGNATURE)
    assert res.status_code == 200 and res.json()["metadata"]["proof"] == "SIGNATURE"
    proof = client.get(f"{API}/transit/shipments/{trip['ids'][0]}/proof", headers=trip["admin"]).json()
    assert proof["method"] == "SIGNATURE" and proof["recipient_name"] == "R. Sharma" and proof["captured_by_name"] == "Pod Driver"
    assert proof["signature"] == check_strokes(SIGNATURE)
    assert client.get(f"{API}/transit/shipments/{trip['ids'][0]}/proof", headers=trip["driver"]).status_code == 403
    assert client.get(f"{API}/transit/shipments/{trip['ids'][1]}/proof", headers=trip["admin"]).status_code == 404

    # A replay changes nothing: the first proof stands.
    again = client.post(f"{API}/transit/shipments/{trip['ids'][0]}/deliver", headers=trip["driver"], json={"recipient_name": "Someone Else", "signature": SIGNATURE})
    assert again.status_code == 200
    db = TestingSessionLocal()
    assert [p.recipient_name for p in db.query(DeliveryProof).all()] == ["R. Sharma"]
    db.close()
    assert client.delete(f"{API}/shipments/{trip['ids'][0]}", headers=trip["admin"]).status_code == 409


def test_delivery_code_is_for_dispatch_and_verified_by_the_server(client, trip):
    url = f"{API}/shipments/{trip['ids'][0]}/delivery-code"
    assert client.post(url, headers=trip["driver"]).status_code == 403
    assert _deliver(client, trip, delivery_code="000000").status_code == 409        # none issued yet
    code = client.post(url, headers=trip["admin"]).json()["code"]
    assert len(code) == 6 and code.isdigit()
    assert client.post(url, headers=trip["admin"]).json()["code"] == code           # stable until reissued
    for who in ("admin", "driver"):
        assert code not in client.get(f"{API}/shipments/{trip['ids'][0]}", headers=trip[who]).text
    wrong = f"{(int(code) + 1) % 1_000_000:06d}"
    bad = _deliver(client, trip, delivery_code=wrong)
    assert bad.status_code == 422 and "4 attempts left" in bad.json()["detail"]
    ok = _deliver(client, trip, delivery_code=code)
    assert ok.status_code == 200 and ok.json()["metadata"]["proof"] == "DELIVERY_CODE"


def test_wrong_codes_lock_until_reissued(client, trip):
    url = f"{API}/shipments/{trip['ids'][0]}/delivery-code"
    code = client.post(url, headers=trip["admin"]).json()["code"]
    wrong = f"{(int(code) + 1) % 1_000_000:06d}"
    for _ in range(5):
        assert _deliver(client, trip, delivery_code=wrong).status_code == 422
    assert _deliver(client, trip, delivery_code=code).status_code == 409            # right code, but locked
    assert client.post(url, headers=trip["admin"]).json()["attempts_left"] == 0
    fresh = client.post(url, headers=trip["admin"], params={"reissue": True}).json()
    assert fresh["attempts_left"] == 5
    assert _deliver(client, trip, delivery_code=fresh["code"]).status_code == 200


def test_no_other_way_to_mark_delivered(client, trip):
    url = f"{API}/shipments/{trip['ids'][0]}/status"
    for who in ("driver", "admin"):
        assert client.patch(url, headers=trip[who], json={"status": "DELIVERED"}).status_code == 409
    stranger = auth_headers(client, "pod-other@pod.io", "DRIVER", full_name="Other Person")
    assert client.patch(url, headers=stranger, json={"status": "FAILED"}).status_code == 403
    born = client.post(f"{API}/shipments", headers=trip["admin"], json={"tracking_number": "POD-X", "customer_name": "Acme", "destination_address": "22 Market Street",
                       "latitude": 19, "longitude": 72.8, "weight_kg": 1, "volume_m3": 1, "hub_id": 1, "status": "DELIVERED"})
    assert born.status_code == 422
    assert _status(client, trip) == "ARRIVED"


def test_offline_queue_needs_the_same_proof(client, trip):
    def sync(payload):
        return client.post(f"{API}/transit/driver/offline-sync", headers=trip["driver"], json={"actions": [
            {"action_id": "a", "action_type": "DELIVER", "shipment_id": trip["ids"][0], "client_timestamp": "2026-11-25T10:00:00Z", "payload": payload}]}).json()
    for payload in ({}, {"recipient_name": "X Y"}, {"recipient_name": "X Y", "signature_text": "OTP-VERIFIED"}, {"recipient_name": "X Y", "signature": [[[0.5, 0.5]]]}):
        assert sync(payload)["applied_count"] == 0
    assert "sign" in sync({"recipient_name": "X Y", "signature": [[[0.5, 0.5]]]})["results"][0]["error"].lower()
    assert sync({"recipient_name": "X Y", "signature": SIGNATURE})["applied_count"] == 1
    assert _status(client, trip) == "DELIVERED"


def test_last_delivery_frees_the_vehicle(client, trip):
    for i in range(2):
        assert _deliver(client, trip, i, signature=SIGNATURE).status_code == 200
    v = client.get(f"{API}/fleet/vehicles/{trip['vehicle']}", headers=trip["admin"]).json()
    assert v["current_status"] == "AVAILABLE"
    db = TestingSessionLocal()
    assert db.query(Driver).one().status.value == "ON_DUTY"
    db.close()
