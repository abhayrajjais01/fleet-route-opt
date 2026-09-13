"""SQLAlchemy Models for Fleet Assets (Hubs, Vehicles, Drivers) - US-002."""
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


class VehicleType(str, enum.Enum):
    VAN = "VAN"
    BOX_TRUCK = "BOX_TRUCK"
    SEMI_TRUCK = "SEMI_TRUCK"
    EV = "EV"


class VehicleStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    IN_TRANSIT = "IN_TRANSIT"
    MAINTENANCE = "MAINTENANCE"
    DECOMMISSIONED = "DECOMMISSIONED"


class LicenseType(str, enum.Enum):
    CLASS_A = "CLASS_A"
    CLASS_B = "CLASS_B"
    COMMERCIAL = "COMMERCIAL"


class DriverStatus(str, enum.Enum):
    ON_DUTY = "ON_DUTY"
    OFF_DUTY = "OFF_DUTY"
    ON_TRIP = "ON_TRIP"
    RESTING = "RESTING"


class Hub(Base, TimestampMixin):
    """Distribution Hub / Depot representing dispatch origin and destination."""
    __tablename__ = "hubs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    address = Column(String(500), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    contact_phone = Column(String(50), nullable=False)
    operating_hours = Column(String(100), default="06:00 - 22:00", nullable=False)

    __table_args__ = (
        CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_hub_lat"),
        CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_hub_lng"),
    )

    # Relationships
    vehicles = relationship("Vehicle", back_populates="hub", cascade="all, delete-orphan")
    drivers = relationship("Driver", back_populates="hub", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Hub id={self.id} code={self.code} name={self.name}>"


class Vehicle(Base, TimestampMixin):
    """Fleet delivery vehicle with capacity and fuel metrics."""
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    plate_number = Column(String(50), unique=True, nullable=False, index=True)
    vehicle_type = Column(Enum(VehicleType), default=VehicleType.VAN, nullable=False)
    max_payload_kg = Column(Float, nullable=False)
    max_volume_m3 = Column(Float, nullable=False)
    fuel_efficiency_kpl = Column(Float, default=12.5, nullable=False)
    current_status = Column(Enum(VehicleStatus), default=VehicleStatus.AVAILABLE, nullable=False)
    
    assigned_hub_id = Column(Integer, ForeignKey("hubs.id", ondelete="CASCADE"), nullable=False)
    current_latitude = Column(Float, nullable=True)
    current_longitude = Column(Float, nullable=True)

    __table_args__ = (
        CheckConstraint("max_payload_kg > 0", name="chk_vehicle_payload"),
        CheckConstraint("max_volume_m3 > 0", name="chk_vehicle_volume"),
        CheckConstraint("fuel_efficiency_kpl > 0", name="chk_vehicle_fuel"),
    )

    # Relationships
    hub = relationship("Hub", back_populates="vehicles")
    assigned_driver = relationship("Driver", back_populates="current_vehicle", uselist=False)

    def __repr__(self):
        return f"<Vehicle id={self.id} plate={self.plate_number} type={self.vehicle_type}>"


class Driver(Base, TimestampMixin):
    """Certified driver with license limits and duty status."""
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    full_name = Column(String(255), nullable=False, index=True)
    license_number = Column(String(100), unique=True, nullable=False, index=True)
    license_type = Column(Enum(LicenseType), default=LicenseType.COMMERCIAL, nullable=False)
    phone_number = Column(String(50), nullable=False)
    status = Column(Enum(DriverStatus), default=DriverStatus.OFF_DUTY, nullable=False)
    max_driving_hours_per_day = Column(Float, default=8.0, nullable=False)

    assigned_hub_id = Column(Integer, ForeignKey("hubs.id", ondelete="CASCADE"), nullable=False)
    current_vehicle_id = Column(Integer, ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True)

    __table_args__ = (
        CheckConstraint("max_driving_hours_per_day > 0 AND max_driving_hours_per_day <= 14", name="chk_driver_hours"),
    )

    # Relationships
    hub = relationship("Hub", back_populates="drivers")
    current_vehicle = relationship("Vehicle", back_populates="assigned_driver")

    def __repr__(self):
        return f"<Driver id={self.id} name={self.full_name} status={self.status}>"
