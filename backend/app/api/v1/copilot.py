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
    ProposalCardResponse,
    ProposalDecision,
    ProposalDecisionRequest,
    ProposalImpact,
    RouteDiffEntry,
    RouteImpactMetrics,
    VehicleRouteDiff,
)
from app.models.audit import AuditAction
from app.schemas.route import DisruptionRequest
from app.services.audit_service import record_audit_event
from app.services.copilot.optimization_agent import AgentError, handle_disruption
from app.services.copilot.proposal_service import (
    ProposalAlreadyDecided,
    ProposalCard,
    ProposalNotFound,
    build_card,
    context_from_request,
    min_to_hhmm,
    registry as proposal_registry,
)
from app.services.copilot.guardrails import evaluate_rag_guardrail, DEFAULT_GUARDRAIL_THRESHOLD
from app.services.copilot.policy_agent import PolicyComplianceAgent, UnresolvedManifestError
from app.services.copilot.state_graph import get_copilot_graph
from app.services.copilot import telemetry as agent_telemetry

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

    with agent_telemetry.track("query", current_user.role.value) as run:
        response = graph.execute(
            query=payload.query.strip(),
            session_id=payload.session_id,
            context=context,
        )
        run.intent = response.intent.value if hasattr(response.intent, "value") else str(response.intent)
        agent_telemetry.record_trace(run, response.execution_trace)
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
    try:
        return PolicyComplianceAgent.evaluate_manifest(
            db=db,
            vehicle_id=request.vehicle_id,
            driver_id=request.driver_id,
            shipment_ids=request.shipment_ids,
            estimated_duration_minutes=request.estimated_duration_minutes,
        )
    except UnresolvedManifestError as err:
        raise HTTPException(status_code=422, detail=str(err))


# ----------------------------------------------------
# Week 11: Structured Action Proposals with Route Diff (Track B)
# ----------------------------------------------------
_PROPOSAL_ROLES = [UserRole.ADMIN, UserRole.FLEET_MANAGER, UserRole.DISPATCHER]


def _card_response(card: ProposalCard) -> ProposalCardResponse:
    p = card.proposal

    def entry(e) -> RouteDiffEntry:
        return RouteDiffEntry(
            stop_id=e.stop_id, name=e.name, change=e.change, before_position=e.before_position, after_position=e.after_position,
            before_eta=min_to_hhmm(e.before_eta), after_eta=min_to_hhmm(e.after_eta), sla_after=e.sla_after,
            moved_to=e.moved_to, moved_from=e.moved_from, planned_eta=min_to_hhmm(e.planned_eta),
        )

    def metrics(m):
        return RouteImpactMetrics(**m.__dict__) if m else None

    return ProposalCardResponse(
        card_id=card.card_id, proposal_id=p.proposal_id, status=card.status, intent=p.intent, planner=p.planner,
        tool_call={"name": p.tool, "arguments": p.arguments}, summary=p.summary,
        vehicles=[VehicleRouteDiff(vehicle=v.vehicle, status=v.status, before=[entry(e) for e in v.before],
                                   after=[entry(e) for e in v.after], current=metrics(v.current), proposed=metrics(v.proposed))
                  for v in card.vehicles],
        impact=ProposalImpact(
            current=metrics(card.current), proposed=metrics(card.proposed),
            delta_km=round(card.proposed.distance_km - card.current.distance_km, 1),
            delta_minutes=round(card.proposed.duration_min - card.current.duration_min, 1),
            delta_cost=round(card.proposed.cost - card.current.cost, 0),
            delta_late_min=round(card.proposed.late_min - card.current.late_min, 1),
        ),
        routes_after={k: [{"stop_id": sid, "eta": min_to_hhmm(eta), "sla": sla} for sid, eta, sla in v] for k, v in p.routes_after.items()},
        unassigned=p.unassigned, violations=p.violations, created_at=card.created_at,
        decided_at=card.decided_at, decided_by=card.decided_by, decision_note=card.decision_note,
    )


@router.post(
    "/proposals",
    response_model=ProposalCardResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a structured re-route proposal with a route diff (US-005, Week 11)",
    description="Runs the Optimization Agent on a disruption report and returns a proposal card: current vs proposed "
                "stop order per vehicle, and the km / time / cost / lateness impact. Nothing is applied until accepted.",
)
def create_proposal(
    request: DisruptionRequest,
    current_user: User = Depends(require_roles(_PROPOSAL_ROLES)),
) -> ProposalCardResponse:
    ctx = context_from_request(request)
    with agent_telemetry.track("proposal", current_user.role.value) as run:
        try:
            proposal = handle_disruption(request.message, ctx, use_llm=request.use_llm)
        except AgentError as err:
            raise HTTPException(status_code=422, detail=str(err))
        run.intent, run.planner = proposal.intent, proposal.planner
    card = proposal_registry.add(build_card(ctx, proposal))
    logger.info(f"Proposal {card.card_id} ({proposal.tool}) created by {current_user.full_name}")
    return _card_response(card)


@router.get(
    "/proposals/{card_id}",
    response_model=ProposalCardResponse,
    summary="Get a proposal card and its decision status",
)
def get_proposal(card_id: str, current_user: User = Depends(require_roles(_PROPOSAL_ROLES))) -> ProposalCardResponse:
    try:
        return _card_response(proposal_registry.get(card_id))
    except ProposalNotFound:
        raise HTTPException(status_code=404, detail="Proposal not found or expired.")


@router.post(
    "/proposals/{card_id}/decision",
    response_model=ProposalCardResponse,
    summary="Accept or reject a proposal (recorded in the audit log)",
)
def decide_proposal(
    card_id: str,
    body: ProposalDecisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(_PROPOSAL_ROLES)),
) -> ProposalCardResponse:
    accept = body.decision == ProposalDecision.ACCEPT
    try:
        card = proposal_registry.claim(card_id)
    except ProposalNotFound:
        raise HTTPException(status_code=404, detail="Proposal not found or expired.")
    except ProposalAlreadyDecided as err:
        raise HTTPException(status_code=409, detail=str(err))

    # Persist the audit record first; the decision only becomes final once it is committed.
    p = card.proposal
    verb = "Accepted" if accept else "Rejected"
    try:
        record_audit_event(
            db=db, actor=current_user, action_type=AuditAction.COPILOT_OVERRIDE, entity_type="RouteProposal", entity_id=0,
            details=f"{verb} copilot proposal {card.card_id} ({p.tool} {p.arguments}): {p.summary}"
                    + (f" Note: {body.note}" if body.note else ""),
            before_state={v.vehicle: [e.stop_id for e in v.before] for v in card.vehicles},
            after_state={"status": "ACCEPTED" if accept else "REJECTED",
                         "routes": {v.vehicle: [e.stop_id for e in v.after] for v in card.vehicles},
                         "unassigned": p.unassigned},
        )
        db.commit()
    except Exception as err:
        db.rollback()
        proposal_registry.release(card_id)
        logger.error(f"Could not record decision for proposal {card_id}: {err}")
        raise HTTPException(status_code=503, detail="Could not record the decision in the audit log; nothing was changed. Please try again.")

    card = proposal_registry.complete(card_id, accept, current_user.full_name, body.note)
    return _card_response(card)


# ----------------------------------------------------
# Week 14: Multi-agent latency and token usage (Track B)
# ----------------------------------------------------
@router.get(
    "/telemetry",
    summary="Copilot latency and LLM token usage (Week 14)",
    description="Per-endpoint, per-intent and per-agent-node latency (count, p50, p95, max) and LLM token totals for "
                "the copilot requests this server process has handled (last 1000), plus the 20 most recent requests.",
)
def copilot_telemetry(current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER]))) -> dict:
    return agent_telemetry.summary()
