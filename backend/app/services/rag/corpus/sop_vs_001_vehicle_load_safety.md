---
doc_id: SOP-VS-001
title: Vehicle Load Limits, Cargo Securing and Pre-Trip Inspection
category: VEHICLE_SAFETY
version: 2.4
effective_date: 2026-01-01
references: Motor Vehicles Act 1988 s.113 & s.194 (India, load limits); EN 12195-1 cargo securing; company maintenance manual
---

## §1 Payload and Volume Limits
A vehicle must never be loaded beyond its rated payload (max_payload_kg) or its cargo volume (max_volume_m3). Overloading is illegal, increases braking distance and voids insurance cover. The route optimizer enforces payload and volume capacity as hard constraints, and a route proposal that exceeds either limit is rejected with an OPTIMIZATION_FAILED status.

## §2 Load Distribution and Securing
Heavier items are loaded low and close to the front bulkhead, with weight spread evenly across axles. Every load must be secured with straps, bars or nets rated for the cargo weight so that it cannot shift under braking, cornering or acceleration. Multi-drop loads are sequenced in reverse delivery order so that the first stop's cargo is nearest the door.

## §3 Daily Pre-Trip Inspection
Before the first trip of the day the driver completes a pre-trip inspection in the mobile app covering brakes, tyres (pressure, damage and minimum 3 mm tread depth by company standard), lights and indicators, mirrors, wipers, horn, fluid leaks, cargo securing equipment and the fire extinguisher. Any defect that affects safety makes the vehicle unfit to drive until repaired.

## §4 Defect Reporting and Maintenance Status
Safety-critical defects are reported to the Fleet Manager immediately and the vehicle status is set to MAINTENANCE, which removes it from route optimization. Non-critical defects are logged for repair within 72 hours. Preventive maintenance is scheduled every 10,000 km or 90 days, whichever comes first.

## §5 Electric Vehicle Range Planning
Electric vehicles (EV) are only assigned routes whose total planned distance plus a 20 percent reserve fits within the vehicle's rated range at the current state of charge. EV routes must start with at least 80 percent charge, and a route that cannot be completed within the reserve requires a planned charging stop.
