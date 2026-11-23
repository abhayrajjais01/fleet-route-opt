import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # Register all models with Base.metadata
from app.main import app as fastapi_app
from app.core.database import Base, get_db
from app.core.http_security import rate_limiter
from app.core.config import settings

# Tests never call the public routing server; road-routing tests opt in with a fake OSRM response.
settings.ROAD_ROUTING = "estimate"

# Isolated In-Memory SQLite Engine for Pytest Suites
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


@pytest.fixture(autouse=True)
def setup_database():
    fastapi_app.dependency_overrides[get_db] = override_get_db
    rate_limiter.reset()            # every test starts with full rate-limit buckets
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(fastapi_app)


BOOTSTRAP_ADMIN = {"email": "bootstrap-admin@fleetopt-tests.io", "password": "Password123!", "full_name": "Bootstrap Admin"}


def auth_headers(client, email: str, role: str = "ADMIN", full_name: str | None = None, password: str = "Password123!") -> dict:
    """Registers a user with any role and returns its Authorization header.

    Since the Week 14 security audit only an admin may create privileged accounts, so this makes sure a bootstrap
    admin exists (inserted directly) and registers the new account on its behalf.
    """
    from app.core.security import hash_password
    from app.models.user import User, UserRole

    db = TestingSessionLocal()
    try:
        if not db.query(User).filter(User.email == BOOTSTRAP_ADMIN["email"]).first():
            db.add(User(email=BOOTSTRAP_ADMIN["email"], full_name=BOOTSTRAP_ADMIN["full_name"], role=UserRole.ADMIN,
                        hashed_password=hash_password(BOOTSTRAP_ADMIN["password"]), is_active=True))
            db.commit()
    finally:
        db.close()
    login = client.post("/api/v1/auth/login", json={"email": BOOTSTRAP_ADMIN["email"], "password": BOOTSTRAP_ADMIN["password"]})
    admin = {"Authorization": f"Bearer {login.json()['access_token']}"}
    res = client.post("/api/v1/auth/register", headers=admin, json={
        "email": email, "password": password, "full_name": full_name or email.split("@")[0], "role": role})
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}

