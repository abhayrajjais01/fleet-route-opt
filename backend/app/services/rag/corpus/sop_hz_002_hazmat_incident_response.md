---
doc_id: SOP-HZ-002
title: Hazmat Incident, Leak and Spill Response
category: HAZMAT
version: 2.2
effective_date: 2026-01-01
references: 49 CFR 171.15-171.16 (incident reporting); ADR Chapter 5.4 instructions in writing; company HSE manual
---

## §1 Immediate Actions at the Scene
If a hazmat leak, spill, fire or collision occurs, the driver must stop the vehicle in a safe location away from drains and water sources, switch off the engine, activate hazard lights and keep all bystanders upwind and at a safe distance. The driver must not attempt to stop a leak or fight a fire involving the load unless trained and equipped to do so. The driver then calls the 24-hour emergency number listed on the shipping papers and local emergency services.

## §2 Isolation Distances and Evacuation
The initial isolation zone is at least 50 metres in all directions for liquid spills and at least 100 metres for leaking gas cylinders, or larger where the emergency response guide specifies. For a hazmat vehicle on fire, the isolation distance is at least 800 metres in all directions. The driver hands the shipping papers and emergency response information to the first responders on arrival.

## §3 Notification to Dispatch and Route Blocking
The driver must notify dispatch within 15 minutes of any hazmat incident. Dispatch marks the trip as ROUTE_BLOCKED, freezes all remaining stops on that vehicle and asks the AI copilot to propose a re-route of unaffected shipments to other vehicles. No re-route is applied without explicit dispatcher approval. The incident is recorded in the immutable audit log with time, location, UN number and actions taken.

## §4 Regulatory Incident Reporting
Incidents involving a release of hazardous material, injury, evacuation or road closure must be reported to the competent authority within the legal deadline; in the US an immediate telephone notice is required for serious incidents and a written incident report within 30 days. The Safety Manager owns regulatory reporting and the post-incident root cause analysis.

## §5 Post-Incident Vehicle Release
A vehicle involved in a hazmat incident may not be returned to service until it is decontaminated, inspected by maintenance and released in writing by the Safety Manager. The vehicle status is set to MAINTENANCE in the fleet register until release.
