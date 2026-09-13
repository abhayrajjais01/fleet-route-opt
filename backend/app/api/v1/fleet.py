"""RESTful APIs for Fleet Asset Management (Hubs, Vehicles, Drivers) (US-002)."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.fleet import (
    Hub,
    Vehicle,
    Driver,
    VehicleStatus,
    DriverStatus,
    VehicleType,
)
from app.schemas.fleet import (
    HubCreate,
    HubUpdate,
    HubResponse,
    VehicleCreate,
    VehicleUpdate,
    VehicleResponse,
    DriverCreate,
    DriverUpdate,
    DriverResponse,
    FleetOverviewResponse,
)

router = APIRouter()


# ==================== FLEET OVERVIEW ==================== #
@router.get("/overview", response_model=FleetOverviewResponse, summary="Get fleet aggregated stats")
def get_fleet_overview(db: Session = Depends(get_db)):
    """Returns real-time aggregated metrics of fleet vehicles, drivers, and hubs."""
    total_vehicles = db.query(Vehicle).count()
    available_vehicles = db.query(Vehicle).filter(Vehicle.current_status == VehicleStatus.AVAILABLE).count()
    in_transit_vehicles = db.query(Vehicle).filter(Vehicle.current_status == VehicleStatus.IN_TRANSIT).count()
    maintenance_vehicles = db.query(Vehicle).filter(Vehicle.current_status == VehicleStatus.MAINTENANCE).count()

    total_drivers = db.query(Driver).count()
    on_duty_drivers = db.query(Driver).filter(Driver.status == DriverStatus.ON_DUTY).count()
    total_hubs = db.query(Hub).count()

    total_capacity = db.query(func.sum(Vehicle.max_payload_kg)).scalar() or 0.0

    return {
        "total_vehicles": total_vehicles,
        "available_vehicles": available_vehicles,
        "in_transit_vehicles": in_transit_vehicles,
        "maintenance_vehicles": maintenance_vehicles,
        "total_drivers": total_drivers,
        "on_duty_drivers": on_duty_drivers,
        "total_hubs": total_hubs,
        "fleet_capacity_kg": float(total_capacity),
    }


# ==================== HUBS CRUD ==================== #
@router.get("/hubs", response_model=List[HubResponse], summary="List all hubs")
def list_hubs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return db.query(Hub).offset(skip).limit(limit).all()


@router.post("/hubs", response_model=HubResponse, status_code=status.HTTP_201_CREATED, summary="Create a hub")
def create_hub(
    hub_in: HubCreate,
    db: Session = Depends(get_db),
):
    existing = db.query(Hub).filter(Hub.code == hub_in.code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Hub with code '{hub_in.code}' already exists.",
        )
    hub = Hub(**hub_in.model_dump())
    db.add(hub)
    db.commit()
    db.refresh(hub)
    return hub


@router.get("/hubs/{hub_id}", response_model=HubResponse, summary="Get hub by ID")
def get_hub(hub_id: int, db: Session = Depends(get_db)):
    hub = db.query(Hub).filter(Hub.id == hub_id).first()
    if not hub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hub not found")
    return hub


@router.put("/hubs/{hub_id}", response_model=HubResponse, summary="Update hub")
def update_hub(
    hub_id: int,
    hub_update: HubUpdate,
    db: Session = Depends(get_db),
):
    hub = db.query(Hub).filter(Hub.id == hub_id).first()
    if not hub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hub not found")
    
    update_data = hub_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(hub, field, value)
    
    db.commit()
    db.refresh(hub)
    return hub


@router.delete("/hubs/{hub_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete hub")
def delete_hub(
    hub_id: int,
    db: Session = Depends(get_db),
):
    hub = db.query(Hub).filter(Hub.id == hub_id).first()
    if not hub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hub not found")
    db.delete(hub)
    db.commit()
    return None


# ==================== VEHICLES CRUD ==================== #
@router.get("/vehicles", response_model=List[VehicleResponse], summary="List vehicles with filters")
def list_vehicles(
    status_filter: Optional[VehicleStatus] = Query(None, alias="status"),
    type_filter: Optional[VehicleType] = Query(None, alias="type"),
    hub_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(Vehicle)
    if status_filter:
        query = query.filter(Vehicle.current_status == status_filter)
    if type_filter:
        query = query.filter(Vehicle.vehicle_type == type_filter)
    if hub_id:
        query = query.filter(Vehicle.assigned_hub_id == hub_id)
    return query.offset(skip).limit(limit).all()


@router.post("/vehicles", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED, summary="Create vehicle")
def create_vehicle(
    vehicle_in: VehicleCreate,
    db: Session = Depends(get_db),
):
    hub = db.query(Hub).filter(Hub.id == vehicle_in.assigned_hub_id).first()
    if not hub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned Hub does not exist")
    
    existing = db.query(Vehicle).filter(Vehicle.plate_number == vehicle_in.plate_number).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vehicle with plate '{vehicle_in.plate_number}' already exists.",
        )
    
    vehicle = Vehicle(**vehicle_in.model_dump())
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.get("/vehicles/{vehicle_id}", response_model=VehicleResponse, summary="Get vehicle by ID")
def get_vehicle(vehicle_id: int, db: Session = Depends(get_db)):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    return vehicle


@router.put("/vehicles/{vehicle_id}", response_model=VehicleResponse, summary="Update vehicle")
def update_vehicle(
    vehicle_id: int,
    vehicle_update: VehicleUpdate,
    db: Session = Depends(get_db),
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")

    if vehicle_update.assigned_hub_id is not None:
        hub = db.query(Hub).filter(Hub.id == vehicle_update.assigned_hub_id).first()
        if not hub:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned Hub does not exist")

    update_data = vehicle_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(vehicle, field, value)

    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.delete("/vehicles/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete vehicle")
def delete_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    db.delete(vehicle)
    db.commit()
    return None


# ==================== DRIVERS CRUD ==================== #
@router.get("/drivers", response_model=List[DriverResponse], summary="List drivers with filters")
def list_drivers(
    status_filter: Optional[DriverStatus] = Query(None, alias="status"),
    hub_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(Driver)
    if status_filter:
        query = query.filter(Driver.status == status_filter)
    if hub_id:
        query = query.filter(Driver.assigned_hub_id == hub_id)
    return query.offset(skip).limit(limit).all()


@router.post("/drivers", response_model=DriverResponse, status_code=status.HTTP_201_CREATED, summary="Create driver")
def create_driver(
    driver_in: DriverCreate,
    db: Session = Depends(get_db),
):
    hub = db.query(Hub).filter(Hub.id == driver_in.assigned_hub_id).first()
    if not hub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned Hub does not exist")
    
    existing = db.query(Driver).filter(Driver.license_number == driver_in.license_number).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Driver with license '{driver_in.license_number}' already exists.",
        )
    
    driver = Driver(**driver_in.model_dump())
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return driver


@router.get("/drivers/{driver_id}", response_model=DriverResponse, summary="Get driver by ID")
def get_driver(driver_id: int, db: Session = Depends(get_db)):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")
    return driver


@router.put("/drivers/{driver_id}", response_model=DriverResponse, summary="Update driver")
def update_driver(
    driver_id: int,
    driver_update: DriverUpdate,
    db: Session = Depends(get_db),
):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")

    if driver_update.assigned_hub_id is not None:
        hub = db.query(Hub).filter(Hub.id == driver_update.assigned_hub_id).first()
        if not hub:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned Hub does not exist")

    update_data = driver_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(driver, field, value)

    db.commit()
    db.refresh(driver)
    return driver


@router.delete("/drivers/{driver_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete driver")
def delete_driver(
    driver_id: int,
    db: Session = Depends(get_db),
):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")
    db.delete(driver)
    db.commit()
    return None
