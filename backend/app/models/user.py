"""
user.py - SQLAlchemy ORM Model for User Authentication & Role Privileges (RBAC)

Defines the User entity stored in the database, along with the UserRole enumeration
specifying the 4 platform privilege levels: ADMIN, FLEET_MANAGER, DISPATCHER, DRIVER.
"""

import enum
from sqlalchemy import Boolean, Column, DateTime, Enum as SQLEnum, Integer, String
from sqlalchemy.sql import false

from app.core.database import Base
from app.models.base import TimestampMixin


# Role-Based Access Control (RBAC) privilege enums
class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"                 # Full system configuration, governance & analytics
    FLEET_MANAGER = "FLEET_MANAGER" # Manage fleet assets (Vehicles, Drivers, Hubs CRUD)
    DISPATCHER = "DISPATCHER"       # Route solver execution, live map, AI Copilot
    DRIVER = "DRIVER"               # Mobile driver view, assigned trips & stop updates


class User(Base, TimestampMixin):
    """
    User ORM Model: Stores authenticated system operators.
    Includes unique email index, PBKDF2 hashed password string, full name, privilege role, and active state boolean.
    """
    __tablename__ = "users"

    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.DISPATCHER, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Passwords. A temporary password (set by an admin) must be changed before anything else is allowed. Tokens carry
    # token_version, so changing or resetting a password ends every older session.
    must_change_password = Column(Boolean, default=False, server_default=false(), nullable=False)
    token_version = Column(Integer, default=0, server_default="0", nullable=False)
    reset_requested_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"
