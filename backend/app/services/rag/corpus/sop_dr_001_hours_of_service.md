---
doc_id: SOP-DR-001
title: Driver Hours of Service and Mandatory Rest Breaks
category: DRIVER_REST
version: 4.1
effective_date: 2026-01-01
references: Motor Transport Workers Act 1961 & Motor Vehicles Act 1988 s.91 (India); EU Regulation 561/2006; 49 CFR Part 395 (FMCSA)
---

## §1 Company Rule: Stricter-of Principle
Drivers operate under the strictest of the hours-of-service regimes that apply to the trip. The company limits are: a maximum of 10 hours of driving per day, a maximum on-duty spread of 14 hours, a minimum 30-minute break after 4.5 hours of continuous driving, and a minimum 11 hours of rest between shifts. The route optimizer treats these limits as hard constraints when assigning stops to a driver, and the driver profile field max_driving_hours_per_day may lower but never raise the company daily limit.

## §2 India: Motor Transport Workers Act
Under the Motor Transport Workers Act, 1961, an adult motor transport worker may not be required to work more than 8 hours in a day or 48 hours in a week, and no period of work may exceed 5 hours before an interval for rest of at least half an hour. Overtime beyond these limits must be voluntary, recorded and paid at the overtime rate. Section 91 of the Motor Vehicles Act, 1988 applies these working-hour limits to drivers of transport vehicles.

## §3 European Union: Regulation (EC) 561/2006
For EU trips, daily driving time must not exceed 9 hours, extendable to 10 hours at most twice per week. Weekly driving must not exceed 56 hours and driving across any two consecutive weeks must not exceed 90 hours. After 4.5 hours of driving the driver must take a break of at least 45 minutes, which may be split into 15 minutes followed by 30 minutes. A regular daily rest period is at least 11 hours, which may be reduced to 9 hours no more than three times between weekly rest periods.

## §4 United States: FMCSA Property-Carrying Rules
For US trips, a property-carrying driver may drive at most 11 hours after 10 consecutive hours off duty and may not drive beyond the 14th consecutive hour after coming on duty. A 30-minute break is required after 8 cumulative hours of driving. Drivers may not drive after 60 hours on duty in 7 consecutive days or 70 hours in 8 consecutive days; a restart of 34 or more consecutive hours off duty resets the weekly limit.

## §5 Recording, Monitoring and Violations
Driving and rest time is recorded by the electronic logging device or tachograph and synchronised with the driver mobile app. Dispatch receives an alert when a driver is within 30 minutes of a driving limit. A driver who would exceed a limit to complete a route must stop at the next safe location; the remaining stops are re-assigned through the copilot re-route proposal workflow. Hours-of-service violations are logged in the audit trail and reviewed by the Fleet Manager; repeated violations lead to suspension from dispatch.
