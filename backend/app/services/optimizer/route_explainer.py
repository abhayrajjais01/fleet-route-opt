"""
route_explainer.py - RAG-Grounded Route Explanations & Driver Instructions (Week 11 · Track A)

Turns a planned route into three pieces of plain language:
  1. dispatch rationale - a short executive summary of why the route looks the way it does
  2. stop reasons       - why each stop sits where it does in the sequence
  3. driver instructions - stop-by-stop directions with compass heading, distance and drive time

Zero-hallucination by construction: every sentence is assembled from computed facts (ETAs, windows, loads,
distances) and every policy statement quotes a passage retrieved from the SOP knowledge base with its
citation. No free-text generation is involved, so nothing can be invented.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

from app.services.optimizer.eta_engine import RouteEvaluation, SLA_AT_RISK, SLA_ON_TIME
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec


@dataclass
class StopInfo:
    """Display details the planner knows about a stop (the solver only needs coordinates and windows)."""
    name: str
    address: str = ""
    priority: str = "STANDARD"


@dataclass
class Citation:
    doc_id: str
    section: str
    heading: str
    excerpt: str
    score: float


@dataclass
class Explanation:
    summary: str
    stop_reasons: List[Tuple[str, str]]
    driver_instructions: List[str]
    citations: List[Citation] = field(default_factory=list)


COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]


def bearing(a: Tuple[float, float], b: Tuple[float, float]) -> str:
    """Initial great-circle bearing from a to b, as one of eight compass directions."""
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlon = math.radians(b[1] - a[1])
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    deg = (math.degrees(math.atan2(x, y)) + 360) % 360
    return COMPASS[int((deg + 22.5) // 45) % 8]


def clock(minutes: float) -> str:
    m = int(round(minutes)) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def _policy_citations(queries: Sequence[str]) -> List[Citation]:
    try:
        from app.services.rag.knowledge_base import get_knowledge_base
        kb = get_knowledge_base()
    except Exception:
        return []
    seen, out = set(), []
    for q in queries:
        for hit in kb.search(q, top_k=1, min_score=0.08):
            if hit.chunk.chunk_id in seen:
                continue
            seen.add(hit.chunk.chunk_id)
            first_sentence = hit.chunk.text.split(". ")[0].rstrip(".") + "."
            out.append(Citation(hit.chunk.doc_id, hit.chunk.section, hit.chunk.heading, first_sentence, hit.score))
    return out


def explain_route(
    hub_name: str,
    hub: Tuple[float, float],
    stops: Sequence[Stop],
    info: Dict[str, StopInfo],
    vehicle: VehicleSpec,
    vehicle_name: str,
    evaluation: RouteEvaluation,
    depart_min: int,
    separate_trips_km: Optional[float] = None,
) -> Explanation:
    by_id = {s.id: s for s in stops}
    etas = evaluation.stops
    name = lambda sid: info.get(sid, StopInfo(sid)).name  # noqa: E731

    # 1. Executive rationale
    late = [e for e in etas if e.minutes_late > 0]
    at_risk = [e for e in etas if e.sla == SLA_AT_RISK]
    waits = sum(e.wait for e in etas)
    parts = [
        f"{vehicle_name} leaves {hub_name} at {clock(depart_min)}, serves {len(etas)} stop{'s' if len(etas) != 1 else ''} "
        f"over {evaluation.distance_km:.1f} km and is back by {clock(evaluation.return_min)} "
        f"({evaluation.duration_min / 60:.1f} h of the {vehicle.max_shift_min / 60:g} h shift).",
        f"The load is {evaluation.load_kg:g} kg and {evaluation.load_m3:g} m³, {evaluation.utilisation * 100:.0f}% of capacity.",
    ]
    if separate_trips_km:
        saved = separate_trips_km - evaluation.distance_km
        if saved > 0:
            parts.append(f"Combining these deliveries saves {saved:.1f} km ({saved / separate_trips_km * 100:.0f}%) compared with a separate trip to each customer.")
    if late:
        parts.append(f"{len(late)} stop{'s' if len(late) > 1 else ''} would miss the delivery window: {', '.join(name(e.stop_id) for e in late)}.")
    elif at_risk:
        parts.append(f"Every stop is inside its window; {', '.join(name(e.stop_id) for e in at_risk)} has less than 15 minutes of slack.")
    else:
        parts.append("Every stop arrives inside its delivery window.")
    if waits >= 15:
        parts.append(f"The driver waits {round(waits)} min in total for windows to open.")
    summary = " ".join(parts)

    # 2. Why each stop is where it is
    reasons: List[Tuple[str, str]] = []
    for i, e in enumerate(etas):
        s = by_id[e.stop_id]
        bits = []
        if info.get(s.id) and info[s.id].priority in ("EXPRESS", "HIGH"):
            bits.append(f"{info[s.id].priority.lower()} priority")
        remaining = [by_id[x.stop_id] for x in etas[i:]]
        if s.window_close == min(r.window_close for r in remaining) and len(remaining) > 1:
            bits.append(f"its window closes first among the remaining stops ({clock(s.window_close)})")
        if i > 0 and e.leg_km <= min((etas[j].leg_km for j in range(i, len(etas))), default=e.leg_km):
            bits.append(f"closest next stop, {e.leg_km:.1f} km from {name(etas[i - 1].stop_id)}")
        if i == 0 and not bits:
            bits.append(f"{e.leg_km:.1f} km from the hub and open from {clock(s.window_open)}")
        if e.wait >= 10:
            bits.append(f"arrives {round(e.wait)} min before the window opens")
        if not bits:
            bits.append(f"fits between neighbouring stops while arriving at {clock(e.arrival)}, before {clock(s.window_close)}")
        status = "on time" if e.sla in (SLA_ON_TIME, SLA_AT_RISK) else f"{round(e.minutes_late)} min late"
        reasons.append((s.id, f"Stop {i + 1}, {name(s.id)}: {'; '.join(bits)} ({status})."))

    # 3. Turn-by-turn driver instructions (heading, distance and time per leg)
    instructions = [f"Load {len(etas)} consignment{'s' if len(etas) != 1 else ''} in reverse delivery order and leave {hub_name} at {clock(depart_min)}."]
    prev_pt = hub
    for i, e in enumerate(etas):
        s = by_id[e.stop_id]
        here = (s.lat, s.lon)
        addr = info.get(s.id).address if info.get(s.id) and info[s.id].address else ""
        line = f"{i + 1}. Head {bearing(prev_pt, here)} for {e.leg_km:.1f} km (~{round(e.leg_min)} min) to {name(s.id)}{', ' + addr if addr else ''}. Arrive {clock(e.arrival)}"
        if e.wait >= 1:
            line += f", wait until {clock(e.service_start)} when the window opens"
        line += f"; unload and collect proof of delivery by {clock(e.departure)}."
        instructions.append(line)
        prev_pt = here
    instructions.append(f"Return {bearing(prev_pt, hub)} to {hub_name}, arriving about {clock(evaluation.return_min)}.")

    # Policy grounding: rules this plan depends on, quoted from the SOP knowledge base.
    queries = ["vehicle payload and volume capacity limits overloading", "driver maximum daily driving hours and rest breaks",
               "delivery time window SLA breach priority"]
    if any(info.get(s.id) and info[s.id].priority == "EXPRESS" for s in stops):
        queries.append("express priority shipments same day delivery")
    citations = _policy_citations(queries)
    return Explanation(summary=summary, stop_reasons=reasons, driver_instructions=instructions, citations=citations)
