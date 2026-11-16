"""Pydantic v2 Schemas for the Executive KPI Analytics Dashboard - US-008, Week 12 (Track B)."""
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class PeriodInfo(BaseModel):
    date_from: str
    date_to: str
    days: int


class KpiCard(BaseModel):
    key: str = Field(..., description="on_time_pct, otif_pct, deliveries, total_cost, cost_per_delivery, fleet_utilisation_pct, total_km, failed_pct")
    value: float
    previous: Optional[float] = Field(None, description="Same KPI for the previous period of equal length")
    change: Optional[float] = None
    change_pct: Optional[float] = None
    higher_is_better: bool


class DailyPoint(BaseModel):
    date: str
    stops: int
    deliveries: int
    on_time: int
    late: int = Field(..., description="Delivered after the window closed")
    failed: int
    on_time_pct: Optional[float] = None
    cost: float
    km: float


class HourBucket(BaseModel):
    hour: int = Field(..., ge=0, le=23)
    stops: int
    on_time: int
    late: int
    failed: int
    on_time_pct: Optional[float] = None


class DriverEfficiency(BaseModel):
    rank: int
    driver: str
    vehicle_types: List[str]
    hubs: List[str]
    trips: int
    stops: int
    deliveries: int
    on_time_pct: float
    stops_per_hour: float
    km_per_stop: float
    cost_per_delivery: float
    utilisation_pct: float


class LiveSnapshot(BaseModel):
    generated_at: str
    shipments_by_status: Dict[str, int]
    vehicles_by_status: Dict[str, int]


class ExecutiveDashboardResponse(BaseModel):
    source: str
    period: PeriodInfo
    previous_period: PeriodInfo
    filters: Dict[str, Optional[str]]
    kpis: List[KpiCard]
    daily: List[DailyPoint]
    sla_by_hour: List[HourBucket]
    drivers: List[DriverEfficiency]
    live: LiveSnapshot
    options: Dict[str, List[str]]
    assumptions: Dict[str, float]
