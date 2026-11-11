"""
mock_stubs.py - Track A Mock & Stub Interfaces (Weeks 7 to 10)
Track A (Manthan Nimodiya) Interface Stubs for Track B Integration

Provides compliant mock implementations and typed interfaces for:
1. Week 7 Track A: Interactive Route Polylines visualizer & Split Manifest formatter.
2. Week 8 Track A: Drag-and-Drop Route Resequencing calculations.
3. Week 9 Track A: LangGraph Optimization Agent solver tool schemas.
4. Week 10 Track A: Downstream ETA Dynamic Recalculation math.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ----------------------------------------------------
# Week 7 Track A Stub: Route Polylines & Split Manifest
# ----------------------------------------------------
class RoutePolylineSegment(BaseModel):
    vehicle_id: int
    color_hex: str
    points: List[List[float]] = Field(default_factory=list)
    total_km: float
    total_duration_minutes: float


class SplitManifestView(BaseModel):
    vehicle_id: int
    plate_number: str
    driver_name: str
    capacity_used_pct: float
    stops_count: int
    active_leg_index: int
    polylines: List[RoutePolylineSegment] = Field(default_factory=list)


class MockRouteVisualizer:
    """Mock helper formatting route polylines and split-manifest views."""

    @staticmethod
    def generate_split_manifest(
        vehicle_id: int,
        plate_number: str,
        driver_name: str,
        stops: List[Dict[str, Any]],
        capacity_pct: float = 75.0,
    ) -> SplitManifestView:
        return SplitManifestView(
            vehicle_id=vehicle_id,
            plate_number=plate_number,
            driver_name=driver_name,
            capacity_used_pct=capacity_pct,
            stops_count=len(stops),
            active_leg_index=0,
            polylines=[
                RoutePolylineSegment(
                    vehicle_id=vehicle_id,
                    color_hex="#2563eb",
                    points=[[19.0760, 72.8777], [19.1136, 72.8697]],
                    total_km=14.5,
                    total_duration_minutes=35.0,
                )
            ],
        )


# ----------------------------------------------------
# Week 8 Track A Stub: Drag-and-Drop Resequencer
# ----------------------------------------------------
class ResequenceResult(BaseModel):
    resequenced: bool
    new_order: List[int]
    distance_delta_km: float
    sla_breaches_detected: int
    breached_stop_ids: List[int] = Field(default_factory=list)


class MockRouteResequencer:
    """Mock interface simulating drag-and-drop stop reordering calculation."""

    @staticmethod
    def calculate_resequence(
        stop_ids: List[int],
        from_index: int,
        to_index: int,
    ) -> ResequenceResult:
        order = list(stop_ids)
        if 0 <= from_index < len(order) and 0 <= to_index < len(order):
            item = order.pop(from_index)
            order.insert(to_index, item)

        return ResequenceResult(
            resequenced=True,
            new_order=order,
            distance_delta_km=1.8,
            sla_breaches_detected=0,
            breached_stop_ids=[],
        )


# ----------------------------------------------------
# Week 9 Track A Stub: Optimization Agent Tool
# ----------------------------------------------------
class MockOptimizationAgentTool:
    """Mock tool interface for LangGraph solver re-optimization."""

    name: str = "solve_vrptw_disruption"
    description: str = "Triggers deterministic VRPTW solver to re-optimize remaining stops after a vehicle breakdown or delay."

    @staticmethod
    def run_reoptimization(vehicle_id: int, unserved_stop_ids: List[int]) -> Dict[str, Any]:
        return {
            "status": "PROPOSED",
            "reassigned_vehicle_id": vehicle_id + 1,
            "transferred_stops_count": len(unserved_stop_ids),
            "estimated_delay_mitigation_minutes": 25.0,
        }


# ----------------------------------------------------
# Week 10 Track A Stub: Downstream ETA Recalculator
# ----------------------------------------------------
class DownstreamEtaRecalculation(BaseModel):
    stop_id: int
    original_eta_min: int
    predicted_eta_min: int
    delay_delta_min: int
    sla_breach: bool


class MockDownstreamETACalculator:
    """Mock calculator estimating ripple effects on downstream stops."""

    @staticmethod
    def recalculate_ripple_etas(
        delay_minutes: int,
        remaining_stops: List[Dict[str, Any]],
    ) -> List[DownstreamEtaRecalculation]:
        results: List[DownstreamEtaRecalculation] = []
        for stop in remaining_stops:
            orig = int(stop.get("eta_min", 600))
            pred = orig + delay_minutes
            deadline = int(stop.get("window_end_min", 720))
            results.append(
                DownstreamEtaRecalculation(
                    stop_id=int(stop.get("id", 0)),
                    original_eta_min=orig,
                    predicted_eta_min=pred,
                    delay_delta_min=delay_minutes,
                    sla_breach=(pred > deadline),
                )
            )
        return results

