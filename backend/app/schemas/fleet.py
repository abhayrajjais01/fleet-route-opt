"""Pydantic v2 Schemas for Fleet Assets (Hubs, Vehicles, Drivers) - US-002."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field
from app.models.fleet import (
    VehicleType,
    VehicleStatus,
    LicenseType,
    DriverStatus,
)


# ---------------- Hub Schemas ---------------- #
class HubBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    code: str = Field(..., min_length=2, max_length=50)
    address: str = Field(..., min_length=5, max_length=500)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    contact_phone: str = Field(..., min_length=5, max_length=50)
    operating_hours: str = Field(default="06:00 - 22:00")


class HubCreate(HubBase):
    pass


class HubUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    address: Optional[str] = None
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    contact_phone: Optional[str] = None
    operating_hours: Optional[str] = None


class HubResponse(HubBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------- Vehicle Schemas ---------------- #
class VehicleBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    plate_number: str = Field(..., min_length=2, max_length=50)
    vehicle_type: VehicleType = VehicleType.VAN
    max_payload_kg: float = Field(..., gt=0)
    max_volume_m3: float = Field(..., gt=0)
    fuel_efficiency_kpl: float = Field(default=12.5, gt=0)
    current_status: VehicleStatus = VehicleStatus.AVAILABLE
    assigned_hub_id: int
    current_latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    current_longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    name: Optional[str] = None
    plate_number: Optional[str] = None
    vehicle_type: Optional[VehicleType] = None
    max_payload_kg: Optional[float] = Field(None, gt=0)
    max_volume_m3: Optional[float] = Field(None, gt=0)
    fuel_efficiency_kpl: Optional[float] = Field(None, gt=0)
    current_status: Optional[VehicleStatus] = None
    assigned_hub_id: Optional[int] = None
    current_latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    current_longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)


class VehicleResponse(VehicleBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------- Driver Schemas ---------------- #
class DriverBase(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    license_number: str = Field(..., min_length=3, max_length=100)
    license_type: LicenseType = LicenseType.COMMERCIAL
    phone_number: str = Field(..., min_length=5, max_length=50)
    status: DriverStatus = DriverStatus.OFF_DUTY
    max_driving_hours_per_day: float = Field(default=8.0, gt=0, le=14)
    assigned_hub_id: int
    user_id: Optional[int] = None
    current_vehicle_id: Optional[int] = None


class DriverCreate(DriverBase):
    pass


class DriverUpdate(BaseModel):
    full_name: Optional[str] = None
    license_type: Optional[LicenseType] = None
    phone_number: Optional[str] = None
    status: Optional[DriverStatus] = None
    max_driving_hours_per_day: Optional[float] = Field(None, gt=0, le=14)
    assigned_hub_id: Optional[int] = None
    current_vehicle_id: Optional[int] = None


class DriverResponse(DriverBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------- Overview Schema ---------------- #
class FleetOverviewResponse(BaseModel):
    total_vehicles: int
    available_vehicles: int
    in_transit_vehicles: int
    maintenance_vehicles: int
    total_drivers: int
    on_duty_drivers: int
    total_hubs: int
    fleet_capacity_kg: float
