from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root_discovery():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "app" in data
    assert data["health"] == "/api/v1/health"
    assert data["ready"] == "/api/v1/ready"


def test_health_check_connectivity():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["healthy", "degraded"]
    assert data["database"]["status"] == "healthy"
    assert "dialect" in data["database"]
    assert "system_time" in data


def test_readiness_probe():
    response = client.get("/api/v1/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
