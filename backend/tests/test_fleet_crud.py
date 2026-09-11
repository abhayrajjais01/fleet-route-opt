"""Comprehensive tests for Fleet Assets (Hubs, Vehicles, Drivers) CRUD, Constraints, and Overview (US-002 Track A)."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app


def test_hub_crud_lifecycle(client: TestClient):
    # 1. Create Hub
    hub_data = {
        "name": "Mumbai Central Logistics Hub",
        "code": "HUB-BOM-01",
        "address": "Plot 10, MIDC Marol, Andheri East, Mumbai",
        "latitude": 19.1136,
        "longitude": 72.8697,
        "contact_phone": "+91-22-2820-1100",
        "operating_hours": "06:00 - 22:00",
    }
    create_resp = client.post("/api/v1/fleet/hubs", json=hub_data)
    assert create_resp.status_code == 201
    hub = create_resp.json()
    assert hub["code"] == "HUB-BOM-01"
    hub_id = hub["id"]

    # 2. Duplicate Hub Code Rejection
    dup_resp = client.post("/api/v1/fleet/hubs", json=hub_data)
    assert dup_resp.status_code == 400
    assert "already exists" in dup_resp.json()["detail"]

    # 3. Get Hub by ID
    get_resp = client.get(f"/api/v1/fleet/hubs/{hub_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == hub_data["name"]

    # 4. Update Hub
    update_resp = client.put(
        f"/api/v1/fleet/hubs/{hub_id}",
        json={"operating_hours": "05:00 - 23:00"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["operating_hours"] == "05:00 - 23:00"

    # 5. List Hubs
    list_resp = client.get("/api/v1/fleet/hubs")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) >= 1


def test_vehicle_crud_and_validation(client: TestClient):
    # Create Hub First
    hub_resp = client.post("/api/v1/fleet/hubs", json={
        "name": "Pune Regional Depot",
        "code": "HUB-PNQ-01",
        "address": "Hinjawadi Phase 2, Pune",
        "latitude": 18.5913,
        "longitude": 73.7389,
        "contact_phone": "+91-20-6710-2200",
        "operating_hours": "06:00 - 22:00",
    })
    hub_id = hub_resp.json()["id"]

    # 1. Create Vehicle
    vehicle_data = {
        "name": "Delivery Van V1",
        "plate_number": "MH-12-QQ-4001",
        "vehicle_type": "VAN",
        "max_payload_kg": 1500.0,
        "max_volume_m3": 12.0,
        "fuel_efficiency_kpl": 13.5,
        "current_status": "AVAILABLE",
        "assigned_hub_id": hub_id,
        "current_latitude": 18.5913,
        "current_longitude": 73.7389,
    }
    create_resp = client.post("/api/v1/fleet/vehicles", json=vehicle_data)
    assert create_resp.status_code == 201
    vehicle = create_resp.json()
    assert vehicle["plate_number"] == "MH-12-QQ-4001"
    vehicle_id = vehicle["id"]

    # 2. Non-existent Hub check
    bad_vehicle = vehicle_data.copy()
    bad_vehicle["plate_number"] = "MH-12-QQ-9999"
    bad_vehicle["assigned_hub_id"] = 99999
    bad_resp = client.post("/api/v1/fleet/vehicles", json=bad_vehicle)
    assert bad_resp.status_code == 404
    assert "Assigned Hub does not exist" in bad_resp.json()["detail"]

    # 3. Filter Vehicles by Status
    filter_resp = client.get("/api/v1/fleet/vehicles?status=AVAILABLE")
    assert filter_resp.status_code == 200
    assert len(filter_resp.json()) >= 1


def test_driver_crud_and_status(client: TestClient):
    # Create Hub
    hub_resp = client.post("/api/v1/fleet/hubs", json={
        "name": "Delhi NCR Depot",
        "code": "HUB-DEL-01",
        "address": "Okhla Phase 3, New Delhi",
        "latitude": 28.5355,
        "longitude": 77.2662,
        "contact_phone": "+91-11-2680-3300",
        "operating_hours": "05:00 - 23:00",
    })
    hub_id = hub_resp.json()["id"]

    # 1. Create Driver
    driver_data = {
        "full_name": "Rohan Deshmukh",
        "license_number": "DL-14-2021-9988",
        "license_type": "COMMERCIAL",
        "phone_number": "+91-98111-22334",
        "status": "ON_DUTY",
        "max_driving_hours_per_day": 9.0,
        "assigned_hub_id": hub_id,
    }
    create_resp = client.post("/api/v1/fleet/drivers", json=driver_data)
    assert create_resp.status_code == 201
    driver = create_resp.json()
    assert driver["full_name"] == "Rohan Deshmukh"
    driver_id = driver["id"]

    # 2. Update Driver status
    update_resp = client.put(
        f"/api/v1/fleet/drivers/{driver_id}",
        json={"status": "ON_TRIP"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "ON_TRIP"


def test_fleet_overview_aggregations(client: TestClient):
    # Create Hub, Vehicle, Driver
    hub_resp = client.post("/api/v1/fleet/hubs", json={
        "name": "Bangalore Logistics Gateway",
        "code": "HUB-BLR-01",
        "address": "Electronic City Phase 1, Bangalore",
        "latitude": 12.8452,
        "longitude": 77.6602,
        "contact_phone": "+91-80-4100-5500",
        "operating_hours": "06:00 - 22:00",
    })
    hub_id = hub_resp.json()["id"]

    client.post("/api/v1/fleet/vehicles", json={
        "name": "Heavy Carrier BLR-1",
        "plate_number": "KA-01-EE-7001",
        "vehicle_type": "BOX_TRUCK",
        "max_payload_kg": 2500.0,
        "max_volume_m3": 18.0,
        "fuel_efficiency_kpl": 10.0,
        "current_status": "AVAILABLE",
        "assigned_hub_id": hub_id,
    })

    client.post("/api/v1/fleet/drivers", json={
        "full_name": "Suresh Reddy",
        "license_number": "KA-01-2019-3344",
        "license_type": "COMMERCIAL",
        "phone_number": "+91-98450-99887",
        "status": "ON_DUTY",
        "max_driving_hours_per_day": 8.0,
        "assigned_hub_id": hub_id,
    })

    # Query Overview
    overview_resp = client.get("/api/v1/fleet/overview")
    assert overview_resp.status_code == 200
    stats = overview_resp.json()
    assert stats["total_hubs"] >= 1
    assert stats["total_vehicles"] >= 1
    assert stats["total_drivers"] >= 1
    assert stats["fleet_capacity_kg"] >= 2500.0
