"""Pydantic v2 Schemas for Route Optimization: Distance Matrix (US-003 / US-004, Track A: Manthan Nimodiya)."""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator

from app.models.fleet import VehicleType


class GeoPoint(BaseModel):
    id: str = Field(..., min_length=1, max_length=64, description="Caller's id, e.g. 'hub-1' or 'SHP-001-MUM'")
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    label: Optional[str] = Field(None, max_length=255)


class DistanceMatrixRequest(BaseModel):
    points: List[GeoPoint] = Field(..., min_length=2, max_length=250)
    vehicle_type: VehicleType = VehicleType.VAN

    @field_validator("points")
    @classmethod
    def ids_must_be_unique(cls, v: List[GeoPoint]) -> List[GeoPoint]:
        ids = [p.id for p in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Point ids must be unique")
        return v


class DistanceMatrixResponse(BaseModel):
    """Row/column i of every matrix refers to ids[i]."""

    ids: List[str]
    vehicle_type: VehicleType
    straight_km: List[List[float]] = Field(..., description="Great-circle (haversine) distances")
    distance_km: List[List[float]] = Field(..., description="Detour-corrected road distance estimates")
    duration_min: List[List[float]] = Field(..., description="Estimated driving minutes for the vehicle type")
    computed_ms: float
    cache: Dict[str, int]


# ---------------- VRPTW Optimization (Week 6) ---------------- #
class OptimizeStop(GeoPoint):
    weight_kg: float = Field(..., gt=0)
    volume_m3: float = Field(..., gt=0)
    window_start: str = Field("09:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    window_end: str = Field("17:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    service_min: int = Field(10, ge=0, le=120)


class OptimizeVehicle(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    capacity_kg: float = Field(..., gt=0)
    capacity_m3: float = Field(..., gt=0)
    vehicle_type: VehicleType = VehicleType.VAN
    max_shift_hours: float = Field(10, gt=0, le=14)


class OptimizeRequest(BaseModel):
    hub: GeoPoint
    stops: List[OptimizeStop] = Field(..., min_length=1, max_length=200)
    vehicles: List[OptimizeVehicle] = Field(..., min_length=1, max_length=50)
    departure: str = Field("08:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")

    @field_validator("stops")
    @classmethod
    def unique_stop_ids(cls, v: List[OptimizeStop]) -> List[OptimizeStop]:
        if len({s.id for s in v}) != len(v):
            raise ValueError("Stop ids must be unique")
        return v


class VisitResponse(BaseModel):
    stop_id: str
    arrival: str
    service_start: str
    departure: str
    wait_min: float


class RouteResponse(BaseModel):
    vehicle_id: str
    stop_ids: List[str]
    visits: List[VisitResponse]
    distance_km: float
    duration_min: float
    return_time: str
    load_kg: float
    load_m3: float
    utilisation: float


class OptimizeResponse(BaseModel):
    status: str = Field(..., description="ROUTE_PROPOSED, or OPTIMIZATION_FAILED when some stops cannot be served")
    routes: List[RouteResponse]
    unassigned: Dict[str, str]
    total_distance_km: float
    separate_trips_km: float = Field(..., description="Baseline: every stop as its own round trip")
    saving_pct: float
    compute_ms: float


# ---------------- Route evaluation & downstream ETAs (Weeks 8, 10, 12) ---------------- #
HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


class RouteVehicle(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    label: Optional[str] = Field(None, max_length=64, description="Plate or name shown to people")
    capacity_kg: float = Field(..., gt=0)
    capacity_m3: float = Field(..., gt=0)
    vehicle_type: VehicleType = VehicleType.VAN
    max_shift_hours: float = Field(10, gt=0, le=14)


class RouteStopIn(OptimizeStop):
    name: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = Field(None, max_length=500)
    priority: str = Field("STANDARD", pattern=r"^(LOW|STANDARD|HIGH|EXPRESS)$")


class EvaluateRequest(BaseModel):
    """Stops in the exact order the dispatcher wants; nothing is re-ordered."""
    hub: GeoPoint
    vehicle: RouteVehicle
    stops: List[RouteStopIn] = Field(..., min_length=1, max_length=100)
    departure: str = Field("08:00", pattern=HHMM)

    @field_validator("stops")
    @classmethod
    def unique_ids(cls, v: List[RouteStopIn]) -> List[RouteStopIn]:
        if len({s.id for s in v}) != len(v):
            raise ValueError("Stop ids must be unique")
        return v


class RecalculateRequest(EvaluateRequest):
    now: Optional[str] = Field(None, pattern=HHMM, description="Current time; remaining stops start no earlier")
    completed: Dict[str, str] = Field(default_factory=dict, description="stop id -> actual departure HH:MM")
    failed: List[str] = Field(default_factory=list)
    delay_min: float = Field(0, ge=0, le=600)
    current_position: Optional[GeoPoint] = None
    previous_etas: Dict[str, str] = Field(default_factory=dict, description="stop id -> last published ETA HH:MM")
    blocked: bool = False


class StopEtaResponse(BaseModel):
    stop_id: str
    sequence: int
    arrival: str
    service_start: str
    departure: str
    wait_min: float
    leg_km: float
    leg_min: float
    completed: bool
    sla: str = Field(..., description="ON_TIME | AT_RISK | PREDICTED_BREACH | SLA_BREACHED | FAILED")
    minutes_late: float
    eta_shift_min: Optional[float] = Field(None, description="Minutes the ETA moved since previous_etas")


class EvaluateResponse(BaseModel):
    route_state: str = Field(..., description="ROUTE_PROPOSED | SLA_BREACHED | ROUTE_BLOCKED")
    feasible: bool
    stops: List[StopEtaResponse]
    distance_km: float
    duration_min: float
    return_time: str
    load_kg: float
    load_m3: float
    utilisation: float
    violations: List[str]


class SlaAlert(BaseModel):
    vehicle_id: str
    stop_id: str
    level: str = Field(..., description="AT_RISK | PREDICTED_BREACH | SLA_BREACHED | ROUTE_BLOCKED")
    message: str
    eta: Optional[str] = None
    minutes_late: float = 0


class SlaCheckRequest(BaseModel):
    routes: List[RecalculateRequest] = Field(..., min_length=1, max_length=50)


class SlaCheckResponse(BaseModel):
    alerts: List[SlaAlert]
    counts: Dict[str, int]
    routes: Dict[str, EvaluateResponse]


# ---------------- Route explanation (Week 11) ---------------- #
class ExplainRequest(EvaluateRequest):
    hub_name: str = Field("the hub", max_length=255)
    separate_trips_km: Optional[float] = Field(None, gt=0)


class CitationResponse(BaseModel):
    doc_id: str
    section: str
    heading: str
    excerpt: str
    score: float


class ExplainResponse(BaseModel):
    summary: str
    stop_reasons: List[Dict[str, str]]
    driver_instructions: List[str]
    citations: List[CitationResponse]
    evaluation: EvaluateResponse


# ---------------- Optimization agent (Week 9) ---------------- #
class FleetRouteIn(BaseModel):
    vehicle: RouteVehicle
    stops: List[RouteStopIn] = Field(..., min_length=1, max_length=100)
    departure: str = Field("08:00", pattern=HHMM)
    completed: Dict[str, str] = Field(default_factory=dict)


class DisruptionRequest(BaseModel):
    message: str = Field(..., min_length=3, max_length=1000, description="e.g. 'MH-04-AB-2045 broke down near Sion'")
    hub: GeoPoint
    routes: List[FleetRouteIn] = Field(..., min_length=1, max_length=50)
    spare_vehicles: List[RouteVehicle] = Field(default_factory=list)
    now: str = Field("10:00", pattern=HHMM)
    use_llm: bool = True


class StopChangeResponse(BaseModel):
    stop_id: str
    name: str
    from_vehicle: str
    to_vehicle: Optional[str]
    old_eta: Optional[str]
    new_eta: Optional[str]


class ProposalResponse(BaseModel):
    proposal_id: str
    intent: str
    planner: str = Field(..., description="'deterministic' or the Claude model that chose the tool")
    tool_call: Dict[str, Any]
    summary: str
    changes: List[StopChangeResponse]
    affected_stops: List[str]
    routes_after: Dict[str, List[Dict[str, str]]]
    unassigned: Dict[str, str]
    late_minutes_before: float
    late_minutes_after: float
    violations: List[str]
    requires_approval: bool
