"""
copilot.py - Schemas for LangGraph Multi-Agent StateGraph, Router & Policy Agent (US-005, US-006)
Track B (Abhayraj Jaiswal) - Weeks 5 to 10
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AgentIntent(str, Enum):
    TRAFFIC_DELAY = "TRAFFIC_DELAY"
    VEHICLE_BREAKDOWN = "VEHICLE_BREAKDOWN"
    POLICY_QUERY = "POLICY_QUERY"
    REROUTE_REQUEST = "REROUTE_REQUEST"
    GENERAL_INQUIRY = "GENERAL_INQUIRY"
    OFF_TOPIC = "OFF_TOPIC"


class SeverityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class TraceStep(BaseModel):
    step: int
    node: str
    action: str
    details: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    latency_ms: float = 0.0


class AgentEntities(BaseModel):
    vehicle_id: Optional[str] = None
    stop_id: Optional[str] = None
    delay_minutes: Optional[int] = None
    location: Optional[str] = None
    severity: SeverityLevel = SeverityLevel.LOW
    policy_topic: Optional[str] = None
    rule_reference: Optional[str] = None
    raw_matches: List[str] = Field(default_factory=list)


# ----------------------------------------------------
# Week 7 Track B: Zero-Hallucination Guardrail Schemas
# ----------------------------------------------------
class PolicyCitationCard(BaseModel):
    doc_id: str
    doc_title: str
    section_number: str
    heading: str
    score: float
    confidence_pct: float
    excerpt: str


class GuardrailEvaluationResult(BaseModel):
    query: str
    passed: bool
    status: str  # "VERIFIED" or "ZERO_HALLUCINATION_REJECTED"
    similarity_score: float
    threshold: float
    confidence_pct: float
    safe_response: str
    citations: List[PolicyCitationCard] = Field(default_factory=list)
    reason: str


# ----------------------------------------------------
# Week 8 Track B: Policy & Compliance Agent Schemas
# ----------------------------------------------------
class ViolationSeverity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class PolicyViolation(BaseModel):
    rule_code: str
    sop_doc_id: str
    sop_section: str
    sop_heading: str
    severity: ViolationSeverity
    description: str
    remediation: str
    impacted_entity_type: str
    impacted_entity_id: Optional[Any] = None


class SOPRuleCitation(BaseModel):
    sop_doc_id: str
    sop_title: str
    section_number: str
    clause_heading: str
    standard_reference: str
    clause_summary: str


class PolicyComplianceReport(BaseModel):
    is_compliant: bool
    # False when a check could not run (e.g. no driver assigned); never compliant then
    evaluation_complete: bool = True
    skipped_checks: List[str] = Field(default_factory=list)
    compliance_score_pct: float
    violations_count: int
    critical_violations_count: int
    violations: List[PolicyViolation] = Field(default_factory=list)
    cited_rules: List[SOPRuleCitation] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    evaluation_timestamp: str = ""


class RouteComplianceRequest(BaseModel):
    vehicle_id: int
    driver_id: Optional[int] = None
    shipment_ids: List[int] = Field(default_factory=list)
    estimated_duration_minutes: float = Field(default=120.0, ge=0.0)


# ----------------------------------------------------
# Core Multi-Agent Copilot Schemas
# ----------------------------------------------------
class AgentState(BaseModel):
    session_id: str
    query: str
    intent: AgentIntent = AgentIntent.GENERAL_INQUIRY
    confidence: float = 0.0
    entities: AgentEntities = Field(default_factory=AgentEntities)
    suggested_action: Optional[str] = None
    response: str = ""
    context: Dict[str, Any] = Field(default_factory=dict)
    execution_trace: List[TraceStep] = Field(default_factory=list)
    total_latency_ms: float = 0.0
    guardrail: Optional[GuardrailEvaluationResult] = None
    compliance: Optional[PolicyComplianceReport] = None


class CopilotQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000, description="Dispatcher natural language command or inquiry")
    session_id: Optional[str] = Field(default=None, description="Optional persistent session ID")
    context: Optional[Dict[str, Any]] = Field(default=None, description="Optional contextual payload")


class CopilotQueryResponse(BaseModel):
    session_id: str
    query: str
    intent: AgentIntent
    confidence: float
    entities: AgentEntities
    response: str
    suggested_action: Optional[str] = None
    execution_trace: List[TraceStep]
    latency_ms: float
    guardrail: Optional[GuardrailEvaluationResult] = None
    compliance: Optional[PolicyComplianceReport] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class IntentCatalogItem(BaseModel):
    intent: AgentIntent
    label: str
    description: str
    example_queries: List[str]
    target_handler: str


class CopilotHealthResponse(BaseModel):
    status: str
    engine: str
    langgraph_available: bool
    supported_intents_count: int
    rag_corpus_indexed: bool
    guardrails_active: bool
    policy_agent_active: bool
