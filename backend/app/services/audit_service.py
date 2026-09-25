"""
audit_service.py - Helper Service for Logging Immutable Governance Audit Records (US-008)
"""

import json
from typing import Optional, Any
from sqlalchemy.orm import Session
from app.models.audit import AuditLog, AuditAction
from app.models.user import User


def record_audit_event(
    db: Session,
    actor: Optional[User],
    action_type: AuditAction,
    entity_type: str,
    entity_id: int,
    details: str,
    before_state: Optional[Any] = None,
    after_state: Optional[Any] = None,
) -> AuditLog:
    """
    Persists an immutable audit log entry capturing actor context, entity id, and serialized JSON diffs.
    """
    actor_id = actor.id if actor else None
    actor_name = actor.full_name if actor else "Automated System Service"
    actor_role = actor.role.value if actor else "SYSTEM"

    before_str = json.dumps(before_state, default=str) if before_state is not None else None
    after_str = json.dumps(after_state, default=str) if after_state is not None else None

    entry = AuditLog(
        actor_id=actor_id,
        actor_name=actor_name,
        actor_role=actor_role,
        action_type=action_type,
        entity_type=entity_type,
        entity_id=entity_id,
        before_state=before_str,
        after_state=after_str,
        details=details,
    )
    db.add(entry)
    db.flush()  # Flush so it gains an ID within current transaction
    return entry
