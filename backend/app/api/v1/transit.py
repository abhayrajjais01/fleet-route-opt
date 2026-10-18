"""
transit.py - In-Transit FSM & Telemetry Tracking Endpoints (US-008, Week 6 Track B)

Exposes RESTful endpoints for driver actions:
- POST /shipments/{id}/depart: Dispatches order with assigned vehicle
- POST /shipments/{id}/arrive: Driver arrival check-in at destination
- POST /shipments/{id}/deliver: Proof of delivery completion
- POST /shipments/{id}/fail: Failure incident reporting
- POST /shipments/{id}/delay: En-route traffic/breakdown delay reporting
- POST /shipments/{id}/redispatch: Returns failed parcel to unassigned queue
- GET  /trips/{vehicle_id}/progress: Real-time multi-stop trip progress & FSM metrics
- GET  /fsm/transitions: Permissible FSM state transition rules dictionary
"""

from typing import Dict, List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.user import User, UserRole
from app.schemas.transit import (
    TransitDepartRequest,
    TransitArriveRequest,
    TransitDeliverRequest,
    TransitFailRequest,
    TransitDelayRequest,
    TransitRedispatchRequest,
    TransitTransitionResponse,
    TripFsmProgressResponse,
)
from app.services.transit_fsm import TransitFSMService, VALID_FSM_TRANSITIONS

router = APIRouter()


@router.post(
    "/shipments/{shipment_id}/depart",
    response_model=TransitTransitionResponse,
    status_code=status.HTTP_200_OK,
    summary="Driver / Dispatcher marks shipment departed in-transit",
)
def mark_shipment_departed(
    shipment_id: int,
    payload: TransitDepartRequest = TransitDepartRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER, UserRole.DISPATCHER, UserRole.DRIVER])),
):
    """
    Transitions shipment from ASSIGNED -> IN_TRANSIT.
    Permitted for drivers, dispatchers, fleet managers, and admins.
    """
    return TransitFSMService.depart_shipment(
        db=db,
        shipment_id=shipment_id,
        actor=current_user,
        vehicle_id=payload.vehicle_id,
        notes=payload.notes,
    )


@router.post(
    "/shipments/{shipment_id}/arrive",
    response_model=TransitTransitionResponse,
    status_code=status.HTTP_200_OK,
    summary="Driver check-in arrival at delivery stop",
)
def mark_stop_arrived(
    shipment_id: int,
    payload: TransitArriveRequest = TransitArriveRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER, UserRole.DISPATCHER, UserRole.DRIVER])),
):
    """
    Transitions shipment from IN_TRANSIT -> ARRIVED.
    Captures driver arrival timestamp and optional GPS telemetry coordinates.
    """
    return TransitFSMService.arrive_at_stop(
        db=db,
        shipment_id=shipment_id,
        actor=current_user,
        latitude=payload.latitude,
        longitude=payload.longitude,
        notes=payload.notes,
    )


@router.post(
    "/shipments/{shipment_id}/deliver",
    response_model=TransitTransitionResponse,
    status_code=status.HTTP_200_OK,
    summary="Confirm successful parcel delivery handover",
)
def mark_shipment_delivered(
    shipment_id: int,
    payload: TransitDeliverRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER, UserRole.DISPATCHER, UserRole.DRIVER])),
):
    """
    Transitions shipment from ARRIVED or IN_TRANSIT -> DELIVERED (Terminal).
    Enforces consignee recipient name and logs proof-of-delivery audit trail.
    """
    return TransitFSMService.deliver_shipment(
        db=db,
        shipment_id=shipment_id,
        recipient_name=payload.recipient_name,
        actor=current_user,
        signature_text=payload.signature_text,
        notes=payload.notes,
    )


@router.post(
    "/shipments/{shipment_id}/fail",
    response_model=TransitTransitionResponse,
    status_code=status.HTTP_200_OK,
    summary="Report delivery failure attempt with reason code",
)
def mark_delivery_failed(
    shipment_id: int,
    payload: TransitFailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER, UserRole.DISPATCHER, UserRole.DRIVER])),
):
    """
    Transitions shipment from IN_TRANSIT or ARRIVED -> FAILED.
    Requires structured failure reason classification and diagnostic incident notes.
    """
    return TransitFSMService.fail_delivery(
        db=db,
        shipment_id=shipment_id,
        reason_code=payload.reason_code,
        notes=payload.notes,
        actor=current_user,
    )


@router.post(
    "/shipments/{shipment_id}/delay",
    response_model=TransitTransitionResponse,
    status_code=status.HTTP_200_OK,
    summary="Report en-route traffic or mechanical delay",
)
def report_shipment_delay(
    shipment_id: int,
    payload: TransitDelayRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER, UserRole.DISPATCHER, UserRole.DRIVER])),
):
    """
    Reports a delay duration and cause for an active shipment without breaking FSM flow.
    Appends audit record for SLA breach risk monitoring.
    """
    return TransitFSMService.report_delay(
        db=db,
        shipment_id=shipment_id,
        delay_minutes=payload.delay_minutes,
        reason=payload.reason,
        actor=current_user,
    )


@router.post(
    "/shipments/{shipment_id}/redispatch",
    response_model=TransitTransitionResponse,
    status_code=status.HTTP_200_OK,
    summary="Return failed parcel to unassigned queue for re-routing",
)
def redispatch_failed_shipment(
    shipment_id: int,
    payload: TransitRedispatchRequest = TransitRedispatchRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER, UserRole.DISPATCHER])),
):
    """
    Transitions shipment from FAILED or ASSIGNED -> UNASSIGNED.
    Clears vehicle assignment and prepares consignment for re-clustering/re-routing.
    """
    return TransitFSMService.redispatch_shipment(
        db=db,
        shipment_id=shipment_id,
        actor=current_user,
        notes=payload.notes,
    )


@router.get(
    "/trips/{vehicle_id}/progress",
    response_model=TripFsmProgressResponse,
    status_code=status.HTTP_200_OK,
    summary="Get real-time trip progress, stop statuses, and FSM metrics",
)
def get_trip_fsm_progress(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns real-time execution progress, stop-by-stop statuses, and completion metrics
    for a vehicle trip manifest.
    """
    return TransitFSMService.get_vehicle_trip_fsm_progress(db=db, vehicle_id=vehicle_id)


@router.get(
    "/fsm/transitions",
    response_model=Dict[str, List[str]],
    summary="Get permissible FSM state transition rules",
)
def get_fsm_transition_rules(
    current_user: User = Depends(get_current_user),
):
    """
    Returns the allowable FSM state transition graph for client state machines.
    """
    return {
        state.value: [next_state.value for next_state in targets]
        for state, targets in VALID_FSM_TRANSITIONS.items()
    }
