"""
routes.py - RESTful API Endpoints for Route Optimization (US-003 / US-004, Track A: Manthan Nimodiya)

Endpoints:
- POST /routes/optimize: VRPTW solver (Clarke-Wright savings + 2-opt) with capacity, time-window and
  shift-limit hard constraints; returns sequenced routes with ETAs (Week 6).
- POST /routes/evaluate: time a dispatcher-chosen stop order and report every violation (Week 8 resequencing).
- POST /routes/recalculate: downstream ETA recalculation after delays / completed stops (Week 10).
- POST /routes/sla-check: SLA alerts across all live routes (Week 12).
- POST /routes/explain: SOP-grounded route rationale + turn-by-turn driver instructions (Week 11).
- POST /routes/disruption: Optimization Agent turns a disruption message into a re-route proposal (Week 9).
- POST /routes/distance-matrix: Pairwise haversine, detour-corrected road distance and travel-time matrices
  for up to 250 points (hubs + delivery stops). This is the cost input for the VRPTW solver (Week 6) and
  powers the distance panel on the Network Map.
"""

import time
from fastapi import APIRouter, HTTPException, status

from app.schemas.route import (
    CitationResponse,
    DisruptionRequest,
    EvaluateRequest,
    EvaluateResponse,
    ExplainRequest,
    ExplainResponse,
    ProposalResponse,
    RecalculateRequest,
    RouteVehicle,
    SlaAlert,
    SlaCheckRequest,
    SlaCheckResponse,
    StopChangeResponse,
    StopEtaResponse,
    DistanceMatrixRequest,
    DistanceMatrixResponse,
    OptimizeRequest,
    OptimizeResponse,
    RouteResponse,
    VisitResponse,
)
from app.services.optimizer.distance_matrix import build_distance_matrix, cache_stats
from app.services.optimizer.eta_engine import RouteEvaluation, recalculate
from app.services.optimizer.route_explainer import StopInfo, explain_route
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec, solve
from app.services.copilot.optimization_agent import AgentError, FleetContext, RouteState, handle_disruption

router = APIRouter()


@router.post("/distance-matrix", response_model=DistanceMatrixResponse, summary="Compute distance & duration matrix")
def compute_distance_matrix(request: DistanceMatrixRequest):
    """
    Returns three n x n matrices ordered like `points`: straight-line km, estimated road km and driving minutes.
    Identical point sets are served from the in-memory LRU cache (see `cache.hits`).
    """
    started = time.perf_counter()
    matrix = build_distance_matrix(
        [(p.latitude, p.longitude) for p in request.points], vehicle_type=request.vehicle_type.value
    )
    computed_ms = (time.perf_counter() - started) * 1000

    return DistanceMatrixResponse(
        ids=[p.id for p in request.points],
        vehicle_type=request.vehicle_type,
        straight_km=matrix.straight_km.round(3).tolist(),
        distance_km=matrix.distance_km.round(3).tolist(),
        duration_min=matrix.duration_min.round(1).tolist(),
        computed_ms=round(computed_ms, 3),
        cache=cache_stats(),
    )


def _hhmm(text: str) -> int:
    h, m = text.split(":")
    return int(h) * 60 + int(m)


def _clock(minutes: float) -> str:
    m = int(round(minutes)) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


@router.post("/optimize", response_model=OptimizeResponse, summary="Solve VRPTW for a batch of stops")
def optimize_routes(request: OptimizeRequest):
    """
    Builds vehicle routes that never exceed payload/volume, reach every stop inside its time window and return
    within the driver's shift. Stops that cannot be served are listed in `unassigned` with the reason.
    """
    solution = solve(
        hub=(request.hub.latitude, request.hub.longitude),
        stops=[Stop(s.id, s.latitude, s.longitude, s.weight_kg, s.volume_m3, _hhmm(s.window_start), _hhmm(s.window_end), s.service_min) for s in request.stops],
        vehicles=[VehicleSpec(v.id, v.capacity_kg, v.capacity_m3, v.vehicle_type.value, int(v.max_shift_hours * 60)) for v in request.vehicles],
        depart_min=_hhmm(request.departure),
    )
    baseline = solution.baseline_distance_km
    return OptimizeResponse(
        status="OPTIMIZATION_FAILED" if solution.unassigned else "ROUTE_PROPOSED",
        routes=[
            RouteResponse(
                vehicle_id=r.vehicle_id, stop_ids=r.stops,
                visits=[VisitResponse(stop_id=v.stop_id, arrival=_clock(v.arrival), service_start=_clock(v.start), departure=_clock(v.departure), wait_min=round(v.wait, 1)) for v in r.visits],
                distance_km=r.distance_km, duration_min=r.duration_min, return_time=_clock(r.return_min),
                load_kg=r.load_kg, load_m3=round(r.load_m3, 3), utilisation=r.utilisation,
            )
            for r in solution.routes
        ],
        unassigned=solution.unassigned,
        total_distance_km=solution.total_distance_km,
        separate_trips_km=baseline,
        saving_pct=round((1 - solution.total_distance_km / baseline) * 100, 1) if baseline else 0.0,
        compute_ms=solution.compute_ms,
    )


# ==================== Week 8 / 10 / 12: evaluation, downstream ETAs, SLA ==================== #
def _vehicle(v: RouteVehicle) -> VehicleSpec:
    return VehicleSpec(v.id, v.capacity_kg, v.capacity_m3, v.vehicle_type.value, int(v.max_shift_hours * 60))


def _stops(req_stops) -> list:
    return [Stop(s.id, s.latitude, s.longitude, s.weight_kg, s.volume_m3, _hhmm(s.window_start), _hhmm(s.window_end), s.service_min) for s in req_stops]


def _evaluation_response(ev: RouteEvaluation) -> EvaluateResponse:
    return EvaluateResponse(
        route_state=ev.route_state, feasible=ev.feasible,
        stops=[StopEtaResponse(
            stop_id=e.stop_id, sequence=e.sequence, arrival=_clock(e.arrival), service_start=_clock(e.service_start),
            departure=_clock(e.departure), wait_min=round(e.wait, 1), leg_km=round(e.leg_km, 2), leg_min=round(e.leg_min, 1),
            completed=e.completed, sla=e.sla, minutes_late=round(e.minutes_late, 1),
            eta_shift_min=None if e.shift_min is None else round(e.shift_min, 1),
        ) for e in ev.stops],
        distance_km=ev.distance_km, duration_min=ev.duration_min, return_time=_clock(ev.return_min),
        load_kg=ev.load_kg, load_m3=ev.load_m3, utilisation=ev.utilisation, violations=ev.violations,
    )


def _recalc(req: RecalculateRequest) -> RouteEvaluation:
    unknown = (set(req.completed) | set(req.failed) | set(req.previous_etas)) - {s.id for s in req.stops}
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown stop ids: {sorted(unknown)}")
    return recalculate(
        hub=(req.hub.latitude, req.hub.longitude), stops=_stops(req.stops), vehicle=_vehicle(req.vehicle),
        depart_min=_hhmm(req.departure), now_min=_hhmm(req.now) if req.now else None,
        completed={k: _hhmm(v) for k, v in req.completed.items()}, failed=req.failed, delay_min=req.delay_min,
        current_position=(req.current_position.latitude, req.current_position.longitude) if req.current_position else None,
        previous_arrivals={k: _hhmm(v) for k, v in req.previous_etas.items()}, blocked=req.blocked,
    )


@router.post("/evaluate", response_model=EvaluateResponse, summary="Time a dispatcher-chosen stop order")
def evaluate_route(request: EvaluateRequest):
    """
    Week 8 resequencing: keeps the given order exactly and returns ETAs, waits, load and every violated
    constraint (late arrivals, overload, shift overrun) instead of refusing the order.
    """
    return _evaluation_response(_recalc(RecalculateRequest(**request.model_dump())))


@router.post("/recalculate", response_model=EvaluateResponse, summary="Recalculate downstream ETAs")
def recalculate_route(request: RecalculateRequest):
    """
    Week 10: completed stops keep their actual times; remaining stops are re-timed from the current time (and
    position, if given) plus any reported delay. `eta_shift_min` says how far each ETA moved.
    """
    return _evaluation_response(_recalc(request))


@router.post("/sla-check", response_model=SlaCheckResponse, summary="SLA alerts across live routes")
def sla_check(request: SlaCheckRequest):
    """Week 12: classifies every stop on every route and returns the alerts a dispatcher should see, worst first."""
    order = {"ROUTE_BLOCKED": 0, "SLA_BREACHED": 1, "PREDICTED_BREACH": 2, "AT_RISK": 3}
    alerts, routes = [], {}
    counts = {k: 0 for k in ["ON_TIME", "AT_RISK", "PREDICTED_BREACH", "SLA_BREACHED", "FAILED", "ROUTE_BLOCKED"]}
    for r in request.routes:
        ev = _recalc(r)
        name = r.vehicle.label or r.vehicle.id
        routes[r.vehicle.id] = _evaluation_response(ev)
        if r.blocked:
            counts["ROUTE_BLOCKED"] += 1
            pending = [e.stop_id for e in ev.stops if not e.completed]
            alerts.append(SlaAlert(vehicle_id=r.vehicle.id, stop_id="", level="ROUTE_BLOCKED",
                                   message=f"{name} is blocked with {len(pending)} stop(s) left; re-route needed."))
        names = {s.id: (s.name or s.id) for s in r.stops}
        for e in ev.stops:
            counts[e.sla] = counts.get(e.sla, 0) + 1
            if e.sla in order:
                msg = {"SLA_BREACHED": f"{names[e.stop_id]} was delivered {round(e.minutes_late)} min after its window.",
                       "PREDICTED_BREACH": f"{names[e.stop_id]} will be {round(e.minutes_late)} min late on {name}.",
                       "AT_RISK": f"{names[e.stop_id]} on {name} has under 15 min of slack."}[e.sla]
                alerts.append(SlaAlert(vehicle_id=r.vehicle.id, stop_id=e.stop_id, level=e.sla, message=msg,
                                       eta=_clock(e.arrival), minutes_late=round(e.minutes_late, 1)))
    alerts.sort(key=lambda a: (order[a.level], -a.minutes_late))
    return SlaCheckResponse(alerts=alerts, counts=counts, routes=routes)


# ==================== Week 11: explanations ==================== #
@router.post("/explain", response_model=ExplainResponse, summary="Explain a route in plain language")
def explain(request: ExplainRequest):
    """Rationale, per-stop reasons and driver instructions built only from computed facts and quoted SOP clauses."""
    stops = _stops(request.stops)
    vehicle = _vehicle(request.vehicle)
    ev = recalculate((request.hub.latitude, request.hub.longitude), stops, vehicle, _hhmm(request.departure))
    info = {s.id: StopInfo(s.name or s.id, s.address or "", s.priority) for s in request.stops}
    ex = explain_route(request.hub_name, (request.hub.latitude, request.hub.longitude), stops, info, vehicle,
                       request.vehicle.label or request.vehicle.id, ev, _hhmm(request.departure), request.separate_trips_km)
    return ExplainResponse(
        summary=ex.summary,
        stop_reasons=[{"stop_id": sid, "reason": text} for sid, text in ex.stop_reasons],
        driver_instructions=ex.driver_instructions,
        citations=[CitationResponse(**c.__dict__) for c in ex.citations],
        evaluation=_evaluation_response(ev),
    )


# ==================== Week 9: optimization agent ==================== #
@router.post("/disruption", response_model=ProposalResponse, summary="Turn a disruption report into a re-route proposal")
def disruption(request: DisruptionRequest):
    """
    The Optimization Agent picks one solver tool (reassign_stops, apply_delay, reoptimize_route) for the message,
    runs it, and returns a proposal. Nothing is applied: the dispatcher approves or declines.
    """
    ctx = FleetContext(
        hub=(request.hub.latitude, request.hub.longitude),
        routes=[RouteState(
            vehicle=_vehicle(r.vehicle), label=r.vehicle.label or r.vehicle.id, stops=_stops(r.stops), depart_min=_hhmm(r.departure),
            completed={k: _hhmm(v) for k, v in r.completed.items()}, names={s.id: (s.name or s.id) for s in r.stops},
        ) for r in request.routes],
        spare_vehicles=[_vehicle(v) for v in request.spare_vehicles],
        now_min=_hhmm(request.now),
    )
    try:
        p = handle_disruption(request.message, ctx, use_llm=request.use_llm)
    except AgentError as err:
        raise HTTPException(status_code=422, detail=str(err))
    to_clock = lambda m: None if m is None else _clock(m)  # noqa: E731
    return ProposalResponse(
        proposal_id=p.proposal_id, intent=p.intent, planner=p.planner, tool_call={"name": p.tool, "arguments": p.arguments},
        summary=p.summary,
        changes=[StopChangeResponse(stop_id=c.stop_id, name=c.name, from_vehicle=c.from_vehicle, to_vehicle=c.to_vehicle,
                                    old_eta=to_clock(c.old_eta), new_eta=to_clock(c.new_eta)) for c in p.changes],
        affected_stops=sorted({c.stop_id for c in p.changes}),
        routes_after={k: [{"stop_id": sid, "eta": _clock(eta), "sla": sla} for sid, eta, sla in v] for k, v in p.routes_after.items()},
        unassigned=p.unassigned, late_minutes_before=p.late_minutes_before, late_minutes_after=p.late_minutes_after,
        violations=p.violations, requires_approval=p.requires_approval,
    )
