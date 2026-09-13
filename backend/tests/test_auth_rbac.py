import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.models.user import User, UserRole

# Use in-memory SQLite database for isolated unit tests
TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_password_hashing():
    plain = "SuperSecretPassword123!"
    hashed = hash_password(plain)
    assert hashed != plain
    assert verify_password(plain, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_user_registration():
    payload = {
        "email": "dispatcher@fleetopt.io",
        "password": "Password123!",
        "full_name": "Test Dispatcher",
        "role": "DISPATCHER",
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "dispatcher@fleetopt.io"
    # First user registered gets assigned ADMIN role automatically
    assert data["user"]["role"] == "ADMIN"


def test_duplicate_registration_fails():
    payload = {
        "email": "unique@fleetopt.io",
        "password": "Password123!",
        "full_name": "Unique User",
        "role": "DRIVER",
    }
    r1 = client.post("/api/v1/auth/register", json=payload)
    assert r1.status_code == 201

    r2 = client.post("/api/v1/auth/register", json=payload)
    assert r2.status_code == 400
    assert "already exists" in r2.json()["detail"]


def test_login_flow():
    # Register user first
    reg_payload = {
        "email": "driver@fleetopt.io",
        "password": "DriverSecret123!",
        "full_name": "John Driver",
        "role": "DRIVER",
    }
    client.post("/api/v1/auth/register", json=reg_payload)

    # Valid login
    login_payload = {
        "email": "driver@fleetopt.io",
        "password": "DriverSecret123!",
    }
    resp = client.post("/api/v1/auth/login", json=login_payload)
    assert resp.status_code == 200
    data = resp.json()
    token = data["access_token"]

    # Profile check with Bearer token
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["email"] == "driver@fleetopt.io"

    # Invalid login fails
    invalid_login = {
        "email": "driver@fleetopt.io",
        "password": "IncorrectPassword!",
    }
    bad_resp = client.post("/api/v1/auth/login", json=invalid_login)
    assert bad_resp.status_code == 401


def test_seed_demo_accounts():
    resp = client.post("/api/v1/auth/seed-demo-users")
    assert resp.status_code == 200
    data = resp.json()
    assert "admin@fleetopt.io" in data["seeded_users"]
    assert "dispatcher@fleetopt.io" in data["seeded_users"]
    assert "driver@fleetopt.io" in data["seeded_users"]

    # Login as seeded admin
    login_resp = client.post("/api/v1/auth/login", json={"email": "admin@fleetopt.io", "password": "password123"})
    assert login_resp.status_code == 200
    assert login_resp.json()["user"]["role"] == "ADMIN"
