"""
policy_agent.py - Multi-Agent Regulatory Policy & Compliance Agent (US-006)
Track B (Abhayraj Jaiswal) Week 8 Deliverable

Implements:
1. Automated route, driver, and manifest compliance validation against verified logistics SOPs:
   - Driver Hours of Service (HOS): Motor Transport Workers Act & Regulation (EC) 561/2006 (SOP-DR-001 §2)
   - Hazardous Materials (Hazmat) segregation & driver certification standards (SOP-HZ-001 §2, §5)
   - Cold Chain temperature-controlled cargo handling & transit windows (SOP-CC-001 §1, §5)
   - Vehicle Gross Payload & Volume capacity constraints (SOP-VS-001 §1)
2. Automated violation detection with structured rule references, severity, and remediation guidance.
3. LangGraph node integration: Intent -> Policy Check -> Citation Synthesis -> Action Proposal.
"""

from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.models.fleet import Driver, DriverStatus, LicenseType, Vehicle, VehicleStatus, VehicleType
from app.models.shipment import Shipment, ShipmentPriority, ShipmentStatus
from app.schemas.copilot import (
    PolicyViolation,
    SOPRuleCitation,
    PolicyComplianceReport,
    ViolationSeverity,
)

# Pre-indexed rule citations directly referencing verified knowledge base clauses
SOP_RULES = {
    "HOS_SHIFT_LIMIT": SOPRuleCitation(
        sop_doc_id="SOP-DR-001",
        sop_title="Driver Hours of Service and Mandatory Rest Breaks",
        section_number="§2",
        clause_heading="India: Motor Transport Workers Act",
        standard_reference="Motor Transport Workers Act 1961, Sec 13 / 15",
        clause_summary="Daily driving hours must not exceed 8 hours per day. Continuous driving without a rest break must not exceed 5 hours.",
    ),
    "HAZMAT_CERTIFICATION": SOPRuleCitation(
        sop_doc_id="SOP-HZ-001",
        sop_title="Hazardous Materials (Dangerous Goods) Transport Policy",
        section_number="§2",
        clause_heading="Driver Qualification and Training",
        standard_reference="Central Motor Vehicles Rules (CMVR) Rule 131/132",
        clause_summary="Drivers transporting dangerous goods or hazardous materials must hold a commercial driving licence with a verified Hazmat endorsement.",
    ),
    "HAZMAT_SEGREGATION": SOPRuleCitation(
        sop_doc_id="SOP-HZ-001",
        sop_title="Hazardous Materials (Dangerous Goods) Transport Policy",
        section_number="§5",
        clause_heading="Segregation and Co-Loading of Incompatible Classes",
        standard_reference="UN Model Regulations on the Transport of Dangerous Goods",
        clause_summary="Flammable liquids (Class 3) and corrosives (Class 8) must never be loaded into the same compartment without chemical segregation barriers.",
    ),
    "COLD_CHAIN_WINDOW": SOPRuleCitation(
        sop_doc_id="SOP-CC-001",
        sop_title="Cold Chain and Temperature-Controlled Cargo Handling",
        section_number="§5",
        clause_heading="Route Planning for Cold Chain",
        standard_reference="WHO Technical Report Series No. 961, Annex 9",
        clause_summary="Temperature-sensitive cargo (vaccines, biologics, dairy) must be routed to complete delivery within the validated 4-hour ambient holdover window.",
    ),
    "VEHICLE_OVERLOAD": SOPRuleCitation(
        sop_doc_id="SOP-VS-001",
        sop_title="Vehicle Load Limits, Cargo Securing and Pre-Trip Inspection",
        section_number="§1",
        clause_heading="Payload and Volume Limits",
        standard_reference="Motor Vehicles Act Sec 113 / 114",
        clause_summary="Total shipment payload and volume must never exceed the registered gross vehicle payload (kg) or volumetric capacity (m³).",
    ),
}


# Hazard-class pairs that SOP-HZ-001 §5 forbids in the same load (main UN class, order-free).
INCOMPATIBLE_HAZARD_CLASSES = {frozenset({"3", "8"})}


class UnresolvedManifestError(ValueError):
    """Raised when the manifest references vehicles, drivers or shipments that do not exist."""


def _main_hazard_class(hazard_class: str) -> str:
    return hazard_class.strip().split(".")[0]


class PolicyComplianceAgent:
    """
    Autonomous Compliance & Regulatory Verification Agent.
    Evaluates proposed routes and manifests against fleet labor rules,
    hazmat co-loading laws, cold chain holdover limits, and vehicle payload bounds.
    """

    @classmethod
    def evaluate_manifest(
        cls,
        db: Session,
        vehicle_id: int,
        driver_id: Optional[int],
        shipment_ids: List[int],
        estimated_duration_minutes: float = 0.0,
    ) -> PolicyComplianceReport:
        from datetime import datetime, timezone

        violations: List[PolicyViolation] = []
        cited_rules: List[SOPRuleCitation] = []
        recommendations: List[str] = []

        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
        driver = db.query(Driver).filter(Driver.id == driver_id).first() if driver_id is not None else None
        shipments = db.query(Shipment).filter(Shipment.id.in_(shipment_ids)).all() if shipment_ids else []

        # Never certify a manifest we could not fully resolve.
        unresolved: List[str] = []
        if not vehicle:
            unresolved.append(f"vehicle {vehicle_id}")
        if driver_id is not None and not driver:
            unresolved.append(f"driver {driver_id}")
        missing_shipments = sorted(set(shipment_ids) - {s.id for s in shipments})
        if missing_shipments:
            unresolved.append("shipment(s) " + ", ".join(str(i) for i in missing_shipments))
        if unresolved:
            raise UnresolvedManifestError("Unknown " + "; ".join(unresolved) + ".")

        # Without a driver the HOS and hazmat-endorsement checks cannot run, so the
        # evaluation is incomplete and the manifest cannot be reported compliant.
        skipped_checks: List[str] = []
        if driver is None:
            skipped_checks.append("Driver hours of service (no driver assigned)")

        # ----------------------------------------------------
        # 1. Driver Hours-of-Service (HOS) Checks
        # ----------------------------------------------------
        if driver:
            max_allowed_hours = driver.max_driving_hours_per_day or 8.0
            max_allowed_minutes = max_allowed_hours * 60.0

            # Check route duration against daily shift ceiling
            if estimated_duration_minutes > max_allowed_minutes:
                rule = SOP_RULES["HOS_SHIFT_LIMIT"]
                cited_rules.append(rule)
                excess_min = round(estimated_duration_minutes - max_allowed_minutes)
                violations.append(
                    PolicyViolation(
                        rule_code="HOS_SHIFT_EXCEEDED",
                        sop_doc_id=rule.sop_doc_id,
                        sop_section=rule.section_number,
                        sop_heading=rule.clause_heading,
                        severity=ViolationSeverity.HIGH,
                        description=(
                            f"Driver {driver.full_name} is assigned a route duration of {estimated_duration_minutes/60:.1f}h, "
                            f"exceeding their certified daily maximum shift limit of {max_allowed_hours:.1f}h by {excess_min} min."
                        ),
                        remediation="Split route stops or reassign a rested secondary driver with available duty hours.",
                        impacted_entity_type="Driver",
                        impacted_entity_id=driver.id,
                    )
                )
                recommendations.append(f"Reassign route to a driver with at least {estimated_duration_minutes/60:.1f} available duty hours.")

            # Check continuous driving limit (5 hours / 300 minutes without mandatory break)
            if estimated_duration_minutes > 300.0:
                rule = SOP_RULES["HOS_SHIFT_LIMIT"]
                if rule not in cited_rules:
                    cited_rules.append(rule)
                violations.append(
                    PolicyViolation(
                        rule_code="HOS_CONTINUOUS_DRIVE_EXCEEDED",
                        sop_doc_id=rule.sop_doc_id,
                        sop_section=rule.section_number,
                        sop_heading=rule.clause_heading,
                        severity=ViolationSeverity.MEDIUM,
                        description=(
                            f"Route duration of {estimated_duration_minutes:.0f} min exceeds the 300-minute continuous driving "
                            "threshold without a mandatory 30-minute rest stop."
                        ),
                        remediation="Insert a mandatory 30-minute rest waypoint after the 4th hour of driving.",
                        impacted_entity_type="Driver",
                        impacted_entity_id=driver.id,
                    )
                )

        # ----------------------------------------------------
        # 2. Vehicle Capacity & Payload Checks
        # ----------------------------------------------------
        if vehicle:
            total_weight = sum(s.weight_kg for s in shipments)
            total_volume = sum(s.volume_m3 for s in shipments)

            if total_weight > vehicle.max_payload_kg:
                rule = SOP_RULES["VEHICLE_OVERLOAD"]
                cited_rules.append(rule)
                overload_kg = round(total_weight - vehicle.max_payload_kg, 1)
                violations.append(
                    PolicyViolation(
                        rule_code="PAYLOAD_CAPACITY_EXCEEDED",
                        sop_doc_id=rule.sop_doc_id,
                        sop_section=rule.section_number,
                        sop_heading=rule.clause_heading,
                        severity=ViolationSeverity.CRITICAL,
                        description=(
                            f"Assigned payload ({total_weight:.1f} kg) exceeds vehicle {vehicle.plate_number} "
                            f"maximum capacity of {vehicle.max_payload_kg:.1f} kg by {overload_kg} kg."
                        ),
                        remediation="Offload heavy shipments to a secondary vehicle to eliminate structural overload hazard.",
                        impacted_entity_type="Vehicle",
                        impacted_entity_id=vehicle.id,
                    )
                )
                recommendations.append(f"Remove at least {overload_kg} kg from vehicle {vehicle.plate_number}.")

            if total_volume > vehicle.max_volume_m3:
                rule = SOP_RULES["VEHICLE_OVERLOAD"]
                if rule not in cited_rules:
                    cited_rules.append(rule)
                over_vol = round(total_volume - vehicle.max_volume_m3, 2)
                violations.append(
                    PolicyViolation(
                        rule_code="VOLUME_CAPACITY_EXCEEDED",
                        sop_doc_id=rule.sop_doc_id,
                        sop_section=rule.section_number,
                        sop_heading=rule.clause_heading,
                        severity=ViolationSeverity.HIGH,
                        description=(
                            f"Assigned volume ({total_volume:.2f} m³) exceeds vehicle {vehicle.plate_number} "
                            f"cargo box capacity of {vehicle.max_volume_m3:.2f} m³ by {over_vol} m³."
                        ),
                        remediation="Reassign volumetric oversized parcels to a Box Truck or Semi-Truck.",
                        impacted_entity_type="Vehicle",
                        impacted_entity_id=vehicle.id,
                    )
                )

        # ----------------------------------------------------
        # 3. Hazmat & Dangerous Goods Verification
        # ----------------------------------------------------
        hazmat_shipments = [s for s in shipments if s.hazard_class and s.hazard_class.strip()]

        if hazmat_shipments:
            rule_hz = SOP_RULES["HAZMAT_CERTIFICATION"]
            cited_rules.append(rule_hz)
            if driver is None:
                skipped_checks.append("Hazmat driver endorsement (no driver assigned)")
            elif not driver.hazmat_endorsed:
                violations.append(
                    PolicyViolation(
                        rule_code="HAZMAT_DRIVER_UNENDORSED",
                        sop_doc_id=rule_hz.sop_doc_id,
                        sop_section=rule_hz.section_number,
                        sop_heading=rule_hz.clause_heading,
                        severity=ViolationSeverity.CRITICAL,
                        description=(
                            f"Driver {driver.full_name} has no verified hazardous-goods endorsement on record, but the manifest "
                            f"contains {len(hazmat_shipments)} dangerous-goods consignment(s) "
                            f"(UN class {', '.join(sorted({s.hazard_class for s in hazmat_shipments}))})."
                        ),
                        remediation="Assign a driver with a verified Hazmat endorsement and training certificate (CMVR 131).",
                        impacted_entity_type="Driver",
                        impacted_entity_id=driver.id,
                    )
                )
                recommendations.append("Assign a Hazmat-endorsed driver to this manifest.")

            # Co-loading: incompatible classes may not share the vehicle (SOP-HZ-001 §5)
            by_class: Dict[str, List[Shipment]] = {}
            for s in hazmat_shipments:
                by_class.setdefault(_main_hazard_class(s.hazard_class), []).append(s)
            for pair in INCOMPATIBLE_HAZARD_CLASSES:
                a, b = sorted(pair)
                if a in by_class and b in by_class:
                    rule_seg = SOP_RULES["HAZMAT_SEGREGATION"]
                    if rule_seg not in cited_rules:
                        cited_rules.append(rule_seg)
                    violations.append(
                        PolicyViolation(
                            rule_code="HAZMAT_INCOMPATIBLE_COLOAD",
                            sop_doc_id=rule_seg.sop_doc_id,
                            sop_section=rule_seg.section_number,
                            sop_heading=rule_seg.clause_heading,
                            severity=ViolationSeverity.CRITICAL,
                            description=(
                                f"Class {a} consignment(s) ({', '.join(x.tracking_number for x in by_class[a])}) are loaded with "
                                f"Class {b} consignment(s) ({', '.join(x.tracking_number for x in by_class[b])}), which must not share a load."
                            ),
                            remediation=f"Move the Class {a} or Class {b} consignments to a separate vehicle.",
                            impacted_entity_type="Shipment",
                            impacted_entity_id=by_class[b][0].id,
                        )
                    )
                    recommendations.append(f"Split Class {a} and Class {b} dangerous goods onto separate vehicles.")

        # ----------------------------------------------------
        # 4. Cold Chain & Holdover Window Verification
        # ----------------------------------------------------
        cold_chain_shipments = [
            s for s in shipments
            if any(term in (s.destination_address + " " + s.customer_name).lower() for term in ["hospital", "vaccine", "biotech", "dairy", "frozen", "blood"])
        ]

        if cold_chain_shipments:
            rule_cc = SOP_RULES["COLD_CHAIN_WINDOW"]
            cited_rules.append(rule_cc)
            if estimated_duration_minutes > 240.0:  # 4 hours
                violations.append(
                    PolicyViolation(
                        rule_code="COLD_CHAIN_HOLDOVER_EXCEEDED",
                        sop_doc_id=rule_cc.sop_doc_id,
                        sop_section=rule_cc.section_number,
                        sop_heading=rule_cc.clause_heading,
                        severity=ViolationSeverity.CRITICAL,
                        description=(
                            f"Manifest contains {len(cold_chain_shipments)} temperature-sensitive consignment(s), but route duration "
                            f"is {estimated_duration_minutes/60:.1f}h, exceeding the mandatory 4.0h passive holdover limit."
                        ),
                        remediation="Resequence cold chain stops to the beginning of the manifest or deploy an active reefer unit.",
                        impacted_entity_type="Shipment",
                        impacted_entity_id=cold_chain_shipments[0].id,
                    )
                )
                recommendations.append("Prioritize cold chain stops within the first 180 minutes of departure.")

        # Calculate composite compliance score
        deductions = sum({
            ViolationSeverity.CRITICAL: 35.0,
            ViolationSeverity.HIGH: 18.0,
            ViolationSeverity.MEDIUM: 8.0,
            ViolationSeverity.LOW: 3.0,
        }[v.severity] for v in violations)
        compliance_score = max(0.0, round(100.0 - deductions, 1))

        critical_count = sum(1 for v in violations if v.severity == ViolationSeverity.CRITICAL)

        if skipped_checks:
            recommendations.append("Assign a driver and re-run validation; some checks could not be evaluated.")

        return PolicyComplianceReport(
            is_compliant=(len(violations) == 0 and not skipped_checks),
            evaluation_complete=not skipped_checks,
            skipped_checks=skipped_checks,
            compliance_score_pct=compliance_score,
            violations_count=len(violations),
            critical_violations_count=critical_count,
            violations=violations,
            cited_rules=cited_rules,
            recommendations=recommendations or ["Manifest complies with all evaluated regulatory standards."],
            evaluation_timestamp=datetime.now(timezone.utc).isoformat(),
        )
