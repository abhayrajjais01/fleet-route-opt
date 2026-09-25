"""
audit.py - RESTful Query API for Immutable Audit Trail (US-008)
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_roles
from app.models.user import User, UserRole
from app.models.audit import AuditLog, AuditAction
from app.schemas.audit import AuditLogResponse

router = APIRouter()


@router.get("", response_model=List[AuditLogResponse])
def list_audit_logs(
    entity_type: Optional[str] = Query(None, description="Filter by entity type (e.g. Shipment, Vehicle)"),
    action_type: Optional[AuditAction] = Query(None, description="Filter by audit action type"),
    actor_role: Optional[str] = Query(None, description="Filter by actor role"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER, UserRole.DISPATCHER])),
):
    """
    Query the immutable audit trail with filtering and pagination.
    Accessible to ADMIN, FLEET_MANAGER, and DISPATCHER roles.
    """
    query = db.query(AuditLog)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if action_type:
        query = query.filter(AuditLog.action_type == action_type)
    if actor_role:
        query = query.filter(AuditLog.actor_role == actor_role)

    return query.order_by(AuditLog.id.desc()).offset(skip).limit(limit).all()
