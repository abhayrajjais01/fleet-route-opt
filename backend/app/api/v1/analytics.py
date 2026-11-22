"""
analytics.py - Executive KPI Analytics API (US-008, Weeks 12-13 · Track B: Abhayraj Jaiswal)

- GET /analytics/executive              headline KPIs vs previous period, daily trend, SLA by hour of day,
                                        driver efficiency, delivery density, and a live snapshot of today's shipments
- GET /analytics/executive/export.csv   one dashboard view as CSV (section=kpis|daily|hours|drivers|density)
- GET /analytics/executive/summary.pdf  printable executive summary

Filters (all endpoints): date range (up to 90 days ending yesterday), hub, vehicle type, driver, priority class.
"""

from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_roles
from app.models.fleet import Vehicle
from app.models.shipment import Shipment
from app.models.user import User, UserRole
from app.schemas.analytics import ExecutiveDashboardResponse, LiveSnapshot
from app.services.executive_analytics import PRIORITIES, Filters, InvalidRange, executive_report, resolve_period
from app.services.executive_exports import SECTIONS, export_filename, section_csv, summary_pdf

router = APIRouter()
EXECUTIVES = require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER])


def live_snapshot(db: Session) -> LiveSnapshot:
    """Current shipment and vehicle states straight from the database (changes as trip events happen)."""
    shipments = Counter(s.status.value for s in db.query(Shipment.status).all())
    vehicles = Counter(v.current_status.value for v in db.query(Vehicle.current_status).all())
    return LiveSnapshot(generated_at=datetime.now(timezone.utc).isoformat(),
                        shipments_by_status=dict(shipments), vehicles_by_status=dict(vehicles))


@dataclass
class ReportQuery:
    """Query parameters shared by the dashboard and its exports, so all three always agree."""
    date_from: Optional[date] = Query(None, description="First day (YYYY-MM-DD); default 30 days before date_to")
    date_to: Optional[date] = Query(None, description="Last day (YYYY-MM-DD); default yesterday")
    hub: Optional[str] = Query(None, max_length=40, description="Hub code, e.g. HUB-MUM-01")
    vehicle_type: Optional[str] = Query(None, max_length=40, description="VAN, EV, BOX_TRUCK or SEMI_TRUCK")
    driver: Optional[str] = Query(None, max_length=120, description="Driver full name, e.g. Rajesh Kumar")
    priority: Optional[str] = Query(None, max_length=20, description="EXPRESS, HIGH, STANDARD or LOW")

    def build(self) -> Dict:
        if self.priority and self.priority not in PRIORITIES:
            raise HTTPException(status_code=422, detail=f"priority must be one of: {', '.join(PRIORITIES)}")
        try:
            period = resolve_period(self.date_from, self.date_to)
        except InvalidRange as err:
            raise HTTPException(status_code=422, detail=str(err))
        return executive_report(period, **self.filters().as_dict())

    def filters(self) -> Filters:
        return Filters(self.hub or None, self.vehicle_type or None, self.driver or None, self.priority or None)


@router.get("/executive", response_model=ExecutiveDashboardResponse, summary="Executive KPI dashboard (US-008)")
def executive_dashboard(
    q: ReportQuery = Depends(),
    db: Session = Depends(get_db),
    current_user: User = Depends(EXECUTIVES),
) -> ExecutiveDashboardResponse:
    return ExecutiveDashboardResponse(**q.build(), live=live_snapshot(db))


@router.get("/executive/export.csv", summary="One dashboard view as CSV", response_class=Response)
def executive_csv(
    section: str = Query("kpis", description=f"One of: {', '.join(SECTIONS)}"),
    q: ReportQuery = Depends(),
    current_user: User = Depends(EXECUTIVES),
) -> Response:
    if section not in SECTIONS:
        raise HTTPException(status_code=422, detail=f"section must be one of: {', '.join(SECTIONS)}")
    report = q.build()
    return Response(content=section_csv(report, section), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{export_filename(report, section, "csv")}"'})


@router.get("/executive/summary.pdf", summary="Printable executive KPI summary", response_class=Response)
def executive_pdf(
    q: ReportQuery = Depends(),
    current_user: User = Depends(EXECUTIVES),
) -> Response:
    report = q.build()
    return Response(content=summary_pdf(report, q.filters().label()), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{export_filename(report, "summary", "pdf")}"'})
