"""
proposal_service.py - Structured Action Proposals & Route Diff (US-005, Week 11 · Track B: Abhayraj Jaiswal)

Turns the Optimization Agent's re-route proposal (Track A, optimization_agent.py) into a card a dispatcher can
decide on from the Copilot drawer:

  1. Route diff     - for every affected vehicle, the current stop order next to the proposed one, with each
                      stop marked SAME / MOVED / ADDED / REMOVED / COMPLETED and its ETA before and after.
  2. Impact summary - km, driving minutes, operating cost and minutes late, current vs proposed, per vehicle
                      and in total. Every number comes from the ETA engine, never from a language model.
  3. Decision       - ACCEPT or REJECT, once. Decisions are written to the immutable audit log.

"Current" means what happens if the dispatcher rejects: the existing order, with any reported delay applied.
Proposals live in memory for the life of the process (they are short-lived what-ifs; the audit log keeps
the permanent record of every decision).
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence

from app.services.analytics.metrics import DEFAULT_DRIVER_COST_PER_HOUR, DEFAULT_FUEL_PRICE_PER_L
from app.services.copilot.optimization_agent import FleetContext, Proposal, RouteState
from app.services.optimizer.eta_engine import RouteEvaluation, recalculate
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec

# Typical fuel efficiency (km per litre) by vehicle class, matching the demo fleet; EVs are costed as the
# diesel-litre equivalent of their charging cost (about ₹2.5/km).
KM_PER_LITRE = {"VAN": 14.0, "BOX_TRUCK": 8.5, "SEMI_TRUCK": 5.8, "EV": DEFAULT_FUEL_PRICE_PER_L / 2.5}

CHANGE_SAME, CHANGE_MOVED, CHANGE_ADDED, CHANGE_REMOVED, CHANGE_COMPLETED = "SAME", "MOVED", "ADDED", "REMOVED", "COMPLETED"


# ─────────────────────────────── Data ─────────────────────────────── #
@dataclass
class DiffEntry:
    stop_id: str
    name: str
    change: str
    before_position: Optional[int]   # 1-based position in the current route
    after_position: Optional[int]    # 1-based position in the proposed route
    before_eta: Optional[float]
    after_eta: Optional[float]
    sla_after: Optional[str] = None
    moved_to: Optional[str] = None   # vehicle a REMOVED stop goes to (None = unassigned)
    moved_from: Optional[str] = None # vehicle an ADDED stop comes from
    planned_eta: Optional[float] = None  # ETA in the original plan, before the reported disruption


@dataclass
class RouteMetrics:
    distance_km: float
    duration_min: float
    cost: float
    late_min: float
    stops: int


@dataclass
class VehicleDiff:
    vehicle: str
    status: str                      # UNCHANGED, RESEQUENCED, CHANGED, NEW_VEHICLE, OUT_OF_SERVICE
    before: List[DiffEntry]
    after: List[DiffEntry]
    current: Optional[RouteMetrics]
    proposed: Optional[RouteMetrics]


@dataclass
class ProposalCard:
    card_id: str
    proposal: Proposal
    vehicles: List[VehicleDiff]
    current: RouteMetrics
    proposed: RouteMetrics
    names: Dict[str, str]
    created_at: str
    status: str = "PROPOSED"         # PROPOSED, ACCEPTED, REJECTED
    decided_at: Optional[str] = None
    decided_by: Optional[str] = None
    decision_note: Optional[str] = None
    deciding: bool = False           # a decision is being persisted; blocks a concurrent second decision


class ProposalNotFound(KeyError):
    pass


class ProposalAlreadyDecided(ValueError):
    pass


# ─────────────────────────────── Maths ─────────────────────────────── #
def route_cost(distance_km: float, duration_min: float, vehicle_type: str,
               fuel_price_per_l: float = DEFAULT_FUEL_PRICE_PER_L,
               driver_cost_per_hour: float = DEFAULT_DRIVER_COST_PER_HOUR) -> float:
    """Fuel plus driver time, using the same cost assumptions as the operational metrics engine."""
    kpl = KM_PER_LITRE.get(vehicle_type, KM_PER_LITRE["VAN"])
    return distance_km / kpl * fuel_price_per_l + duration_min / 60.0 * driver_cost_per_hour


def _late(ev: RouteEvaluation) -> float:
    return sum(e.minutes_late for e in ev.stops if not e.completed)


def _metrics(ev: RouteEvaluation, vehicle_type: str) -> RouteMetrics:
    return RouteMetrics(
        distance_km=round(ev.distance_km, 1), duration_min=round(ev.duration_min, 1),
        cost=round(route_cost(ev.distance_km, ev.duration_min, vehicle_type), 0),
        late_min=round(_late(ev), 1), stops=len(ev.stops),
    )


def _total(items: Sequence[Optional[RouteMetrics]]) -> RouteMetrics:
    xs = [m for m in items if m is not None]
    return RouteMetrics(
        distance_km=round(sum(m.distance_km for m in xs), 1), duration_min=round(sum(m.duration_min for m in xs), 1),
        cost=round(sum(m.cost for m in xs), 0), late_min=round(sum(m.late_min for m in xs), 1), stops=sum(m.stops for m in xs),
    )


def _evaluate(ctx: FleetContext, route: Optional[RouteState], vehicle: VehicleSpec, order: Sequence[Stop], delay: float) -> RouteEvaluation:
    """Evaluate a full order (completed stops first) from the route's departure, as the agent does."""
    depart = route.depart_min if route else ctx.now_min
    completed = route.completed if route else {}
    return recalculate(ctx.hub, list(order), vehicle, depart, now_min=ctx.now_min, completed=completed, delay_min=delay)


# ─────────────────────────────── Diff ─────────────────────────────── #
def build_card(ctx: FleetContext, proposal: Proposal) -> ProposalCard:
    by_label = {r.label: r for r in ctx.routes}
    by_id = {r.vehicle.id: r for r in ctx.routes}
    spares = {v.id: v for v in ctx.spare_vehicles}
    stops: Dict[str, Stop] = {s.id: s for r in ctx.routes for s in r.stops}
    names: Dict[str, str] = {k: v for r in ctx.routes for k, v in r.names.items()}
    stop_owner: Dict[str, str] = {s.id: r.label for r in ctx.routes for s in r.stops}

    delay = float(proposal.arguments.get("minutes", 0)) if proposal.tool == "apply_delay" else 0.0
    delayed_vehicle = str(proposal.arguments.get("vehicle_id")) if delay else None
    broken = str(proposal.arguments.get("vehicle_id")) if proposal.tool == "reassign_stops" else None

    # Proposed order per vehicle label (spare vehicles are keyed by id in the agent's output).
    proposed: Dict[str, List[str]] = {}
    for key, visits in proposal.routes_after.items():
        label = by_id[key].label if key in by_id and key not in by_label else key
        proposed[label] = [sid for sid, _, _ in visits]
    if broken and broken in by_label:
        r = by_label[broken]
        proposed[broken] = [s.id for s in r.stops if s.id in r.completed]   # it keeps only what it already delivered

    new_owner = {sid: label for label, ids in proposed.items() for sid in ids}

    diffs: List[VehicleDiff] = []
    for label in list(by_label) + [l for l in proposed if l not in by_label]:
        route = by_label.get(label)
        vehicle = route.vehicle if route else spares.get(label)
        if vehicle is None:
            continue
        before_ids = [s.id for s in route.stops] if route else []
        after_ids = proposed.get(label, before_ids)
        if route is not None and label not in proposed:
            continue                                                    # not touched by this proposal

        own_delay = delay if label == delayed_vehicle else 0.0
        before_ev = _evaluate(ctx, route, vehicle, [stops[i] for i in before_ids], own_delay) if before_ids else None
        after_ev = _evaluate(ctx, route, vehicle, [stops[i] for i in after_ids if i in stops], own_delay) if after_ids else None
        b_eta = {e.stop_id: e.arrival for e in before_ev.stops} if before_ev else {}
        if own_delay and before_ids:
            planned_ev = _evaluate(ctx, route, vehicle, [stops[i] for i in before_ids], 0.0)
            p_eta = {e.stop_id: e.arrival for e in planned_ev.stops}
        else:
            p_eta = dict(b_eta)
        a_eta = {e.stop_id: (e.arrival, e.sla) for e in after_ev.stops} if after_ev else {}
        done = route.completed if route else {}

        before_entries: List[DiffEntry] = []
        for pos, sid in enumerate(before_ids, 1):
            if sid in done:
                change = CHANGE_COMPLETED
            elif sid not in after_ids:
                change = CHANGE_REMOVED
            elif after_ids.index(sid) + 1 != pos:
                change = CHANGE_MOVED
            else:
                change = CHANGE_SAME
            before_entries.append(DiffEntry(
                stop_id=sid, name=names.get(sid, sid), change=change, before_position=pos,
                after_position=after_ids.index(sid) + 1 if sid in after_ids else None,
                before_eta=b_eta.get(sid), after_eta=a_eta.get(sid, (None,))[0],
                moved_to=new_owner.get(sid) if change == CHANGE_REMOVED else None, planned_eta=p_eta.get(sid),
            ))
        after_entries: List[DiffEntry] = []
        for pos, sid in enumerate(after_ids, 1):
            if sid in done:
                change = CHANGE_COMPLETED
            elif sid not in before_ids:
                change = CHANGE_ADDED
            elif before_ids.index(sid) + 1 != pos:
                change = CHANGE_MOVED
            else:
                change = CHANGE_SAME
            eta, sla = a_eta.get(sid, (None, None))
            after_entries.append(DiffEntry(
                stop_id=sid, name=names.get(sid, sid), change=change,
                before_position=before_ids.index(sid) + 1 if sid in before_ids else None, after_position=pos,
                before_eta=b_eta.get(sid), after_eta=eta, sla_after=sla,
                moved_from=stop_owner.get(sid) if change == CHANGE_ADDED else None, planned_eta=p_eta.get(sid),
            ))

        if label == broken:
            status = "OUT_OF_SERVICE"
        elif route is None:
            status = "NEW_VEHICLE"
        elif set(before_ids) != set(after_ids):
            status = "CHANGED"
        elif before_ids != after_ids:
            status = "RESEQUENCED"
        else:
            status = "UNCHANGED"

        diffs.append(VehicleDiff(
            vehicle=label, status=status, before=before_entries, after=after_entries,
            current=_metrics(before_ev, vehicle.vehicle_type) if before_ev else None,
            proposed=_metrics(after_ev, vehicle.vehicle_type) if after_ev else None,
        ))

    # Vehicles the proposal changes first, then the rest it re-timed.
    order = {"OUT_OF_SERVICE": 0, "CHANGED": 1, "NEW_VEHICLE": 2, "RESEQUENCED": 3, "UNCHANGED": 4}
    diffs.sort(key=lambda d: order[d.status])

    return ProposalCard(
        card_id=f"{proposal.proposal_id}-{uuid.uuid4().hex[:6]}",
        proposal=proposal, vehicles=diffs,
        current=_total([d.current for d in diffs]), proposed=_total([d.proposed for d in diffs]),
        names=names, created_at=datetime.now(timezone.utc).isoformat(),
    )


# ─────────────────────────────── Request → agent context ─────────────────────────────── #
def hhmm_to_min(text: str) -> int:
    h, m = text.split(":")
    return int(h) * 60 + int(m)


def min_to_hhmm(minutes: Optional[float]) -> Optional[str]:
    if minutes is None:
        return None
    m = int(round(minutes)) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def context_from_request(request) -> FleetContext:
    """Build the Optimization Agent's FleetContext from a `DisruptionRequest` (same contract as /routes/disruption)."""
    def spec(v) -> VehicleSpec:
        return VehicleSpec(v.id, v.capacity_kg, v.capacity_m3, v.vehicle_type.value, int(v.max_shift_hours * 60))

    return FleetContext(
        hub=(request.hub.latitude, request.hub.longitude),
        routes=[RouteState(
            vehicle=spec(r.vehicle), label=r.vehicle.label or r.vehicle.id,
            stops=[Stop(s.id, s.latitude, s.longitude, s.weight_kg, s.volume_m3, hhmm_to_min(s.window_start),
                        hhmm_to_min(s.window_end), s.service_min) for s in r.stops],
            depart_min=hhmm_to_min(r.departure), completed={k: hhmm_to_min(v) for k, v in r.completed.items()},
            names={s.id: (s.name or s.id) for s in r.stops},
        ) for r in request.routes],
        spare_vehicles=[spec(v) for v in request.spare_vehicles],
        now_min=hhmm_to_min(request.now),
    )


# ─────────────────────────────── Registry ─────────────────────────────── #
class ProposalRegistry:
    """Thread-safe, bounded in-memory store of proposal cards awaiting or holding a decision."""

    def __init__(self, max_items: int = 500):
        self._items: Dict[str, ProposalCard] = {}
        self._lock = threading.Lock()
        self._max = max_items

    def add(self, card: ProposalCard) -> ProposalCard:
        with self._lock:
            if len(self._items) >= self._max:
                oldest = min(self._items.values(), key=lambda c: c.created_at)
                self._items.pop(oldest.card_id, None)
            self._items[card.card_id] = card
        return card

    def get(self, card_id: str) -> ProposalCard:
        card = self._items.get(card_id)
        if card is None:
            raise ProposalNotFound(card_id)
        return card

    # A decision is two-phase so it never becomes final unless its audit record was saved:
    #   claim()    -> reserve the proposal (a concurrent second decision gets ProposalAlreadyDecided)
    #   complete() -> after the audit record is committed, make the decision final
    #   release()  -> if saving the audit record failed, put the proposal back to PROPOSED for a retry
    def claim(self, card_id: str) -> ProposalCard:
        with self._lock:
            card = self.get(card_id)
            if card.status != "PROPOSED":
                raise ProposalAlreadyDecided(f"Proposal {card_id} was already {card.status.lower()}.")
            if card.deciding:
                raise ProposalAlreadyDecided(f"Proposal {card_id} is already being decided.")
            card.deciding = True
            return card

    def complete(self, card_id: str, accept: bool, actor: str, note: Optional[str] = None) -> ProposalCard:
        with self._lock:
            card = self.get(card_id)
            card.status = "ACCEPTED" if accept else "REJECTED"
            card.decided_at = datetime.now(timezone.utc).isoformat()
            card.decided_by = actor
            card.decision_note = note
            card.deciding = False
            return card

    def release(self, card_id: str) -> None:
        with self._lock:
            card = self._items.get(card_id)
            if card is not None:
                card.deciding = False

    def decide(self, card_id: str, accept: bool, actor: str, note: Optional[str] = None) -> ProposalCard:
        """Claim and complete in one step (no external side effect to wait for)."""
        self.claim(card_id)
        return self.complete(card_id, accept, actor, note)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


registry = ProposalRegistry()
