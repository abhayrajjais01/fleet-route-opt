"""
transit_fsm.py - In-Transit Finite State Machine & Telemetry Tracking Service (US-008, Week 6 Track B)

Enforces strict lifecycle state transitions, validates driver check-ins and handovers,
synchronizes vehicle and driver duty states, records forensic audit snapshots, and computes
real-time multi-stop trip execution progress.
"""

from datetime import datetime, timezone
from typing import Dict, Set, Optional, Tuple, Any, List
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.shipment import Shipment, ShipmentStatus
from app.models.fleet import Vehicle, VehicleStatus, Driver, DriverStatus
from app.models.user import User
from app.models.audit import AuditAction
from app.schemas.transit import (
    TransitFailureReason,
    TransitTransitionResponse,
    TripFsmProgressResponse,
    TripStopFsmSummary,
)
from app.services.audit_service import record_audit_event


# ─────────────────────────────────────────────────────────────────────────────
# FSM State Transition Graph (Directional & Strict)
# ─────────────────────────────────────────────────────────────────────────────

VALID_FSM_TRANSITIONS: Dict[ShipmentStatus, Set[ShipmentStatus]] = {
    ShipmentStatus.UNASSIGNED: {
        ShipmentStatus.CLUSTERED,
        ShipmentStatus.ASSIGNED,
    },
    ShipmentStatus.CLUSTERED: {
        ShipmentStatus.ASSIGNED,
        ShipmentStatus.UNASSIGNED,
    },
    ShipmentStatus.ASSIGNED: {
        ShipmentStatus.IN_TRANSIT,
        ShipmentStatus.UNASSIGNED,
    },
    ShipmentStatus.IN_TRANSIT: {
        ShipmentStatus.ARRIVED,
        ShipmentStatus.DELIVERED,
        ShipmentStatus.FAILED,
        ShipmentStatus.ASSIGNED,  # E.g. dispatch recalled before delivery
    },
    ShipmentStatus.ARRIVED: {
        ShipmentStatus.DELIVERED,
        ShipmentStatus.FAILED,
        ShipmentStatus.IN_TRANSIT,  # E.g. driver re-routes or temporary detour
    },
    ShipmentStatus.FAILED: {
        ShipmentStatus.UNASSIGNED,  # Return to depot for re-clustering/re-routing
        ShipmentStatus.ASSIGNED,    # Re-assigned to recovery vehicle
    },
    # Terminal State: DELIVERED cannot transition to any other status
    ShipmentStatus.DELIVERED: set(),
}


class TransitFSMService:
    """
    Finite State Machine controller managing the lifecycle of customer consignments
    and synchronizing fleet telemetry during trip execution.
    """

    @staticmethod
    def validate_transition(current: ShipmentStatus, target: ShipmentStatus) -> None:
        """
        Validates if target state is a permissible transition from current state.
        Raises HTTPException 400 Bad Request if illegal.
        """
        if current == target:
            return

        allowed = VALID_FSM_TRANSITIONS.get(current, set())
        if target not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Illegal FSM transition: Cannot move shipment from '{current.value}' to '{target.value}'. "
                    f"Permissible next states: {[s.value for s in allowed] or ['None (Terminal State)']}"
                ),
            )

    @classmethod
    def depart_shipment(
        cls,
        db: Session,
        shipment_id: int,
        actor: User,
        vehicle_id: Optional[int] = None,
        notes: Optional[str] = None,
    ) -> TransitTransitionResponse:
        """
        Transitions shipment ASSIGNED -> IN_TRANSIT.
        Synchronizes assigned Vehicle status to IN_TRANSIT and Driver to ON_TRIP.
        """
        shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
        if not shipment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")

        # If vehicle_id provided, assign it if unassigned or verify
        if vehicle_id is not None:
            vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
            if not vehicle:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Vehicle {vehicle_id} not found.")
            shipment.assigned_vehicle_id = vehicle_id

        if not shipment.assigned_vehicle_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot depart shipment: No vehicle assigned. Assign a vehicle before departing.",
            )

        target_status = ShipmentStatus.IN_TRANSIT
        cls.validate_transition(shipment.status, target_status)

        old_status = shipment.status
        shipment.status = target_status

        # Synchronize vehicle & driver
        vehicle = db.query(Vehicle).filter(Vehicle.id == shipment.assigned_vehicle_id).first()
        if vehicle and vehicle.current_status == VehicleStatus.AVAILABLE:
            vehicle.current_status = VehicleStatus.IN_TRANSIT

        driver = db.query(Driver).filter(Driver.current_vehicle_id == shipment.assigned_vehicle_id).first()
        if driver and driver.status == DriverStatus.ON_DUTY:
            driver.status = DriverStatus.ON_TRIP

        detail_msg = f"Dispatched for delivery (IN_TRANSIT) with vehicle {vehicle.plate_number if vehicle else shipment.assigned_vehicle_id}"
        if notes:
            detail_msg += f". Notes: {notes}"

        audit_entry = record_audit_event(
            db=db,
            actor=actor,
            action_type=AuditAction.STATUS_CHANGE,
            entity_type="Shipment",
            entity_id=shipment.id,
            details=detail_msg,
            before_state={"status": old_status.value, "vehicle_id": shipment.assigned_vehicle_id},
            after_state={"status": target_status.value, "vehicle_id": shipment.assigned_vehicle_id, "notes": notes},
        )

        db.commit()
        db.refresh(shipment)

        return TransitTransitionResponse(
            shipment_id=shipment.id,
            tracking_number=shipment.tracking_number,
            previous_status=old_status,
            current_status=shipment.status,
            assigned_vehicle_id=shipment.assigned_vehicle_id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            timestamp=datetime.now(timezone.utc),
            details=detail_msg,
            metadata={"notes": notes, "vehicle_id": shipment.assigned_vehicle_id},
        )

    @classmethod
    def arrive_at_stop(
        cls,
        db: Session,
        shipment_id: int,
        actor: User,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        notes: Optional[str] = None,
    ) -> TransitTransitionResponse:
        """
        Transitions shipment IN_TRANSIT -> ARRIVED.
        Records GPS arrival coordinates and timestamp.
        """
        shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
        if not shipment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")

        target_status = ShipmentStatus.ARRIVED
        cls.validate_transition(shipment.status, target_status)

        old_status = shipment.status
        shipment.status = target_status

        gps_info = f" (GPS: {latitude:.4f}, {longitude:.4f})" if latitude and longitude else ""
        detail_msg = f"Driver checked in as ARRIVED at consignee address '{shipment.destination_address}'{gps_info}"
        if notes:
            detail_msg += f". Notes: {notes}"

        record_audit_event(
            db=db,
            actor=actor,
            action_type=AuditAction.STATUS_CHANGE,
            entity_type="Shipment",
            entity_id=shipment.id,
            details=detail_msg,
            before_state={"status": old_status.value},
            after_state={
                "status": target_status.value,
                "checkin_lat": latitude,
                "checkin_lng": longitude,
                "notes": notes,
            },
        )

        db.commit()
        db.refresh(shipment)

        return TransitTransitionResponse(
            shipment_id=shipment.id,
            tracking_number=shipment.tracking_number,
            previous_status=old_status,
            current_status=shipment.status,
            assigned_vehicle_id=shipment.assigned_vehicle_id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            timestamp=datetime.now(timezone.utc),
            details=detail_msg,
            metadata={"checkin_lat": latitude, "checkin_lng": longitude, "notes": notes},
        )

    @classmethod
    def deliver_shipment(
        cls,
        db: Session,
        shipment_id: int,
        recipient_name: str,
        actor: User,
        signature_text: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> TransitTransitionResponse:
        """
        Transitions shipment ARRIVED / IN_TRANSIT -> DELIVERED (Terminal).
        Verifies proof of delivery consignee name and creates permanent handover record.
        """
        shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
        if not shipment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")

        target_status = ShipmentStatus.DELIVERED
        cls.validate_transition(shipment.status, target_status)

        old_status = shipment.status
        shipment.status = target_status

        sig_info = f" (Signature Token: {signature_text})" if signature_text else ""
        detail_msg = f"Delivery completed to recipient '{recipient_name}'{sig_info}"
        if notes:
            detail_msg += f". Handover Notes: {notes}"

        record_audit_event(
            db=db,
            actor=actor,
            action_type=AuditAction.STATUS_CHANGE,
            entity_type="Shipment",
            entity_id=shipment.id,
            details=detail_msg,
            before_state={"status": old_status.value},
            after_state={
                "status": target_status.value,
                "recipient_name": recipient_name,
                "signature": signature_text,
                "notes": notes,
            },
        )

        # Check if all shipments for assigned vehicle are now terminal
        if shipment.assigned_vehicle_id:
            cls._check_vehicle_completion(db, shipment.assigned_vehicle_id)

        db.commit()
        db.refresh(shipment)

        return TransitTransitionResponse(
            shipment_id=shipment.id,
            tracking_number=shipment.tracking_number,
            previous_status=old_status,
            current_status=shipment.status,
            assigned_vehicle_id=shipment.assigned_vehicle_id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            timestamp=datetime.now(timezone.utc),
            details=detail_msg,
            metadata={
                "recipient_name": recipient_name,
                "signature_text": signature_text,
                "notes": notes,
            },
        )

    @classmethod
    def fail_delivery(
        cls,
        db: Session,
        shipment_id: int,
        reason_code: TransitFailureReason,
        notes: str,
        actor: User,
    ) -> TransitTransitionResponse:
        """
        Transitions shipment IN_TRANSIT / ARRIVED -> FAILED.
        Enforces failure reason categorization and diagnostic incident notes.
        """
        shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
        if not shipment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")

        target_status = ShipmentStatus.FAILED
        cls.validate_transition(shipment.status, target_status)

        old_status = shipment.status
        shipment.status = target_status

        detail_msg = f"Delivery attempt failed [{reason_code.value}]: {notes}"

        record_audit_event(
            db=db,
            actor=actor,
            action_type=AuditAction.STATUS_CHANGE,
            entity_type="Shipment",
            entity_id=shipment.id,
            details=detail_msg,
            before_state={"status": old_status.value},
            after_state={
                "status": target_status.value,
                "reason_code": reason_code.value,
                "notes": notes,
            },
        )

        if shipment.assigned_vehicle_id:
            cls._check_vehicle_completion(db, shipment.assigned_vehicle_id)

        db.commit()
        db.refresh(shipment)

        return TransitTransitionResponse(
            shipment_id=shipment.id,
            tracking_number=shipment.tracking_number,
            previous_status=old_status,
            current_status=shipment.status,
            assigned_vehicle_id=shipment.assigned_vehicle_id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            timestamp=datetime.now(timezone.utc),
            details=detail_msg,
            metadata={"reason_code": reason_code.value, "notes": notes},
        )

    @classmethod
    def redispatch_shipment(
        cls,
        db: Session,
        shipment_id: int,
        actor: User,
        notes: Optional[str] = None,
    ) -> TransitTransitionResponse:
        """
        Transitions FAILED or ASSIGNED shipment -> UNASSIGNED.
        Clears assigned vehicle and returns shipment to unrouted pool.
        """
        shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
        if not shipment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")

        target_status = ShipmentStatus.UNASSIGNED
        cls.validate_transition(shipment.status, target_status)

        old_status = shipment.status
        prev_vehicle = shipment.assigned_vehicle_id

        shipment.status = target_status
        shipment.assigned_vehicle_id = None

        detail_msg = f"Redispatched back to unassigned parcel queue from previous status '{old_status.value}'"
        if notes:
            detail_msg += f". Notes: {notes}"

        record_audit_event(
            db=db,
            actor=actor,
            action_type=AuditAction.STATUS_CHANGE,
            entity_type="Shipment",
            entity_id=shipment.id,
            details=detail_msg,
            before_state={"status": old_status.value, "vehicle_id": prev_vehicle},
            after_state={"status": target_status.value, "vehicle_id": None, "notes": notes},
        )

        db.commit()
        db.refresh(shipment)

        return TransitTransitionResponse(
            shipment_id=shipment.id,
            tracking_number=shipment.tracking_number,
            previous_status=old_status,
            current_status=shipment.status,
            assigned_vehicle_id=None,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            timestamp=datetime.now(timezone.utc),
            details=detail_msg,
            metadata={"previous_vehicle_id": prev_vehicle, "notes": notes},
        )

    @classmethod
    def report_delay(
        cls,
        db: Session,
        shipment_id: int,
        delay_minutes: int,
        reason: str,
        actor: User,
    ) -> TransitTransitionResponse:
        """
        Logs a transit delay for an active shipment without breaking FSM state.
        Records delay minutes and cause in the audit log for SLA tracking.
        """
        shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
        if not shipment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")

        if shipment.status not in {ShipmentStatus.ASSIGNED, ShipmentStatus.IN_TRANSIT, ShipmentStatus.ARRIVED}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot report transit delay on shipment with status '{shipment.status.value}'.",
            )

        detail_msg = f"Reported transit delay of +{delay_minutes} mins: {reason}"

        record_audit_event(
            db=db,
            actor=actor,
            action_type=AuditAction.STATUS_CHANGE,
            entity_type="Shipment",
            entity_id=shipment.id,
            details=detail_msg,
            before_state={"status": shipment.status.value},
            after_state={
                "status": shipment.status.value,
                "delay_minutes": delay_minutes,
                "delay_reason": reason,
            },
        )

        db.commit()

        return TransitTransitionResponse(
            shipment_id=shipment.id,
            tracking_number=shipment.tracking_number,
            previous_status=shipment.status,
            current_status=shipment.status,
            assigned_vehicle_id=shipment.assigned_vehicle_id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            timestamp=datetime.now(timezone.utc),
            details=detail_msg,
            metadata={"delay_minutes": delay_minutes, "delay_reason": reason},
        )

    @classmethod
    def get_vehicle_trip_fsm_progress(cls, db: Session, vehicle_id: int) -> TripFsmProgressResponse:
        """
        Calculates real-time multi-stop trip progress for a given vehicle manifest.
        Aggregates stop counts across FSM lifecycle states.
        """
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Vehicle {vehicle_id} not found.")

        driver = db.query(Driver).filter(Driver.current_vehicle_id == vehicle_id).first()

        # Fetch all shipments currently or recently assigned to this vehicle
        shipments = (
            db.query(Shipment)
            .filter(Shipment.assigned_vehicle_id == vehicle_id)
            .order_by(Shipment.id.asc())
            .all()
        )

        total_stops = len(shipments)
        completed_stops = sum(1 for s in shipments if s.status == ShipmentStatus.DELIVERED)
        failed_stops = sum(1 for s in shipments if s.status == ShipmentStatus.FAILED)
        in_transit_stops = sum(1 for s in shipments if s.status == ShipmentStatus.IN_TRANSIT)
        arrived_stops = sum(1 for s in shipments if s.status == ShipmentStatus.ARRIVED)
        pending_stops = sum(1 for s in shipments if s.status in {ShipmentStatus.ASSIGNED, ShipmentStatus.CLUSTERED})

        trip_pct = (completed_stops / total_stops * 100.0) if total_stops > 0 else 0.0

        # Current stop index: first non-terminal stop
        current_idx = 0
        for i, s in enumerate(shipments):
            if s.status not in {ShipmentStatus.DELIVERED, ShipmentStatus.FAILED}:
                current_idx = i
                break
        else:
            current_idx = max(0, total_stops - 1)

        is_active = vehicle.current_status == VehicleStatus.IN_TRANSIT or any(
            s.status in {ShipmentStatus.IN_TRANSIT, ShipmentStatus.ARRIVED, ShipmentStatus.ASSIGNED}
            for s in shipments
        )

        stop_summaries = [
            TripStopFsmSummary(
                id=s.id,
                tracking_number=s.tracking_number,
                customer_name=s.customer_name,
                destination_address=s.destination_address,
                latitude=s.latitude,
                longitude=s.longitude,
                status=s.status,
                priority=s.priority,
                weight_kg=s.weight_kg,
                time_window_start=s.time_window_start,
                time_window_end=s.time_window_end,
                stop_sequence=idx + 1,
            )
            for idx, s in enumerate(shipments)
        ]

        return TripFsmProgressResponse(
            vehicle_id=vehicle.id,
            vehicle_name=vehicle.name,
            plate_number=vehicle.plate_number,
            vehicle_status=vehicle.current_status.value,
            driver_id=driver.id if driver else None,
            driver_name=driver.full_name if driver else None,
            driver_status=driver.status.value if driver else None,
            total_stops=total_stops,
            completed_stops=completed_stops,
            failed_stops=failed_stops,
            in_transit_stops=in_transit_stops,
            arrived_stops=arrived_stops,
            pending_stops=pending_stops,
            current_stop_index=current_idx,
            trip_progress_pct=round(trip_pct, 1),
            is_trip_active=is_active,
            stops=stop_summaries,
        )

    @classmethod
    def _check_vehicle_completion(cls, db: Session, vehicle_id: int) -> None:
        """
        If all shipments assigned to this vehicle are terminal (DELIVERED or FAILED),
        transitions vehicle to AVAILABLE and driver to ON_DUTY.
        """
        remaining = (
            db.query(Shipment)
            .filter(
                Shipment.assigned_vehicle_id == vehicle_id,
                Shipment.status.notin_([ShipmentStatus.DELIVERED, ShipmentStatus.FAILED]),
            )
            .count()
        )
        if remaining == 0:
            vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
            if vehicle and vehicle.current_status == VehicleStatus.IN_TRANSIT:
                vehicle.current_status = VehicleStatus.AVAILABLE

            driver = db.query(Driver).filter(Driver.current_vehicle_id == vehicle_id).first()
            if driver and driver.status == DriverStatus.ON_TRIP:
                driver.status = DriverStatus.ON_DUTY
