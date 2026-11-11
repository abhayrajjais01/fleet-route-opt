"""
test_mobile_driver_api.py - Pytest Suite for Mobile Driver Manifest & Offline Sync (US-008, Week 9 Track B)

Verifies:
1. Driver mobile manifest retrieval (GET /api/v1/transit/driver/manifest) with assigned stops, phone contacts, and sync tokens.
2. Batch offline sync endpoint (POST /api/v1/transit/driver/offline-sync) replaying queued driver actions.
3. Resilient error isolation during offline sync replay.
4. Track A mock/stub interfaces (Route visualizer, Resequencer, Optimization tool, Downstream ETA).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core.security import hash_password, create_access_token
from app.models.user import User, UserRole
from app.models.fleet import Hub, Vehicle, VehicleStatus, VehicleType, Driver, DriverStatus, LicenseType
from app.models.shipment import Shipment, ShipmentStatus, ShipmentPriority
from app.services.optimizer.mock_stubs import (
    MockRouteVisualizer,
    MockRouteResequencer,
    MockOptimizationAgentTool,
    MockDownstreamETACalculator,
)

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def driver_env():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        driver_user = User(
            email="driver_rajesh@fleet.io",
            hashed_password=hash_password("password123"),
            full_name="Driver Rajesh",
            role=UserRole.DRIVER,
            is_active=True,
        )
        db.add(driver_user)
        db.flush()

        hub = Hub(
            name="Mumbai Depot",
            code="HUB-MUM",
            address="Kurla, Mumbai",
            latitude=19.0657,
            longitude=72.8792,
            contact_phone="+91-22-26501234",
            operating_hours="06:00 - 22:00",
        )
        db.add(hub)
        db.flush()

        veh = Vehicle(
            name="Tata Delivery 407",
            plate_number="MH-02-TR-7001",
            vehicle_type=VehicleType.VAN,
            max_payload_kg=1200.0,
            max_volume_m3=8.0,
            fuel_efficiency_kpl=11.0,
            current_status=VehicleStatus.IN_TRANSIT,
            assigned_hub_id=hub.id,
        )
        db.add(veh)
        db.flush()

        driver = Driver(
            full_name="Driver Rajesh",
            license_number="DL-MH-999",
            license_type=LicenseType.COMMERCIAL,
            phone_number="+91-98200-11223",
            status=DriverStatus.ON_TRIP,
            assigned_hub_id=hub.id,
            current_vehicle_id=veh.id,
        )
        db.add(driver)
        db.flush()

        s1 = Shipment(
            tracking_number="SHP-MOB-01",
            customer_name="Reliance Retail",
            destination_address="Andheri East, Mumbai",
            latitude=19.1136,
            longitude=72.8697,
            weight_kg=100.0,
            volume_m3=0.8,
            time_window_start="09:00",
            time_window_end="12:00",
            priority=ShipmentPriority.HIGH,
            status=ShipmentStatus.ASSIGNED,
            hub_id=hub.id,
            assigned_vehicle_id=veh.id,
        )
        s2 = Shipment(
            tracking_number="SHP-MOB-02",
            customer_name="D-Mart Supermarket",
            destination_address="Powai, Mumbai",
            latitude=19.1176,
            longitude=72.9060,
            weight_kg=150.0,
            volume_m3=1.2,
            time_window_start="10:00",
            time_window_end="13:00",
            priority=ShipmentPriority.STANDARD,
            status=ShipmentStatus.ASSIGNED,
            hub_id=hub.id,
            assigned_vehicle_id=veh.id,
        )
        db.add_all([s1, s2])
        db.commit()

        token = create_access_token({"sub": driver_user.email, "role": driver_user.role.value})

        yield {
            "db": db,
            "headers": {"Authorization": f"Bearer {token}"},
            "driver_id": driver.id,
            "vehicle_id": veh.id,
            "s1_id": s1.id,
            "s2_id": s2.id,
        }
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(driver_env):
    def override_get_db():
        try:
            yield driver_env["db"]
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_get_driver_mobile_manifest(client, driver_env):
    """Driver fetches mobile manifest returning assigned stops, customer phone, and sync token."""
    resp = client.get("/api/v1/transit/driver/manifest", headers=driver_env["headers"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["driver_name"] == "Driver Rajesh"
    assert data["vehicle_plate"] == "MH-02-TR-7001"
    assert data["total_stops"] == 2
    assert len(data["stops"]) == 2
    assert data["stops"][0]["customer_name"] == "Reliance Retail"
    assert data["stops"][0]["customer_phone"] == "+91-98200-11223"
    assert data["sync_token"] is not None


def test_driver_offline_sync_arrive_and_deliver(client, driver_env):
    """Driver replays queued offline actions (ARRIVE, DELIVER) via batch sync endpoint."""
    s1_id = driver_env["s1_id"]
    # First depart the shipment
    client.post(
        f"/api/v1/transit/shipments/{s1_id}/depart",
        json={},
        headers=driver_env["headers"],
    )

    sync_payload = {
        "actions": [
            {
                "action_id": "act-offline-001",
                "action_type": "ARRIVE",
                "shipment_id": s1_id,
                "client_timestamp": "2026-11-11T10:15:00Z",
                "payload": {"latitude": 19.1136, "longitude": 72.8697, "notes": "Offline check-in"},
            },
            {
                "action_id": "act-offline-002",
                "action_type": "DELIVER",
                "shipment_id": s1_id,
                "client_timestamp": "2026-11-11T10:20:00Z",
                "payload": {"recipient_name": "Sanjay Mehta", "signature_text": "OTP-9988"},
            },
        ]
    }

    resp = client.post(
        "/api/v1/transit/driver/offline-sync",
        json=sync_payload,
        headers=driver_env["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_actions"] == 2
    assert data["applied_count"] == 2
    assert data["failed_count"] == 0
    assert data["results"][0]["success"] is True
    assert data["results"][0]["new_status"] == "ARRIVED"
    assert data["results"][1]["success"] is True
    assert data["results"][1]["new_status"] == "DELIVERED"


def test_driver_offline_sync_error_isolation(client, driver_env):
    """An invalid action in the offline batch is cleanly reported as failed without crashing the batch."""
    sync_payload = {
        "actions": [
            {
                "action_id": "act-err-999",
                "action_type": "DELIVER",
                "shipment_id": 999999,  # Non-existent shipment
                "client_timestamp": "2026-11-11T10:30:00Z",
                "payload": {"recipient_name": "Ghost"},
            }
        ]
    }
    resp = client.post(
        "/api/v1/transit/driver/offline-sync",
        json=sync_payload,
        headers=driver_env["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["applied_count"] == 0
    assert data["failed_count"] == 1
    assert data["results"][0]["success"] is False
    assert "not found" in data["results"][0]["error"].lower()


def test_trackA_mock_stubs():
    """Verifies that Track A mock stubs are functional for Track B integration."""
    manifest = MockRouteVisualizer.generate_split_manifest(
        vehicle_id=1,
        plate_number="MH-01-AB-1234",
        driver_name="Test Driver",
        stops=[{"id": 1}],
    )
    assert manifest.capacity_used_pct == 75.0
    assert len(manifest.polylines) > 0

    reseq = MockRouteResequencer.calculate_resequence([1, 2, 3], 0, 2)
    assert reseq.resequenced is True
    assert reseq.new_order == [2, 3, 1]

    tool_res = MockOptimizationAgentTool.run_reoptimization(vehicle_id=1, unserved_stop_ids=[2, 3])
    assert tool_res["status"] == "PROPOSED"

    ripple = MockDownstreamETACalculator.recalculate_ripple_etas(
        delay_minutes=30,
        remaining_stops=[{"id": 10, "eta_min": 600, "window_end_min": 620}],
    )
    assert len(ripple) == 1
    assert ripple[0].predicted_eta_min == 630
    assert ripple[0].sla_breach is True

