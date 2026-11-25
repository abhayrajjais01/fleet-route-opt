"""Admin user management: DRIVER accounts and driver profiles stay linked (Nov 2026)."""
import pytest

from app.models.audit import AuditLog
from app.models.fleet import Driver, Hub
from app.models.user import User
from tests.conftest import TestingSessionLocal, auth_headers

API = "/api/v1/users"


@pytest.fixture
def admin(client):
    return auth_headers(client, "root@fleetopt-tests.io", "ADMIN", "Root Admin")


@pytest.fixture
def hub_id():
    db = TestingSessionLocal()
    hub = Hub(name="Mumbai Central Depot", code="HUB-MUM-01", address="Andheri East", latitude=19.11, longitude=72.87,
              contact_phone="+91-22-2820-1100", operating_hours="06:00-22:00")
    db.add(hub); db.commit(); hid = hub.id; db.close()
    return hid


def _driver_profile(hub_id, name="Amit Patil", licence="MH01-2020-55441", user_id=None):
    db = TestingSessionLocal()
    d = Driver(full_name=name, license_number=licence, phone_number="+91-99600-77889", assigned_hub_id=hub_id, user_id=user_id)
    db.add(d); db.commit(); did = d.id; db.close()
    return did


def new_driver(hub_id, email="neha@fleetopt-tests.io", licence="MH43-2018-77120"):
    return {"email": email, "password": "Password123!", "full_name": "Neha Kulkarni", "role": "DRIVER",
            "driver": {"license_number": licence, "phone_number": "+91-98190-33445", "assigned_hub_id": hub_id, "max_driving_hours_per_day": 9}}


def test_only_admins_manage_users(client):
    assert client.get(API).status_code == 401
    dispatcher = auth_headers(client, "disp@fleetopt-tests.io", "DISPATCHER")
    assert client.get(API, headers=dispatcher).status_code == 403
    assert client.post(API, headers=dispatcher, json={}).status_code == 403


def test_creating_a_driver_account_creates_its_linked_profile(client, admin, hub_id):
    res = client.post(API, headers=admin, json=new_driver(hub_id))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["role"] == "DRIVER" and body["driver"]["full_name"] == "Neha Kulkarni" and not body["profile_missing"]
    db = TestingSessionLocal()
    d = db.query(Driver).filter(Driver.license_number == "MH43-2018-77120").one()
    assert d.user_id == body["id"] and d.assigned_hub_id == hub_id and d.max_driving_hours_per_day == 9
    assert db.query(AuditLog).filter(AuditLog.entity_type == "User", AuditLog.entity_id == body["id"]).count() == 1
    db.close()
    # The new person can sign in straight away and the planner sees the profile
    login = client.post("/api/v1/auth/login", json={"email": "neha@fleetopt-tests.io", "password": "Password123!"})
    assert login.status_code == 200


def test_driver_account_requires_a_profile_and_others_must_not_have_one(client, admin, hub_id):
    no_profile = {**new_driver(hub_id), "driver": None}
    assert client.post(API, headers=admin, json=no_profile).status_code == 422
    dispatcher_with_profile = {**new_driver(hub_id), "role": "DISPATCHER"}
    assert client.post(API, headers=admin, json=dispatcher_with_profile).status_code == 422


def test_linking_an_existing_profile(client, admin, hub_id):
    did = _driver_profile(hub_id)
    assert [d["id"] for d in client.get(f"{API}/unlinked-drivers", headers=admin).json()] == [did]
    body = {"email": "amit@fleetopt-tests.io", "password": "Password123!", "full_name": "Amit Patil", "role": "DRIVER", "driver_id": did}
    res = client.post(API, headers=admin, json=body)
    assert res.status_code == 201 and res.json()["driver"]["id"] == did
    assert client.get(f"{API}/unlinked-drivers", headers=admin).json() == []
    # A profile can belong to one account only
    again = {**body, "email": "amit2@fleetopt-tests.io"}
    assert client.post(API, headers=admin, json=again).status_code == 409


def test_duplicate_email_licence_and_unknown_hub_are_rejected(client, admin, hub_id):
    assert client.post(API, headers=admin, json=new_driver(hub_id)).status_code == 201
    assert client.post(API, headers=admin, json=new_driver(hub_id, licence="OTHER-1")).status_code == 409          # email
    assert client.post(API, headers=admin, json=new_driver(hub_id, email="x@fleetopt-tests.io")).status_code == 409       # licence
    assert client.post(API, headers=admin, json=new_driver(999, email="y@fleetopt-tests.io", licence="L-2")).status_code == 422


def test_changing_role_away_from_driver_keeps_profile_but_removes_app_access(client, admin, hub_id):
    uid = client.post(API, headers=admin, json=new_driver(hub_id)).json()["id"]
    res = client.patch(f"{API}/{uid}", headers=admin, json={"role": "DISPATCHER"})
    assert res.status_code == 200 and res.json()["driver"] is None
    db = TestingSessionLocal()
    assert db.query(Driver).filter(Driver.license_number == "MH43-2018-77120").one().user_id is None
    db.close()


def test_renaming_a_driver_renames_the_profile(client, admin, hub_id):
    uid = client.post(API, headers=admin, json=new_driver(hub_id)).json()["id"]
    assert client.patch(f"{API}/{uid}", headers=admin, json={"full_name": "Neha K. Kulkarni"}).json()["driver"]["full_name"] == "Neha K. Kulkarni"


def test_role_change_to_driver_flags_missing_profile_then_link_fixes_it(client, admin, hub_id):
    uid = client.post(API, headers=admin, json={"email": "d@fleetopt-tests.io", "password": "Password123!", "full_name": "Amit Patil", "role": "DISPATCHER"}).json()["id"]
    assert client.patch(f"{API}/{uid}", headers=admin, json={"role": "DRIVER"}).json()["profile_missing"] is True
    did = _driver_profile(hub_id)
    res = client.put(f"{API}/{uid}/driver", headers=admin, json={"driver_id": did})
    assert res.status_code == 200 and res.json()["driver"]["id"] == did and not res.json()["profile_missing"]
    res = client.put(f"{API}/{uid}/driver", headers=admin, json={"driver_id": None})
    assert res.json()["profile_missing"] is True


def test_admin_safety_rails(client, admin):
    me = next(u for u in client.get(API, headers=admin).json() if u["email"] == "root@fleetopt-tests.io")
    assert client.patch(f"{API}/{me['id']}", headers=admin, json={"is_active": False}).status_code == 409
    assert client.patch(f"{API}/{me['id']}", headers=admin, json={"role": "DISPATCHER"}).status_code == 409
    # Another admin can be deactivated while at least one active admin remains
    other = client.post(API, headers=admin, json={"email": "a2@fleetopt-tests.io", "password": "Password123!", "full_name": "Second Admin", "role": "ADMIN"}).json()
    assert client.patch(f"{API}/{other['id']}", headers=admin, json={"is_active": False}).json()["is_active"] is False


def test_deactivated_driver_cannot_sign_in(client, admin, hub_id):
    uid = client.post(API, headers=admin, json=new_driver(hub_id)).json()["id"]
    client.patch(f"{API}/{uid}", headers=admin, json={"is_active": False})
    login = client.post("/api/v1/auth/login", json={"email": "neha@fleetopt-tests.io", "password": "Password123!"})
    assert login.status_code in (401, 403)
    db = TestingSessionLocal()
    assert db.query(User).filter(User.email == "neha@fleetopt-tests.io").one().is_active is False
    db.close()


def test_driver_list_shows_app_access_to_every_planner_role(client, admin, hub_id):
    """Dispatchers cannot list users, so the driver roster itself says who can use the driver app."""
    uid = client.post(API, headers=admin, json=new_driver(hub_id)).json()["id"]
    _driver_profile(hub_id)  # a driver with no login
    dispatcher = auth_headers(client, "disp2@fleetopt-tests.io", "DISPATCHER")
    rows = {d["full_name"]: d for d in client.get("/api/v1/fleet/drivers", headers=dispatcher).json()}
    assert rows["Neha Kulkarni"]["account_active"] is True and rows["Neha Kulkarni"]["account_email"] == "neha@fleetopt-tests.io"
    assert rows["Amit Patil"]["account_active"] is None
    client.patch(f"{API}/{uid}", headers=admin, json={"is_active": False})
    rows = {d["full_name"]: d for d in client.get("/api/v1/fleet/drivers", headers=dispatcher).json()}
    assert rows["Neha Kulkarni"]["account_active"] is False
