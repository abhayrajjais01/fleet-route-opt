"""
dispatch_plan.py - Saving dispatches and re-routes

One plan change (a dispatch, a re-sequence, an accepted copilot proposal) touches shipments, vehicles and drivers
together, so it is saved in one transaction or not at all. Every item carries what the dispatcher was looking at
("expected"); if someone else has changed it meanwhile the whole change is refused (409) instead of overwriting them.

Safety rules are checked on the result: no shipment on an out-of-service vehicle, nothing dispatched without exactly
one driver, hazmat segregation and endorsement (the route planner's own rules, SOP-HZ-001).
"""

from __future__ import annotations

from typing import Dict, List

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.audit import AuditAction
from app.models.fleet import Driver, DriverStatus, Vehicle, VehicleStatus
from app.models.shipment import Shipment, ShipmentStatus
from app.models.user import User
from app.schemas.shipment import PlanChange
from app.services.audit_service import record_audit_event
from app.services.optimizer.hazmat import needs_endorsed_driver, segregation_conflict

ACTIVE = (ShipmentStatus.ASSIGNED, ShipmentStatus.IN_TRANSIT, ShipmentStatus.ARRIVED)
CLOSED = (ShipmentStatus.DELIVERED, ShipmentStatus.FAILED)


def _conflict(message: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, message)


def _invalid(message: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, message)


def _load(db: Session, model, ids: List[int], what: str) -> Dict[int, object]:
    if len(ids) != len(set(ids)):
        raise _invalid(f"The same {what} appears twice in this change.")
    # Locked in id order (PostgreSQL), so two dispatchers saving at once queue up instead of interleaving.
    rows = {r.id: r for r in db.query(model).filter(model.id.in_(ids)).order_by(model.id).with_for_update().populate_existing().all()} if ids else {}
    missing = [i for i in ids if i not in rows]
    if missing:
        raise _conflict(f"This {what} no longer exists (id {missing[0]}). Refresh and try again.")
    return rows


def apply_plan(db: Session, change: PlanChange, actor: User) -> List[Shipment]:
    try:
        shipments = _apply(db, change, actor)
        db.commit()
    except Exception:
        db.rollback()
        raise
    for s in shipments:
        db.refresh(s)
    return shipments


def _apply(db: Session, change: PlanChange, actor: User) -> List[Shipment]:
    shipments = _load(db, Shipment, [c.id for c in change.shipments], "shipment")
    vehicles = _load(db, Vehicle, [c.id for c in change.vehicles], "vehicle")
    drivers = _load(db, Driver, [c.id for c in change.drivers], "driver")

    # ── 1. Nothing may have changed since the dispatcher looked ──
    stale = [shipments[c.id].tracking_number for c in change.shipments
             if (shipments[c.id].status, shipments[c.id].assigned_vehicle_id) != (c.expected_status, c.expected_vehicle_id)]
    stale += [vehicles[c.id].plate_number for c in change.vehicles if vehicles[c.id].current_status != c.expected_status]
    stale += [drivers[c.id].full_name for c in change.drivers
              if (drivers[c.id].status, drivers[c.id].current_vehicle_id) != (c.expected_status, c.expected_vehicle_id)]
    if stale:
        raise _conflict(f"Someone else has changed {', '.join(stale[:4])}{' and more' if len(stale) > 4 else ''}. "
                        "Nothing was saved. The latest plan has been loaded; please check it and try again.")

    # ── 2. Vehicles and drivers ──
    for c in change.vehicles:
        v = vehicles[c.id]
        if v.current_status == VehicleStatus.DECOMMISSIONED:
            raise _invalid(f"{v.plate_number} is decommissioned.")
        if c.current_status != v.current_status:
            before = v.current_status.value
            v.current_status = c.current_status
            record_audit_event(db, actor, AuditAction.ASSET_UPDATED, "Vehicle", v.id, f"{v.plate_number}: {before} to {v.current_status.value} ({change.reason})",
                               {"current_status": before}, {"current_status": v.current_status.value})
    for c in change.drivers:
        d = drivers[c.id]
        if c.status == DriverStatus.ON_TRIP and d.status not in (DriverStatus.ON_DUTY, DriverStatus.ON_TRIP):
            raise _invalid(f"{d.full_name} is {d.status.value.replace('_', ' ').lower()} and can't be dispatched.")
        if c.status == DriverStatus.ON_TRIP and d.user_id is not None:
            account = db.get(User, d.user_id)
            if account is not None and not account.is_active:
                raise _invalid(f"{d.full_name}'s account is deactivated, so they can't be dispatched.")
        before = {"status": d.status.value, "vehicle_id": d.current_vehicle_id}
        d.status, d.current_vehicle_id = c.status, c.current_vehicle_id
        after = {"status": d.status.value, "vehicle_id": d.current_vehicle_id}
        if before != after:
            record_audit_event(db, actor, AuditAction.ASSET_UPDATED, "Driver", d.id, f"{d.full_name} reassigned ({change.reason})", before, after)

    # ── 3. Shipments ──
    gained = set()
    for c in change.shipments:
        s = shipments[c.id]
        if s.status in CLOSED:
            raise _conflict(f"{s.tracking_number} is already {s.status.value.lower()} and can't be re-planned.")
        if c.status not in (s.status, ShipmentStatus.ASSIGNED, ShipmentStatus.UNASSIGNED):
            raise _invalid(f"A plan can't mark {s.tracking_number} {c.status.value.replace('_', ' ').lower()}.")
        on_vehicle = c.status in ACTIVE
        if on_vehicle != (c.assigned_vehicle_id is not None):
            raise _invalid(f"{s.tracking_number}: a planned shipment needs a vehicle, and an unplanned one must not have one.")
        if on_vehicle and (c.assigned_vehicle_id != s.assigned_vehicle_id or s.status not in ACTIVE):
            gained.add(c.assigned_vehicle_id)
        before = {"status": s.status.value, "vehicle_id": s.assigned_vehicle_id, "route_sequence": s.route_sequence}
        s.status, s.assigned_vehicle_id = c.status, c.assigned_vehicle_id
        s.route_sequence = c.route_sequence if on_vehicle else None
        s.dispatch_time = c.dispatch_time if on_vehicle else None
        after = {"status": s.status.value, "vehicle_id": s.assigned_vehicle_id, "route_sequence": s.route_sequence}
        if before != after:
            moved = before["vehicle_id"] != after["vehicle_id"] or before["status"] != after["status"]
            action = (AuditAction.DISPATCH_APPROVED if before["status"] in ("UNASSIGNED", "CLUSTERED") else AuditAction.STATUS_CHANGE) if moved else AuditAction.ROUTE_MODIFIED
            record_audit_event(db, actor, action, "Shipment", s.id, f"{s.tracking_number}: {change.reason}", before, after)
    db.flush()

    # ── 4. The resulting plan must be safe ──
    for vid in sorted(gained):
        v = db.get(Vehicle, vid)
        if v is None:
            raise _conflict("That vehicle no longer exists. Refresh and try again.")
        if v.current_status in (VehicleStatus.MAINTENANCE, VehicleStatus.DECOMMISSIONED):
            raise _invalid(f"{v.plate_number} is {v.current_status.value.lower()} and can't take shipments.")
        crew = db.query(Driver).filter(Driver.current_vehicle_id == vid, Driver.status.in_([DriverStatus.ON_DUTY, DriverStatus.ON_TRIP])).all()
        if not crew:
            raise _invalid(f"{v.plate_number} has no driver. Assign a driver before dispatching it.")
        if len(crew) > 1:
            raise _conflict(f"{v.plate_number} already has a driver ({', '.join(sorted(d.full_name for d in crew))}). Nothing was saved.")
        load = db.query(Shipment).filter(Shipment.assigned_vehicle_id == vid, Shipment.status.in_(ACTIVE)).all()
        classes = [s.hazard_class for s in load]
        problem = segregation_conflict(classes)
        if problem:
            raise _invalid(f"{v.plate_number}: {problem}.")
        if needs_endorsed_driver(classes) and not crew[0].hazmat_endorsed:
            raise _invalid(f"{v.plate_number} carries dangerous goods, and {crew[0].full_name} has no hazmat endorsement (SOP-HZ-001 §2).")

    # A driver can't be taken off a truck that still has stops to serve.
    for c in change.drivers:
        left = c.expected_vehicle_id
        if left is None or left == c.current_vehicle_id:
            continue
        if db.query(Driver).filter(Driver.current_vehicle_id == left, Driver.status.in_([DriverStatus.ON_DUTY, DriverStatus.ON_TRIP])).first():
            continue
        waiting = db.query(Shipment).filter(Shipment.assigned_vehicle_id == left, Shipment.status.in_(ACTIVE)).count()
        if waiting:
            v = db.get(Vehicle, left)
            raise _invalid(f"{drivers[c.id].full_name} is on {v.plate_number}, which still has {waiting} stop{'s' if waiting != 1 else ''} to serve.")
    return list(shipments.values())
