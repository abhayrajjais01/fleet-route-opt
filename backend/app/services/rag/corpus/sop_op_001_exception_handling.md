---
doc_id: SOP-OP-001
title: Route Deviation, Breakdown and In-Transit Exception Handling
category: OPERATIONS
version: 3.2
effective_date: 2026-01-01
references: Company dispatch operations manual; PRD product states (ROUTE_BLOCKED, SLA_BREACHED)
---

## §1 Vehicle Breakdown on Route
If a vehicle breaks down, the driver moves it off the carriageway where possible, switches on hazard lights, places warning triangles behind the vehicle and reports the breakdown to dispatch through the mobile app within 15 minutes. Dispatch marks the trip ROUTE_BLOCKED. Completed stops are kept as they are; only the remaining undelivered stops are considered for re-assignment.

## §2 Re-Routing Approval (Human in the Loop)
When a trip is ROUTE_BLOCKED, the AI copilot calls the route optimizer to compute a re-assignment of the remaining stops to available vehicles that respects capacity, time windows and driver hours. The copilot presents the proposal with affected stops, time saved and any constraint violations. The proposal is only applied after the dispatcher explicitly clicks Approve; declined proposals are logged and no state changes.

## §3 Delays and Downstream ETA Recalculation
A driver reports a delay when they expect to arrive at the next stop more than 15 minutes later than planned. When a delay is reported, the ETAs of all downstream stops are recalculated without changing completed stops. If any recalculated ETA falls outside the customer's delivery window, dispatch is alerted and the customer is notified of the new ETA.

## §4 Route Deviations
A route deviation occurs when the vehicle leaves the planned route corridor by more than 2 km or skips a planned stop. Every deviation is recorded in the audit trail with the reason given by the driver (road closure, traffic, customer request or other). Unexplained deviations are reviewed by the Fleet Manager.

## §5 Failed Deliveries
If a delivery cannot be completed (customer absent, address not found, goods refused or damaged), the driver marks the stop FAILED with a reason and photo evidence. Failed shipments return to the hub at the end of the route and re-enter the UNASSIGNED pool for re-delivery on the next planning cycle.
