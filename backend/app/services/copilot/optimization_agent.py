"""
optimization_agent.py - LangGraph Optimization Agent: disruption -> solver tool calls (Week 9 · Track A)

The dispatcher reports a disruption in plain language ("MH-04-AB-2045 broke down near Sion", "V-101 stuck
in traffic, 40 min"). The agent:
  1. plans  - picks ONE tool and its arguments (the tool-calling step)
  2. acts   - runs that tool against the deterministic solver / ETA engine
  3. proposes - returns a structured re-route proposal that a human must approve; nothing is applied here

Tools (JSON-schema definitions below, shared by both planners):
  reassign_stops(vehicle_id)          breakdown: move the vehicle's remaining stops to other vehicles
  apply_delay(vehicle_id, minutes)    delay: shift downstream ETAs, re-sequence if windows would be missed
  reoptimize_route(vehicle_id)        re-route: re-sequence the vehicle's remaining stops from now

Planners:
  deterministic (default) - Abhayraj's RouterAgent classifies intent and extracts the vehicle and delay;
                            works offline, no API key, fully testable.
  claude (optional)       - when ANTHROPIC_API_KEY is set and the `anthropic` package is installed, Claude
                            chooses the tool via tool use. Its arguments are validated against the fleet
                            before anything runs; on any error the deterministic planner takes over.
The LLM only chooses WHICH tool to call; every number in a proposal still comes from the solver.
"""

from __future__ import annotations

import hashlib
import itertools
import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.core.logging import logger
from app.services.optimizer.eta_engine import RouteEvaluation, recalculate
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec, solve

CLAUDE_MODEL = "claude-opus-5-5"

TOOLS: List[Dict[str, Any]] = [
    {
        "name": "reassign_stops",
        "description": "Use when a vehicle cannot continue (breakdown, accident, driver unavailable). Moves every stop it has not yet served onto other vehicles, keeping capacity, time windows and shift limits.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"vehicle_id": {"type": "string", "description": "Id or plate of the vehicle that cannot continue."}},
            "required": ["vehicle_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "apply_delay",
        "description": "Use when a vehicle is held up but can continue (traffic, road closure, slow loading). Shifts its downstream ETAs and re-sequences its remaining stops if that avoids missed delivery windows.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "vehicle_id": {"type": "string", "description": "Id or plate of the delayed vehicle."},
                "minutes": {"type": "integer", "description": "Expected delay in minutes."},
            },
            "required": ["vehicle_id", "minutes"],
            "additionalProperties": False,
        },
    },
    {
        "name": "reoptimize_route",
        "description": "Use when the dispatcher asks to re-route or re-order a vehicle's remaining stops without a specific disruption.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"vehicle_id": {"type": "string", "description": "Id or plate of the vehicle to re-route."}},
            "required": ["vehicle_id"],
            "additionalProperties": False,
        },
    },
]


# ─────────────────────────────── Context & proposal ─────────────────────────────── #
@dataclass
class RouteState:
    vehicle: VehicleSpec
    label: str                                   # plate or name shown to people
    stops: List[Stop]                            # current order
    depart_min: int
    completed: Dict[str, float] = field(default_factory=dict)   # stop id -> actual departure minute
    names: Dict[str, str] = field(default_factory=dict)         # stop id -> customer name


@dataclass
class FleetContext:
    hub: Tuple[float, float]
    routes: List[RouteState]
    spare_vehicles: List[VehicleSpec]
    now_min: int


@dataclass
class StopChange:
    stop_id: str
    name: str
    from_vehicle: str
    to_vehicle: Optional[str]
    old_eta: Optional[float]
    new_eta: Optional[float]


@dataclass
class Proposal:
    proposal_id: str
    intent: str
    planner: str
    tool: str
    arguments: Dict[str, Any]
    summary: str
    changes: List[StopChange]
    routes_after: Dict[str, List[Tuple[str, float, str]]]  # vehicle label -> [(stop id, eta, sla)]
    unassigned: Dict[str, str]
    late_minutes_before: float
    late_minutes_after: float
    violations: List[str]
    requires_approval: bool = True


class AgentError(ValueError):
    """Raised when the message cannot be turned into a valid tool call (e.g. unknown vehicle)."""


# ─────────────────────────────── Helpers ─────────────────────────────── #
def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def resolve_vehicle(ref: Optional[str], ctx: FleetContext) -> RouteState:
    if not ref:
        raise AgentError("Which vehicle? Mention its plate or id, e.g. 'MH-04-AB-2045 broke down'.")
    key = _norm(ref)
    for r in ctx.routes:
        if key in (_norm(r.vehicle.id), _norm(r.label)) or (key and key in _norm(r.label)):
            return r
    raise AgentError(f"No dispatched vehicle matches '{ref}'.")


def _pending(r: RouteState) -> List[Stop]:
    return [s for s in r.stops if s.id not in r.completed]


def _eval(ctx: FleetContext, r: RouteState, order: Sequence[Stop], delay: float = 0.0, vehicle: Optional[VehicleSpec] = None) -> RouteEvaluation:
    done = [s for s in r.stops if s.id in r.completed]
    return recalculate(ctx.hub, list(done) + list(order), vehicle or r.vehicle, r.depart_min,
                       now_min=ctx.now_min, completed=r.completed, delay_min=delay)


def _late(ev: RouteEvaluation) -> float:
    return sum(e.minutes_late for e in ev.stops if not e.completed)


def _eta_map(ev: RouteEvaluation) -> Dict[str, float]:
    return {e.stop_id: e.arrival for e in ev.stops}


def _best_order(ctx: FleetContext, r: RouteState, delay: float, use_distance: bool) -> Tuple[List[Stop], RouteEvaluation]:
    """
    Exhaustive search for <= 7 remaining stops (5,040 orders, a few ms); otherwise keep the current order.
    After a delay the order only changes if that reduces lateness (drivers should not be re-routed for a
    small distance gain mid-trip); an explicit re-route request also accepts shorter routes.
    """
    pending = _pending(r)
    best = (pending, _eval(ctx, r, pending, delay))

    def key(ev: RouteEvaluation):
        return (round(_late(ev), 1), len(ev.violations), ev.distance_km if use_distance else 0.0)

    if 1 < len(pending) <= 7:
        for perm in itertools.permutations(pending):
            ev = _eval(ctx, r, perm, delay)
            if key(ev) < key(best[1]):
                best = (list(perm), ev)
    return best


def _proposal_id(*parts: Any) -> str:
    return "prop_" + hashlib.sha1(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()[:10]


def _clock(m: Optional[float]) -> str:
    if m is None:
        return "—"
    m = int(round(m)) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


# ─────────────────────────────── Tools ─────────────────────────────── #
def tool_apply_delay(ctx: FleetContext, r: RouteState, minutes: float, reoptimize_only: bool = False) -> Proposal:
    before = _eval(ctx, r, _pending(r))
    delayed = _eval(ctx, r, _pending(r), minutes)
    order, best = _best_order(ctx, r, minutes, use_distance=reoptimize_only)
    old, new = _eta_map(before), _eta_map(best)
    resequenced = [s.id for s in order] != [s.id for s in _pending(r)]
    changes = [StopChange(s.id, r.names.get(s.id, s.id), r.label, r.label, old.get(s.id), new.get(s.id))
               for s in order if abs(new.get(s.id, 0) - old.get(s.id, 0)) >= 1 or resequenced]
    if reoptimize_only:
        tool, args = "reoptimize_route", {"vehicle_id": r.label}
        summary = (f"Re-sequenced {r.label}'s {len(order)} remaining stops: {' → '.join(r.names.get(s.id, s.id) for s in order)}."
                   if resequenced else f"{r.label}'s current order is already the best for its remaining stops.")
    else:
        tool, args = "apply_delay", {"vehicle_id": r.label, "minutes": int(minutes)}
        summary = f"{r.label} delayed {int(minutes)} min: remaining ETAs move back by up to {round(max((c.new_eta or 0) - (c.old_eta or 0) for c in changes) if changes else 0)} min."
        if resequenced and _late(best) < _late(delayed):
            summary += f" Re-ordering the remaining stops cuts lateness from {round(_late(delayed))} to {round(_late(best))} min."
        elif _late(best) > 0:
            summary += f" {sum(1 for e in best.stops if e.minutes_late > 0 and not e.completed)} stop(s) will still miss their window; notify those customers."
    return Proposal(
        proposal_id=_proposal_id(tool, args, ctx.now_min), intent="", planner="", tool=tool, arguments=args, summary=summary,
        changes=changes, routes_after={r.label: [(e.stop_id, e.arrival, e.sla) for e in best.stops]}, unassigned={},
        late_minutes_before=round(_late(delayed if not reoptimize_only else before), 1), late_minutes_after=round(_late(best), 1),
        violations=best.violations,
    )


def tool_reassign_stops(ctx: FleetContext, broken: RouteState) -> Proposal:
    orphans = _pending(broken)
    before_eta = _eta_map(_eval(ctx, broken, orphans))
    others = {r.vehicle.id: (r, list(_pending(r))) for r in ctx.routes if r is not broken}
    base_late = sum(_late(_eval(ctx, r, p)) for r, p in others.values())
    changes: List[StopChange] = []
    unassigned: Dict[str, str] = {}
    leftovers: List[Stop] = []

    # Cheapest feasible insertion into vehicles already on the road (completed stops stay fixed).
    for s in sorted(orphans, key=lambda x: x.window_close):
        best: Optional[Tuple[float, str, List[Stop]]] = None
        for vid, (r, order) in others.items():
            base = _eval(ctx, r, order)
            for pos in range(len(order) + 1):
                cand = order[:pos] + [s] + order[pos:]
                ev = _eval(ctx, r, cand)
                if ev.violations:
                    continue
                cost = (ev.distance_km - base.distance_km) + 0.3 * (ev.return_min - base.return_min)
                if best is None or cost < best[0]:
                    best = (cost, vid, cand)
        if best is None:
            leftovers.append(s)
        else:
            _, vid, cand = best
            others[vid] = (others[vid][0], cand)

    # Anything left goes to spare vehicles dispatched from the hub now.
    spare_routes: Dict[str, List[Tuple[str, float, str]]] = {}
    if leftovers and ctx.spare_vehicles:
        sol = solve(ctx.hub, leftovers, ctx.spare_vehicles, ctx.now_min)
        for route in sol.routes:
            spare_routes[route.vehicle_id] = [(v.stop_id, v.arrival, "ON_TIME") for v in route.visits]
            for v in route.visits:
                changes.append(StopChange(v.stop_id, broken.names.get(v.stop_id, v.stop_id), broken.label, route.vehicle_id, before_eta.get(v.stop_id), v.arrival))
        unassigned.update(sol.unassigned)
    else:
        unassigned.update({s.id: "no vehicle with spare capacity and time" for s in leftovers})

    routes_after: Dict[str, List[Tuple[str, float, str]]] = dict(spare_routes)
    after_late = 0.0
    moved = {s.id for s in orphans}
    for vid, (r, order) in others.items():
        ev = _eval(ctx, r, order)
        after_late += _late(ev)
        routes_after[r.label] = [(e.stop_id, e.arrival, e.sla) for e in ev.stops]
        for e in ev.stops:
            if e.stop_id in moved:
                changes.append(StopChange(e.stop_id, broken.names.get(e.stop_id, e.stop_id), broken.label, r.label, before_eta.get(e.stop_id), e.arrival))

    placed = len(orphans) - len(unassigned)
    summary = (f"{broken.label} is out of service with {len(orphans)} stop(s) left. "
               f"{placed} reassigned" + (f" ({', '.join(sorted({c.to_vehicle for c in changes if c.to_vehicle}))})" if changes else "")
               + (f"; {len(unassigned)} could not be placed." if unassigned else "; every stop still has a vehicle."))
    args = {"vehicle_id": broken.label}
    return Proposal(
        proposal_id=_proposal_id("reassign_stops", args, ctx.now_min), intent="", planner="", tool="reassign_stops", arguments=args,
        summary=summary, changes=changes, routes_after=routes_after, unassigned=unassigned,
        late_minutes_before=round(base_late, 1), late_minutes_after=round(after_late, 1),
        violations=[f"{broken.names.get(sid, sid)}: {why}" for sid, why in unassigned.items()],
    )


def execute_tool(name: str, args: Dict[str, Any], ctx: FleetContext) -> Proposal:
    route = resolve_vehicle(str(args.get("vehicle_id", "")), ctx)
    if name == "reassign_stops":
        return tool_reassign_stops(ctx, route)
    if name == "apply_delay":
        minutes = int(args.get("minutes") or 0)
        if not 0 < minutes <= 600:
            raise AgentError("How long is the delay? Give minutes, e.g. 'delayed 30 min'.")
        return tool_apply_delay(ctx, route, minutes)
    if name == "reoptimize_route":
        return tool_apply_delay(ctx, route, 0, reoptimize_only=True)
    raise AgentError(f"Unknown tool {name}")


# ─────────────────────────────── Planners ─────────────────────────────── #
def plan_deterministic(message: str) -> Tuple[str, str, Dict[str, Any]]:
    from app.services.copilot.router_agent import get_router_agent
    from app.schemas.copilot import AgentIntent

    router = get_router_agent()
    intent, _, _ = router.classify_intent(message)
    ent = router.extract_entities(message)
    vid = ent.vehicle_id or ""
    if re.search(r"\b(broke(n)?\s*down|breakdown|engine (failure|failed)|flat (tyre|tire)|accident|crash(ed)?|out of service)\b", message, re.I):
        intent = AgentIntent.VEHICLE_BREAKDOWN
    if intent == AgentIntent.VEHICLE_BREAKDOWN:
        return intent.value, "reassign_stops", {"vehicle_id": vid}
    if intent == AgentIntent.TRAFFIC_DELAY or ent.delay_minutes:
        return AgentIntent.TRAFFIC_DELAY.value, "apply_delay", {"vehicle_id": vid, "minutes": ent.delay_minutes or 0}
    if intent == AgentIntent.REROUTE_REQUEST:
        return intent.value, "reoptimize_route", {"vehicle_id": vid}
    raise AgentError("I handle breakdowns, delays and re-route requests. Try 'MH-04-AB-2045 broke down' or 'V-101 delayed 30 min'.")


def plan_with_claude(message: str, ctx: FleetContext) -> Optional[Tuple[str, str, Dict[str, Any]]]:
    """Asks Claude to pick one tool. Returns None (caller falls back) when unavailable or unusable."""
    if not os.getenv("ANTHROPIC_API_KEY"):
        return None
    try:
        import anthropic
    except ImportError:
        return None
    fleet = "\n".join(f"- {r.label} (id {r.vehicle.id}): {len(_pending(r))} stops left" for r in ctx.routes)
    try:
        client = anthropic.Anthropic()
        response = client.beta.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=2000,
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=("You are the optimization agent of a fleet dispatch system. Read the dispatcher's message and call exactly "
                    "one tool. Use the vehicle's plate as vehicle_id. If the message names no dispatched vehicle or is not a "
                    "routing disruption, do not call a tool; reply with one sentence saying what is missing.\n\n"
                    f"Dispatched vehicles:\n{fleet}"),
            tools=TOOLS,
            tool_choice={"type": "auto"},
            messages=[{"role": "user", "content": message}],
        )
    except anthropic.APIError as err:
        logger.warning(f"Claude planner unavailable, using deterministic planner: {err}")
        return None
    if response.stop_reason == "refusal":
        return None
    call = next((b for b in response.content if b.type == "tool_use"), None)
    if call is None or call.name not in {t["name"] for t in TOOLS}:
        return None
    intent = {"reassign_stops": "VEHICLE_BREAKDOWN", "apply_delay": "TRAFFIC_DELAY", "reoptimize_route": "REROUTE_REQUEST"}[call.name]
    return intent, call.name, dict(call.input)


def handle_disruption(message: str, ctx: FleetContext, use_llm: bool = True) -> Proposal:
    planned = plan_with_claude(message, ctx) if use_llm else None
    planner = CLAUDE_MODEL if planned else "deterministic"
    if planned:
        try:
            resolve_vehicle(str(planned[2].get("vehicle_id", "")), ctx)
        except AgentError:
            planned, planner = None, "deterministic"   # never trust an LLM argument we cannot ground in the fleet
    intent, tool, args = planned or plan_deterministic(message)
    proposal = execute_tool(tool, args, ctx)
    proposal.intent, proposal.planner = intent, planner
    return proposal
