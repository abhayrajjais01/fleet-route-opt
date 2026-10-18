"""Pydantic v2 Schemas for Route Optimization: Distance Matrix (US-003 / US-004, Track A: Manthan Nimodiya)."""
from typing import Dict, List, Optional
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
