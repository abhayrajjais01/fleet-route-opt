"""Pydantic schemas for admin user management with linked driver profiles (Nov 2026).

A driver is one person with two records: a login account (users, role DRIVER) and a driver profile (drivers:
licence, hub, legal hours). The profile carries `user_id`, so planners know who can open the driver app.
"""
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.core.sanitize import CleanStr
from app.models.fleet import DriverStatus, LicenseType
from app.models.user import UserRole
from app.schemas.auth import UserCreate, UserResponse


class DriverProfileIn(BaseModel):
    """Driver-specific details captured when an admin creates a DRIVER account."""
    license_number: CleanStr = Field(..., min_length=3, max_length=100)
    license_type: LicenseType = LicenseType.COMMERCIAL
    phone_number: CleanStr = Field(..., min_length=5, max_length=50)
    assigned_hub_id: int
    max_driving_hours_per_day: float = Field(8.0, gt=0, le=14)
    hazmat_endorsed: bool = False


class ManagedUserCreate(UserCreate):
    """
    role=DRIVER needs exactly one of: `driver` (create a new linked profile) or `driver_id` (link an existing
    profile that has no login yet). Other roles take neither.
    """
    password: str = Field(..., min_length=8, max_length=128, description="Temporary: must be changed at the first sign-in")
    driver: Optional[DriverProfileIn] = None
    driver_id: Optional[int] = None

    @model_validator(mode="after")
    def driver_details_match_role(self) -> "ManagedUserCreate":
        has_profile = self.driver is not None, self.driver_id is not None
        if self.role == UserRole.DRIVER:
            if sum(has_profile) != 1:
                raise ValueError("A DRIVER account needs a driver profile: send either 'driver' (new) or 'driver_id' (existing).")
        elif any(has_profile):
            raise ValueError("Only DRIVER accounts can have a driver profile.")
        return self


class ManagedUserUpdate(BaseModel):
    full_name: Optional[CleanStr] = Field(None, min_length=2, max_length=100)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class TemporaryPassword(BaseModel):
    temporary_password: str = Field(..., description="Shown once. Must be changed at the next sign-in.")


class DriverLinkRequest(BaseModel):
    driver_id: Optional[int] = Field(None, description="Driver profile to link; null unlinks the current one")


class LinkedDriver(BaseModel):
    id: int
    full_name: str
    assigned_hub_id: int
    status: DriverStatus


class ManagedUserResponse(UserResponse):
    driver: Optional[LinkedDriver] = None
    reset_requested: bool = Field(False, description="The account holder asked for a password reset")
    profile_missing: bool = Field(False, description="DRIVER account without a driver profile: cannot be planned")
