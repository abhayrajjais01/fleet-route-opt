"""Pydantic data contracts / schemas module."""
from app.schemas.fleet import (
    HubBase,
    HubCreate,
    HubUpdate,
    HubResponse,
    VehicleBase,
    VehicleCreate,
    VehicleUpdate,
    VehicleResponse,
    DriverBase,
    DriverCreate,
    DriverUpdate,
    DriverResponse,
    FleetOverviewResponse,
)

__all__ = [
    "HubBase",
    "HubCreate",
    "HubUpdate",
    "HubResponse",
    "VehicleBase",
    "VehicleCreate",
    "VehicleUpdate",
    "VehicleResponse",
    "DriverBase",
    "DriverCreate",
    "DriverUpdate",
    "DriverResponse",
    "FleetOverviewResponse",
]
