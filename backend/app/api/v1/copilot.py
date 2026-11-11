"""
copilot.py - REST API Router for LangGraph AI Copilot & Router Agent (US-005)
Track B (Abhayraj Jaiswal) Week 5 Deliverable
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.logging import logger
from app.core.security import require_roles
from app.models.user import User, UserRole
from app.core.database import get_db
from sqlalchemy.orm import Session
from app.schemas.copilot import (
    AgentIntent,
    CopilotHealthResponse,
    CopilotQueryRequest,
    CopilotQueryResponse,
    IntentCatalogItem,
    GuardrailEvaluationResult,
    PolicyComplianceReport,
    RouteComplianceRequest,
)
from app.services.copilot.guardrails import evaluate_rag_guardrail, DEFAULT_GUARDRAIL_THRESHOLD
from app.services.copilot.policy_agent import PolicyComplianceAgent
from app.services.copilot.state_graph import get_copilot_graph

router = APIRouter()

INTENT_CATALOG: List[IntentCatalogItem] = [
    IntentCatalogItem(
        intent=AgentIntent.VEHICLE_BREAKDOWN,
        label="Vehicle Breakdown & Mechanical Failure",
        description="Immediate incident escalation for stalled engines, flat tires, or mechanical halts.",
        example_queries=[
            "Vehicle V-101 engine breakdown on NH-48",
            "Truck VH-02 blew a tire near Mumbai Hub",
            "Vehicle V-104 overheated and needs towing",
        ],
        target_handler="BreakdownEmergencyHandlerNode",
    ),
    IntentCatalogItem(
        intent=AgentIntent.TRAFFIC_DELAY,
        label="Traffic Congestion & Delay Buffer",
        description="Dynamic delay buffer injection and downstream delivery window recalibration.",
        example_queries=[
            "Heavy traffic congestion on Eastern Express Highway, 45 minute delay",
            "Truck V-102 stuck in toll plaza bottleneck for 30 mins",
            "Road closure causing 1 hour delay on Western Express",
        ],
        target_handler="TrafficDelayRecalibrationNode",
    ),
    IntentCatalogItem(
        intent=AgentIntent.POLICY_QUERY,
        label="Regulatory Compliance & SOP Verification",
        description="RAG-grounded retrieval of transportation laws, hours-of-service, and Hazmat protocols.",
        example_queries=[
            "What is the maximum driver driving limit before mandatory rest break?",
            "What are the ADR placarding rules for transporting Class 3 flammables?",
            "What is the temperature excursion protocol for cold chain vaccines?",
        ],
        target_handler="RAGPolicyComplianceNode",
    ),
    IntentCatalogItem(
        intent=AgentIntent.REROUTE_REQUEST,
        label="Dynamic Route Optimization & Resequencing",
        description="Triggers the VRPTW Solver to resequence customer stops and bypass road obstructions.",
        example_queries=[
            "Reroute truck V-101 to avoid the flooded underpass",
            "Detour stop #4 to the end of the sequence",
            "Recalculate route sequence for vehicle V-103",
        ],
        target_handler="OptimizationSolverToolNode",
    ),
    IntentCatalogItem(
        intent=AgentIntent.GENERAL_INQUIRY,
        label="Fleet Overview & Copilot Guidance",
        description="General assistance regarding fleet capabilities, active vehicles, and command syntax.",
        example_queries=[
            "What can you help me with?",
            "How does the route optimizer handle emergency breakdowns?",
            "Show me available dispatch commands",
        ],
        target_handler="GeneralDispatcherAssistanceNode",
    ),
    IntentCatalogItem(
        intent=AgentIntent.OFF_TOPIC,
        label="Conversational & Off-Topic Filtering",
        description="Polite guidance redirecting off-topic queries back to logistics dispatch operations.",
        example_queries=[
            "Hello, good morning!",
            "Tell me a joke",
            "What is the weather today?",
        ],
        target_handler="OffTopicRedirectionNode",
    ),
]


@router.post(
    "/query",
    response_model=CopilotQueryResponse,
    summary="Execute Natural Language Dispatcher Query via StateGraph",
    description="Classifies intent, extracts entities, and executes the LangGraph multi-agent workflow.",
)
def execute_query(
    payload: CopilotQueryRequest,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER, UserRole.DISPATCHER])),
) -> CopilotQueryResponse:
    if not payload.query or not payload.query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query string cannot be empty",
        )

    graph = get_copilot_graph()
    context = payload.context or {}
    context["user_id"] = current_user.id
    context["user_role"] = current_user.role.value

    response = graph.execute(
        query=payload.query.strip(),
        session_id=payload.session_id,
        context=context,
    )
    return response


@router.get(
    "/intents",
    response_model=List[IntentCatalogItem],
    summary="Get Supported Copilot Intent Catalog",
    description="Returns all supported intent categories, example prompts, and assigned handlers.",
)
def get_intent_catalog() -> List[IntentCatalogItem]:
    return INTENT_CATALOG


@router.get(
    "/health",
    response_model=CopilotHealthResponse,
    summary="Copilot Agent System Health & Graph Engine Status",
)
def get_copilot_health() -> CopilotHealthResponse:
    graph = get_copilot_graph()

    rag_ready = False
    try:
        from app.services.rag.knowledge_base import get_knowledge_base
        kb = get_knowledge_base()
        rag_ready = bool(kb and len(kb.chunks) > 0)
    except Exception as exc:
        logger.warning(f"RAG knowledge base unavailable during health check: {exc}")
        rag_ready = False

    health_status = "healthy" if rag_ready else "degraded"

    return CopilotHealthResponse(
        status=health_status,
        engine="LangGraph StateGraph" if graph.is_langgraph_native else "Deterministic StateGraph Fallback",
        langgraph_available=graph.is_langgraph_native,
        supported_intents_count=len(INTENT_CATALOG),
        rag_corpus_indexed=rag_ready,
        guardrails_active=True,
        policy_agent_active=True,
    )


@router.post(
    "/guardrails/evaluate",
    response_model=GuardrailEvaluationResult,
    summary="Evaluate Policy Query against Zero-Hallucination Guardrails (US-006, Week 7)",
    description="Calculates similarity against RAG embeddings and applies calibrated confidence thresholds to prevent regulatory hallucinations.",
)
def evaluate_guardrail_endpoint(
    request: CopilotQueryRequest,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER, UserRole.DISPATCHER])),
) -> GuardrailEvaluationResult:
    from app.services.rag.knowledge_base import get_knowledge_base
    kb = get_knowledge_base()
    hits = kb.search(request.query, top_k=3)
    return evaluate_rag_guardrail(query=request.query, hits=hits)


@router.post(
    "/policy/validate-route",
    response_model=PolicyComplianceReport,
    summary="Evaluate Route Manifest Compliance via Policy Agent (US-006, Week 8)",
    description="Validates a proposed route and manifest against Driver HOS (Motor Transport Workers Act), Hazmat segregation, and Cold Chain standards.",
)
def validate_route_policy_endpoint(
    request: RouteComplianceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER, UserRole.DISPATCHER])),
) -> PolicyComplianceReport:
    return PolicyComplianceAgent.evaluate_manifest(
        db=db,
        vehicle_id=request.vehicle_id,
        driver_id=request.driver_id,
        shipment_ids=request.shipment_ids,
        estimated_duration_minutes=request.estimated_duration_minutes,
    )
