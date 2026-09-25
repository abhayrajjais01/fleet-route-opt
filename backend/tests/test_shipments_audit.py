"""
test_shipments_audit.py - Automated Pytest Suite for Shipments & Immutable Audit Logging (Track B: Week 3)
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
from app.models.fleet import Hub
from app.models.shipment import Shipment, ShipmentStatus, ShipmentPriority
from app.models.audit import AuditLog, AuditAction

# Setup in-memory SQLite database isolated per test session
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        # Seed test users
        admin = User(
            email="admin_test@fleet.io",
            hashed_password=hash_password("adminpass"),
            full_name="Admin Tester",
            role=UserRole.ADMIN,
            is_active=True,
        )
        dispatcher = User(
            email="dispatcher_test@fleet.io",
            hashed_password=hash_password("disp会在pass"),
            full_name="Dispatcher Tester",
            role=UserRole.DISPATCHER,
            is_active=True,
        )
        driver = User(
            email="driver_test@fleet.io",
            hashed_password=hash_password("driverpass"),
            full_name="Driver Tester",
            role=UserRole.DRIVER,
            is_active=True,
        )
        hub = Hub(
            name="Mumbai Test Hub",
            code="HUB-TEST-01",
            address="123 Test Expressway",
            latitude=19.0760,
            longitude=72.8777,
            contact_phone="+91-22-12345678",
            operating_hours="06:00 - 22:00",
        )
        db.add_all([admin, dispatcher, driver, hub])
        db.commit()
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def get_token(email: str, role: str) -> str:
    return create_access_token(data={"sub": email, "role": role})


# ------------------------------------------------------------------------------
# TESTS
# ------------------------------------------------------------------------------

def test_create_shipment_success(client, db_session):
    token = get_token("dispatcher_test@fleet.io", "DISPATCHER")
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "tracking_number": "SHP-TEST-001",
        "customer_name": "Acme Retail Ltd",
        "destination_address": "Bandra Kurla Complex, Mumbai",
        "latitude": 19.0657,
        "longitude": 72.8687,
        "weight_kg": 250.5,
        "volume_m3": 1.8,
        "time_window_start": "10:00",
        "time_window_end": "14:00",
        "priority": "HIGH",
        "status": "UNASSIGNED",
        "hub_id": 1,
    }

    response = client.post("/api/v1/shipments", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["tracking_number"] == "SHP-TEST-001"
    assert data["weight_kg"] == 250.5
    assert data["priority"] == "HIGH"
    assert data["status"] == "UNASSIGNED"

    # Verify audit log was created
    audit = db_session.query(AuditLog).filter(AuditLog.entity_id == data["id"]).first()
    assert audit is not None
    assert audit.action_type == AuditAction.ASSET_CREATED
    assert audit.actor_name == "Dispatcher Tester"
    assert "Acme Retail Ltd" in audit.details


def test_shipment_validation_errors(client):
    token = get_token("dispatcher_test@fleet.io", "DISPATCHER")
    headers = {"Authorization": f"Bearer {token}"}

    # Test invalid coordinates & negative weight
    invalid_payload = {
        "tracking_number": "SHP-BAD-001",
        "customer_name": "Invalid Order",
        "destination_address": "Nowhere",
        "latitude": 95.0,  # Invalid (>90)
        "longitude": 72.8687,
        "weight_kg": -10.0, # Invalid (<=0)
        "volume_m3": 1.0,
        "time_window_start": "14:00",
        "time_window_end": "10:00", # Invalid (end before start)
        "hub_id": 1,
    }
    response = client.post("/api/v1/shipments", json=invalid_payload, headers=headers)
    assert response.status_code == 422


def test_shipment_status_transition_creates_audit_log(client, db_session):
    token = get_token("dispatcher_test@fleet.io", "DISPATCHER")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create shipment
    payload = {
        "tracking_number": "SHP-STATUS-01",
        "customer_name": "TCS Logistics",
        "destination_address": "Powai, Mumbai",
        "latitude": 19.1176,
        "longitude": 72.9060,
        "weight_kg": 100.0,
        "volume_m3": 0.8,
        "hub_id": 1,
    }
    res = client.post("/api/v1/shipments", json=payload, headers=headers)
    assert res.status_code == 201
    shipment_id = res.json()["id"]

    # 2. Patch status to IN_TRANSIT
    patch_res = client.patch(
        f"/api/v1/shipments/{shipment_id}/status",
        json={"status": "IN_TRANSIT", "notes": "Dispatched with Driver Rajesh"},
        headers=headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "IN_TRANSIT"

    # 3. Verify audit log captures transition
    audit_logs = db_session.query(AuditLog).filter(
        AuditLog.entity_type == "Shipment",
        AuditLog.entity_id == shipment_id,
        AuditLog.action_type == AuditAction.STATUS_CHANGE,
    ).all()
    assert len(audit_logs) == 1
    assert "UNASSIGNED to IN_TRANSIT" in audit_logs[0].details
    assert "Dispatched with Driver Rajesh" in audit_logs[0].details


def test_driver_role_authorization_guards(client):
    driver_token = get_token("driver_test@fleet.io", "DRIVER")
    driver_headers = {"Authorization": f"Bearer {driver_token}"}

    # Drivers cannot create shipments (returns 403)
    payload = {
        "tracking_number": "SHP-DRIVER-FAIL",
        "customer_name": "Forbidden Consignment",
        "destination_address": "Goregaon",
        "latitude": 19.1663,
        "longitude": 72.8526,
        "weight_kg": 50.0,
        "volume_m3": 0.5,
        "hub_id": 1,
    }
    res = client.post("/api/v1/shipments", json=payload, headers=driver_headers)
    assert res.status_code == 403

    # Drivers can list shipments (returns 200)
    list_res = client.get("/api/v1/shipments", headers=driver_headers)
    assert list_res.status_code == 200


def test_query_audit_logs_with_filter(client, db_session):
    admin_token = get_token("admin_test@fleet.io", "ADMIN")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Create shipment to generate audit entry
    payload = {
        "tracking_number": "SHP-AUDIT-01",
        "customer_name": "Reliance Retail",
        "destination_address": "Bandra Kurla Complex, Mumbai",
        "latitude": 19.0600,
        "longitude": 72.8600,
        "weight_kg": 300.0,
        "volume_m3": 2.0,
        "hub_id": 1,
    }
    client.post("/api/v1/shipments", json=payload, headers=headers)

    # Query audit logs
    res = client.get("/api/v1/audit?entity_type=Shipment&action_type=ASSET_CREATED", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    assert data[0]["entity_type"] == "Shipment"
    assert data[0]["action_type"] == "ASSET_CREATED"
