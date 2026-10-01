"""
test_batch_ingestion.py - Automated Pytest Suite for Batch Order Ingestion (Track B: Week 4)
"""

import io
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
        admin = User(
            email="admin_batch@fleet.io",
            hashed_password=hash_password("adminpass"),
            full_name="Admin Batch Tester",
            role=UserRole.ADMIN,
            is_active=True,
        )
        dispatcher = User(
            email="dispatcher_batch@fleet.io",
            hashed_password=hash_password("disppass"),
            full_name="Dispatcher Batch Tester",
            role=UserRole.DISPATCHER,
            is_active=True,
        )
        driver = User(
            email="driver_batch@fleet.io",
            hashed_password=hash_password("driverpass"),
            full_name="Driver Batch Tester",
            role=UserRole.DRIVER,
            is_active=True,
        )
        hub = Hub(
            id=1,
            name="Mumbai Hub 1",
            code="HUB-MUM-01",
            address="MIDC Andheri East, Mumbai",
            latitude=19.1136,
            longitude=72.8697,
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
    # app.dependency_overrides.clear()


def get_token(email: str, role: str) -> str:
    return create_access_token(data={"sub": email, "role": role})


# ------------------------------------------------------------------------------
# TESTS
# ------------------------------------------------------------------------------

def test_download_csv_template(client):
    token = get_token("dispatcher_batch@fleet.io", "DISPATCHER")
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/v1/shipments/batch/template", headers=headers)
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "tracking_number" in res.text
    assert "destination_address" in res.text
    assert "weight_kg" in res.text


def test_batch_upload_valid_csv(client, db_session):
    token = get_token("dispatcher_batch@fleet.io", "DISPATCHER")
    headers = {"Authorization": f"Bearer {token}"}

    csv_data = """tracking_number,customer_name,destination_address,latitude,longitude,weight_kg,volume_m3,time_window_start,time_window_end,priority,hub_id
SHP-VAL-01,Reliance Retail,Bandra Kurla Complex Mumbai,19.0657,72.8687,200.0,1.8,09:00,12:00,HIGH,1
SHP-VAL-02,TCS Logistics,Hiranandani Powai Mumbai,19.1176,72.9060,150.0,1.2,10:00,14:00,STANDARD,1
SHP-VAL-03,Flipkart Hub,Belapur Navi Mumbai,19.0144,73.0380,450.0,3.5,08:30,11:30,EXPRESS,1
"""
    files = {"file": ("shipments.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    res = client.post("/api/v1/shipments/batch/upload", files=files, headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["total_processed"] == 3
    assert data["successful_count"] == 3
    assert data["failed_count"] == 0
    assert len(data["errors"]) == 0
    assert len(data["created_shipments"]) == 3

    # Check DB
    shipments_in_db = db_session.query(Shipment).all()
    assert len(shipments_in_db) == 3

    # Check Audit Log
    audit = db_session.query(AuditLog).filter(AuditLog.entity_type == "ShipmentBatch").first()
    assert audit is not None
    assert "Batch imported 3 shipments" in audit.details


def test_batch_upload_json(client, db_session):
    token = get_token("admin_batch@fleet.io", "ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "shipments": [
            {
                "tracking_number": "SHP-JSON-01",
                "customer_name": "Amazon India",
                "destination_address": "Goregaon East Mumbai",
                "latitude": 19.1663,
                "longitude": 72.8526,
                "weight_kg": 80.0,
                "volume_m3": 0.6,
                "time_window_start": "09:00",
                "time_window_end": "12:00",
                "priority": "HIGH",
                "hub_id": 1,
            },
            {
                "tracking_number": "SHP-JSON-02",
                "customer_name": "Infosys Corp",
                "destination_address": "Andheri West Mumbai",
                "latitude": 19.1363,
                "longitude": 72.8277,
                "weight_kg": 120.0,
                "volume_m3": 1.0,
                "time_window_start": "11:00",
                "time_window_end": "16:00",
                "priority": "STANDARD",
                "hub_id": 1,
            },
        ]
    }
    res = client.post("/api/v1/shipments/batch", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_processed"] == 2
    assert data["successful_count"] == 2
    assert data["failed_count"] == 0


def test_batch_upload_partial_errors(client, db_session):
    token = get_token("dispatcher_batch@fleet.io", "DISPATCHER")
    headers = {"Authorization": f"Bearer {token}"}

    csv_data = """tracking_number,customer_name,destination_address,latitude,longitude,weight_kg,volume_m3,time_window_start,time_window_end,priority,hub_id
SHP-GOOD-01,Valid Consignment 1,Bandra Kurla Complex,19.0657,72.8687,100.0,1.0,09:00,12:00,STANDARD,1
SHP-BAD-LAT,Bad Latitude Order,Powai Business Center,999.0,72.9060,100.0,1.0,09:00,12:00,STANDARD,1
SHP-NEG-WT,Negative Weight Order,Andheri MIDC Road,19.1136,72.8697,-50.0,1.0,09:00,12:00,STANDARD,1
SHP-GOOD-02,Valid Consignment 2,Vashi Sector 17,19.0760,72.9986,220.0,2.0,10:00,15:00,EXPRESS,1
SHP-BAD-HUB,Bad Hub Order,Thane West Gateway,19.2183,72.9781,100.0,1.0,09:00,12:00,STANDARD,999
SHP-BAD-WIN,Bad Window Order,Malad Link Road,19.1860,72.8485,100.0,1.0,15:00,10:00,STANDARD,1
SHP-GOOD-03,Valid Consignment 3,Dadar Central Station,19.0178,72.8478,140.0,1.2,09:00,17:00,HIGH,1
"""
    files = {"file": ("mixed.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    res = client.post("/api/v1/shipments/batch/upload", files=files, headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["total_processed"] == 7
    assert data["successful_count"] == 3
    assert data["failed_count"] == 4
    assert len(data["errors"]) == 4

    # Ensure the 3 valid rows were committed to DB
    valid_trackings = [s["tracking_number"] for s in data["created_shipments"]]
    assert set(valid_trackings) == {"SHP-GOOD-01", "SHP-GOOD-02", "SHP-GOOD-03"}

    # Verify error explanations
    reasons = [e["reason"] for e in data["errors"]]
    assert any("Invalid latitude" in r for r in reasons)
    assert any("Invalid weight_kg" in r for r in reasons)
    assert any("does not exist" in r for r in reasons)
    assert any("time_window_end" in r for r in reasons)


def test_batch_upload_missing_required_columns(client):
    token = get_token("dispatcher_batch@fleet.io", "DISPATCHER")
    headers = {"Authorization": f"Bearer {token}"}

    csv_data = """tracking_number,latitude,longitude
SHP-MISSING-01,19.0657,72.8687
"""
    files = {"file": ("missing_cols.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    res = client.post("/api/v1/shipments/batch/upload", files=files, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["successful_count"] == 0
    assert len(data["errors"]) == 1
    assert "Missing required CSV column" in data["errors"][0]["reason"]


def test_batch_upload_rbac_guard(client):
    driver_token = get_token("driver_batch@fleet.io", "DRIVER")
    driver_headers = {"Authorization": f"Bearer {driver_token}"}

    csv_data = """tracking_number,customer_name,destination_address,latitude,longitude,weight_kg,volume_m3,hub_id
SHP-DRV-01,Customer,Address,19.0,72.0,10.0,1.0,1
"""
    files = {"file": ("shipments.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    res = client.post("/api/v1/shipments/batch/upload", files=files, headers=driver_headers)
    assert res.status_code == 403


def test_batch_upload_duplicate_detection(client, db_session):
    token = get_token("dispatcher_batch@fleet.io", "DISPATCHER")
    headers = {"Authorization": f"Bearer {token}"}

    csv_data = """tracking_number,customer_name,destination_address,latitude,longitude,weight_kg,volume_m3,hub_id
SHP-DUP-01,Client A,BKC Mumbai,19.0657,72.8687,100.0,1.0,1
SHP-DUP-01,Client B,Powai Mumbai,19.1176,72.9060,100.0,1.0,1
"""
    files = {"file": ("dups.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    res = client.post("/api/v1/shipments/batch/upload", files=files, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["successful_count"] == 1
    assert data["failed_count"] == 1
    assert "Duplicate tracking_number" in data["errors"][0]["reason"]
