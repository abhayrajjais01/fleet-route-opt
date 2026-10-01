"""
batch_ingestion.py - Batch Shipment Ingestion & Parsing Engine (Track B: Week 4)

Provides high-throughput CSV/JSON ingestion, column normalization, row-level schema validation,
geographic bounds checking, relational hub verification, and automated audit logging.
"""

import csv
import io
import re
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session

from app.models.shipment import Shipment, ShipmentStatus, ShipmentPriority
from app.models.fleet import Hub
from app.models.user import User
from app.models.audit import AuditAction
from app.schemas.shipment import (
    ShipmentCreate,
    ShipmentResponse,
    BatchIngestionRowError,
    BatchShipmentIngestionResponse,
)
from app.services.audit_service import record_audit_event


CSV_REQUIRED_COLUMNS = {
    "tracking_number",
    "customer_name",
    "destination_address",
    "latitude",
    "longitude",
    "weight_kg",
    "volume_m3",
    "hub_id",
}

TIME_REGEX = re.compile(r"^\d{2}:\d{2}$")


def generate_csv_template() -> str:
    """Generates an RFC 4180 standard CSV template with realistic sample orders."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "tracking_number",
        "customer_name",
        "destination_address",
        "latitude",
        "longitude",
        "weight_kg",
        "volume_m3",
        "time_window_start",
        "time_window_end",
        "priority",
        "hub_id",
    ])
    sample_rows = [
        ["SHP-CSV-001", "Reliance Retail Hub", "Bandra Kurla Complex, Bandra East, Mumbai", "19.0657", "72.8687", "250.0", "2.1", "09:00", "13:00", "HIGH", "1"],
        ["SHP-CSV-002", "Tata Digital Logistics", "Hiranandani Business Park, Powai, Mumbai", "19.1176", "72.9060", "110.5", "0.9", "10:00", "15:00", "STANDARD", "1"],
        ["SHP-CSV-003", "Flipkart Supply Chain", "Sector 11, CBD Belapur, Navi Mumbai", "19.0144", "73.0380", "520.0", "4.2", "08:30", "12:00", "EXPRESS", "1"],
        ["SHP-CSV-004", "Infosys Technologies Ltd", "Electronics City Phase 1, Hosur Road, Bengaluru", "12.8452", "77.6602", "340.0", "2.8", "11:00", "16:00", "STANDARD", "2"],
        ["SHP-CSV-005", "Amazon India Fulfillment", "Okhla Phase II Industrial Area, New Delhi", "28.5320", "77.2710", "185.0", "1.4", "09:00", "12:30", "EXPRESS", "3"],
    ]
    for row in sample_rows:
        writer.writerow(row)
    return output.getvalue()


def parse_and_validate_csv(
    csv_text: str,
    db: Session,
    actor: Optional[User] = None,
) -> BatchShipmentIngestionResponse:
    """
    Parses, validates, and bulk-inserts shipments from a CSV string.
    Gracefully captures row-level errors while persisting all valid rows.
    """
    # Remove UTF-8 BOM if present
    if csv_text.startswith("\ufeff"):
        csv_text = csv_text[1:]

    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        return BatchShipmentIngestionResponse(
            total_processed=0,
            successful_count=0,
            failed_count=0,
            errors=[BatchIngestionRowError(row=1, reason="CSV file is empty or missing headers.")],
            created_shipments=[],
        )

    # Normalize header column names (lowercase, stripped)
    normalized_fieldnames = {f: f.strip().lower() for f in reader.fieldnames if f}
    missing_cols = CSV_REQUIRED_COLUMNS - set(normalized_fieldnames.values())
    if missing_cols:
        return BatchShipmentIngestionResponse(
            total_processed=0,
            successful_count=0,
            failed_count=0,
            errors=[BatchIngestionRowError(
                row=1,
                reason=f"Missing required CSV column(s): {', '.join(sorted(missing_cols))}",
            )],
            created_shipments=[],
        )

    # Pre-cache existing tracking numbers and valid hub IDs for fast in-memory verification
    existing_tracking = set(r[0] for r in db.query(Shipment.tracking_number).all())
    valid_hub_ids = set(r[0] for r in db.query(Hub.id).all())
    batch_tracking_seen = set()

    to_insert: List[Shipment] = []
    errors: List[BatchIngestionRowError] = []
    row_index = 1  # Header is row 1, data starts at row 2

    for raw_row in reader:
        row_index += 1
        # Normalize row keys
        row = {normalized_fieldnames.get(k, k): v.strip() if v else "" for k, v in raw_row.items() if k}

        tracking = row.get("tracking_number", "").strip()
        if not tracking:
            errors.append(BatchIngestionRowError(row=row_index, tracking_number=None, reason="tracking_number cannot be empty."))
            continue

        if len(tracking) < 3 or len(tracking) > 50:
            errors.append(BatchIngestionRowError(row=row_index, tracking_number=tracking, reason="tracking_number length must be between 3 and 50 characters."))
            continue

        if tracking in existing_tracking or tracking in batch_tracking_seen:
            errors.append(BatchIngestionRowError(row=row_index, tracking_number=tracking, reason=f"Duplicate tracking_number '{tracking}'."))
            continue

        customer_name = row.get("customer_name", "").strip()
        if len(customer_name) < 2:
            errors.append(BatchIngestionRowError(row=row_index, tracking_number=tracking, reason="customer_name must have at least 2 characters."))
            continue

        destination_address = row.get("destination_address", "").strip()
        if len(destination_address) < 5:
            errors.append(BatchIngestionRowError(row=row_index, tracking_number=tracking, reason="destination_address must have at least 5 characters."))
            continue

        # Latitude & Longitude validation
        try:
            lat = float(row.get("latitude", ""))
            if lat < -90.0 or lat > 90.0:
                raise ValueError("Out of range")
        except Exception:
            errors.append(BatchIngestionRowError(row=row_index, tracking_number=tracking, reason=f"Invalid latitude '{row.get('latitude')}'; must be a float between -90.0 and 90.0."))
            continue

        try:
            lng = float(row.get("longitude", ""))
            if lng < -180.0 or lng > 180.0:
                raise ValueError("Out of range")
        except Exception:
            errors.append(BatchIngestionRowError(row=row_index, tracking_number=tracking, reason=f"Invalid longitude '{row.get('longitude')}'; must be a float between -180.0 and 180.0."))
            continue

        # Weight & Volume validation
        try:
            weight = float(row.get("weight_kg", ""))
            if weight <= 0:
                raise ValueError("Non-positive")
        except Exception:
            errors.append(BatchIngestionRowError(row=row_index, tracking_number=tracking, reason=f"Invalid weight_kg '{row.get('weight_kg')}'; must be > 0."))
            continue

        try:
            volume = float(row.get("volume_m3", ""))
            if volume <= 0:
                raise ValueError("Non-positive")
        except Exception:
            errors.append(BatchIngestionRowError(row=row_index, tracking_number=tracking, reason=f"Invalid volume_m3 '{row.get('volume_m3')}'; must be > 0."))
            continue

        # Hub ID validation
        try:
            hub_id = int(row.get("hub_id", ""))
            if hub_id not in valid_hub_ids:
                errors.append(BatchIngestionRowError(row=row_index, tracking_number=tracking, reason=f"Referenced hub_id {hub_id} does not exist in fleet registry."))
                continue
        except Exception:
            errors.append(BatchIngestionRowError(row=row_index, tracking_number=tracking, reason=f"Invalid hub_id '{row.get('hub_id')}'; must be an integer."))
            continue

        # Time Windows validation
        t_start = row.get("time_window_start", "09:00").strip() or "09:00"
        t_end = row.get("time_window_end", "17:00").strip() or "17:00"
        if not TIME_REGEX.match(t_start) or not TIME_REGEX.match(t_end):
            errors.append(BatchIngestionRowError(row=row_index, tracking_number=tracking, reason="Time windows must match HH:MM 24-hr format (e.g. 09:00)."))
            continue
        if t_end < t_start:
            errors.append(BatchIngestionRowError(row=row_index, tracking_number=tracking, reason=f"time_window_end ({t_end}) cannot be earlier than time_window_start ({t_start})."))
            continue

        # Priority
        raw_pri = row.get("priority", "STANDARD").strip().upper()
        try:
            priority = ShipmentPriority(raw_pri)
        except Exception:
            priority = ShipmentPriority.STANDARD

        # Mark tracking number as used in this batch
        batch_tracking_seen.add(tracking)

        shipment = Shipment(
            tracking_number=tracking,
            customer_name=customer_name,
            destination_address=destination_address,
            latitude=lat,
            longitude=lng,
            weight_kg=weight,
            volume_m3=volume,
            time_window_start=t_start,
            time_window_end=t_end,
            priority=priority,
            status=ShipmentStatus.UNASSIGNED,
            hub_id=hub_id,
        )
        to_insert.append(shipment)

    # Bulk insert valid shipments into DB
    created_responses: List[ShipmentResponse] = []
    if to_insert:
        db.add_all(to_insert)
        db.flush()

        # Audit log creation
        sample_ids = [s.tracking_number for s in to_insert[:5]]
        record_audit_event(
            db=db,
            actor=actor,
            action_type=AuditAction.ASSET_CREATED,
            entity_type="ShipmentBatch",
            entity_id=to_insert[0].id,
            details=f"Batch imported {len(to_insert)} shipments. Samples: {', '.join(sample_ids)} (Errors: {len(errors)})",
            after_state={
                "batch_size": len(to_insert),
                "error_count": len(errors),
                "sample_trackings": sample_ids,
            },
        )
        db.commit()

        for s in to_insert:
            db.refresh(s)
            created_responses.append(ShipmentResponse.model_validate(s))

    total_processed = (row_index - 1)
    return BatchShipmentIngestionResponse(
        total_processed=total_processed,
        successful_count=len(created_responses),
        failed_count=len(errors),
        errors=errors,
        created_shipments=created_responses,
    )


def parse_and_validate_json(
    shipments: List[ShipmentCreate],
    db: Session,
    actor: Optional[User] = None,
) -> BatchShipmentIngestionResponse:
    """
    Validates and bulk-inserts shipments from a list of ShipmentCreate schemas.
    """
    existing_tracking = set(r[0] for r in db.query(Shipment.tracking_number).all())
    valid_hub_ids = set(r[0] for r in db.query(Hub.id).all())
    batch_tracking_seen = set()

    to_insert: List[Shipment] = []
    errors: List[BatchIngestionRowError] = []

    for idx, sc in enumerate(shipments, start=1):
        tracking = sc.tracking_number.strip()
        if tracking in existing_tracking or tracking in batch_tracking_seen:
            errors.append(BatchIngestionRowError(row=idx, tracking_number=tracking, reason=f"Duplicate tracking_number '{tracking}'."))
            continue

        if sc.hub_id not in valid_hub_ids:
            errors.append(BatchIngestionRowError(row=idx, tracking_number=tracking, reason=f"Referenced hub_id {sc.hub_id} does not exist in fleet registry."))
            continue

        batch_tracking_seen.add(tracking)
        shipment = Shipment(**sc.model_dump())
        to_insert.append(shipment)

    created_responses: List[ShipmentResponse] = []
    if to_insert:
        db.add_all(to_insert)
        db.flush()

        sample_ids = [s.tracking_number for s in to_insert[:5]]
        record_audit_event(
            db=db,
            actor=actor,
            action_type=AuditAction.ASSET_CREATED,
            entity_type="ShipmentBatch",
            entity_id=to_insert[0].id,
            details=f"Batch JSON imported {len(to_insert)} shipments. Samples: {', '.join(sample_ids)} (Errors: {len(errors)})",
            after_state={
                "batch_size": len(to_insert),
                "error_count": len(errors),
                "sample_trackings": sample_ids,
            },
        )
        db.commit()

        for s in to_insert:
            db.refresh(s)
            created_responses.append(ShipmentResponse.model_validate(s))

    return BatchShipmentIngestionResponse(
        total_processed=len(shipments),
        successful_count=len(created_responses),
        failed_count=len(errors),
        errors=errors,
        created_shipments=created_responses,
    )
