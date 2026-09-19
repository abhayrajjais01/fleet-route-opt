"""
fleet.py - SQLAlchemy ORM Models for Fleet Assets (Hubs, Vehicles, Drivers)

This module defines the relational database entities for managing physical fleet logistics:
1. Hub: Central dispatch origin/destination depots with spatial geocoordinates.
2. Vehicle: Delivery assets with payload (kg), volumetric capacity (m³), fuel efficiency (km/L), and operational status.
3. Driver: Certified commercial operators with license classifications, duty states, and daily DOT driving hour constraints.
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


# Enumeration of valid fleet delivery vehicle classifications
class VehicleType(str, enum.Enum):
    VAN = "VAN"                 # Light Urban Cargo Van
    BOX_TRUCK = "BOX_TRUCK"     # Medium Commercial Courier Truck
    SEMI_TRUCK = "SEMI_TRUCK"   # Heavy Interstate Freight Carrier
    EV = "EV"                   # Electric Zero-Emission Vehicle


# Enumeration of vehicle telematics & availability statuses
class VehicleStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"             # Ready at depot for route allocation
    IN_TRANSIT = "IN_TRANSIT"           # Currently executing active delivery dispatch
    MAINTENANCE = "MAINTENANCE"         # In shop for service/inspection
    DECOMMISSIONED = "DECOMMISSIONED"   # Out of active roster


# Enumeration of driver commercial license categories
class LicenseType(str, enum.Enum):
    CLASS_A = "CLASS_A"                 # Combination / Articulated Heavy Goods Vehicle
    CLASS_B = "CLASS_B"                 # Straight Heavy Rigid Goods Vehicle
    COMMERCIAL = "COMMERCIAL"           # Standard Commercial Transport License


# Enumeration of driver duty lifecycle states
class DriverStatus(str, enum.Enum):
    ON_DUTY = "ON_DUTY"         # Signed in & ready for trip assignment
    OFF_DUTY = "OFF_DUTY"       # Shift ended
    ON_TRIP = "ON_TRIP"         # Currently driving active route
    RESTING = "RESTING"         # Mandatory DOT rest break


class Hub(Base, TimestampMixin):
    """
    Hub ORM Model: Represents a physical logistics facility, warehouse, or depot origin.
    Includes latitude/longitude bounds validation (-90 to +90 lat, -180 to +180 lng).
    """
    __tablename__ = "hubs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)  # e.g., HUB-MUM-01
    address = Column(String(500), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    contact_phone = Column(String(50), nullable=False)
    operating_hours = Column(String(100), default="06:00 - 22:00", nullable=False)

    # Database-level SQL CHECK constraints for geocoordinate integrity
    __table_args__ = (
        CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_hub_lat"),
        CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_hub_lng"),
    )

    # Relational mappings
    vehicles = relationship("Vehicle", back_populates="hub", cascade="all, delete-orphan")
    drivers = relationship("Driver", back_populates="hub", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Hub id={self.id} code={self.code} name={self.name}>"


class Vehicle(Base, TimestampMixin):
    """
    Vehicle ORM Model: Represents a physical delivery unit within the fleet.
    Stores payload limits (kg), spatial volume (m³), fuel efficiency (km/L), and assigned hub foreign key.
    """
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)                           # e.g., Alpha Prime Van
    plate_number = Column(String(50), unique=True, nullable=False, index=True) # e.g., MH-02-EE-1001
    vehicle_type = Column(Enum(VehicleType), default=VehicleType.VAN, nullable=False)
    max_payload_kg = Column(Float, nullable=False)                       # Maximum weight capacity in kg
    max_volume_m3 = Column(Float, nullable=False)                        # Maximum cargo volume capacity in m³
    fuel_efficiency_kpl = Column(Float, default=12.5, nullable=False)   # Kilometers per Liter
    current_status = Column(Enum(VehicleStatus), default=VehicleStatus.AVAILABLE, nullable=False)
    
    # Foreign key link to home distribution depot
    assigned_hub_id = Column(Integer, ForeignKey("hubs.id", ondelete="CASCADE"), nullable=False)
    current_latitude = Column(Float, nullable=True)                      # Live telematics coordinate
    current_longitude = Column(Float, nullable=True)                     # Live telematics coordinate

    # Database-level positive non-zero metric constraints
    __table_args__ = (
        CheckConstraint("max_payload_kg > 0", name="chk_vehicle_payload"),
        CheckConstraint("max_volume_m3 > 0", name="chk_vehicle_volume"),
        CheckConstraint("fuel_efficiency_kpl > 0", name="chk_vehicle_fuel"),
    )

    # Relational mappings
    hub = relationship("Hub", back_populates="vehicles")
    assigned_driver = relationship("Driver", back_populates="current_vehicle", uselist=False)

    def __repr__(self):
        return f"<Vehicle id={self.id} plate={self.plate_number} type={self.vehicle_type}>"


class Driver(Base, TimestampMixin):
    """
    Driver ORM Model: Represents a certified commercial driver.
    Enforces daily DOT maximum driving hour constraints (<= 14 hours/day) and tracks shift status.
    """
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True) # Link to auth User
    full_name = Column(String(255), nullable=False, index=True)
    license_number = Column(String(100), unique=True, nullable=False, index=True)
    license_type = Column(Enum(LicenseType), default=LicenseType.COMMERCIAL, nullable=False)
    phone_number = Column(String(50), nullable=False)
    status = Column(Enum(DriverStatus), default=DriverStatus.OFF_DUTY, nullable=False)
    max_driving_hours_per_day = Column(Float, default=8.0, nullable=False) # DOT Hours of Service limit

    assigned_hub_id = Column(Integer, ForeignKey("hubs.id", ondelete="CASCADE"), nullable=False)
    current_vehicle_id = Column(Integer, ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True)

    # SQL Constraint enforcing legal DOT maximum daily driving hour boundaries (1 to 14 hrs)
    __table_args__ = (
        CheckConstraint("max_driving_hours_per_day > 0 AND max_driving_hours_per_day <= 14", name="chk_driver_hours"),
    )

    # Relational mappings
    hub = relationship("Hub", back_populates="drivers")
    current_vehicle = relationship("Vehicle", back_populates="assigned_driver")

    def __repr__(self):
        return f"<Driver id={self.id} name={self.full_name} status={self.status}>"
