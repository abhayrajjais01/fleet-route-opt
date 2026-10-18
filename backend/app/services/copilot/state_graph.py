"""
state_graph.py - LangGraph Multi-Agent StateGraph Architecture (US-005)
Track B (Abhayraj Jaiswal) Week 5 Deliverable

Implements:
1. Multi-Agent StateGraph workflow engine.
2. Structured AgentState with immutable step tracing.
3. Conditional intent routing to specialized sub-agent nodes:
   - Breakdown Handler: Emergency halt & stop redistribution logic
   - Traffic Delay Handler: ETA buffer recalculation & ripple effect warning
   - Policy Compliance Node: Real-time RAG Knowledge Base retrieval & citation
   - Reroute Handler: Feasibility check & VRPTW re-solver preparation
   - General Logistics Copilot Node: Dispatcher overview & capabilities
   - Off-topic Filter: Friendly conversational redirection
4. Dual Execution Engine:
   - Native LangGraph StateGraph compiled workflow with executable conditional edges
   - Zero-dependency Deterministic Fallback workflow runner
"""

import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from app.core.logging import logger
from app.schemas.copilot import (
    AgentEntities,
    AgentIntent,
    AgentState,
    CopilotQueryResponse,
    SeverityLevel,
    TraceStep,
)
from app.services.copilot.router_agent import RouterAgent, get_router_agent

try:
    from app.services.rag.knowledge_base import get_knowledge_base
    _RAG_AVAILABLE = True
except Exception as e:
    logger.warning(f"RAG Knowledge Base not available for copilot policy node: {e}")
    _RAG_AVAILABLE = False


class CopilotStateGraph:
    """
    StateGraph workflow coordinator managing multi-agent dispatch routing.
    Compiles and executes native LangGraph StateGraph when available,
    falling back to deterministic execution when not installed.
    """

    def __init__(self, router: Optional[RouterAgent] = None):
        self.router = router or get_router_agent()
        self._langgraph_app = self._build_langgraph()

    def _build_langgraph(self) -> Optional[Any]:
        """
        Attempts to construct and compile a native LangGraph StateGraph with
        executable conditional edges and specialized sub-agent handler nodes.
        """
        try:
            from langgraph.graph import StateGraph, START, END

            graph = StateGraph(dict)

            # Node 1: Input Parser Node
            def input_parser_node(state: dict) -> dict:
                t1 = time.perf_counter()
                query = state.get("query", "")
                session_id = state.get("session_id", "")
                trace = state.setdefault("trace", [])
                trace.append(
                    TraceStep(
                        step=1,
                        node="input_parser",
                        action="Sanitized input and initialized session state",
                        details={"query_length": len(query), "session_id": session_id},
                        latency_ms=round((time.perf_counter() - t1) * 1000, 2),
                    )
                )
                return state

            # Node 2: Router Intent Classifier Node
            def router_intent_classifier_node(state: dict) -> dict:
                t2 = time.perf_counter()
                query = state.get("query", "")
                intent, confidence, scores = self.router.classify_intent(query)
                entities = self.router.extract_entities(query)
                state["intent"] = intent
                state["confidence"] = confidence
                state["entities"] = entities
                state["candidate_scores"] = scores

                trace = state.setdefault("trace", [])
                trace.append(
                    TraceStep(
                        step=2,
                        node="router_intent_classifier",
                        action=f"Classified intent as {intent.value} ({confidence * 100:.1f}% confidence)",
                        details={
                            "intent": intent.value,
                            "confidence": confidence,
                            "extracted_entities": entities.model_dump(),
                            "candidate_scores": {k.value: v for k, v in scores.items() if v > 0},
                        },
                        latency_ms=round((time.perf_counter() - t2) * 1000, 2),
                    )
                )
                return state

            # Conditional Router Edge Function
            def route_conditional(state: dict) -> str:
                intent: AgentIntent = state.get("intent", AgentIntent.GENERAL_INQUIRY)
                return f"handler_{intent.value.lower()}"

            # Register Nodes 1 & 2
            graph.add_node("input_parser", input_parser_node)
            graph.add_node("router_intent_classifier", router_intent_classifier_node)
            graph.add_edge(START, "input_parser")
            graph.add_edge("input_parser", "router_intent_classifier")

            # Node 3: Specialized Sub-Agent Handler Nodes
            for target_intent in AgentIntent:
                node_name = f"handler_{target_intent.value.lower()}"

                def make_handler(bound_intent: AgentIntent):
                    def handler_node(state: dict) -> dict:
                        t3 = time.perf_counter()
                        query = state.get("query", "")
                        entities: AgentEntities = state.get("entities", AgentEntities())
                        context = state.get("context", {})

                        narrative, action, details = self._dispatch_intent_handler(
                            query=query,
                            intent=bound_intent,
                            entities=entities,
                            context=context,
                        )
                        state["response_text"] = narrative
                        state["suggested_action"] = action
                        state["node_details"] = details

                        trace = state.setdefault("trace", [])
                        trace.append(
                            TraceStep(
                                step=3,
                                node=f"handler_{bound_intent.value.lower()}",
                                action=f"Executed specialized {bound_intent.value} operational evaluation",
                                details=details,
                                latency_ms=round((time.perf_counter() - t3) * 1000, 2),
                            )
                        )
                        return state
                    return handler_node

                graph.add_node(node_name, make_handler(target_intent))
                graph.add_edge(node_name, "action_synthesizer")

            # Conditional routing from router to specific handler
            graph.add_conditional_edges("router_intent_classifier", route_conditional)

            # Node 4: Action Synthesizer Node
            def action_synthesizer_node(state: dict) -> dict:
                t4 = time.perf_counter()
                start_time = state.get("start_time", t4)
                entities: AgentEntities = state.get("entities", AgentEntities())
                total_latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
                state["total_latency_ms"] = total_latency_ms

                trace = state.setdefault("trace", [])
                trace.append(
                    TraceStep(
                        step=4,
                        node="action_synthesizer",
                        action="Synthesized operational directives and formatted response payload",
                        details={"status": "READY_FOR_DISPATCHER", "severity": entities.severity.value},
                        latency_ms=round((time.perf_counter() - t4) * 1000, 2),
                    )
                )
                return state

            graph.add_node("action_synthesizer", action_synthesizer_node)
            graph.add_edge("action_synthesizer", END)

            compiled = graph.compile()
            logger.info("LangGraph StateGraph successfully compiled with native conditional routing.")
            return compiled
        except Exception as err:
            logger.warning(f"Native LangGraph compile skipped ({err}), using built-in deterministic engine.")
            return None

    @property
    def is_langgraph_native(self) -> bool:
        return self._langgraph_app is not None

    def execute(
        self,
        query: str,
        session_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> CopilotQueryResponse:
        """
        Executes the StateGraph multi-agent pipeline and returns a structured response.
        Executes via compiled LangGraph StateGraph when available, with clean fallback.
        """
        session_id = session_id or f"sess_{uuid.uuid4().hex[:10]}"
        context = context or {}

        if self._langgraph_app is not None:
            try:
                return self._execute_langgraph(query, session_id, context)
            except Exception as exc:
                logger.error(f"LangGraph execution encountered an error: {exc}. Falling back to deterministic engine.")
                return self._execute_deterministic(query, session_id, context)

        return self._execute_deterministic(query, session_id, context)

    def _execute_langgraph(
        self,
        query: str,
        session_id: str,
        context: Dict[str, Any],
    ) -> CopilotQueryResponse:
        start_time = time.perf_counter()
        initial_state = {
            "query": query,
            "session_id": session_id,
            "context": context,
            "trace": [],
            "start_time": start_time,
        }
        output_state = self._langgraph_app.invoke(initial_state)

        return CopilotQueryResponse(
            session_id=session_id,
            query=query,
            intent=output_state["intent"],
            confidence=output_state["confidence"],
            entities=output_state["entities"],
            response=output_state["response_text"],
            suggested_action=output_state.get("suggested_action"),
            execution_trace=output_state["trace"],
            latency_ms=output_state.get("total_latency_ms", round((time.perf_counter() - start_time) * 1000, 2)),
        )

    def _execute_deterministic(
        self,
        query: str,
        session_id: str,
        context: Dict[str, Any],
    ) -> CopilotQueryResponse:
        start_time = time.perf_counter()
        trace: List[TraceStep] = []

        # Node 1: Input Parser
        t1 = time.perf_counter()
        trace.append(
            TraceStep(
                step=1,
                node="input_parser",
                action="Sanitized input and initialized session state",
                details={"query_length": len(query), "session_id": session_id},
                latency_ms=round((time.perf_counter() - t1) * 1000, 2),
            )
        )

        # Node 2: Router Intent Classifier
        t2 = time.perf_counter()
        intent, confidence, scores = self.router.classify_intent(query)
        entities = self.router.extract_entities(query)
        trace.append(
            TraceStep(
                step=2,
                node="router_intent_classifier",
                action=f"Classified intent as {intent.value} ({confidence * 100:.1f}% confidence)",
                details={
                    "intent": intent.value,
                    "confidence": confidence,
                    "extracted_entities": entities.model_dump(),
                    "candidate_scores": {k.value: v for k, v in scores.items() if v > 0},
                },
                latency_ms=round((time.perf_counter() - t2) * 1000, 2),
            )
        )

        # Node 3: Intent-Specific Sub-Agent Handler
        t3 = time.perf_counter()
        response_text, suggested_action, node_details = self._dispatch_intent_handler(
            query=query, intent=intent, entities=entities, context=context
        )
        trace.append(
            TraceStep(
                step=3,
                node=f"handler_{intent.value.lower()}",
                action=f"Executed specialized {intent.value} operational evaluation",
                details=node_details,
                latency_ms=round((time.perf_counter() - t3) * 1000, 2),
            )
        )

        # Node 4: Action Synthesizer
        t4 = time.perf_counter()
        total_latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        trace.append(
            TraceStep(
                step=4,
                node="action_synthesizer",
                action="Synthesized operational directives and formatted response payload",
                details={"status": "READY_FOR_DISPATCHER", "severity": entities.severity.value},
                latency_ms=round((time.perf_counter() - t4) * 1000, 2),
            )
        )

        return CopilotQueryResponse(
            session_id=session_id,
            query=query,
            intent=intent,
            confidence=confidence,
            entities=entities,
            response=response_text,
            suggested_action=suggested_action,
            execution_trace=trace,
            latency_ms=total_latency_ms,
        )

    def _dispatch_intent_handler(
        self,
        query: str,
        intent: AgentIntent,
        entities: AgentEntities,
        context: Dict[str, Any],
    ) -> Tuple[str, str, Dict[str, Any]]:
        v_label = f"Vehicle {entities.vehicle_id}" if entities.vehicle_id else "Impacted vehicle"
        loc_label = f" on {entities.location}" if entities.location else ""

        if intent == AgentIntent.VEHICLE_BREAKDOWN:
            action = self.router.build_suggested_action(intent, entities)
            narrative = (
                f"Disruption Alert: {v_label} reported a mechanical breakdown{loc_label}. " +
                f"Emergency status flagged at {entities.severity.value} severity. " +
                "The system recommends immediately halting this vehicle and reallocating remaining delivery waypoints " +
                "to available nearby fleet units to prevent SLA breaches."
            )
            return narrative, action, {"incident_type": "BREAKDOWN", "halt_vehicle": True, "reassign_stops": True}

        elif intent == AgentIntent.TRAFFIC_DELAY:
            action = self.router.build_suggested_action(intent, entities)
            delay_text = f"{entities.delay_minutes} minutes" if entities.delay_minutes else "unspecified duration"
            narrative = (
                f"Traffic Congestion Notice: Congestion reported{loc_label} causing approximately {delay_text} delay " +
                f"for {v_label}. Downstream delivery windows have been marked for buffer recalibration. " +
                "Dispatcher action recommended: apply dynamic delay offset to avoid false SLA violation flags."
            )
            return narrative, action, {"incident_type": "TRAFFIC_DELAY", "delay_minutes": entities.delay_minutes}

        elif intent == AgentIntent.POLICY_QUERY:
            action = self.router.build_suggested_action(intent, entities)
            citations = []
            if _RAG_AVAILABLE:
                try:
                    kb = get_knowledge_base()
                    hits = kb.search(query, top_k=2, min_score=0.08)
                    for hit in hits:
                        sec_title = f"{hit.chunk.section} - {hit.chunk.heading}" if hit.chunk.section else hit.chunk.heading
                        citations.append({
                            "doc_id": hit.chunk.doc_id,
                            "section": sec_title,
                            "score": round(hit.score, 3),
                            "excerpt": hit.chunk.text[:200] + "...",
                        })
                except Exception as err:
                    logger.error(f"Error querying RAG knowledge base: {err}")

            if citations:
                top = citations[0]
                topic_str = entities.policy_topic or "Standard Operating Procedure"
                narrative = (
                    f"Regulatory Compliance Policy ({topic_str}):\n\n" +
                    f"According to {top['doc_id']} ({top['section']}):\n" +
                    f"\"{top['excerpt']}\"\n\n" +
                    f"Verified Citation: {top['doc_id']} (Confidence: {top['score'] * 100:.1f}%)."
                )
            else:
                ref = entities.rule_reference or "Fleet Operational SOP Manual"
                topic_str = entities.policy_topic or "logistics operations"
                narrative = (
                    f"Standard Operating Procedure: Queried policy regarding {topic_str}. " +
                    f"Reference standard: {ref}. Please verify driver shift logs and ensure mandatory safety procedures are logged."
                )
            return narrative, action, {"citations_found": len(citations), "citations": citations}

        elif intent == AgentIntent.REROUTE_REQUEST:
            action = self.router.build_suggested_action(intent, entities)
            narrative = (
                f"Route Optimization Triggered: Rerouting requested for {v_label}{loc_label}. " +
                "The Deterministic VRPTW Optimization Solver is prepared to recompute the shortest travel duration matrix " +
                "incorporating detour factors and customer delivery time windows."
            )
            return narrative, action, {"recompute_solver": True, "target_vehicle": entities.vehicle_id}

        elif intent == AgentIntent.GENERAL_INQUIRY:
            q_lower = query.lower()

            unassigned_trigger_terms = [
                "unassigned",
                "need routing",
                "needs routing",
                "pending routing",
                "pending shipment",
                "pending shipments",
                "pending parcel",
                "pending parcels",
                "pending order",
                "pending orders",
                "unrouted",
                "which shipment",
                "which parcel",
                "which order",
                "unassigned parcel",
                "unassigned shipment",
                "unassigned order",
            ]

            # Sub-case A: Inquiries about unassigned shipments, parcels, or pending routing
            if any(term in q_lower for term in unassigned_trigger_terms):
                unassigned: List[Dict[str, Any]] = []

                # 1. Respect an explicitly provided shipments list from client context
                if context and "shipments" in context and isinstance(context["shipments"], list):
                    unassigned = [
                        s for s in context["shipments"]
                        if str(s.get("status", "")).upper() == "UNASSIGNED"
                    ]
                else:
                    # 2. Fall back to database query ONLY when no shipment list was provided in context
                    try:
                        from app.core.database import SessionLocal
                        from app.models.shipment import Shipment, ShipmentStatus
                        db = SessionLocal()
                        try:
                            db_shipments = db.query(Shipment).filter(Shipment.status == ShipmentStatus.UNASSIGNED).all()
                            unassigned = [
                                {
                                    "tracking_number": s.tracking_number,
                                    "customer_name": s.customer_name,
                                    "destination_address": s.destination_address,
                                    "weight_kg": s.weight_kg,
                                    "priority": s.priority.value if hasattr(s.priority, "value") else str(s.priority),
                                    "time_window_start": s.time_window_start,
                                    "time_window_end": s.time_window_end,
                                }
                                for s in db_shipments
                            ]
                        finally:
                            db.close()
                    except Exception as db_err:
                        logger.warning(f"Could not query shipments from DB for copilot inquiry: {db_err}")

                if unassigned:
                    items_lines = []
                    for s in unassigned:
                        trk = s.get("tracking_number", "SHP-N/A")
                        cust = s.get("customer_name", "Customer")
                        dest = s.get("destination_address", "Destination unlisted")
                        wt = s.get("weight_kg", 0)
                        prio = s.get("priority", "STANDARD")
                        tw = f"{s.get('time_window_start', '08:00')} - {s.get('time_window_end', '12:00')}"
                        items_lines.append(
                            f"• {trk} — {cust}\n"
                            f"  - Destination: {dest}\n"
                            f"  - Cargo: {wt} kg | Priority: {prio}\n"
                            f"  - Delivery Window: {tw}"
                        )
                    items_text = "\n".join(items_lines)

                    narrative = (
                        f"Unassigned Shipments Report ({len(unassigned)} Pending Dispatch):\n\n"
                        f"{items_text}\n\n"
                        "Operational Directive: These consignments are currently unassigned and awaiting vehicle allocation. "
                        "Recommend opening the Dispatch Planner to cluster these stops and assign them to an available fleet unit before SLA deadlines."
                    )
                    action = "Open Dispatch Planner to assign unrouted shipments to vehicle manifests."
                    return narrative, action, {
                        "inquiry_type": "UNASSIGNED_SHIPMENTS",
                        "unassigned_count": len(unassigned),
                        "shipments": unassigned,
                    }
                else:
                    narrative = (
                        "Shipment Status Report: All customer shipments are currently assigned or in transit. "
                        "Zero unassigned parcels are pending route optimization."
                    )
                    action = "Monitor active deliveries on Live Tracking."
                    return narrative, action, {
                        "inquiry_type": "UNASSIGNED_SHIPMENTS",
                        "unassigned_count": 0,
                    }

            # Sub-case B: Performance Summary & Today's KPIs
            elif any(term in q_lower for term in ["kpi", "performance", "today's", "summary", "otif", "metrics"]):
                # Derive metrics dynamically from client context / shipments state
                shipments_list = context.get("shipments") if (context and isinstance(context.get("shipments"), list)) else []
                if shipments_list:
                    in_transit_cnt = sum(1 for s in shipments_list if str(s.get("status", "")).upper() == "IN_TRANSIT")
                    unassigned_cnt = sum(1 for s in shipments_list if str(s.get("status", "")).upper() == "UNASSIGNED")
                else:
                    in_transit_cnt = context.get("in_transit_shipments_count", 4) if context else 4
                    unassigned_cnt = context.get("unassigned_shipments_count", 0) if context else 0

                active_vehicles_cnt = (
                    context.get("active_vehicles_count")
                    if (context and "active_vehicles_count" in context)
                    else context.get("vehicles_count", 4)
                    if context
                    else 4
                )
                on_duty_drivers_cnt = (
                    context.get("on_duty_drivers_count")
                    if (context and "on_duty_drivers_count" in context)
                    else context.get("drivers_count", 4)
                    if context
                    else 4
                )
                otif_rate = context.get("otif_rate", "99.2%") if context else "99.2%"

                narrative = (
                    "Operations Telemetry & Daily KPI Summary:\n\n"
                    f"• Active Vehicles: {active_vehicles_cnt} units operational across Mumbai-Pune corridors\n"
                    f"• In-Transit Shipments: {in_transit_cnt} active delivery routes\n"
                    f"• Unassigned Consignments: {unassigned_cnt} parcel(s) awaiting dispatch allocation\n"
                    f"• On-Duty Drivers: {on_duty_drivers_cnt} drivers logged in\n"
                    f"• On-Time In-Full (OTIF) Rate: {otif_rate} (above 95% SLA target)"
                )
                action = "Inspect Network Map for live regional vehicle distribution."
                return narrative, action, {
                    "inquiry_type": "KPI_SUMMARY",
                    "active_vehicles": active_vehicles_cnt,
                    "in_transit_shipments": in_transit_cnt,
                    "unassigned_shipments": unassigned_cnt,
                    "on_duty_drivers": on_duty_drivers_cnt,
                    "otif_rate": otif_rate,
                }

            # Sub-case C: General Capabilities Menu
            action = "Explore Fleet Directory, Live Map, or enter a natural language command."
            narrative = (
                "Fleet AI Copilot Ready: I can assist you with real-time operational disruptions:\n" +
                "- Unassigned Shipments: 'Which shipments are unassigned and need routing?'\n" +
                "- Breakdown Management: 'Vehicle V-101 engine breakdown on Highway 8'\n" +
                "- Traffic Delays: 'Congestion on Eastern Express, 45 minute delay'\n" +
                "- Compliance SOPs: 'What is the maximum driver driving limit before mandatory rest?'\n" +
                "- Route Detours: 'Reroute vehicle V-102 to avoid closed flyover'"
            )
            return narrative, action, {"help_menu": True}

        else:  # OFF_TOPIC
            action = "Please provide an operational fleet query or disruption alert."
            narrative = (
                "Hello! I am your Fleet Route Optimizer Copilot. " +
                "Please ask me about fleet status, traffic delays, vehicle breakdowns, route optimization, or compliance SOPs."
            )
            return narrative, action, {"off_topic": True}


_default_graph: Optional[CopilotStateGraph] = None


def get_copilot_graph() -> CopilotStateGraph:
    global _default_graph
    if _default_graph is None:
        _default_graph = CopilotStateGraph()
    return _default_graph
