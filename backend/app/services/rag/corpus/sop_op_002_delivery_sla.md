---
doc_id: SOP-OP-002
title: Delivery Time Windows, Priorities and SLA Commitments
category: OPERATIONS
version: 1.6
effective_date: 2026-01-01
references: Company customer service level agreement (SLA) schedule; OTIF metric definition
---

## §1 Customer Time Windows
Each shipment carries a delivery time window with an opening time and a closing time. Arrival before the window opens means the vehicle waits at the stop; arrival after the window closes is a late delivery. The route optimizer treats the closing time as a hard constraint when building routes.

## §2 Shipment Priority Levels
Shipments have one of four priorities: LOW, STANDARD, HIGH and EXPRESS. EXPRESS shipments must be delivered on the same day and are sequenced before other stops when time windows allow. HIGH priority shipments are next-day with a guaranteed window. When fleet capacity is insufficient, LOW priority shipments are deferred to the next planning cycle first.

## §3 SLA Breach Definition
An SLA breach occurs when the actual delivery timestamp is later than the committed window closing time, or when the shipment is not delivered in full. A breached shipment is automatically flagged SLA_BREACHED and recorded in the audit log. Dispatch must notify the customer before the window closes if a breach is predicted.

## §4 On-Time In-Full (OTIF)
OTIF is the percentage of shipments delivered both within the committed time window and with the complete ordered quantity, with no damage. The company OTIF target is 95 percent per month. OTIF is reported on the executive analytics dashboard per hub, per vehicle type and per driver.

## §5 Proof of Delivery
Every completed delivery requires proof of delivery: recipient name, signature or one-time PIN, timestamp and GPS location captured by the driver app. Deliveries without proof of delivery are not counted as completed for OTIF purposes.
