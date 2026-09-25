"""
audit.py - SQLAlchemy ORM Model for Immutable Governance Audit Trail (US-008)

Records all administrative actions, asset lifecycle transitions, dispatcher route approvals,
and AI Copilot overrides with cryptographic-grade immutability and complete before/after state diffs.
"""

import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Enum,
    ForeignKey,
    DateTime,
)
from app.core.database import Base
from app.models.base import TimestampMixin


# Action types categorizing logged platform events
class AuditAction(str, enum.Enum):
    ASSET_CREATED = "ASSET_CREATED"       # Vehicle, Driver, Hub, or Shipment created
    ASSET_UPDATED = "ASSET_UPDATED"       # Asset attributes modified
    ASSET_DELETED = "ASSET_DELETED"       # Asset decommissioned/removed
    STATUS_CHANGE = "STATUS_CHANGE"       # Shipment or Vehicle operational state shift
    ROUTE_MODIFIED = "ROUTE_MODIFIED"     # Waypoints resequenced or stops inserted
    COPILOT_OVERRIDE = "COPILOT_OVERRIDE" # Dispatcher approved or rejected AI Copilot proposal
    DISPATCH_APPROVED = "DISPATCH_APPROVED" # Route finalized and locked to DISPATCHED


class AuditLog(Base, TimestampMixin):
    """
    AuditLog ORM Model: Immutable append-only audit trail record.
    Captures actor context, entity reference, before/after JSON states, and human-readable explanation.
    """
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    
    # Actor performing the action (nullable for automated system tasks)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_name = Column(String(255), nullable=False)
    actor_role = Column(String(50), nullable=False, index=True)

    # Action classification & target entity reference
    action_type = Column(Enum(AuditAction), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False, index=True) # e.g. "Shipment", "Vehicle", "Driver"
    entity_id = Column(Integer, nullable=False, index=True)

    # Detailed snapshot serialization for forensic auditability
    before_state = Column(Text, nullable=True) # JSON serialized string
    after_state = Column(Text, nullable=True)  # JSON serialized string
    details = Column(String(1000), nullable=False)

    def __repr__(self) -> str:
        return f"<AuditLog id={self.id} action={self.action_type} entity={self.entity_type}:{self.entity_id} actor={self.actor_name}>"
