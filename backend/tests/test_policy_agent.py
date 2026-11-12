"""
test_policy_agent.py - Pytest Suite for Policy & Compliance Agent (US-006, Week 8 Track B)

Verifies:
1. Manifest evaluation against Driver Hours-of-Service (HOS) under Motor Transport Workers Act (SOP-DR-001 §2).
2. Vehicle payload and volumetric capacity overload detection (SOP-VS-001 §1).
3. Hazardous Materials (Hazmat) driver certification endorsement checks (SOP-HZ-001 §2).
4. Cold Chain holdover window violation detection for temperature-controlled cargo (SOP-CC-001 §5).
5. Clean, fully-compliant manifests score 100% with 0 violations.
6. RESTful endpoint /api/v1/copilot/policy/validate-route operates with dispatcher authorization.
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
from app.services.copilot.policy_agent import PolicyComplianceAgent, UnresolvedManifestError, ViolationSeverity

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def policy_env():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        dispatcher = User(
            email="dispatch_policy@fleet.io",
            hashed_password=hash_password("password123"),
            full_name="Dispatcher Policy",
            role=UserRole.DISPATCHER,
            is_active=True,
        )
        db.add(dispatcher)
        db.flush()

        hub = Hub(
            name="Depot Mumbai",
            code="HUB-MUM",
            address="Kurla, Mumbai",
            latitude=19.0657,
            longitude=72.8792,
            contact_phone="+91-22-26501234",
            operating_hours="06:00 - 22:00",
        )
        db.add(hub)
        db.flush()

        # Vehicles
        v_small = Vehicle(
            name="Small Delivery Van",
            plate_number="MH-01-SM-100",
            vehicle_type=VehicleType.VAN,
            max_payload_kg=500.0,
            max_volume_m3=4.0,
            fuel_efficiency_kpl=14.0,
            current_status=VehicleStatus.AVAILABLE,
            assigned_hub_id=hub.id,
        )
        v_large = Vehicle(
            name="Heavy Truck",
            plate_number="MH-01-LG-200",
            vehicle_type=VehicleType.BOX_TRUCK,
            max_payload_kg=3000.0,
            max_volume_m3=20.0,
            fuel_efficiency_kpl=8.0,
            current_status=VehicleStatus.AVAILABLE,
            assigned_hub_id=hub.id,
        )
        db.add_all([v_small, v_large])
        db.flush()

        # Drivers
        driver_commercial = Driver(
            full_name="Rajesh Commercial",
            license_number="DL-COMM-001",
            license_type=LicenseType.COMMERCIAL,
            phone_number="+91-9876543210",
            status=DriverStatus.ON_DUTY,
            max_driving_hours_per_day=8.0,
            assigned_hub_id=hub.id,
            current_vehicle_id=v_large.id,
        )
        driver_standard = Driver(
            full_name="Suresh Standard",
            license_number="DL-STD-002",
            license_type=LicenseType.CLASS_B,
            phone_number="+91-9876543211",
            status=DriverStatus.ON_DUTY,
            max_driving_hours_per_day=6.0,
            assigned_hub_id=hub.id,
            current_vehicle_id=v_small.id,
        )
        db.add_all([driver_commercial, driver_standard])
        db.flush()

        # Shipments
        s_normal = Shipment(
            tracking_number="SHP-POL-01",
            customer_name="Retail Store",
            destination_address="Bandra, Mumbai",
            latitude=19.0596,
            longitude=72.8295,
            weight_kg=150.0,
            volume_m3=1.0,
            time_window_start="09:00",
            time_window_end="12:00",
            priority=ShipmentPriority.STANDARD,
            status=ShipmentStatus.ASSIGNED,
            hub_id=hub.id,
        )
        s_heavy = Shipment(
            tracking_number="SHP-POL-02",
            customer_name="Steel Warehouse",
            destination_address="Kurla, Mumbai",
            latitude=19.0650,
            longitude=72.8790,
            weight_kg=800.0,  # Exceeds v_small
            volume_m3=5.0,
            time_window_start="10:00",
            time_window_end="14:00",
            priority=ShipmentPriority.HIGH,
            status=ShipmentStatus.ASSIGNED,
            hub_id=hub.id,
        )
        s_hazmat = Shipment(
            tracking_number="SHP-POL-03",
            customer_name="Chemical Lab Solvents",
            destination_address="MIDC Chemical Zone, Mumbai",
            latitude=19.1100,
            longitude=72.8700,
            weight_kg=450.0,
            volume_m3=2.0,
            time_window_start="08:00",
            time_window_end="11:00",
            priority=ShipmentPriority.EXPRESS,
            hazard_class="3",
            status=ShipmentStatus.ASSIGNED,
            hub_id=hub.id,
        )
        s_corrosive = Shipment(
            tracking_number="SHP-POL-05",
            customer_name="Acme Industrial Supply",
            destination_address="Thane West, Mumbai",
            latitude=19.2000,
            longitude=72.9700,
            weight_kg=120.0,
            volume_m3=0.6,
            time_window_start="09:00",
            time_window_end="12:00",
            priority=ShipmentPriority.STANDARD,
            hazard_class="8",
            status=ShipmentStatus.ASSIGNED,
            hub_id=hub.id,
        )
        s_cold_chain = Shipment(
            tracking_number="SHP-POL-04",
            customer_name="City Hospital Vaccine Bank",
            destination_address="Parel Hospital Hub, Mumbai",
            latitude=19.0000,
            longitude=72.8400,
            weight_kg=80.0,
            volume_m3=0.8,
            time_window_start="09:00",
            time_window_end="11:30",
            priority=ShipmentPriority.EXPRESS,
            status=ShipmentStatus.ASSIGNED,
            hub_id=hub.id,
        )
        db.add_all([s_normal, s_heavy, s_hazmat, s_corrosive, s_cold_chain])
        db.commit()

        token = create_access_token({"sub": dispatcher.email, "role": dispatcher.role.value})

        yield {
            "db": db,
            "headers": {"Authorization": f"Bearer {token}"},
            "v_small_id": v_small.id,
            "v_large_id": v_large.id,
            "d_comm_id": driver_commercial.id,
            "d_std_id": driver_standard.id,
            "s_normal_id": s_normal.id,
            "s_heavy_id": s_heavy.id,
            "s_hazmat_id": s_hazmat.id,
            "s_corrosive_id": s_corrosive.id,
            "s_cold_chain_id": s_cold_chain.id,
        }
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(policy_env):
    def override_get_db():
        try:
            yield policy_env["db"]
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_clean_compliant_manifest_scores_100_percent(policy_env):
    """A valid route within vehicle capacity, driver shift limits, and standard cargo scores 100%."""
    db = policy_env["db"]
    report = PolicyComplianceAgent.evaluate_manifest(
        db=db,
        vehicle_id=policy_env["v_small_id"],
        driver_id=policy_env["d_std_id"],
        shipment_ids=[policy_env["s_normal_id"]],
        estimated_duration_minutes=120.0,  # 2 hours
    )
    assert report.is_compliant is True
    assert report.compliance_score_pct == 100.0
    assert report.violations_count == 0
    assert len(report.violations) == 0


def test_driver_hours_of_service_violation(policy_env):
    """Driver assigned a shift duration exceeding their certified daily limit triggers HOS violation."""
    db = policy_env["db"]
    # Suresh Standard has max_driving_hours = 6.0 (360 mins). Test 420 mins (7 hours).
    report = PolicyComplianceAgent.evaluate_manifest(
        db=db,
        vehicle_id=policy_env["v_small_id"],
        driver_id=policy_env["d_std_id"],
        shipment_ids=[policy_env["s_normal_id"]],
        estimated_duration_minutes=420.0,
    )
    assert report.is_compliant is False
    assert report.compliance_score_pct < 100.0

    codes = [v.rule_code for v in report.violations]
    assert "HOS_SHIFT_EXCEEDED" in codes
    assert any(v.sop_doc_id == "SOP-DR-001" for v in report.violations)


def test_vehicle_payload_overload_violation(policy_env):
    """Assigning 800 kg heavy shipment to 500 kg van triggers CRITICAL overload violation."""
    db = policy_env["db"]
    report = PolicyComplianceAgent.evaluate_manifest(
        db=db,
        vehicle_id=policy_env["v_small_id"],
        driver_id=policy_env["d_std_id"],
        shipment_ids=[policy_env["s_heavy_id"]],
        estimated_duration_minutes=120.0,
    )
    assert report.is_compliant is False
    codes = [v.rule_code for v in report.violations]
    assert "PAYLOAD_CAPACITY_EXCEEDED" in codes
    critical_violation = next(v for v in report.violations if v.rule_code == "PAYLOAD_CAPACITY_EXCEEDED")
    assert critical_violation.severity == ViolationSeverity.CRITICAL
    assert critical_violation.sop_doc_id == "SOP-VS-001"


def test_hazmat_unendorsed_driver_violation(policy_env):
    """Transporting chemical solvents with a non-commercial driver licence triggers Hazmat violation."""
    db = policy_env["db"]
    # Driver standard has HEAVY license, not COMMERCIAL
    report = PolicyComplianceAgent.evaluate_manifest(
        db=db,
        vehicle_id=policy_env["v_large_id"],
        driver_id=policy_env["d_std_id"],
        shipment_ids=[policy_env["s_hazmat_id"]],
        estimated_duration_minutes=120.0,
    )
    assert report.is_compliant is False
    codes = [v.rule_code for v in report.violations]
    assert "HAZMAT_DRIVER_UNENDORSED" in codes
    assert any(v.sop_doc_id == "SOP-HZ-001" for v in report.violations)


def test_cold_chain_holdover_exceeded_violation(policy_env):
    """Exceeding 4.0 hours for vaccine delivery triggers cold chain holdover excursion violation."""
    db = policy_env["db"]
    report = PolicyComplianceAgent.evaluate_manifest(
        db=db,
        vehicle_id=policy_env["v_large_id"],
        driver_id=policy_env["d_comm_id"],
        shipment_ids=[policy_env["s_cold_chain_id"]],
        estimated_duration_minutes=300.0,  # 5 hours > 4 hours holdover
    )
    assert report.is_compliant is False
    codes = [v.rule_code for v in report.violations]
    assert "COLD_CHAIN_HOLDOVER_EXCEEDED" in codes
    assert any(v.sop_doc_id == "SOP-CC-001" for v in report.violations)


def test_policy_validate_route_endpoint(client, policy_env):
    """REST endpoint /api/v1/copilot/policy/validate-route returns full compliance report."""
    resp = client.post(
        "/api/v1/copilot/policy/validate-route",
        json={
            "vehicle_id": policy_env["v_small_id"],
            "driver_id": policy_env["d_std_id"],
            "shipment_ids": [policy_env["s_heavy_id"]],
            "estimated_duration_minutes": 100.0,
        },
        headers=policy_env["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_compliant"] is False
    assert data["violations_count"] >= 1
    assert any(v["rule_code"] == "PAYLOAD_CAPACITY_EXCEEDED" for v in data["violations"])
    assert len(data["cited_rules"]) > 0


def test_hazmat_detected_from_hazard_class_not_customer_text(policy_env):
    """A classified shipment with an ordinary name is still treated as hazmat."""
    db = policy_env["db"]
    report = PolicyComplianceAgent.evaluate_manifest(
        db=db,
        vehicle_id=policy_env["v_large_id"],
        driver_id=policy_env["d_std_id"],
        shipment_ids=[policy_env["s_corrosive_id"]],
        estimated_duration_minutes=120.0,
    )
    assert "HAZMAT_DRIVER_UNENDORSED" in [v.rule_code for v in report.violations]


def test_commercial_licence_without_endorsement_is_not_hazmat_certified(policy_env):
    """A COMMERCIAL licence alone does not satisfy SOP-HZ-001 §2; an endorsement does."""
    db = policy_env["db"]
    args = dict(
        db=db,
        vehicle_id=policy_env["v_large_id"],
        driver_id=policy_env["d_comm_id"],
        shipment_ids=[policy_env["s_hazmat_id"]],
        estimated_duration_minutes=120.0,
    )
    report = PolicyComplianceAgent.evaluate_manifest(**args)
    assert "HAZMAT_DRIVER_UNENDORSED" in [v.rule_code for v in report.violations]

    driver = db.get(Driver, policy_env["d_comm_id"])
    driver.hazmat_endorsed = True
    db.commit()
    report = PolicyComplianceAgent.evaluate_manifest(**args)
    assert "HAZMAT_DRIVER_UNENDORSED" not in [v.rule_code for v in report.violations]


def test_incompatible_hazmat_coload_violation(policy_env):
    """Class 3 and Class 8 in the same load violate SOP-HZ-001 §5 even with an endorsed driver."""
    db = policy_env["db"]
    driver = db.get(Driver, policy_env["d_comm_id"])
    driver.hazmat_endorsed = True
    db.commit()
    report = PolicyComplianceAgent.evaluate_manifest(
        db=db,
        vehicle_id=policy_env["v_large_id"],
        driver_id=policy_env["d_comm_id"],
        shipment_ids=[policy_env["s_hazmat_id"], policy_env["s_corrosive_id"]],
        estimated_duration_minutes=120.0,
    )
    assert report.is_compliant is False
    seg = [v for v in report.violations if v.rule_code == "HAZMAT_INCOMPATIBLE_COLOAD"]
    assert seg and seg[0].sop_section == "§5"


def test_unresolved_references_are_rejected(policy_env):
    """Unknown vehicle, driver or shipment IDs are never certified compliant."""
    db = policy_env["db"]
    for kwargs in (
        dict(vehicle_id=99999, driver_id=policy_env["d_std_id"], shipment_ids=[policy_env["s_normal_id"]]),
        dict(vehicle_id=policy_env["v_small_id"], driver_id=99999, shipment_ids=[policy_env["s_normal_id"]]),
        dict(vehicle_id=policy_env["v_small_id"], driver_id=policy_env["d_std_id"], shipment_ids=[policy_env["s_normal_id"], 99999]),
    ):
        with pytest.raises(UnresolvedManifestError):
            PolicyComplianceAgent.evaluate_manifest(db=db, estimated_duration_minutes=60.0, **kwargs)


def test_missing_driver_reports_incomplete_evaluation(policy_env):
    """Without a driver the HOS checks cannot run, so the manifest is not reported compliant."""
    report = PolicyComplianceAgent.evaluate_manifest(
        db=policy_env["db"],
        vehicle_id=policy_env["v_small_id"],
        driver_id=None,
        shipment_ids=[policy_env["s_normal_id"]],
        estimated_duration_minutes=60.0,
    )
    assert report.is_compliant is False
    assert report.evaluation_complete is False
    assert report.skipped_checks


def test_policy_validate_route_endpoint_rejects_unknown_ids(client, policy_env):
    resp = client.post(
        "/api/v1/copilot/policy/validate-route",
        json={"vehicle_id": 99999, "driver_id": policy_env["d_std_id"], "shipment_ids": [policy_env["s_normal_id"]]},
        headers=policy_env["headers"],
    )
    assert resp.status_code == 422
