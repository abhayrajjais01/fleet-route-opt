"""
audit.py - RESTful Query API for Immutable Audit Trail (US-008)

- GET /audit              filtered, paginated entries (admin, fleet manager, dispatcher)
- GET /audit/report       compliance summary with integrity checks (Week 14 · Track B)
- GET /audit/export.csv   every entry for the filters, spreadsheet-safe (Week 14 · Track B)
- GET /audit/report.pdf   printable compliance report (Week 14 · Track B)
"""

from dataclasses import dataclass
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_roles
from app.models.user import User, UserRole
from app.models.audit import AuditLog, AuditAction
from app.schemas.audit import AuditLogResponse
from app.services.audit_report import AuditFilters, audit_csv, audit_pdf, build_report, entries

router = APIRouter()
COMPLIANCE = require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER])


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


# ─── Week 14: compliance report (Track B) ────────────────────────────────────────────────────

@dataclass
class AuditReportQuery:
    date_from: Optional[date] = Query(None, description="First day (YYYY-MM-DD, UTC)")
    date_to: Optional[date] = Query(None, description="Last day (YYYY-MM-DD, UTC)")
    action_type: Optional[AuditAction] = Query(None, description="Only this action type")
    entity_type: Optional[str] = Query(None, max_length=50, description="Only this entity type, e.g. Shipment")
    actor_role: Optional[str] = Query(None, max_length=50, description="Only this actor role, e.g. DISPATCHER")

    def filters(self) -> AuditFilters:
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise HTTPException(status_code=422, detail="date_from must be on or before date_to.")
        return AuditFilters(self.date_from, self.date_to, self.action_type, self.entity_type or None, self.actor_role or None)


def _filename(f: AuditFilters, ext: str) -> str:
    span = f"{f.date_from or 'start'}-to-{f.date_to or 'today'}"
    return f"audit-trail-{span}.{ext}"


@router.get("/report", summary="Audit trail compliance report with integrity checks")
def audit_report(q: AuditReportQuery = Depends(), db: Session = Depends(get_db), current_user: User = Depends(COMPLIANCE)) -> dict:
    return build_report(db, q.filters())


@router.get("/export.csv", summary="Audit trail as CSV", response_class=Response)
def audit_export_csv(q: AuditReportQuery = Depends(), db: Session = Depends(get_db), current_user: User = Depends(COMPLIANCE)) -> Response:
    f = q.filters()
    return Response(content=audit_csv(entries(db, f)), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{_filename(f, "csv")}"'})


@router.get("/report.pdf", summary="Printable audit trail compliance report", response_class=Response)
def audit_report_pdf(q: AuditReportQuery = Depends(), db: Session = Depends(get_db), current_user: User = Depends(COMPLIANCE)) -> Response:
    f = q.filters()
    rows = entries(db, f)
    return Response(content=audit_pdf(build_report(db, f), rows, f.label()), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{_filename(f, "pdf")}"'})
