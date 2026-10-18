"""
test_transit_fsm.py - Comprehensive Pytest Suite for In-Transit FSM & Telemetry Tracking (US-008, Week 6 Track B)

Verifies:
1. Strict FSM state transition validation (Directional rules).
2. Driver action endpoints (depart, arrive, deliver, fail, delay, redispatch).
3. Telemetry synchronization (Vehicle and Driver duty states).
4. Immutable audit trail logging on every status transition.
5. Multi-stop trip execution progress calculation.
6. Role-based access control (Driver actions vs Dispatcher redispatch).
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
from app.models.audit import AuditLog, AuditAction
from app.schemas.transit import TransitFailureReason

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def fsm_env():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        # 1. Seed Users
        admin = User(
            email="admin_fsm@fleet.io",
            hashed_password=hash_password("password123"),
            full_name="Admin FSM",
            role=UserRole.ADMIN,
            is_active=True,
        )
        dispatcher = User(
            email="dispatch_fsm@fleet.io",
            hashed_password=hash_password("password123"),
            full_name="Dispatcher FSM",
            role=UserRole.DISPATCHER,
            is_active=True,
        )
        driver_user = User(
            email="driver_fsm@fleet.io",
            hashed_password=hash_password("password123"),
            full_name="Driver Rajesh",
            role=UserRole.DRIVER,
            is_active=True,
        )
        db.add_all([admin, dispatcher, driver_user])
        db.flush()

        # 2. Seed Hub
        hub = Hub(
            name="Mumbai Central Depot",
            code="HUB-MUM-01",
            address="Kurla West, Mumbai",
            latitude=19.0657,
            longitude=72.8792,
            contact_phone="+91-22-26501234",
            operating_hours="06:00 - 22:00",
        )
        db.add(hub)
        db.flush()

        # 3. Seed Vehicle
        vehicle = Vehicle(
            name="Tata 407 Delivery Van",
            plate_number="MH-02-TR-7001",
            vehicle_type=VehicleType.VAN,
            max_payload_kg=1200.0,
            max_volume_m3=8.5,
            fuel_efficiency_kpl=11.5,
            current_status=VehicleStatus.AVAILABLE,
            assigned_hub_id=hub.id,
        )
        db.add(vehicle)
        db.flush()

        # 4. Seed Driver
        driver = Driver(
            full_name="Driver Rajesh",
            license_number="DL-MH-2022-998877",
            license_type=LicenseType.COMMERCIAL,
            phone_number="+91-9876543210",
            status=DriverStatus.ON_DUTY,
            assigned_hub_id=hub.id,
            current_vehicle_id=vehicle.id,
        )
        db.add(driver)
        db.flush()

        # 5. Seed Shipments
        s1 = Shipment(
            tracking_number="SHP-FSM-001",
            customer_name="Reliance Retail",
            destination_address="Andheri East, Mumbai",
            latitude=19.1136,
            longitude=72.8697,
            weight_kg=250.0,
            volume_m3=1.2,
            time_window_start="09:00",
            time_window_end="13:00",
            priority=ShipmentPriority.HIGH,
            status=ShipmentStatus.ASSIGNED,
            hub_id=hub.id,
            assigned_vehicle_id=vehicle.id,
        )
        s2 = Shipment(
            tracking_number="SHP-FSM-002",
            customer_name="Tata Croma",
            destination_address="Bandra Kurla Complex, Mumbai",
            latitude=19.0600,
            longitude=72.8600,
            weight_kg=180.0,
            volume_m3=0.9,
            time_window_start="10:00",
            time_window_end="14:00",
            priority=ShipmentPriority.STANDARD,
            status=ShipmentStatus.ASSIGNED,
            hub_id=hub.id,
            assigned_vehicle_id=vehicle.id,
        )
        s3 = Shipment(
            tracking_number="SHP-FSM-003",
            customer_name="Nykaa Beauty",
            destination_address="Powai, Mumbai",
            latitude=19.1176,
            longitude=72.9060,
            weight_kg=80.0,
            volume_m3=0.4,
            time_window_start="11:00",
            time_window_end="16:00",
            priority=ShipmentPriority.LOW,
            status=ShipmentStatus.UNASSIGNED,
            hub_id=hub.id,
            assigned_vehicle_id=None,
        )
        db.add_all([s1, s2, s3])
        db.commit()

        # Generate JWT Tokens
        admin_tok = create_access_token({"sub": admin.email, "role": admin.role.value})
        disp_tok = create_access_token({"sub": dispatcher.email, "role": dispatcher.role.value})
        driver_tok = create_access_token({"sub": driver_user.email, "role": driver_user.role.value})

        yield {
            "db": db,
            "admin_headers": {"Authorization": f"Bearer {admin_tok}"},
            "disp_headers": {"Authorization": f"Bearer {disp_tok}"},
            "driver_headers": {"Authorization": f"Bearer {driver_tok}"},
            "vehicle_id": vehicle.id,
            "s1_id": s1.id,
            "s2_id": s2.id,
            "s3_id": s3.id,
        }
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def fsm_client(fsm_env):
    def _override():
        try:
            yield fsm_env["db"]
        finally:
            pass

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_fsm_transition_rules_endpoint(fsm_client, fsm_env):
    """GET /api/v1/transit/fsm/transitions returns the valid transition dictionary."""
    resp = fsm_client.get("/api/v1/transit/fsm/transitions", headers=fsm_env["driver_headers"])
    assert resp.status_code == 200
    data = resp.json()
    assert "UNASSIGNED" in data
    assert "IN_TRANSIT" in data
    assert "ARRIVED" in data
    assert "DELIVERED" in data
    assert data["DELIVERED"] == []  # Terminal


def test_depart_shipment_happy_path(fsm_client, fsm_env):
    """Driver departs with ASSIGNED shipment -> IN_TRANSIT and vehicle/driver duty states synchronize."""
    s1_id = fsm_env["s1_id"]
    resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s1_id}/depart",
        json={"notes": "Departed Kurla hub via Eastern Express"},
        headers=fsm_env["driver_headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["previous_status"] == "ASSIGNED"
    assert data["current_status"] == "IN_TRANSIT"
    assert data["tracking_number"] == "SHP-FSM-001"

    # Check vehicle and driver synced
    db = fsm_env["db"]
    veh = db.query(Vehicle).filter(Vehicle.id == fsm_env["vehicle_id"]).first()
    assert veh.current_status == VehicleStatus.IN_TRANSIT

    drv = db.query(Driver).filter(Driver.current_vehicle_id == fsm_env["vehicle_id"]).first()
    assert drv.status == DriverStatus.ON_TRIP

    # Check Audit Log created
    audit = db.query(AuditLog).filter(AuditLog.entity_id == s1_id, AuditLog.entity_type == "Shipment").first()
    assert audit is not None
    assert audit.action_type == AuditAction.STATUS_CHANGE
    assert "IN_TRANSIT" in audit.details


def test_depart_unassigned_fails(fsm_client, fsm_env):
    """Attempting to depart an UNASSIGNED shipment without a vehicle fails with 400 Bad Request."""
    s3_id = fsm_env["s3_id"]
    resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s3_id}/depart",
        json={"notes": "Attempting early departure"},
        headers=fsm_env["driver_headers"],
    )
    assert resp.status_code == 400
    assert "No vehicle assigned" in resp.json()["detail"]


def test_arrive_at_stop_happy_path(fsm_client, fsm_env):
    """Driver arrives at delivery stop -> transitions IN_TRANSIT to ARRIVED with GPS coordinates."""
    s1_id = fsm_env["s1_id"]
    # 1. Depart first
    fsm_client.post(f"/api/v1/transit/shipments/{s1_id}/depart", json={}, headers=fsm_env["driver_headers"])

    # 2. Arrive
    resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s1_id}/arrive",
        json={"latitude": 19.1136, "longitude": 72.8697, "notes": "Gate check-in complete"},
        headers=fsm_env["driver_headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["previous_status"] == "IN_TRANSIT"
    assert data["current_status"] == "ARRIVED"
    assert data["metadata"]["checkin_lat"] == 19.1136


def test_arrive_when_not_in_transit_fails(fsm_client, fsm_env):
    """Attempting to mark ARRIVED when shipment is still ASSIGNED fails with 400."""
    s2_id = fsm_env["s2_id"]
    resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s2_id}/arrive",
        json={},
        headers=fsm_env["driver_headers"],
    )
    assert resp.status_code == 400
    assert "Illegal FSM transition" in resp.json()["detail"]


def test_deliver_shipment_happy_path(fsm_client, fsm_env):
    """Driver confirms delivery with recipient name -> transitions to DELIVERED."""
    s1_id = fsm_env["s1_id"]
    fsm_client.post(f"/api/v1/transit/shipments/{s1_id}/depart", json={}, headers=fsm_env["driver_headers"])
    fsm_client.post(f"/api/v1/transit/shipments/{s1_id}/arrive", json={}, headers=fsm_env["driver_headers"])

    resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s1_id}/deliver",
        json={
            "recipient_name": "Sanjay Mehta (Store Mgr)",
            "signature_text": "SIG-OTP-98214",
            "notes": "Handed to dock supervisor with invoice",
        },
        headers=fsm_env["driver_headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["previous_status"] == "ARRIVED"
    assert data["current_status"] == "DELIVERED"
    assert data["metadata"]["recipient_name"] == "Sanjay Mehta (Store Mgr)"


def test_deliver_terminal_state_cannot_transition(fsm_client, fsm_env):
    """A DELIVERED shipment cannot transition to IN_TRANSIT or FAILED."""
    s1_id = fsm_env["s1_id"]
    fsm_client.post(f"/api/v1/transit/shipments/{s1_id}/depart", json={}, headers=fsm_env["driver_headers"])
    fsm_client.post(
        f"/api/v1/transit/shipments/{s1_id}/deliver",
        json={"recipient_name": "John Doe"},
        headers=fsm_env["driver_headers"],
    )

    # Attempt transition back to IN_TRANSIT
    resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s1_id}/depart",
        json={},
        headers=fsm_env["driver_headers"],
    )
    assert resp.status_code == 400
    assert "Illegal FSM transition" in resp.json()["detail"]


def test_fail_delivery_with_reason_code(fsm_client, fsm_env):
    """Reporting a delivery failure transitions status to FAILED with structured reason code."""
    s2_id = fsm_env["s2_id"]
    fsm_client.post(f"/api/v1/transit/shipments/{s2_id}/depart", json={}, headers=fsm_env["driver_headers"])

    resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s2_id}/fail",
        json={
            "reason_code": TransitFailureReason.CONSIGNEE_UNAVAILABLE.value,
            "notes": "Office closed on Sunday, security denied access",
        },
        headers=fsm_env["driver_headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["current_status"] == "FAILED"
    assert data["metadata"]["reason_code"] == "CONSIGNEE_UNAVAILABLE"


def test_redispatch_failed_shipment(fsm_client, fsm_env):
    """Dispatcher redispatches a FAILED shipment back to UNASSIGNED for rescheduling."""
    s2_id = fsm_env["s2_id"]
    fsm_client.post(f"/api/v1/transit/shipments/{s2_id}/depart", json={}, headers=fsm_env["driver_headers"])
    fsm_client.post(
        f"/api/v1/transit/shipments/{s2_id}/fail",
        json={"reason_code": "CONSIGNEE_UNAVAILABLE", "notes": "No answer"},
        headers=fsm_env["driver_headers"],
    )

    resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s2_id}/redispatch",
        json={"notes": "Rescheduling delivery for Monday morning"},
        headers=fsm_env["disp_headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["previous_status"] == "FAILED"
    assert data["current_status"] == "UNASSIGNED"
    assert data["assigned_vehicle_id"] is None


def test_report_delay_updates_audit(fsm_client, fsm_env):
    """Reporting a transit delay records delay minutes in audit without breaking FSM status."""
    s1_id = fsm_env["s1_id"]
    fsm_client.post(f"/api/v1/transit/shipments/{s1_id}/depart", json={}, headers=fsm_env["driver_headers"])

    resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s1_id}/delay",
        json={"delay_minutes": 45, "reason": "Heavy waterlogging near Kurla flyover"},
        headers=fsm_env["driver_headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["current_status"] == "IN_TRANSIT"
    assert data["metadata"]["delay_minutes"] == 45

    # Reporting delay on UNASSIGNED shipment fails
    s3_id = fsm_env["s3_id"]
    fail_resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s3_id}/delay",
        json={"delay_minutes": 20, "reason": "Traffic"},
        headers=fsm_env["driver_headers"],
    )
    assert fail_resp.status_code == 400


def test_trip_fsm_progress_metrics_and_driver_role(fsm_client, fsm_env):
    """Verifies multi-stop trip progress aggregation and role protection."""
    vehicle_id = fsm_env["vehicle_id"]
    s1_id = fsm_env["s1_id"]
    s2_id = fsm_env["s2_id"]

    # Deliver S1
    fsm_client.post(f"/api/v1/transit/shipments/{s1_id}/depart", json={}, headers=fsm_env["driver_headers"])
    fsm_client.post(f"/api/v1/transit/shipments/{s1_id}/deliver", json={"recipient_name": "R. Sharma"}, headers=fsm_env["driver_headers"])

    # Query trip progress
    resp = fsm_client.get(f"/api/v1/transit/trips/{vehicle_id}/progress", headers=fsm_env["driver_headers"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_stops"] == 2
    assert data["completed_stops"] == 1
    assert data["pending_stops"] == 1
    assert data["trip_progress_pct"] == 50.0
    assert len(data["stops"]) == 2

    # Driver cannot redispatch (Dispatcher/Admin role required)
    redispatch_fail = fsm_client.post(
        f"/api/v1/transit/shipments/{s2_id}/redispatch",
        json={},
        headers=fsm_env["driver_headers"],
    )
    assert redispatch_fail.status_code == 403


def test_driver_forbidden_to_reassign_vehicle_on_departure(fsm_client, fsm_env):
    """Driver role cannot reassign a shipment to a different vehicle during departure (403)."""
    db = fsm_env["db"]
    veh1 = db.query(Vehicle).filter(Vehicle.id == fsm_env["vehicle_id"]).first()
    # Seed a second vehicle
    v2 = Vehicle(
        name="Mahindra Bolero Pickup",
        plate_number="MH-02-TR-9999",
        vehicle_type=VehicleType.VAN,
        max_payload_kg=900.0,
        max_volume_m3=6.0,
        fuel_efficiency_kpl=13.0,
        current_status=VehicleStatus.AVAILABLE,
        assigned_hub_id=veh1.assigned_hub_id,
    )
    db.add(v2)
    db.commit()

    s1_id = fsm_env["s1_id"]
    resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s1_id}/depart",
        json={"vehicle_id": v2.id, "notes": "Unauthorized vehicle switch by driver"},
        headers=fsm_env["driver_headers"],
    )
    assert resp.status_code == 403
    assert "Drivers cannot reassign shipments" in resp.json()["detail"]


def test_dispatcher_can_reassign_vehicle_and_prior_vehicle_preserved_in_audit(fsm_client, fsm_env):
    """Dispatcher can reassign vehicle on departure, and audit trail preserves the true old vehicle ID."""
    import json
    db = fsm_env["db"]
    old_veh_id = fsm_env["vehicle_id"]
    veh1 = db.query(Vehicle).filter(Vehicle.id == old_veh_id).first()
    v2 = Vehicle(
        name="Force Delivery Truck",
        plate_number="MH-02-TR-8888",
        vehicle_type=VehicleType.BOX_TRUCK,
        max_payload_kg=2500.0,
        max_volume_m3=18.0,
        fuel_efficiency_kpl=8.5,
        current_status=VehicleStatus.AVAILABLE,
        assigned_hub_id=veh1.assigned_hub_id,
    )
    db.add(v2)
    db.commit()

    s1_id = fsm_env["s1_id"]
    resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s1_id}/depart",
        json={"vehicle_id": v2.id, "notes": "Reassigned by dispatch supervisor"},
        headers=fsm_env["disp_headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["assigned_vehicle_id"] == v2.id
    assert data["metadata"]["previous_vehicle_id"] == old_veh_id

    # Verify immutable audit log snapshot captures old_veh_id in before_state and v2.id in after_state
    audit = db.query(AuditLog).filter(
        AuditLog.entity_id == s1_id,
        AuditLog.entity_type == "Shipment",
        AuditLog.action_type == AuditAction.STATUS_CHANGE,
    ).first()
    assert audit is not None
    before_dict = json.loads(audit.before_state) if isinstance(audit.before_state, str) else audit.before_state
    after_dict = json.loads(audit.after_state) if isinstance(audit.after_state, str) else audit.after_state
    assert before_dict["vehicle_id"] == old_veh_id
    assert after_dict["vehicle_id"] == v2.id


def test_depart_fails_when_vehicle_is_maintenance_status(fsm_client, fsm_env):
    """Departure is blocked if assigned vehicle is in MAINTENANCE status (400)."""
    db = fsm_env["db"]
    veh = db.query(Vehicle).filter(Vehicle.id == fsm_env["vehicle_id"]).first()
    veh.current_status = VehicleStatus.MAINTENANCE
    db.commit()

    s1_id = fsm_env["s1_id"]
    resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s1_id}/depart",
        json={},
        headers=fsm_env["disp_headers"],
    )
    assert resp.status_code == 400
    assert "MAINTENANCE" in resp.json()["detail"]


def test_driver_cannot_depart_vehicle_assigned_to_different_driver(fsm_client, fsm_env):
    """Driver A cannot depart a vehicle assigned to Driver B (403)."""
    db = fsm_env["db"]
    other_driver_user = User(
        email="driver_other@fleet.io",
        hashed_password=hash_password("password123"),
        full_name="Driver Other",
        role=UserRole.DRIVER,
        is_active=True,
    )
    db.add(other_driver_user)
    db.commit()

    other_token = create_access_token(data={"sub": other_driver_user.email, "role": other_driver_user.role.value})
    other_headers = {"Authorization": f"Bearer {other_token}"}

    s1_id = fsm_env["s1_id"]
    resp = fsm_client.post(
        f"/api/v1/transit/shipments/{s1_id}/depart",
        json={},
        headers=other_headers,
    )
    assert resp.status_code == 403
    assert "is not authorized to depart vehicle" in resp.json()["detail"]
