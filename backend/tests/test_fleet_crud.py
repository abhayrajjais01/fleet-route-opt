"""Comprehensive Test Suite for Fleet Management CRUD, Constraints & Metrics (US-002 Track A)."""
import pytest
from fastapi.testclient import TestClient


def test_hub_crud_and_uniqueness(client: TestClient):
    # 1. Create Hub
    hub_data = {
        "name": "Central Hub Mumbai",
        "code": "HUB-BOM-01",
        "address": "Andheri East, Mumbai, Maharashtra 400069",
        "latitude": 19.1136,
        "longitude": 72.8697,
        "contact_phone": "+91 9876543210",
        "operating_hours": "06:00 - 22:00",
    }
    resp = client.post("/api/v1/fleet/hubs", json=hub_data)
    assert resp.status_code == 201
    created_hub = resp.json()
    assert created_hub["code"] == "HUB-BOM-01"
    assert created_hub["name"] == "Central Hub Mumbai"
    hub_id = created_hub["id"]

    # 2. Duplicate Hub Code Fails (400)
    dup_resp = client.post("/api/v1/fleet/hubs", json=hub_data)
    assert dup_resp.status_code == 400
    assert "already exists" in dup_resp.json()["detail"]

    # 3. Read Hub by ID
    get_resp = client.get(f"/api/v1/fleet/hubs/{hub_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == hub_id

    # 4. Update Hub
    update_resp = client.put(
        f"/api/v1/fleet/hubs/{hub_id}",
        json={"name": "Central Hub Mumbai North"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Central Hub Mumbai North"


def test_vehicle_crud_and_relational_constraints(client: TestClient):
    # Setup Hub first
    hub_resp = client.post(
        "/api/v1/fleet/hubs",
        json={
            "name": "Bengaluru Depot",
            "code": "HUB-BLR-01",
            "address": "Whitefield, Bengaluru 560066",
            "latitude": 12.9698,
            "longitude": 77.7500,
            "contact_phone": "+91 9876543211",
        },
    )
    assert hub_resp.status_code == 201
    hub_id = hub_resp.json()["id"]

    # 1. Create Vehicle
    veh_data = {
        "name": "Heavy Freight Alpha",
        "plate_number": "KA-01-MJ-1234",
        "vehicle_type": "SEMI_TRUCK",
        "max_payload_kg": 12000.0,
        "max_volume_m3": 45.0,
        "fuel_efficiency_kpl": 4.5,
        "current_status": "AVAILABLE",
        "assigned_hub_id": hub_id,
    }
    resp = client.post("/api/v1/fleet/vehicles", json=veh_data)
    assert resp.status_code == 201
    created_veh = resp.json()
    assert created_veh["plate_number"] == "KA-01-MJ-1234"
    veh_id = created_veh["id"]

    # 2. Duplicate Plate Number Fails (400)
    dup_resp = client.post("/api/v1/fleet/vehicles", json=veh_data)
    assert dup_resp.status_code == 400

    # 3. Invalid Hub ID Fails (404)
    invalid_veh = {**veh_data, "plate_number": "KA-01-MJ-9999", "assigned_hub_id": 99999}
    bad_resp = client.post("/api/v1/fleet/vehicles", json=invalid_veh)
    assert bad_resp.status_code == 404
    assert "Assigned Hub does not exist" in bad_resp.json()["detail"]

    # 4. List Vehicles with Filter
    list_resp = client.get("/api/v1/fleet/vehicles?status=AVAILABLE")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) >= 1


def test_driver_crud_and_shift_limits(client: TestClient):
    # Setup Hub first
    hub_resp = client.post(
        "/api/v1/fleet/hubs",
        json={
            "name": "Delhi Central Hub",
            "code": "HUB-DEL-01",
            "address": "Connaught Place, New Delhi 110001",
            "latitude": 28.6315,
            "longitude": 77.2167,
            "contact_phone": "+91 9876543212",
        },
    )
    hub_id = hub_resp.json()["id"]

    # 1. Create Driver
    driver_data = {
        "full_name": "Rajesh Kumar",
        "license_number": "DL-0420110012345",
        "license_type": "COMMERCIAL",
        "phone_number": "+91 9123456780",
        "status": "ON_DUTY",
        "max_driving_hours_per_day": 10.0,
        "assigned_hub_id": hub_id,
    }
    resp = client.post("/api/v1/fleet/drivers", json=driver_data)
    assert resp.status_code == 201
    driver_id = resp.json()["id"]

    # 2. Driving hours > 14 fails validation (422)
    invalid_driver = {**driver_data, "license_number": "DL-9999", "max_driving_hours_per_day": 16.0}
    bad_resp = client.post("/api/v1/fleet/drivers", json=invalid_driver)
    assert bad_resp.status_code == 422

    # 3. Update Driver Status to RESTING
    up_resp = client.put(f"/api/v1/fleet/drivers/{driver_id}", json={"status": "RESTING"})
    assert up_resp.status_code == 200
    assert up_resp.json()["status"] == "RESTING"


def test_fleet_overview_metrics(client: TestClient):
    # Create Hub
    hub_resp = client.post(
        "/api/v1/fleet/hubs",
        json={
            "name": "Hyderabad Hub",
            "code": "HUB-HYD-01",
            "address": "HITEC City, Hyderabad 500081",
            "latitude": 17.4435,
            "longitude": 78.3772,
            "contact_phone": "+91 9876543213",
        },
    )
    hub_id = hub_resp.json()["id"]

    # Create 2 Vehicles
    client.post(
        "/api/v1/fleet/vehicles",
        json={
            "name": "Delivery Van 1",
            "plate_number": "TS-09-UB-1001",
            "vehicle_type": "VAN",
            "max_payload_kg": 1500.0,
            "max_volume_m3": 10.0,
            "current_status": "AVAILABLE",
            "assigned_hub_id": hub_id,
        },
    )
    client.post(
        "/api/v1/fleet/vehicles",
        json={
            "name": "Heavy Freight 2",
            "plate_number": "TS-09-UB-2002",
            "vehicle_type": "SEMI_TRUCK",
            "max_payload_kg": 10000.0,
            "max_volume_m3": 40.0,
            "current_status": "IN_TRANSIT",
            "assigned_hub_id": hub_id,
        },
    )

    # Create Driver
    client.post(
        "/api/v1/fleet/drivers",
        json={
            "full_name": "Anil Reddy",
            "license_number": "TS-123456789",
            "license_type": "COMMERCIAL",
            "phone_number": "+91 9988776655",
            "status": "ON_DUTY",
            "assigned_hub_id": hub_id,
        },
    )

    # Verify Overview Metrics
    overview_resp = client.get("/api/v1/fleet/overview")
    assert overview_resp.status_code == 200
    metrics = overview_resp.json()
    assert metrics["total_hubs"] >= 1
    assert metrics["total_vehicles"] >= 2
    assert metrics["available_vehicles"] >= 1
    assert metrics["in_transit_vehicles"] >= 1
    assert metrics["total_drivers"] >= 1
    assert metrics["on_duty_drivers"] >= 1
    assert metrics["fleet_capacity_kg"] >= 11500.0
