"""Pydantic v2 Schemas for Shipment Management - US-002 & US-008."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.models.shipment import ShipmentPriority, ShipmentStatus


class ShipmentBase(BaseModel):
    tracking_number: str = Field(..., min_length=3, max_length=50, description="Unique tracking identifier")
    customer_name: str = Field(..., min_length=2, max_length=255)
    destination_address: str = Field(..., min_length=5, max_length=500)
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Delivery latitude coordinate")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Delivery longitude coordinate")
    weight_kg: float = Field(..., gt=0, description="Parcel gross weight in kilograms")
    volume_m3: float = Field(..., gt=0, description="Parcel spatial volume in cubic meters")
    time_window_start: str = Field(default="09:00", pattern=r"^\d{2}:\d{2}$", description="Window opening time (HH:MM)")
    time_window_end: str = Field(default="17:00", pattern=r"^\d{2}:\d{2}$", description="Window closing time (HH:MM)")
    priority: ShipmentPriority = ShipmentPriority.STANDARD
    status: ShipmentStatus = ShipmentStatus.UNASSIGNED
    hub_id: int = Field(..., description="Origin distribution hub ID")
    assigned_vehicle_id: Optional[int] = Field(None, description="Assigned delivery vehicle ID")

    @field_validator("time_window_end")
    @classmethod
    def validate_time_window(cls, v: str, info):
        start = info.data.get("time_window_start")
        if start and v < start:
            raise ValueError(f"time_window_end ({v}) cannot be earlier than time_window_start ({start})")
        return v


class ShipmentCreate(ShipmentBase):
    pass


class ShipmentUpdate(BaseModel):
    customer_name: Optional[str] = Field(None, min_length=2, max_length=255)
    destination_address: Optional[str] = None
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    weight_kg: Optional[float] = Field(None, gt=0)
    volume_m3: Optional[float] = Field(None, gt=0)
    time_window_start: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    time_window_end: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    priority: Optional[ShipmentPriority] = None
    status: Optional[ShipmentStatus] = None
    assigned_vehicle_id: Optional[int] = None


class ShipmentStatusUpdate(BaseModel):
    status: ShipmentStatus
    notes: Optional[str] = Field(None, max_length=500, description="Audit reason for status change")


class ShipmentResponse(ShipmentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =====================================================================
# Track B (Week 4): Batch Order Ingestion Schemas
# =====================================================================

class BatchIngestionRowError(BaseModel):
    row: int = Field(..., description="Line/Row number in CSV or index in JSON array")
    tracking_number: Optional[str] = Field(None, description="Tracking ID if extracted")
    reason: str = Field(..., description="Detailed explanation of rejection")


class BatchShipmentIngestionResponse(BaseModel):
    total_processed: int = Field(..., description="Total rows/records inspected")
    successful_count: int = Field(..., description="Number of orders ingested successfully")
    failed_count: int = Field(..., description="Number of rejected rows")
    errors: List[BatchIngestionRowError] = Field(default_factory=list, description="Row-level error breakdown")
    created_shipments: List[ShipmentResponse] = Field(default_factory=list, description="Successfully created shipments")


class BatchShipmentJSONRequest(BaseModel):
    shipments: List[ShipmentCreate] = Field(..., min_length=1, description="List of shipments to ingest")
