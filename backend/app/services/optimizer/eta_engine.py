"""
eta_engine.py - Route Evaluation, Downstream ETA Recalculation & SLA Monitoring (Weeks 8, 10, 12 · Track A)

One engine answers three questions about a route whose stop ORDER is already decided:

  evaluate()     Week 8  - "If the dispatcher drags stops into this order, what are the ETAs and what breaks?"
                           Unlike the solver, it never refuses an order: it reports every violation instead
                           (late arrival, over capacity, shift overrun), so the UI can badge them.
  recalculate()  Week 10 - "A delay was reported / some stops are done: what are the new ETAs?"
                           Completed stops keep their actual times; only the remaining stops are re-timed,
                           starting from the last completed stop (or the current position) plus the delay.
  SLA status     Week 12 - every stop is classified ON_TIME / AT_RISK / PREDICTED_BREACH / SLA_BREACHED,
                           and the trip is ROUTE_BLOCKED when a breakdown is reported.

Drive times come from the same cached distance engine as the solver, so planner, tracking and solver agree.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

from app.services.optimizer.distance_matrix import build_distance_matrix
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec

AT_RISK_MARGIN_MIN = 15  # an ETA within 15 min of the window closing is flagged AT_RISK

SLA_ON_TIME = "ON_TIME"
SLA_AT_RISK = "AT_RISK"
SLA_PREDICTED_BREACH = "PREDICTED_BREACH"
SLA_BREACHED = "SLA_BREACHED"
SLA_FAILED = "FAILED"


@dataclass
class StopEta:
    stop_id: str
    sequence: int
    arrival: float
    service_start: float
    departure: float
    wait: float
    leg_km: float
    leg_min: float
    completed: bool
    sla: str
    minutes_late: float
    previous_arrival: Optional[float] = None

    @property
    def shift_min(self) -> Optional[float]:
        return None if self.previous_arrival is None else self.arrival - self.previous_arrival


@dataclass
class RouteEvaluation:
    stops: List[StopEta]
    distance_km: float
    return_min: float
    duration_min: float
    load_kg: float
    load_m3: float
    utilisation: float
    violations: List[str] = field(default_factory=list)
    route_state: str = "ROUTE_PROPOSED"

    @property
    def feasible(self) -> bool:
        return not self.violations


def classify_sla(arrival: float, window_close: float, completed: bool, failed: bool = False) -> Tuple[str, float]:
    late = max(0.0, arrival - window_close)
    if failed:
        return SLA_FAILED, late
    if late > 0:
        return (SLA_BREACHED if completed else SLA_PREDICTED_BREACH), late
    if not completed and window_close - arrival <= AT_RISK_MARGIN_MIN:
        return SLA_AT_RISK, 0.0
    return SLA_ON_TIME, 0.0


def _matrices(hub: Tuple[float, float], stops: Sequence[Stop], vehicle_type: str, start_at: Optional[Tuple[float, float]]):
    points = [hub] + [(s.lat, s.lon) for s in stops] + ([start_at] if start_at else [])
    m = build_distance_matrix(points, vehicle_type)
    return m.distance_km, m.duration_min


def recalculate(
    hub: Tuple[float, float],
    stops: Sequence[Stop],
    vehicle: VehicleSpec,
    depart_min: int,
    now_min: Optional[float] = None,
    completed: Optional[Dict[str, float]] = None,
    failed: Optional[Sequence[str]] = None,
    delay_min: float = 0.0,
    current_position: Optional[Tuple[float, float]] = None,
    previous_arrivals: Optional[Dict[str, float]] = None,
    blocked: bool = False,
) -> RouteEvaluation:
    """
    Re-times a route in its given order.

    completed: stop id -> actual departure minute for stops already served (kept as-is).
    failed: stop ids marked failed (no service time, kept in place for reporting).
    delay_min: extra minutes added before the next movement (traffic, loading issue...).
    current_position: where the vehicle is now; if given, the next leg starts there instead of the last stop.
    previous_arrivals: last published ETAs, used to report how far each ETA moved.
    """
    completed = completed or {}
    failed_set = set(failed or [])
    prev = previous_arrivals or {}
    dist, dur = _matrices(hub, stops, vehicle.vehicle_type, current_position)
    pos_idx = len(stops) + 1 if current_position else None

    violations: List[str] = []
    kg = sum(s.weight_kg for s in stops)
    m3 = sum(s.volume_m3 for s in stops)
    if kg > vehicle.capacity_kg + 1e-9:
        violations.append(f"Over payload: {kg:g} kg on a {vehicle.capacity_kg:g} kg vehicle")
    if m3 > vehicle.capacity_m3 + 1e-9:
        violations.append(f"Over volume: {m3:g} m³ on a {vehicle.capacity_m3:g} m³ vehicle")

    results: List[StopEta] = []
    t = float(depart_min)
    at = 0
    total_km = 0.0
    resumed = False
    for seq, s in enumerate(stops, start=1):
        node = seq
        if s.id in completed:
            leg_km, leg_min = float(dist[at, node]), float(dur[at, node])
            departure = float(completed[s.id])
            arrival = departure - s.service_min
            sla, late = classify_sla(arrival, s.window_close, completed=True)
            results.append(StopEta(s.id, seq, arrival, arrival, departure, 0.0, leg_km, leg_min, True, sla, late, prev.get(s.id)))
            total_km += leg_km
            t, at = departure, node
            continue
        if not resumed:
            # First remaining stop: the vehicle moves on from wherever it is now, after any reported delay.
            if now_min is not None:
                t = max(t, float(now_min))
            t += delay_min
            if pos_idx is not None:
                at = pos_idx
            resumed = True
        leg_km, leg_min = float(dist[at, node]), float(dur[at, node])
        arrival = t + leg_min
        is_failed = s.id in failed_set
        start = arrival if is_failed else max(arrival, s.window_open)
        departure = start if is_failed else start + s.service_min
        sla, late = classify_sla(arrival, s.window_close, completed=False, failed=is_failed)
        if late > 0:
            violations.append(f"{s.id} arrives {round(late)} min after its window closes")
        results.append(StopEta(s.id, seq, arrival, start, departure, start - arrival, leg_km, leg_min, False, sla, late, prev.get(s.id)))
        total_km += leg_km
        t, at = departure, node

    back_km, back_min = float(dist[at, 0]), float(dur[at, 0])
    total_km += back_km
    return_min = t + back_min
    duration = return_min - depart_min
    if duration > vehicle.max_shift_min + 1e-9:
        violations.append(f"Route takes {round(duration)} min, over the {vehicle.max_shift_min} min shift limit")

    state = "ROUTE_BLOCKED" if blocked else ("SLA_BREACHED" if any(r.sla == SLA_BREACHED for r in results) else "ROUTE_PROPOSED")
    return RouteEvaluation(
        stops=results,
        distance_km=round(total_km, 3),
        return_min=round(return_min, 1),
        duration_min=round(duration, 1),
        load_kg=kg,
        load_m3=round(m3, 3),
        utilisation=round(max(kg / vehicle.capacity_kg, m3 / vehicle.capacity_m3), 4),
        violations=violations,
        route_state=state,
    )


def evaluate(hub: Tuple[float, float], stops: Sequence[Stop], vehicle: VehicleSpec, depart_min: int) -> RouteEvaluation:
    """Week 8: time a dispatcher-chosen order from scratch and report every violation."""
    return recalculate(hub, stops, vehicle, depart_min)
