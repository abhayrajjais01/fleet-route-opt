"""
test_rag_guardrails.py - Pytest Suite for RAG Zero-Hallucination Guardrails & Scoring (US-006, Week 7 Track B)

Verifies:
1. In-domain regulatory queries pass semantic threshold guardrail with calibrated confidence.
2. Out-of-domain or speculative queries trip the zero-hallucination fallback gate.
3. Citation cards return verified doc_id, section, heading, and verbatim excerpt.
4. REST endpoint /api/v1/copilot/guardrails/evaluate enforces RBAC and returns structured metadata.
5. Copilot query execution trace records the dedicated 'rag_similarity_guardrail' evaluation step.
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
from app.services.copilot.guardrails import (
    evaluate_rag_guardrail,
    compute_confidence_percentage,
    ZERO_HALLUCINATION_FALLBACK_TEXT,
    DEFAULT_GUARDRAIL_THRESHOLD,
)
from app.services.rag.knowledge_base import get_knowledge_base

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def guardrail_env():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        dispatcher = User(
            email="dispatch_gr@fleet.io",
            hashed_password=hash_password("password123"),
            full_name="Dispatcher Guardrail",
            role=UserRole.DISPATCHER,
            is_active=True,
        )
        driver = User(
            email="driver_gr@fleet.io",
            hashed_password=hash_password("password123"),
            full_name="Driver Guardrail",
            role=UserRole.DRIVER,
            is_active=True,
        )
        db.add_all([dispatcher, driver])
        db.commit()

        disp_tok = create_access_token({"sub": dispatcher.email, "role": dispatcher.role.value})
        driver_tok = create_access_token({"sub": driver.email, "role": driver.role.value})

        yield {
            "db": db,
            "disp_headers": {"Authorization": f"Bearer {disp_tok}"},
            "driver_headers": {"Authorization": f"Bearer {driver_tok}"},
        }
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(guardrail_env):
    def override_get_db():
        try:
            yield guardrail_env["db"]
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_confidence_score_normalization():
    """Verifies that cosine similarity scores map to calibrated [0, 100%] confidence percentages."""
    assert compute_confidence_percentage(0.0) == 0.0
    # Below threshold (0.18) maps to < 50%
    low_conf = compute_confidence_percentage(0.09)
    assert 0.0 < low_conf < 50.0

    # Above threshold maps to >= 50%
    high_conf = compute_confidence_percentage(0.35)
    assert high_conf >= 50.0
    assert high_conf <= 99.0


def test_in_domain_policy_query_passes_guardrail():
    """In-domain SOP query matches verified corpus, passes guardrail, and returns citations."""
    kb = get_knowledge_base()
    query = "driver mandatory rest break after driving hours"
    hits = kb.search(query, top_k=2)
    assert len(hits) > 0

    res = evaluate_rag_guardrail(query=query, hits=hits)
    assert res.passed is True
    assert res.status == "VERIFIED"
    assert res.confidence_pct >= 50.0
    assert len(res.citations) > 0
    assert res.citations[0].doc_id in ["SOP-DR-001", "SOP-DR-002"]
    assert "SOP-DR-001" in res.safe_response or "SOP-DR-002" in res.safe_response


def test_out_of_domain_query_trips_zero_hallucination_guardrail():
    """Out-of-domain query fails guardrail, returns 0 citations, and emits strict fallback."""
    kb = get_knowledge_base()
    query = "cryptocurrency blockchain mining protocol for outer space"
    hits = kb.search(query, top_k=2)

    res = evaluate_rag_guardrail(query=query, hits=hits)
    assert res.passed is False
    assert res.status == "ZERO_HALLUCINATION_REJECTED"
    assert res.confidence_pct < 50.0
    assert len(res.citations) == 0
    assert ZERO_HALLUCINATION_FALLBACK_TEXT in res.safe_response


def test_guardrails_evaluate_endpoint(client, guardrail_env):
    """Direct REST endpoint evaluates guardrail with dispatcher authorization."""
    resp = client.post(
        "/api/v1/copilot/guardrails/evaluate",
        json={"query": "hazmat class 3 transport placard regulations"},
        headers=guardrail_env["disp_headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["passed"] is True
    assert data["status"] == "VERIFIED"
    assert len(data["citations"]) > 0
    assert data["citations"][0]["doc_id"] == "SOP-HZ-001"

    # Driver role is forbidden
    driver_resp = client.post(
        "/api/v1/copilot/guardrails/evaluate",
        json={"query": "hazmat class 3"},
        headers=guardrail_env["driver_headers"],
    )
    assert driver_resp.status_code == 403


def test_copilot_query_records_guardrail_trace_and_metadata(client, guardrail_env):
    """Copilot query on policy topic records guardrail evaluation in execution trace and response."""
    resp = client.post(
        "/api/v1/copilot/query",
        json={"query": "What are the driver hours of service rest break rules?"},
        headers=guardrail_env["disp_headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["intent"] == "POLICY_QUERY"
    assert data["guardrail"] is not None
    assert data["guardrail"]["passed"] is True
    assert data["guardrail"]["confidence_pct"] >= 50.0

    # Verify dedicated trace step exists
    trace_nodes = [t["node"] for t in data["execution_trace"]]
    assert "rag_similarity_guardrail" in trace_nodes

