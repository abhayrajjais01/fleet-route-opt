"""Pydantic v2 Schemas for Audit Trail - US-008."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.audit import AuditAction


class AuditLogBase(BaseModel):
    actor_name: str = Field(..., min_length=2, max_length=255)
    actor_role: str = Field(..., min_length=2, max_length=50)
    action_type: AuditAction
    entity_type: str = Field(..., min_length=2, max_length=50)
    entity_id: int
    before_state: Optional[str] = None
    after_state: Optional[str] = None
    details: str = Field(..., min_length=3, max_length=1000)
    actor_id: Optional[int] = None


class AuditLogCreate(AuditLogBase):
    pass


class AuditLogResponse(AuditLogBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
