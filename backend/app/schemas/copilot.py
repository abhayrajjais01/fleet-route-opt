"""
copilot.py - Schemas for LangGraph Multi-Agent StateGraph & Router Agent (US-005)
Track B (Abhayraj Jaiswal) Week 5 Deliverable
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
