"""
transit.py - Pydantic v2 Schemas for In-Transit FSM & Telemetry Tracking (US-008, Week 6 Track B)

Defines structured payloads for driver action triggers (depart, arrived, delivered, failed, delay),
FSM state transition validation, reason codes, and trip progress tracking.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field
from app.models.shipment import ShipmentStatus, ShipmentPriority


class TransitFailureReason(str, Enum):
    CONSIGNEE_UNAVAILABLE = "CONSIGNEE_UNAVAILABLE"
    INCORRECT_ADDRESS = "INCORRECT_ADDRESS"
    DAMAGED_PACKAGE = "DAMAGED_PACKAGE"
    ACCESS_RESTRICTED = "ACCESS_RESTRICTED"
    CUSTOMER_REFUSED = "CUSTOMER_REFUSED"
    VEHICLE_ISSUE = "VEHICLE_ISSUE"
    OTHER = "OTHER"


class TransitDepartRequest(BaseModel):
    vehicle_id: Optional[int] = Field(None, description="Vehicle ID departing with this shipment")
    notes: Optional[str] = Field(None, max_length=500, description="Departure notes")


class TransitArriveRequest(BaseModel):
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0, allow_inf_nan=False, description="GPS check-in latitude")
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0, allow_inf_nan=False, description="GPS check-in longitude")
    notes: Optional[str] = Field(None, max_length=500, description="Arrival check-in notes")


class TransitDeliverRequest(BaseModel):
    recipient_name: str = Field(..., min_length=2, max_length=255, description="Name of consignee accepting package")
    signature_text: Optional[str] = Field(None, max_length=255, description="Signee verification text or digital token")
    notes: Optional[str] = Field(None, max_length=500, description="Handover delivery notes")


class TransitFailRequest(BaseModel):
    reason_code: TransitFailureReason = Field(..., description="Standardized failure classification")
    notes: str = Field(..., min_length=3, max_length=500, description="Detailed explanation of failure cause")


class TransitDelayRequest(BaseModel):
    delay_minutes: int = Field(..., gt=0, le=480, description="Reported delay duration in minutes")
    reason: str = Field(..., min_length=3, max_length=500, description="Cause of transit delay (traffic, weather, inspection)")


class TransitRedispatchRequest(BaseModel):
    notes: Optional[str] = Field(None, max_length=500, description="Redispatch reason or depot return note")


class TransitTransitionResponse(BaseModel):
    shipment_id: int
    tracking_number: str
    previous_status: ShipmentStatus
    current_status: ShipmentStatus
    assigned_vehicle_id: Optional[int] = None
    actor_name: str
    actor_role: str
    timestamp: datetime
    details: str
    metadata: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)


class TripStopFsmSummary(BaseModel):
    id: int
    tracking_number: str
    customer_name: str
    destination_address: str
    latitude: float
    longitude: float
    status: ShipmentStatus
    priority: ShipmentPriority
    weight_kg: float
    time_window_start: str
    time_window_end: str
    stop_sequence: int

    model_config = ConfigDict(from_attributes=True)


class TripFsmProgressResponse(BaseModel):
    vehicle_id: int
    vehicle_name: str
    plate_number: str
    vehicle_status: str
    driver_id: Optional[int] = None
    driver_name: Optional[str] = None
    driver_status: Optional[str] = None
    total_stops: int
    completed_stops: int
    failed_stops: int
    in_transit_stops: int
    arrived_stops: int
    pending_stops: int
    current_stop_index: int
    trip_progress_pct: float
    is_trip_active: bool
    stops: List[TripStopFsmSummary]
