"""
router_agent.py - Dispatcher Natural Language Router & Intent Classifier (US-005)
Track B (Abhayraj Jaiswal) Week 5 Deliverable

Implements:
1. Deterministic Intent Classification across logistics categories:
   - VEHICLE_BREAKDOWN
   - TRAFFIC_DELAY
   - POLICY_QUERY
   - REROUTE_REQUEST
   - GENERAL_INQUIRY
   - OFF_TOPIC
2. High-precision Entity Extraction:
   - Vehicle ID (e.g., V-101, VH-03, MH-04-AB-1234)
   - Stop/Shipment ID (e.g., Stop #4, Order SH-1002)
   - Delay Duration (e.g., 45 minutes, 1.5 hours)
   - Location / Corridor (e.g., NH-48, Eastern Express Highway)
   - Severity Level (LOW, MEDIUM, HIGH, CRITICAL)
   - Regulatory Policy Topic (DRIVER_REST, HAZMAT, COLD_CHAIN, etc.)
3. Zero-Hallucination & Zero-Dependency Deterministic Fallback Engine:
   - 100% testable without external LLM API keys
   - Sub-millisecond latency (p99 < 5ms)
   - Clear confidence scoring (0.0 to 1.0)
"""

import re
from typing import Dict, List, Optional, Tuple

from app.schemas.copilot import AgentEntities, AgentIntent, SeverityLevel


class RouterAgent:
    """
    Dispatcher Intent Classification & Entity Extraction Engine.
    Routes incoming natural language messages to dedicated agent subgraphs or handlers.
    """

    INTENT_KEYWORDS: Dict[AgentIntent, Dict[str, float]] = {
        AgentIntent.VEHICLE_BREAKDOWN: {
            "breakdown": 1.0,
            "broken down": 1.0,
            "broken-down": 1.0,
            "engine failure": 1.0,
            "engine smoke": 1.0,
            "flat tire": 1.0,
            "blown tire": 1.0,
            "overheating": 0.9,
            "overheated": 0.9,
            "towed": 0.9,
            "tow truck": 0.9,
            "mechanical failure": 1.0,
            "clutch failed": 0.9,
            "battery dead": 0.9,
            "transmission failure": 1.0,
            "stalled": 0.8,
            "wont start": 0.8,
            "cannot start": 0.8,
            "accident": 0.7,
            "collision": 0.8,
            "engine check": 0.6,
            "puncture": 0.8,
            "vehicle stopped": 0.7,
        },
        AgentIntent.TRAFFIC_DELAY: {
            "traffic": 0.8,
            "traffic jam": 1.0,
            "congestion": 0.9,
            "heavy congestion": 1.0,
            "gridlock": 1.0,
            "bottleneck": 0.8,
            "delay": 0.7,
            "delayed": 0.7,
            "running late": 0.8,
            "slow moving": 0.8,
            "stuck in traffic": 1.0,
            "roadblock": 0.9,
            "road closure": 0.9,
            "highway closed": 0.9,
            "waterlogging": 0.8,
            "flooding": 0.8,
            "diversion": 0.8,
            "toll queue": 0.8,
            "toll plaza delay": 0.9,
        },
        AgentIntent.POLICY_QUERY: {
            "sop": 0.9,
            "policy": 0.9,
            "regulation": 0.9,
            "rule": 0.7,
            "hours of service": 1.0,
            "hos": 1.0,
            "driving limit": 1.0,
            "rest break": 1.0,
            "mandatory rest": 1.0,
            "fatigue": 0.9,
            "shift limit": 0.9,
            "hazmat": 1.0,
            "hazardous": 1.0,
            "flammable": 0.9,
            "toxic": 0.9,
            "explosive": 0.9,
            "adr": 0.9,
            "cmvr": 0.9,
            "placard": 0.9,
            "cold chain": 1.0,
            "temperature excursion": 1.0,
            "pharma": 0.8,
            "perishable": 0.8,
            "reefer": 0.8,
            "refrigeration": 0.8,
            "sla": 0.8,
            "delivery window": 0.8,
            "load safety": 0.9,
            "axle weight": 0.9,
            "overweight": 0.8,
            "tie down": 0.8,
        },
        AgentIntent.REROUTE_REQUEST: {
            "reroute": 1.0,
            "re-route": 1.0,
            "detour": 1.0,
            "alternative route": 1.0,
            "new route": 0.8,
            "change route": 0.9,
            "resequence": 1.0,
            "re-order": 0.9,
            "swap stop": 1.0,
            "skip stop": 0.9,
            "recalculate route": 1.0,
            "optimize route": 0.8,
            "avoid highway": 0.9,
            "bypass": 0.9,
            "reassign deliveries": 0.9,
        },
        AgentIntent.GENERAL_INQUIRY: {
            "help": 0.6,
            "what can you do": 0.9,
            "capabilities": 0.9,
            "how do i": 0.6,
            "overview": 0.6,
            "fleet status": 0.8,
            "active vehicles": 0.8,
            "summary": 0.6,
            "dashboard": 0.6,
            "explain": 0.5,
            "who are you": 0.8,
            "copilot": 0.6,
        },
        AgentIntent.OFF_TOPIC: {
            "hello": 0.5,
            "hi": 0.4,
            "hey": 0.4,
            "good morning": 0.6,
            "good afternoon": 0.6,
            "tell me a joke": 1.0,
            "weather in": 0.7,
            "who won": 0.9,
            "recipe": 1.0,
            "sports": 0.8,
            "movie": 0.8,
        },
    }

    # Regex patterns for Entity Extraction
    VEHICLE_REGEX = re.compile(
        r"\b(?:vehicle|truck|van|lorry|fleet)?\s*([Vv][Hh]?[-_]?[0-9]{1,4}|[A-Za-z]{2}[-_]?[0-9]{2}[-_]?[A-Za-z]{1,2}[-_]?[0-9]{4})\b",
        re.IGNORECASE,
    )
    STOP_REGEX = re.compile(
        r"\b(?:stop|shipment|order|package|pkg|dropoff)\s*#?\s*([A-Za-z0-9\-_]{1,12})\b",
        re.IGNORECASE,
    )
    DELAY_REGEX = re.compile(
        r"\b(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\b",
        re.IGNORECASE,
    )
    LOCATION_REGEX = re.compile(
        r"\b(NH[- ]?\d+|SH[- ]?\d+|Eastern Express(?:way)?|Western Express(?:way)?|Highway\s*\d+|Expressway|Ring Road|Bandra[- ]?Worli Sea Link|Toll Plaza|Hub [A-Za-z0-9]+|Depot [A-Za-z0-9]+|[A-Z][a-z]+ (?:Road|Street|Flyover|Bypass|Bridge))\b",
        re.IGNORECASE,
    )

    def __init__(self, confidence_threshold: float = 0.30):
        self.confidence_threshold = confidence_threshold

    def extract_entities(self, query: str) -> AgentEntities:
        """
        Extracts structured domain entities from free-form dispatcher text.
        """
        entities = AgentEntities()
        raw_matches: List[str] = []

        # Vehicle ID extraction
        vehicle_match = self.VEHICLE_REGEX.search(query)
        if vehicle_match:
            entities.vehicle_id = vehicle_match.group(1).upper()
            raw_matches.append(f"vehicle:{entities.vehicle_id}")

        # Stop / Shipment ID extraction
        stop_match = self.STOP_REGEX.search(query)
        if stop_match:
            entities.stop_id = stop_match.group(1).upper()
            raw_matches.append(f"stop:{entities.stop_id}")

        # Delay duration extraction
        delay_match = self.DELAY_REGEX.search(query)
        if delay_match:
            val_str, unit = delay_match.groups()
            try:
                val = float(val_str)
                unit_lower = unit.lower()
                if "h" in unit_lower:
                    entities.delay_minutes = int(val * 60)
                else:
                    entities.delay_minutes = int(val)
                raw_matches.append(f"delay:{entities.delay_minutes}min")
            except ValueError:
                pass

        # Location extraction
        loc_match = self.LOCATION_REGEX.search(query)
        if loc_match:
            entities.location = loc_match.group(1).strip()
            raw_matches.append(f"location:{entities.location}")

        # Policy topic detection
        q_lower = query.lower()
        if any(w in q_lower for w in ["hazmat", "hazardous", "flammable", "adr", "chemical", "dot"]):
            entities.policy_topic = "HAZMAT"
            entities.rule_reference = "SOP-HZ-001 (Hazardous Materials Transit Guidelines)"
        elif any(w in q_lower for w in ["hours of service", "hos", "rest break", "fatigue", "driving limit", "shift limit"]):
            entities.policy_topic = "DRIVER_REST"
            entities.rule_reference = "SOP-DR-001 (Driver Hours of Service & Rest Breaks)"
        elif any(w in q_lower for w in ["cold chain", "temperature", "pharma", "vaccine", "reefer", "excursion"]):
            entities.policy_topic = "COLD_CHAIN"
            entities.rule_reference = "SOP-CC-001 (Cold Chain Temperature Integrity)"
        elif any(w in q_lower for w in ["load safety", "axle weight", "overweight", "tie down", "securing load"]):
            entities.policy_topic = "VEHICLE_SAFETY"
            entities.rule_reference = "SOP-VS-001 (Vehicle Load & Road Safety Compliance)"
        elif any(w in q_lower for w in ["sla", "delivery window", "delayed delivery", "window breach"]):
            entities.policy_topic = "OPERATIONS"
            entities.rule_reference = "SOP-OP-002 (Delivery SLA & On-Time Performance)"

        # Severity determination
        if any(w in q_lower for w in ["fire", "hazard leak", "spill", "casualty", "major accident", "emergency"]):
            entities.severity = SeverityLevel.CRITICAL
        elif any(w in q_lower for w in ["breakdown", "broken down", "broken-down", "towed", "engine fail", "overheat", "blown tire"]):
            entities.severity = SeverityLevel.HIGH
        elif (entities.delay_minutes and entities.delay_minutes >= 60):
            entities.severity = SeverityLevel.HIGH
        elif (entities.delay_minutes and entities.delay_minutes >= 15) or "congestion" in q_lower or "traffic jam" in q_lower:
            entities.severity = SeverityLevel.MEDIUM
        else:
            entities.severity = SeverityLevel.LOW

        entities.raw_matches = raw_matches
        return entities

    def classify_intent(self, query: str) -> Tuple[AgentIntent, float, Dict[str, float]]:
        """
        Classifies the user query into an AgentIntent using weighted semantic matching.
        Returns: (best_intent, confidence, all_scores)
        """
        if not query or not query.strip():
            return AgentIntent.OFF_TOPIC, 0.0, {}

        q_clean = " " + re.sub(r"[^a-zA-Z0-9\s]", " ", query.lower()) + " "
        scores: Dict[AgentIntent, float] = {intent: 0.0 for intent in AgentIntent}

        for intent, keyword_weights in self.INTENT_KEYWORDS.items():
            intent_score = 0.0
            for keyword, weight in keyword_weights.items():
                pattern = r"\b" + re.escape(keyword) + r"\b"
                if re.search(pattern, q_clean):
                    intent_score += weight * 1.5
                elif keyword in q_clean:
                    intent_score += weight

            normalized = min(1.0, intent_score / 2.0)
            scores[intent] = round(normalized, 3)

        # Disambiguation heuristics
        if any(w in q_clean for w in [" breakdown ", " broken down ", " engine failed ", " flat tire ", " towed "]):
            scores[AgentIntent.VEHICLE_BREAKDOWN] = max(scores[AgentIntent.VEHICLE_BREAKDOWN], 0.95)
        
        if any(w in q_clean for w in [" sop ", " policy ", " regulation ", " rules ", " hours of service ", " mandatory rest "]):
            scores[AgentIntent.POLICY_QUERY] = max(scores[AgentIntent.POLICY_QUERY], 0.92)

        if any(w in q_clean for w in [" reroute ", " re-route ", " detour ", " alternative route ", " swap stop "]):
            scores[AgentIntent.REROUTE_REQUEST] = max(scores[AgentIntent.REROUTE_REQUEST], 0.92)

        best_intent = max(scores, key=lambda i: scores[i])
        best_score = scores[best_intent]

        if best_score < self.confidence_threshold:
            if any(w in q_clean for w in [" hello ", " hi ", " hey ", " morning ", " afternoon ", " thank "]):
                return AgentIntent.OFF_TOPIC, 0.50, scores
            return AgentIntent.GENERAL_INQUIRY, 0.40, scores

        return best_intent, best_score, scores

    def build_suggested_action(self, intent: AgentIntent, entities: AgentEntities) -> str:
        """
        Synthesizes an immediate operational action proposal based on intent and entities.
        """
        v_tag = f"Vehicle {entities.vehicle_id}" if entities.vehicle_id else "impacted vehicle"

        if intent == AgentIntent.VEHICLE_BREAKDOWN:
            loc = f" at {entities.location}" if entities.location else ""
            return f"Flag {v_tag} as OUT_OF_SERVICE{loc}. Reassign pending shipments to nearest active vehicle."
        elif intent == AgentIntent.TRAFFIC_DELAY:
            delay_str = f"{entities.delay_minutes} min" if entities.delay_minutes else "delay"
            return f"Apply {delay_str} buffer to {v_tag} schedule. Recalculate downstream customer delivery ETAs."
        elif intent == AgentIntent.POLICY_QUERY:
            topic = entities.policy_topic or "logistics SOP"
            ref = f" per {entities.rule_reference}" if entities.rule_reference else ""
            return f"Retrieve verified standard operating procedure for {topic}{ref}."
        elif intent == AgentIntent.REROUTE_REQUEST:
            return f"Invoke VRPTW Solver to recompute optimized stop sequence for {v_tag} bypassing congested waypoints."
        elif intent == AgentIntent.GENERAL_INQUIRY:
            return "Display fleet operational overview and Copilot command suggestions."
        else:
            return "Prompt dispatcher with available command options (e.g. breakdown, delay, policy lookup, reroute)."


_default_router: Optional[RouterAgent] = None


def get_router_agent() -> RouterAgent:
    global _default_router
    if _default_router is None:
        _default_router = RouterAgent()
    return _default_router
