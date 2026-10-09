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
