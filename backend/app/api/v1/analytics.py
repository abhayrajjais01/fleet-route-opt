"""
analytics.py - Executive KPI Analytics API (US-008, Week 12 · Track B: Abhayraj Jaiswal)

- GET /analytics/executive   headline KPIs vs previous period, daily trend, SLA by hour of day,
                             driver efficiency, and a live snapshot of today's shipments and vehicles.

Filters: date range (up to 90 days ending yesterday), hub, vehicle category.
"""

from collections import Counter
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_roles
from app.models.fleet import Vehicle
from app.models.shipment import Shipment
from app.models.user import User, UserRole
from app.schemas.analytics import ExecutiveDashboardResponse, LiveSnapshot
from app.services.executive_analytics import InvalidRange, executive_report, resolve_period

router = APIRouter()


def live_snapshot(db: Session) -> LiveSnapshot:
    """Current shipment and vehicle states straight from the database (changes as trip events happen)."""
    shipments = Counter(s.status.value for s in db.query(Shipment.status).all())
    vehicles = Counter(v.current_status.value for v in db.query(Vehicle.current_status).all())
    return LiveSnapshot(generated_at=datetime.now(timezone.utc).isoformat(),
                        shipments_by_status=dict(shipments), vehicles_by_status=dict(vehicles))


@router.get(
    "/executive",
    response_model=ExecutiveDashboardResponse,
    summary="Executive KPI dashboard (US-008, Week 12)",
)
def executive_dashboard(
    date_from: Optional[date] = Query(None, description="First day (YYYY-MM-DD); default 30 days before date_to"),
    date_to: Optional[date] = Query(None, description="Last day (YYYY-MM-DD); default yesterday"),
    hub: Optional[str] = Query(None, description="Hub code, e.g. HUB-MUM-01"),
    vehicle_type: Optional[str] = Query(None, description="VAN, EV, BOX_TRUCK or SEMI_TRUCK"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER])),
) -> ExecutiveDashboardResponse:
    try:
        period = resolve_period(date_from, date_to)
    except InvalidRange as err:
        raise HTTPException(status_code=422, detail=str(err))
    report = executive_report(period, hub=hub or None, vehicle_type=vehicle_type or None)
    return ExecutiveDashboardResponse(**report, live=live_snapshot(db))
