"""
reports.py - Operational Metrics & Export API (US-007, Weeks 13-14 · Track A: Manthan Nimodiya)

Endpoints (all accept the same filters, so the dashboard, CSV and PDF always agree):
- GET /reports/metrics      KPIs + per-hub / per-vehicle-type / per-driver breakdowns + daily series
- GET /reports/export.csv   one row per delivery attempt, for operational audits
- GET /reports/summary.pdf  printable executive trip summary

Data source: simulated dispatch history (see services/analytics/history.py) until completed trips are persisted.
"""

from datetime import date
from typing import Dict, List, Optional

from fastapi import APIRouter, Query
from fastapi.responses import Response
from pydantic import BaseModel

from app.services.analytics.exports import stops_csv, summary_pdf
from app.services.analytics.history import simulated_history
from app.services.analytics.metrics import (
    DEFAULT_DRIVER_COST_PER_HOUR,
    DEFAULT_FUEL_PRICE_PER_L,
    TripRecord,
    breakdown,
    compute_metrics,
    filter_trips,
)

router = APIRouter()

DEFINITIONS = {
    "otif_pct": "Stops delivered inside the window and in full, as a share of all stops",
    "on_time_pct": "Stops whose actual arrival was before the window closed",
    "sla_breach_pct": "Stops that arrived after the window closed",
    "avg_transit_min": "Mean trip duration from hub departure to hub return",
    "route_efficiency_index": "Separate-trip km divided by actual km (higher means more consolidation)",
    "fuel_l_per_100km": "Litres of fuel per 100 km driven",
    "cost_per_ton_km": "(Fuel + driver cost) per tonne-km moved; tonne-km assumes a linear unload over the route",
    "fleet_utilisation_pct": "Trip load as a share of vehicle payload",
}


class Filters(BaseModel):
    days: int
    hub: Optional[str]
    vehicle_type: Optional[str]
    driver: Optional[str]


class MetricsResponse(BaseModel):
    source: str
    filters: Filters
    assumptions: Dict[str, float]
    definitions: Dict[str, str]
    kpis: Dict[str, float]
    by_hub: Dict[str, Dict[str, float]]
    by_vehicle_type: Dict[str, Dict[str, float]]
    by_driver: Dict[str, Dict[str, float]]
    daily: List[Dict[str, float | str]]
    options: Dict[str, List[str]]


def _trips(days: int, hub: Optional[str], vehicle_type: Optional[str], driver: Optional[str]) -> List[TripRecord]:
    return filter_trips(simulated_history(days), hub=hub, vehicle_type=vehicle_type, driver=driver)


def _filters_text(hub, vehicle_type, driver) -> str:
    parts = [p for p in [hub, vehicle_type, driver] if p]
    return ", ".join(parts) if parts else "all hubs, vehicles and drivers"


DaysQ = Query(30, ge=1, le=90, description="Number of past days")
HubQ = Query(None, description="Hub code, e.g. HUB-MUM-01")
TypeQ = Query(None, description="VAN, EV, BOX_TRUCK or SEMI_TRUCK")
DriverQ = Query(None, description="Driver full name")
FuelQ = Query(DEFAULT_FUEL_PRICE_PER_L, gt=0, description="Fuel price per litre (₹)")
WageQ = Query(DEFAULT_DRIVER_COST_PER_HOUR, gt=0, description="Driver cost per hour (₹)")


@router.get("/metrics", response_model=MetricsResponse, summary="Operational KPIs with breakdowns")
def metrics(days: int = DaysQ, hub: Optional[str] = HubQ, vehicle_type: Optional[str] = TypeQ, driver: Optional[str] = DriverQ,
            fuel_price: float = FuelQ, driver_cost: float = WageQ):
    trips = _trips(days, hub, vehicle_type, driver)
    kw = dict(fuel_price_per_l=fuel_price, driver_cost_per_hour=driver_cost)
    everything = simulated_history(days)
    daily = [{"date": d, **m.as_dict()} for d, m in breakdown(trips, lambda t: t.date, **kw).items()]
    return MetricsResponse(
        source=f"Simulated dispatch history: {days} days replayed through the VRPTW solver and ETA engine",
        filters=Filters(days=days, hub=hub, vehicle_type=vehicle_type, driver=driver),
        assumptions={"fuel_price_per_l": fuel_price, "driver_cost_per_hour": driver_cost},
        definitions=DEFINITIONS,
        kpis=compute_metrics(trips, **kw).as_dict(),
        by_hub={k: v.as_dict() for k, v in breakdown(trips, lambda t: t.hub, **kw).items()},
        by_vehicle_type={k: v.as_dict() for k, v in breakdown(trips, lambda t: t.vehicle_type, **kw).items()},
        by_driver={k: v.as_dict() for k, v in breakdown(trips, lambda t: t.driver, **kw).items()},
        daily=daily,
        options={"hubs": sorted({t.hub for t in everything}), "vehicle_types": sorted({t.vehicle_type for t in everything}),
                 "drivers": sorted({t.driver for t in everything})},
    )


@router.get("/export.csv", summary="CSV export of every delivery attempt", response_class=Response)
def export_csv(days: int = DaysQ, hub: Optional[str] = HubQ, vehicle_type: Optional[str] = TypeQ, driver: Optional[str] = DriverQ):
    body = stops_csv(_trips(days, hub, vehicle_type, driver))
    name = f"fleet-deliveries-{date.today().isoformat()}.csv"
    return Response(body, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/summary.pdf", summary="Printable executive trip summary", response_class=Response)
def export_pdf(days: int = DaysQ, hub: Optional[str] = HubQ, vehicle_type: Optional[str] = TypeQ, driver: Optional[str] = DriverQ,
               fuel_price: float = FuelQ, driver_cost: float = WageQ):
    pdf = summary_pdf(_trips(days, hub, vehicle_type, driver), _filters_text(hub, vehicle_type, driver), fuel_price, driver_cost)
    name = f"executive-trip-summary-{date.today().isoformat()}.pdf"
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"'})
