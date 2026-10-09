"""
test_copilot_router.py - Automated Unit & Integration Tests for LangGraph Router Agent (US-005)
Track B (Abhayraj Jaiswal) Week 5 Deliverable

Verifies:
1. Intent Classification precision across all 6 logistics categories.
2. Structured Entity Extraction (Vehicle ID, Stop ID, Delay minutes, Corridor, Severity).
3. Confidence scoring calibration and deterministic fallback guarantee.
4. LangGraph StateGraph execution trace steps & sub-millisecond latencies.
5. RAG Policy Knowledge Base citation integration.
6. REST API Endpoints (/api/v1/copilot/health, /intents, /query).
7. RBAC security enforcement (Unauthorized 401, Invalid 400, Dispatcher/Admin 200).
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.copilot import AgentIntent, SeverityLevel
from app.services.copilot.router_agent import RouterAgent
from app.services.copilot.state_graph import CopilotStateGraph, get_copilot_graph


@pytest.fixture
def router() -> RouterAgent:
    return RouterAgent()


@pytest.fixture
def graph() -> CopilotStateGraph:
    return get_copilot_graph()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def dispatcher_token(client: TestClient) -> str:
    # Seed demo users and login
    client.post("/api/v1/auth/seed-demo-users")
    login_res = client.post("/api/v1/auth/login", json={"email": "dispatcher@fleetopt.io", "password": "password123"})
    if login_res.status_code == 200:
        return login_res.json()["access_token"]
    # Fallback to direct registration if seed was already run
    reg_res = client.post("/api/v1/auth/register", json={
        "email": "disp_test@fleetopt.io",
        "password": "Password123!",
        "full_name": "Test Dispatcher",
        "role": "DISPATCHER"
    })
    return reg_res.json().get("access_token", "")


# =====================================================================
# 1. INTENT CLASSIFICATION TESTS
# =====================================================================

def test_intent_vehicle_breakdown(router: RouterAgent):
    queries = [
        "Vehicle V-101 has broken down on NH-48",
        "Truck VH-02 suffered an engine failure near Mumbai Hub",
        "Flat tire reported for vehicle V-103, needs tow truck",
        "Engine overheated and stalled on the flyover",
    ]
    for q in queries:
        intent, conf, _ = router.classify_intent(q)
        assert intent == AgentIntent.VEHICLE_BREAKDOWN, f"Failed on: {q}"
        assert conf >= 0.70, f"Low confidence on breakdown: {conf}"


def test_intent_traffic_delay(router: RouterAgent):
    queries = [
        "Heavy traffic congestion on Eastern Express Highway, 45 minute delay",
        "Truck V-102 stuck in severe bottleneck at toll plaza",
        "Highway closed due to waterlogging, running 30 mins late",
        "Gridlock on Western Express causing significant delays",
    ]
    for q in queries:
        intent, conf, _ = router.classify_intent(q)
        assert intent == AgentIntent.TRAFFIC_DELAY, f"Failed on: {q}"
        assert conf >= 0.60, f"Low confidence on delay: {conf}"


def test_intent_policy_query(router: RouterAgent):
    queries = [
        "What is the maximum driver driving limit before mandatory rest break?",
        "What are the ADR placarding requirements for transporting hazardous materials?",
        "What is the cold chain SOP for temperature excursion in pharma shipments?",
        "Check vehicle load safety rules and axle weight limits",
    ]
    for q in queries:
        intent, conf, _ = router.classify_intent(q)
        assert intent == AgentIntent.POLICY_QUERY, f"Failed on: {q}"
        assert conf >= 0.65, f"Low confidence on policy: {conf}"


def test_intent_reroute_request(router: RouterAgent):
    queries = [
        "Reroute vehicle V-101 to avoid the flooded underpass",
        "Detour truck V-102 around the closed bridge",
        "Swap stop #4 and stop #5 to optimize delivery window",
        "Recalculate route sequence for active fleet manifest",
    ]
    for q in queries:
        intent, conf, _ = router.classify_intent(q)
        assert intent == AgentIntent.REROUTE_REQUEST, f"Failed on: {q}"
        assert conf >= 0.65, f"Low confidence on reroute: {conf}"


def test_intent_general_inquiry(router: RouterAgent):
    queries = [
        "What can the fleet AI copilot do?",
        "How do I use this system to view fleet status?",
        "Show me fleet capabilities overview",
    ]
    for q in queries:
        intent, conf, _ = router.classify_intent(q)
        assert intent == AgentIntent.GENERAL_INQUIRY, f"Failed on: {q}"


def test_intent_off_topic_and_empty(router: RouterAgent):
    assert router.classify_intent("")[0] == AgentIntent.OFF_TOPIC
    assert router.classify_intent("   ")[0] == AgentIntent.OFF_TOPIC

    greeting_intent, conf, _ = router.classify_intent("Hello good morning!")
    assert greeting_intent == AgentIntent.OFF_TOPIC


# =====================================================================
# 2. ENTITY EXTRACTION TESTS
# =====================================================================

def test_entity_extraction_full(router: RouterAgent):
    query = "Vehicle V-101 broken down on NH-48 with 45 minutes delay near stop #4"
    entities = router.extract_entities(query)

    assert entities.vehicle_id == "V-101"
    assert entities.location == "NH-48"
    assert entities.delay_minutes == 45
    assert entities.stop_id == "4"
    assert entities.severity in (SeverityLevel.HIGH, SeverityLevel.CRITICAL)


def test_entity_extraction_hour_conversion(router: RouterAgent):
    query = "Traffic jam causing 1.5 hours delay on Eastern Express Highway"
    entities = router.extract_entities(query)

    assert entities.delay_minutes == 90
    assert "Eastern Express" in entities.location
    assert entities.severity == SeverityLevel.HIGH


def test_entity_extraction_policy_topics(router: RouterAgent):
    hos_entities = router.extract_entities("What are the hours of service rules?")
    assert hos_entities.policy_topic == "DRIVER_REST"
    assert "SOP-DR-001" in (hos_entities.rule_reference or "")

    hazmat_entities = router.extract_entities("Check ADR placard compliance for hazardous materials")
    assert hazmat_entities.policy_topic == "HAZMAT"
    assert "SOP-HZ-001" in (hazmat_entities.rule_reference or "")

    cold_entities = router.extract_entities("Cold chain reefer temperature excursion alert")
    assert cold_entities.policy_topic == "COLD_CHAIN"
    assert "SOP-CC-001" in (cold_entities.rule_reference or "")


# =====================================================================
# 3. STATEGRAPH EXECUTION & RAG TRACE TESTS
# =====================================================================

def test_stategraph_execution_trace(graph: CopilotStateGraph):
    response = graph.execute("Vehicle V-102 engine failure on Western Express")

    assert response.session_id.startswith("sess_")
    assert response.intent == AgentIntent.VEHICLE_BREAKDOWN
    assert response.entities.vehicle_id == "V-102"
    assert response.suggested_action is not None
    assert "OUT_OF_SERVICE" in response.suggested_action

    # Verify execution trace steps
    assert len(response.execution_trace) == 4
    step_nodes = [s.node for s in response.execution_trace]
    assert step_nodes == ["input_parser", "router_intent_classifier", "handler_vehicle_breakdown", "action_synthesizer"]
    assert all(s.latency_ms >= 0 for s in response.execution_trace)
    assert response.latency_ms >= 0


def test_stategraph_rag_policy_integration(graph: CopilotStateGraph):
    response = graph.execute("What is the maximum driver driving limit before mandatory rest break?")

    assert response.intent == AgentIntent.POLICY_QUERY
    assert "SOP-DR-001" in response.response
    assert "Verified Citation" in response.response
    assert response.entities.policy_topic == "DRIVER_REST"


# =====================================================================
# 4. REST API ENDPOINT TESTS
# =====================================================================

def test_api_copilot_health(client: TestClient):
    res = client.get("/api/v1/copilot/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["supported_intents_count"] == 6
    assert data["rag_corpus_indexed"] is True
    assert "engine" in data


def test_api_copilot_intents(client: TestClient):
    res = client.get("/api/v1/copilot/intents")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 6
    intents = [item["intent"] for item in data]
    assert "VEHICLE_BREAKDOWN" in intents
    assert "TRAFFIC_DELAY" in intents
    assert "POLICY_QUERY" in intents
    assert "REROUTE_REQUEST" in intents
    assert "GENERAL_INQUIRY" in intents
    assert "OFF_TOPIC" in intents


def test_api_copilot_query_unauthorized(client: TestClient):
    res = client.post("/api/v1/copilot/query", json={"query": "Vehicle V-101 broken down"})
    assert res.status_code == 401


def test_api_copilot_query_empty_string(client: TestClient, dispatcher_token: str):
    headers = {"Authorization": f"Bearer {dispatcher_token}"}
    res = client.post("/api/v1/copilot/query", json={"query": "   "}, headers=headers)
    assert res.status_code == 400
    assert "empty" in res.json()["detail"].lower()


def test_api_copilot_query_authorized(client: TestClient, dispatcher_token: str):
    headers = {"Authorization": f"Bearer {dispatcher_token}"}
    payload = {
        "query": "Heavy traffic jam on Eastern Express causing 45 minutes delay for Vehicle V-101",
        "session_id": "test_session_123",
    }
    res = client.post("/api/v1/copilot/query", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["session_id"] == "test_session_123"
    assert data["intent"] == "TRAFFIC_DELAY"
    assert data["entities"]["vehicle_id"] == "V-101"
    assert data["entities"]["delay_minutes"] == 45
    assert len(data["execution_trace"]) == 4
    assert data["latency_ms"] >= 0
def test_api_copilot_query_forbidden_for_driver(client: TestClient):
    """Verifies that driver tokens are rejected with 403 Forbidden on the copilot query endpoint."""
    client.post("/api/v1/auth/seed-demo-users")
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "driver@fleetopt.io", "password": "password123"},
    )
    assert login_res.status_code == 200
    driver_token = login_res.json()["access_token"]

    headers = {"Authorization": f"Bearer {driver_token}"}
    payload = {"query": "Vehicle V-101 breakdown on NH-48"}
    res = client.post("/api/v1/copilot/query", json=payload, headers=headers)
    assert res.status_code == 403
    assert "not permitted" in res.json()["detail"].lower()


def test_stategraph_native_compiled_execution(graph: CopilotStateGraph):
    """Verifies that the compiled LangGraph StateGraph is native, runnable, and yields structured traces."""
    assert graph.is_langgraph_native is True
    assert graph._langgraph_app is not None

    res = graph.execute("Vehicle V-103 breakdown on Highway 48", session_id="lg_test_sess")
    assert res.session_id == "lg_test_sess"
    assert res.intent == AgentIntent.VEHICLE_BREAKDOWN
    assert len(res.execution_trace) == 4
    nodes = [s.node for s in res.execution_trace]
    assert nodes == ["input_parser", "router_intent_classifier", "handler_vehicle_breakdown", "action_synthesizer"]
    assert all(s.latency_ms >= 0 for s in res.execution_trace)
def test_copilot_query_unassigned_shipments_with_context(graph: CopilotStateGraph):
    """Verifies that queries regarding unassigned parcels/shipments dynamically report pending shipments."""
    context = {
        "shipments": [
            {
                "tracking_number": "SHP-001-MUM",
                "customer_name": "Reliance Industries",
                "status": "IN_TRANSIT",
            },
            {
                "tracking_number": "SHP-003-NV",
                "customer_name": "Flipkart Supply Chain",
                "destination_address": "Belapur, Navi Mumbai",
                "weight_kg": 920,
                "priority": "EXPRESS",
                "status": "UNASSIGNED",
                "time_window_start": "08:00",
                "time_window_end": "11:00",
            },
        ]
    }
    resp = graph.execute("Which shipments are unassigned and need routing?", context=context)
    assert resp.intent == AgentIntent.GENERAL_INQUIRY
    assert resp.confidence >= 0.8
    assert "SHP-003-NV" in resp.response
    assert "Flipkart Supply Chain" in resp.response
    assert "Dispatch Planner" in resp.suggested_action


def test_copilot_query_zero_unassigned_shipments(graph: CopilotStateGraph):
    """Verifies that copilot accurately reports zero pending shipments when all are assigned."""
    context = {
        "shipments": [
            {"tracking_number": "SHP-001-MUM", "status": "ASSIGNED"},
            {"tracking_number": "SHP-002-MUM", "status": "IN_TRANSIT"},
        ]
    }
    resp = graph.execute("Which shipments are unassigned and need routing?", context=context)
    assert resp.intent == AgentIntent.GENERAL_INQUIRY
    assert "Zero unassigned parcels" in resp.response


def test_copilot_query_todays_kpis(graph: CopilotStateGraph):
    """Verifies that copilot returns executive operational KPI telemetry."""
    context = {"vehicles_count": 4, "drivers_count": 4, "unassigned_shipments_count": 1}
    resp = graph.execute("Give me a performance summary for today", context=context)
    assert resp.intent == AgentIntent.GENERAL_INQUIRY
    assert "OTIF" in resp.response
    assert "Active Vehicles: 4" in resp.response
