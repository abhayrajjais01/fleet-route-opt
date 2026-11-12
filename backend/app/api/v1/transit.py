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
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.user import User, UserRole
from typing import Optional
from datetime import datetime, timezone
import hashlib
from fastapi import HTTPException
from app.models.fleet import Driver, Vehicle, Hub
from app.models.shipment import Shipment, ShipmentStatus
from app.schemas.transit import (
    TransitDepartRequest,
    TransitArriveRequest,
    TransitDeliverRequest,
    TransitFailRequest,
    TransitDelayRequest,
    TransitRedispatchRequest,
    TransitTransitionResponse,
    TripFsmProgressResponse,
    DriverMobileManifestResponse,
    DriverStopManifestItem,
    DriverOfflineSyncRequest,
    DriverOfflineSyncResponse,
    DriverOfflineSyncResultItem,
    DriverOfflineActionType,
    TransitFailureReason,
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


@router.get(
    "/driver/manifest",
    response_model=DriverMobileManifestResponse,
    summary="Get Mobile Driver Daily Manifest (US-008, Week 9)",
    description="Returns the authenticated driver's assigned vehicle, depot, and sequenced delivery stops with phone contacts and status.",
)
def get_driver_mobile_manifest(
    driver_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DriverMobileManifestResponse:
    # 1. Resolve Driver entity
    driver: Optional[Driver] = None
    if current_user.role == UserRole.DRIVER:
        # A driver only ever sees their own manifest: resolve by the explicit account link,
        # else by an exact (case-insensitive) name match. Never fall back to another driver.
        driver = db.query(Driver).filter(Driver.user_id == current_user.id).first()
        if not driver:
            driver = db.query(Driver).filter(
                func.lower(func.trim(Driver.full_name)) == current_user.full_name.strip().lower()
            ).first()
        if not driver:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No driver record is linked to this account.",
            )
    elif driver_id is not None:
        driver = db.query(Driver).filter(Driver.id == driver_id).first()
    else:
        # Default for supervisor view
        driver = db.query(Driver).first()

    if not driver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver record not found.")

    # 2. Resolve Vehicle & Hub
    vehicle = db.query(Vehicle).filter(Vehicle.id == driver.current_vehicle_id).first() if driver.current_vehicle_id else None
    hub = db.query(Hub).filter(Hub.id == driver.assigned_hub_id).first() if driver.assigned_hub_id else None

    # 3. Resolve Stops
    stops_items: List[DriverStopManifestItem] = []
    if vehicle:
        shipments = (
            db.query(Shipment)
            .filter(
                Shipment.assigned_vehicle_id == vehicle.id,
                Shipment.status.in_([
                    ShipmentStatus.ASSIGNED,
                    ShipmentStatus.IN_TRANSIT,
                    ShipmentStatus.ARRIVED,
                    ShipmentStatus.DELIVERED,
                    ShipmentStatus.FAILED,
                ]),
            )
            .order_by(Shipment.time_window_start.asc(), Shipment.id.asc())
            .all()
        )

        first_pending_found = False
        for idx, shp in enumerate(shipments):
            is_done = shp.status == ShipmentStatus.DELIVERED
            is_failed = shp.status == ShipmentStatus.FAILED
            is_next = False
            if not is_done and not is_failed and not first_pending_found:
                is_next = True
                first_pending_found = True

            stops_items.append(
                DriverStopManifestItem(
                    shipment_id=shp.id,
                    tracking_number=shp.tracking_number,
                    sequence_index=idx + 1,
                    customer_name=shp.customer_name,
                    customer_phone="+91-98200-11223",
                    destination_address=shp.destination_address,
                    latitude=float(shp.latitude or 19.0760),
                    longitude=float(shp.longitude or 72.8777),
                    weight_kg=float(shp.weight_kg),
                    volume_m3=float(shp.volume_m3),
                    time_window_start=shp.time_window_start,
                    time_window_end=shp.time_window_end,
                    priority=shp.priority,
                    status=shp.status,
                    is_next=is_next,
                    is_delivered=is_done,
                    is_failed=is_failed,
                )
            )

    completed = sum(1 for s in stops_items if s.is_delivered)
    pending = len(stops_items) - completed
    sync_raw = f"{driver.id}-{vehicle.id if vehicle else 0}-{len(stops_items)}-{completed}"
    sync_token = hashlib.sha256(sync_raw.encode("utf-8")).hexdigest()[:16]

    return DriverMobileManifestResponse(
        driver_id=driver.id,
        driver_name=driver.full_name,
        vehicle_id=vehicle.id if vehicle else None,
        vehicle_plate=vehicle.plate_number if vehicle else None,
        vehicle_name=vehicle.name if vehicle else None,
        hub_id=hub.id if hub else None,
        hub_name=hub.name if hub else None,
        hub_code=hub.code if hub else None,
        total_stops=len(stops_items),
        completed_stops=completed,
        pending_stops=pending,
        stops=stops_items,
        sync_token=sync_token,
        server_time=datetime.now(timezone.utc).isoformat(),
        offline_cache_ttl_seconds=3600,
    )


@router.post(
    "/driver/offline-sync",
    response_model=DriverOfflineSyncResponse,
    summary="Batch Synchronize Driver Offline Actions (US-008, Week 9)",
    description="Replays queued local actions (Arrive, Deliver, Fail, Delay) recorded when mobile driver was disconnected.",
)
def sync_driver_offline_actions(
    sync_req: DriverOfflineSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.DRIVER, UserRole.ADMIN, UserRole.DISPATCHER])),
) -> DriverOfflineSyncResponse:
    results: List[DriverOfflineSyncResultItem] = []
    applied_count = 0
    failed_count = 0

    for action in sync_req.actions:
        try:
            if action.action_type == DriverOfflineActionType.ARRIVE:
                lat = action.payload.get("latitude")
                lng = action.payload.get("longitude")
                notes = action.payload.get("notes", "Offline queued check-in")
                res = TransitFSMService.arrive_at_stop(
                    db=db,
                    shipment_id=action.shipment_id,
                    actor=current_user,
                    latitude=lat,
                    longitude=lng,
                    notes=notes,
                )
                results.append(
                    DriverOfflineSyncResultItem(
                        action_id=action.action_id,
                        shipment_id=action.shipment_id,
                        action_type=action.action_type.value,
                        success=True,
                        new_status=res.current_status,
                    )
                )
                applied_count += 1

            elif action.action_type == DriverOfflineActionType.DELIVER:
                recipient = action.payload.get("recipient_name", "Authorized Consignee")
                sig = action.payload.get("signature_text", "OFFLINE-SIG")
                notes = action.payload.get("notes", "Offline confirmed delivery")
                res = TransitFSMService.deliver_shipment(
                    db=db,
                    shipment_id=action.shipment_id,
                    actor=current_user,
                    recipient_name=recipient,
                    signature_text=sig,
                    notes=notes,
                )
                results.append(
                    DriverOfflineSyncResultItem(
                        action_id=action.action_id,
                        shipment_id=action.shipment_id,
                        action_type=action.action_type.value,
                        success=True,
                        new_status=res.current_status,
                    )
                )
                applied_count += 1

            elif action.action_type == DriverOfflineActionType.FAIL:
                reason = TransitFailureReason(action.payload.get("reason_code", TransitFailureReason.OTHER.value))
                notes = action.payload.get("notes", "Offline reported failure")
                res = TransitFSMService.fail_delivery(
                    db=db,
                    shipment_id=action.shipment_id,
                    actor=current_user,
                    reason_code=reason,
                    notes=notes,
                )
                results.append(
                    DriverOfflineSyncResultItem(
                        action_id=action.action_id,
                        shipment_id=action.shipment_id,
                        action_type=action.action_type.value,
                        success=True,
                        new_status=res.current_status,
                    )
                )
                applied_count += 1

            elif action.action_type == DriverOfflineActionType.DELAY:
                minutes = int(action.payload.get("delay_minutes", 15))
                reason = action.payload.get("reason", "Offline logged delay")
                res = TransitFSMService.report_delay(
                    db=db,
                    shipment_id=action.shipment_id,
                    actor=current_user,
                    delay_minutes=minutes,
                    reason=reason,
                )
                results.append(
                    DriverOfflineSyncResultItem(
                        action_id=action.action_id,
                        shipment_id=action.shipment_id,
                        action_type=action.action_type.value,
                        success=True,
                        new_status=res.current_status,
                    )
                )
                applied_count += 1

        except Exception as err:
            results.append(
                DriverOfflineSyncResultItem(
                    action_id=action.action_id,
                    shipment_id=action.shipment_id,
                    action_type=action.action_type.value,
                    success=False,
                    error=str(err),
                )
            )
            failed_count += 1

    return DriverOfflineSyncResponse(
        total_actions=len(sync_req.actions),
        applied_count=applied_count,
        failed_count=failed_count,
        results=results,
        synced_at=datetime.now(timezone.utc).isoformat(),
    )
