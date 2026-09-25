"""
shipments.py - RESTful CRUD APIs for Shipment Orders (US-002 & US-008)
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.user import User, UserRole
from app.models.shipment import Shipment, ShipmentStatus, ShipmentPriority
from app.models.fleet import Hub
from app.models.audit import AuditAction
from app.schemas.shipment import (
    ShipmentCreate,
    ShipmentUpdate,
    ShipmentStatusUpdate,
    ShipmentResponse,
)
from app.services.audit_service import record_audit_event

router = APIRouter()


@router.get("", response_model=List[ShipmentResponse])
def list_shipments(
    hub_id: Optional[int] = Query(None, description="Filter by origin hub ID"),
    status: Optional[ShipmentStatus] = Query(None, description="Filter by shipment status"),
    priority: Optional[ShipmentPriority] = Query(None, description="Filter by priority"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List shipments with optional filtering by origin hub, operational status, or priority.
    Accessible to all authenticated roles (Admin, Fleet Manager, Dispatcher, Driver).
    """
    query = db.query(Shipment)
    if hub_id is not None:
        query = query.filter(Shipment.hub_id == hub_id)
    if status is not None:
        query = query.filter(Shipment.status == status)
    if priority is not None:
        query = query.filter(Shipment.priority == priority)

    return query.order_by(Shipment.id.desc()).offset(skip).limit(limit).all()


@router.post("", response_model=ShipmentResponse, status_code=status.HTTP_201_CREATED)
def create_shipment(
    payload: ShipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER, UserRole.DISPATCHER])),
):
    """
    Create a new shipment consignment.
    Requires ADMIN, FLEET_MANAGER, or DISPATCHER privileges.
    Verifies that the referenced hub exists and logs an immutable audit event.
    """
    # Verify Hub existence
    hub = db.query(Hub).filter(Hub.id == payload.hub_id).first()
    if not hub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Origin hub with ID {payload.hub_id} not found."
        )

    # Check tracking number uniqueness
    existing = db.query(Shipment).filter(Shipment.tracking_number == payload.tracking_number).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Shipment with tracking number '{payload.tracking_number}' already exists."
        )

    shipment = Shipment(**payload.model_dump())
    db.add(shipment)
    db.flush()

    # Record Audit Event
    record_audit_event(
        db=db,
        actor=current_user,
        action_type=AuditAction.ASSET_CREATED,
        entity_type="Shipment",
        entity_id=shipment.id,
        details=f"Created shipment {shipment.tracking_number} for customer '{shipment.customer_name}' at Hub {shipment.hub_id}",
        after_state={
            "tracking_number": shipment.tracking_number,
            "customer_name": shipment.customer_name,
            "weight_kg": shipment.weight_kg,
            "volume_m3": shipment.volume_m3,
            "priority": shipment.priority.value,
            "status": shipment.status.value,
        },
    )

    db.commit()
    db.refresh(shipment)
    return shipment


@router.get("/{shipment_id}", response_model=ShipmentResponse)
def get_shipment(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve detailed metadata for a specific shipment by ID."""
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")
    return shipment


@router.patch("/{shipment_id}/status", response_model=ShipmentResponse)
def update_shipment_status(
    shipment_id: int,
    payload: ShipmentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER, UserRole.DISPATCHER, UserRole.DRIVER])),
):
    """
    Transition shipment operational state (e.g. UNASSIGNED -> ASSIGNED -> IN_TRANSIT -> DELIVERED).
    Permitted for all roles including DRIVER (for live mobile trip completion updates).
    Automatically logs an immutable audit event with before and after state snapshots.
    """
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")

    old_status = shipment.status.value
    shipment.status = payload.status

    reason_detail = f": {payload.notes}" if payload.notes else ""
    record_audit_event(
        db=db,
        actor=current_user,
        action_type=AuditAction.STATUS_CHANGE,
        entity_type="Shipment",
        entity_id=shipment.id,
        details=f"Status transitioned from {old_status} to {payload.status.value}{reason_detail}",
        before_state={"status": old_status},
        after_state={"status": payload.status.value, "notes": payload.notes},
    )

    db.commit()
    db.refresh(shipment)
    return shipment


@router.delete("/{shipment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shipment(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER])),
):
    """Delete a shipment consignment. Restricted to ADMIN and FLEET_MANAGER."""
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")

    record_audit_event(
        db=db,
        actor=current_user,
        action_type=AuditAction.ASSET_DELETED,
        entity_type="Shipment",
        entity_id=shipment.id,
        details=f"Deleted shipment {shipment.tracking_number} (Customer: {shipment.customer_name})",
        before_state={"tracking_number": shipment.tracking_number, "status": shipment.status.value},
    )

    db.delete(shipment)
    db.commit()
    return None
