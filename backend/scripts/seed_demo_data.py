"""Database Seeder Script for AI Fleet Route Optimizer Demo."""
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal, engine, Base
import app.models
from app.models.user import User, UserRole
from app.models.fleet import Hub, Vehicle, Driver, VehicleType, VehicleStatus, LicenseType, DriverStatus
from app.core.security import hash_password


def seed():
    print("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # 1. Seed Demo Users
        users = [
            ("admin@fleetopt.io", "password123", "Chief Dispatch Officer (Admin)", UserRole.ADMIN),
            ("manager@fleetopt.io", "password123", "Regional Fleet Manager", UserRole.FLEET_MANAGER),
            ("dispatcher@fleetopt.io", "password123", "Primary Dispatch Operator", UserRole.DISPATCHER),
            ("driver@fleetopt.io", "password123", "Field Delivery Driver", UserRole.DRIVER),
        ]
        for email, pwd, name, role in users:
            existing = db.query(User).filter(User.email == email).first()
            if not existing:
                u = User(
                    email=email,
                    hashed_password=hash_password(pwd),
                    full_name=name,
                    role=role,
                    is_active=True,
                )
                db.add(u)
                print(f"  + User created: {email} ({role.value})")
        db.commit()

        # 2. Seed Hubs
        hubs_data = [
            {
                "name": "Mumbai Central Distribution Hub",
                "code": "HUB-BOM-01",
                "address": "Andheri East, MIDC Industrial Area, Mumbai, Maharashtra 400069",
                "latitude": 19.1136,
                "longitude": 72.8697,
                "contact_phone": "+91 9876543210",
                "operating_hours": "06:00 - 22:00",
            },
            {
                "name": "Bengaluru Tech Logistics Depot",
                "code": "HUB-BLR-01",
                "address": "Whitefield Export Promotion Zone, Bengaluru, Karnataka 560066",
                "latitude": 12.9698,
                "longitude": 77.7500,
                "contact_phone": "+91 9876543211",
                "operating_hours": "05:30 - 23:00",
            },
            {
                "name": "Delhi NCR Northern Gateway",
                "code": "HUB-DEL-01",
                "address": "Okhla Industrial Estate Phase III, New Delhi 110020",
                "latitude": 28.5355,
                "longitude": 77.2610,
                "contact_phone": "+91 9876543212",
                "operating_hours": "06:00 - 22:00",
            },
        ]
        created_hubs = []
        for h_data in hubs_data:
            existing = db.query(Hub).filter(Hub.code == h_data["code"]).first()
            if not existing:
                h = Hub(**h_data)
                db.add(h)
                db.flush()
                created_hubs.append(h)
                print(f"  + Hub created: {h.name} ({h.code})")
            else:
                created_hubs.append(existing)
        db.commit()

        hub1, hub2, hub3 = created_hubs[0], created_hubs[1], created_hubs[2]

        # 3. Seed Vehicles
        vehicles_data = [
            {
                "name": "Eco Delivery Van Alpha",
                "plate_number": "MH-02-EV-1001",
                "vehicle_type": VehicleType.EV,
                "max_payload_kg": 1200.0,
                "max_volume_m3": 8.5,
                "fuel_efficiency_kpl": 18.0,
                "current_status": VehicleStatus.AVAILABLE,
                "assigned_hub_id": hub1.id,
                "current_latitude": 19.1136,
                "current_longitude": 72.8697,
            },
            {
                "name": "Heavy Freight Titan Semi",
                "plate_number": "MH-04-MJ-2002",
                "vehicle_type": VehicleType.SEMI_TRUCK,
                "max_payload_kg": 15000.0,
                "max_volume_m3": 45.0,
                "fuel_efficiency_kpl": 4.5,
                "current_status": VehicleStatus.AVAILABLE,
                "assigned_hub_id": hub1.id,
                "current_latitude": 19.1140,
                "current_longitude": 72.8700,
            },
            {
                "name": "Express Box Cargo 01",
                "plate_number": "KA-01-BX-3003",
                "vehicle_type": VehicleType.BOX_TRUCK,
                "max_payload_kg": 4500.0,
                "max_volume_m3": 18.0,
                "fuel_efficiency_kpl": 9.2,
                "current_status": VehicleStatus.IN_TRANSIT,
                "assigned_hub_id": hub2.id,
                "current_latitude": 12.9716,
                "current_longitude": 77.5946,
            },
            {
                "name": "Urban Sprinter EV 02",
                "plate_number": "DL-01-EV-4004",
                "vehicle_type": VehicleType.EV,
                "max_payload_kg": 1500.0,
                "max_volume_m3": 10.0,
                "fuel_efficiency_kpl": 16.5,
                "current_status": VehicleStatus.AVAILABLE,
                "assigned_hub_id": hub3.id,
                "current_latitude": 28.5355,
                "current_longitude": 77.2610,
            },
        ]
        created_vehs = []
        for v_data in vehicles_data:
            existing = db.query(Vehicle).filter(Vehicle.plate_number == v_data["plate_number"]).first()
            if not existing:
                v = Vehicle(**v_data)
                db.add(v)
                db.flush()
                created_vehs.append(v)
                print(f"  + Vehicle created: {v.name} ({v.plate_number})")
            else:
                created_vehs.append(existing)
        db.commit()

        # 4. Seed Drivers
        drivers_data = [
            {
                "full_name": "Rajesh Kumar",
                "license_number": "MH-02-2015-0012345",
                "license_type": LicenseType.COMMERCIAL,
                "phone_number": "+91 9811223344",
                "status": DriverStatus.ON_DUTY,
                "max_driving_hours_per_day": 8.0,
                "assigned_hub_id": hub1.id,
                "current_vehicle_id": created_vehs[0].id,
            },
            {
                "full_name": "Anil Reddy",
                "license_number": "KA-01-2018-0098765",
                "license_type": LicenseType.CLASS_A,
                "phone_number": "+91 9822334455",
                "status": DriverStatus.ON_DUTY,
                "max_driving_hours_per_day": 9.0,
                "assigned_hub_id": hub2.id,
                "current_vehicle_id": created_vehs[2].id,
            },
            {
                "full_name": "Vikram Singh",
                "license_number": "DL-04-2019-0054321",
                "license_type": LicenseType.COMMERCIAL,
                "phone_number": "+91 9833445566",
                "status": DriverStatus.OFF_DUTY,
                "max_driving_hours_per_day": 8.0,
                "assigned_hub_id": hub3.id,
                "current_vehicle_id": None,
            },
        ]
        for d_data in drivers_data:
            existing = db.query(Driver).filter(Driver.license_number == d_data["license_number"]).first()
            if not existing:
                d = Driver(**d_data)
                db.add(d)
                print(f"  + Driver created: {d.full_name} ({d.status.value})")
        db.commit()

        print("\n✅ Seed data populated successfully!")

    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding database: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed()
