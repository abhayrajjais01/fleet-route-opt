"""
Demo data seeder for the AI Fleet Route Optimizer.

Seeds the Mumbai - Navi Mumbai - Pune network the web app is built around (the same hubs, vehicles, drivers and
shipments as the frontend's offline demo data), plus the demo sign-in accounts. Idempotent: every record is keyed
by a natural key (email, hub code, plate, licence, tracking number), so running it twice changes nothing.

    python scripts/seed_demo_data.py            # add anything missing
    python scripts/seed_demo_data.py --reset    # DEMO DATABASES ONLY: drop every table, then seed from scratch

Driver profiles are linked to their login accounts (drivers.user_id), so the driver app and the planners agree on
who can see a route. Vikramjit, Priya and Neha also get demo logins; Amit, Suresh and Imran deliberately have none,
so the "no app login" flow can be demonstrated.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal, engine, Base
import app.models  # noqa: F401  (registers every model)
from app.models.user import User, UserRole
from app.models.fleet import Hub, Vehicle, Driver, VehicleType, VehicleStatus, LicenseType, DriverStatus
from app.models.shipment import Shipment, ShipmentStatus, ShipmentPriority
from app.models.audit import AuditLog, AuditAction
from app.core.security import hash_password

DEMO_PASSWORD = "password123"   # demo databases only; production deployments do not run this seeder

USERS = [
    ("admin@fleetopt.io", "Chief Dispatch Officer (Admin)", UserRole.ADMIN),
    ("manager@fleetopt.io", "Regional Fleet Manager", UserRole.FLEET_MANAGER),
    ("dispatcher@fleetopt.io", "Primary Dispatch Operator", UserRole.DISPATCHER),
    ("driver@fleetopt.io", "Rajesh Kumar", UserRole.DRIVER),
    ("vikramjit@fleetopt.io", "Vikramjit Singh", UserRole.DRIVER),
    ("priya@fleetopt.io", "Priya Mehta", UserRole.DRIVER),
    ("neha@fleetopt.io", "Neha Kulkarni", UserRole.DRIVER),
]

HUBS = [
    dict(code="HUB-MUM-01", name="Mumbai Central Depot", address="Plot 45, MIDC, Andheri East, Mumbai", latitude=19.1136, longitude=72.8697,
         contact_phone="+91-22-2820-1100", operating_hours="06:00-22:00"),
    dict(code="HUB-NV-02", name="Navi Mumbai Distribution Center", address="Sector 19, Vashi, Navi Mumbai", latitude=19.0760, longitude=72.9986,
         contact_phone="+91-22-2780-4400", operating_hours="05:00-23:00"),
    dict(code="HUB-PNQ-03", name="Pune Regional Gateway", address="Phase 2, Hinjawadi, Pune", latitude=18.5913, longitude=73.7389,
         contact_phone="+91-20-6710-2200", operating_hours="06:00-22:00"),
]

# (hub code, fields)
VEHICLES = [
    ("HUB-MUM-01", dict(name="Alpha Prime Van", plate_number="MH-02-EE-1001", vehicle_type=VehicleType.VAN, max_payload_kg=1500, max_volume_m3=12,
                        fuel_efficiency_kpl=14.2, current_status=VehicleStatus.IN_TRANSIT)),
    ("HUB-MUM-01", dict(name="Heavy Box Carrier", plate_number="MH-04-AB-2045", vehicle_type=VehicleType.BOX_TRUCK, max_payload_kg=3500, max_volume_m3=24.5,
                        fuel_efficiency_kpl=8.5, current_status=VehicleStatus.IN_TRANSIT)),
    ("HUB-NV-02", dict(name="Eco Cargo Electric", plate_number="MH-01-EV-8822", vehicle_type=VehicleType.EV, max_payload_kg=950, max_volume_m3=8,
                       fuel_efficiency_kpl=18, current_status=VehicleStatus.IN_TRANSIT)),
    ("HUB-PNQ-03", dict(name="Interstate Hauler", plate_number="MH-12-QQ-4001", vehicle_type=VehicleType.SEMI_TRUCK, max_payload_kg=8500, max_volume_m3=55,
                        fuel_efficiency_kpl=5.8, current_status=VehicleStatus.MAINTENANCE)),
    ("HUB-NV-02", dict(name="Metro Box Truck", plate_number="MH-43-BX-3310", vehicle_type=VehicleType.BOX_TRUCK, max_payload_kg=2500, max_volume_m3=18,
                       fuel_efficiency_kpl=9.2, current_status=VehicleStatus.AVAILABLE)),
    ("HUB-NV-02", dict(name="City Runner Van", plate_number="MH-43-CV-7712", vehicle_type=VehicleType.VAN, max_payload_kg=1200, max_volume_m3=10,
                       fuel_efficiency_kpl=13.5, current_status=VehicleStatus.AVAILABLE)),
]

# (hub code, current vehicle plate, login email, fields)
DRIVERS = [
    ("HUB-MUM-01", "MH-02-EE-1001", "driver@fleetopt.io", dict(full_name="Rajesh Kumar", license_number="DL-14-2021-9988", license_type=LicenseType.COMMERCIAL,
                                                               phone_number="+91-98200-11223", status=DriverStatus.ON_TRIP, max_driving_hours_per_day=8, hazmat_endorsed=True)),
    ("HUB-MUM-01", "MH-04-AB-2045", "vikramjit@fleetopt.io", dict(full_name="Vikramjit Singh", license_number="MH04-2015-88319", license_type=LicenseType.CLASS_A,
                                                                  phone_number="+91-98700-44556", status=DriverStatus.ON_TRIP, max_driving_hours_per_day=10)),
    ("HUB-NV-02", None, None, dict(full_name="Amit Patil", license_number="MH01-2020-55441", license_type=LicenseType.CLASS_B,
                                   phone_number="+91-99600-77889", status=DriverStatus.RESTING, max_driving_hours_per_day=8)),
    ("HUB-PNQ-03", None, None, dict(full_name="Suresh Reddy", license_number="KA01-2019-33441", license_type=LicenseType.COMMERCIAL,
                                    phone_number="+91-98450-99887", status=DriverStatus.OFF_DUTY, max_driving_hours_per_day=9, hazmat_endorsed=True)),
    ("HUB-NV-02", "MH-01-EV-8822", "priya@fleetopt.io", dict(full_name="Priya Mehta", license_number="GJ01-2022-12345", license_type=LicenseType.CLASS_B,
                                                             phone_number="+91-97200-55678", status=DriverStatus.ON_TRIP, max_driving_hours_per_day=8)),
    ("HUB-NV-02", None, "neha@fleetopt.io", dict(full_name="Neha Kulkarni", license_number="MH43-2018-77120", license_type=LicenseType.COMMERCIAL,
                                                 phone_number="+91-98190-33445", status=DriverStatus.ON_DUTY, max_driving_hours_per_day=9, hazmat_endorsed=True)),
    ("HUB-NV-02", None, None, dict(full_name="Imran Shaikh", license_number="MH43-2019-55018", license_type=LicenseType.COMMERCIAL,
                                   phone_number="+91-98330-22114", status=DriverStatus.ON_DUTY, max_driving_hours_per_day=9)),
]

P = ShipmentPriority
S = ShipmentStatus
# (hub code, vehicle plate or None, fields)
SHIPMENTS = [
    ("HUB-MUM-01", "MH-04-AB-2045", dict(tracking_number="SHP-001-MUM", customer_name="Reliance Industries", destination_address="Plot C-22, G Block, BKC, Bandra East, Mumbai 400051",
                                         latitude=19.066, longitude=72.865, weight_kg=450, volume_m3=3.2, time_window_start="09:00", time_window_end="12:00", priority=P.HIGH, status=S.IN_TRANSIT)),
    ("HUB-MUM-01", "MH-02-EE-1001", dict(tracking_number="SHP-002-MUM", customer_name="TCS Logistics", destination_address="Hiranandani Business Park, Powai, Mumbai 400076",
                                         latitude=19.1176, longitude=72.906, weight_kg=180, volume_m3=1.5, time_window_start="10:00", time_window_end="14:00", priority=P.STANDARD, status=S.ASSIGNED)),
    ("HUB-NV-02", None, dict(tracking_number="SHP-003-NV", customer_name="Flipkart Supply Chain", destination_address="Sector 11, CBD Belapur, Navi Mumbai 400614",
                             latitude=19.0235, longitude=73.04, weight_kg=920, volume_m3=7.8, time_window_start="08:00", time_window_end="11:00", priority=P.EXPRESS, status=S.UNASSIGNED,
                             hazard_class="3")),   # paints and thinners: flammable liquid, needs a hazmat-endorsed driver
    ("HUB-PNQ-03", None, dict(tracking_number="SHP-004-PNQ", customer_name="Amazon India", destination_address="Paud Road, Kothrud, Pune 411038",
                              latitude=18.5074, longitude=73.8077, weight_kg=640, volume_m3=5.1, time_window_start="11:00", time_window_end="15:00", priority=P.STANDARD, status=S.DELIVERED)),
    ("HUB-MUM-01", "MH-04-AB-2045", dict(tracking_number="SHP-005-MUM", customer_name="HDFC Bank", destination_address="Ramon House, Nariman Point, Mumbai 400021",
                                         latitude=18.9256, longitude=72.8242, weight_kg=120, volume_m3=0.8, time_window_start="09:30", time_window_end="11:00", priority=P.EXPRESS, status=S.IN_TRANSIT)),
    ("HUB-NV-02", "MH-01-EV-8822", dict(tracking_number="SHP-006-NV", customer_name="Reliance Retail", destination_address="Sector 15, Nerul, Navi Mumbai 400706",
                                        latitude=19.033, longitude=73.0297, weight_kg=260, volume_m3=1.9, time_window_start="09:00", time_window_end="12:00", priority=P.STANDARD, status=S.IN_TRANSIT)),
    ("HUB-NV-02", "MH-01-EV-8822", dict(tracking_number="SHP-007-NV", customer_name="DMart Logistics", destination_address="Sector 7, Kharghar, Navi Mumbai 410210",
                                        latitude=19.0473, longitude=73.0699, weight_kg=310, volume_m3=2.4, time_window_start="09:30", time_window_end="10:15", priority=P.HIGH, status=S.ASSIGNED)),
    ("HUB-NV-02", "MH-01-EV-8822", dict(tracking_number="SHP-008-NV", customer_name="Godrej Appliances", destination_address="TTC Industrial Area, Airoli, Navi Mumbai 400708",
                                        latitude=19.159, longitude=72.9986, weight_kg=180, volume_m3=1.2, time_window_start="11:00", time_window_end="15:00", priority=P.STANDARD, status=S.ASSIGNED)),
    ("HUB-MUM-01", "MH-02-EE-1001", dict(tracking_number="SHP-009-MUM", customer_name="Myntra Fulfilment", destination_address="Linking Road, Bandra West, Mumbai 400050",
                                         latitude=19.0596, longitude=72.8295, weight_kg=140, volume_m3=1.1, time_window_start="09:00", time_window_end="12:30", priority=P.HIGH, status=S.IN_TRANSIT)),
    ("HUB-MUM-01", "MH-04-AB-2045", dict(tracking_number="SHP-010-MUM", customer_name="Tata CLiQ", destination_address="Kamala Mills, Lower Parel, Mumbai 400013",
                                         latitude=18.998, longitude=72.83, weight_kg=220, volume_m3=1.6, time_window_start="10:00", time_window_end="13:00", priority=P.STANDARD, status=S.ASSIGNED)),
    ("HUB-MUM-01", "MH-02-EE-1001", dict(tracking_number="SHP-011-MUM", customer_name="Nykaa Warehouse", destination_address="LBS Marg, Ghatkopar West, Mumbai 400086",
                                         latitude=19.086, longitude=72.9081, weight_kg=160, volume_m3=1.0, time_window_start="11:30", time_window_end="16:00", priority=P.LOW, status=S.ASSIGNED)),
]


def seed(reset: bool = False) -> None:
    if reset:
        print("Resetting the demo database (dropping every table)...")
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        users = {}
        for email, name, role in USERS:
            u = db.query(User).filter(User.email == email).first()
            if not u:
                u = User(email=email, hashed_password=hash_password(DEMO_PASSWORD), full_name=name, role=role, is_active=True)
                db.add(u); db.flush()
                print(f"  + User {email} ({role.value})")
            users[email] = u

        hubs = {}
        for h in HUBS:
            hub = db.query(Hub).filter(Hub.code == h["code"]).first()
            if not hub:
                hub = Hub(**h); db.add(hub); db.flush()
                print(f"  + Hub {hub.code}")
            hubs[h["code"]] = hub

        vehicles = {}
        for code, v in VEHICLES:
            veh = db.query(Vehicle).filter(Vehicle.plate_number == v["plate_number"]).first()
            if not veh:
                veh = Vehicle(assigned_hub_id=hubs[code].id, **v); db.add(veh); db.flush()
                print(f"  + Vehicle {veh.plate_number}")
            vehicles[v["plate_number"]] = veh

        for code, plate, email, d in DRIVERS:
            drv = db.query(Driver).filter(Driver.license_number == d["license_number"]).first()
            if not drv:
                drv = Driver(assigned_hub_id=hubs[code].id, current_vehicle_id=vehicles[plate].id if plate else None, **d)
                db.add(drv); db.flush()
                print(f"  + Driver {drv.full_name}")
            if email and drv.user_id is None and not db.query(Driver).filter(Driver.user_id == users[email].id).first():
                drv.user_id = users[email].id     # one profile per account

        shipments = []
        for code, plate, s in SHIPMENTS:
            shp = db.query(Shipment).filter(Shipment.tracking_number == s["tracking_number"]).first()
            if not shp:
                shp = Shipment(hub_id=hubs[code].id, assigned_vehicle_id=vehicles[plate].id if plate else None, **s)
                db.add(shp); db.flush()
                print(f"  + Shipment {shp.tracking_number}")
            shipments.append(shp)

        if not db.query(AuditLog).first():
            admin = users["admin@fleetopt.io"]
            db.add(AuditLog(actor_id=admin.id, actor_name=admin.full_name, actor_role=admin.role.value, action_type=AuditAction.ASSET_CREATED,
                            entity_type="Shipment", entity_id=shipments[0].id, details="Demo network seeded: 3 hubs, 6 vehicles, 7 drivers, 11 shipments"))
        db.commit()
        print("\n[SUCCESS] Demo data ready (Mumbai - Navi Mumbai - Pune network).")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="drop every table first (demo databases only)")
    seed(reset=parser.parse_args().reset)
