"""
shipment.py - SQLAlchemy ORM Model for Delivery Orders & Shipments (US-002 & US-008)

Defines customer shipments, geolocated delivery destinations, parcel cargo weights/volumes,
delivery time windows [start, end], priority classification, and delivery lifecycle states.
"""

import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Enum,
    ForeignKey,
    CheckConstraint,
)
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin


# Priority classifications for dispatch scheduling
class ShipmentPriority(str, enum.Enum):
    LOW = "LOW"
    STANDARD = "STANDARD"
    HIGH = "HIGH"
    EXPRESS = "EXPRESS"


# Lifecycle states of a shipment from creation to terminal completion
class ShipmentStatus(str, enum.Enum):
    UNASSIGNED = "UNASSIGNED"   # Newly ingested, not yet clustered or assigned to route
    CLUSTERED = "CLUSTERED"     # Grouped by geographic zone for route optimization
    ASSIGNED = "ASSIGNED"       # Assigned to a specific vehicle/manifest
    IN_TRANSIT = "IN_TRANSIT"   # Currently out for delivery
    DELIVERED = "DELIVERED"     # Successfully handed over to consignee
    FAILED = "FAILED"           # Delivery attempt failed (e.g. consignee unavailable)


class Shipment(Base, TimestampMixin):
    """
    Shipment ORM Model: Represents a discrete customer delivery consignment.
    Enforces geographic coordinate boundary checks, strictly positive weights and volumes,
    and customer-specific delivery time windows.
    """
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True, index=True)
    tracking_number = Column(String(50), unique=True, nullable=False, index=True) # e.g. SHP-001-MUM
    customer_name = Column(String(255), nullable=False, index=True)
    destination_address = Column(String(500), nullable=False)
    
    # Geocoded delivery coordinates
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)

    # Physical parcel dimensions for VRPTW capacity constraints
    weight_kg = Column(Float, nullable=False)
    volume_m3 = Column(Float, nullable=False)

    # Delivery time window constraints (HH:MM 24-hr format)
    time_window_start = Column(String(10), default="09:00", nullable=False)
    time_window_end = Column(String(10), default="17:00", nullable=False)

    priority = Column(Enum(ShipmentPriority), default=ShipmentPriority.STANDARD, nullable=False, index=True)
    status = Column(Enum(ShipmentStatus), default=ShipmentStatus.UNASSIGNED, nullable=False, index=True)

    # Distribution depot origin foreign key
    hub_id = Column(Integer, ForeignKey("hubs.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Assigned vehicle foreign key (nullable when UNASSIGNED)
    assigned_vehicle_id = Column(Integer, ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True)

    # SQL Constraints
    __table_args__ = (
        CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_shipment_lat"),
        CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_shipment_lng"),
        CheckConstraint("weight_kg > 0", name="chk_shipment_weight"),
        CheckConstraint("volume_m3 > 0", name="chk_shipment_volume"),
    )

    # Relational mappings
    hub = relationship("Hub")
    assigned_vehicle = relationship("Vehicle")

    def __repr__(self) -> str:
        return f"<Shipment id={self.id} tracking={self.tracking_number} status={self.status} priority={self.priority}>"
