"""
delivery_proof.py - Issuing and verifying proof of delivery

A shipment becomes DELIVERED only with one of:
  - the customer's 6-digit delivery code. Dispatch issues it and passes it to the customer; drivers can never see it,
    so a driver who knows it was given it by the customer. Five wrong attempts lock the code until it is reissued.
  - a signature drawn by the recipient (validated strokes, not typed text).

The code is derived (HMAC of the shipment and a random nonce), so the database never holds it in readable form.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import secrets
from typing import List, Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.audit import AuditAction
from app.models.delivery import DeliveryProof, ProofMethod
from app.models.shipment import Shipment
from app.models.user import User
from app.services.audit_service import record_audit_event

MAX_CODE_ATTEMPTS = 5
MAX_POINTS = 4000
MIN_POINTS = 8
MIN_INK = 0.25          # total stroke length, in widths of the signature box

Strokes = List[List[List[float]]]


def check_strokes(strokes: Sequence) -> Strokes:
    """Rejects anything that is not a drawn signature: wrong shape, off the pad, or just a dot or a tap."""
    if not strokes or not all(isinstance(s, (list, tuple)) and s for s in strokes):
        raise ValueError("Ask the recipient to sign.")
    points = 0
    ink = 0.0
    clean: Strokes = []
    for stroke in strokes:
        line: List[List[float]] = []
        for p in stroke:
            if not isinstance(p, (list, tuple)) or len(p) != 2:
                raise ValueError("The signature is not valid.")
            try:
                x, y = float(p[0]), float(p[1])
            except (TypeError, ValueError):
                raise ValueError("The signature is not valid.")
            if not (math.isfinite(x) and math.isfinite(y) and -0.05 <= x <= 1.05 and -0.05 <= y <= 1.05):
                raise ValueError("The signature is not valid.")
            if line:
                ink += math.hypot(x - line[-1][0], y - line[-1][1])
            line.append([round(x, 4), round(y, 4)])
        points += len(line)
        clean.append(line)
    if points > MAX_POINTS:
        raise ValueError("The signature is too large.")
    if points < MIN_POINTS or ink < MIN_INK:
        raise ValueError("The signature is too short. Ask the recipient to sign in full.")
    return clean


def _code(shipment: Shipment) -> str:
    digest = hmac.new(settings.SECRET_KEY.encode(), f"delivery:{shipment.id}:{shipment.delivery_code_nonce}".encode(), hashlib.sha256).digest()
    return f"{int.from_bytes(digest[:8], 'big') % 1_000_000:06d}"


def issue_code(db: Session, shipment: Shipment, actor: User, reissue: bool = False) -> str:
    """The shipment's delivery code, creating it on first use. Reissuing replaces it and clears failed attempts."""
    if shipment.delivery_code_nonce is None or reissue:
        before = "none" if shipment.delivery_code_nonce is None else "issued"
        shipment.delivery_code_nonce = secrets.token_hex(16)
        shipment.delivery_code_attempts = 0
        record_audit_event(db, actor, AuditAction.ASSET_UPDATED, "Shipment", shipment.id,
                           f"{'Reissued' if before == 'issued' else 'Issued'} the delivery code for {shipment.tracking_number}",
                           {"delivery_code": before}, {"delivery_code": "reissued" if before == "issued" else "issued"})
        db.commit()
    return _code(shipment)


def verify(db: Session, shipment: Shipment, code: Optional[str], strokes: Optional[Sequence]) -> ProofMethod:
    """Checks the proof. A wrong code is counted even though the request fails."""
    if code:
        if shipment.delivery_code_nonce is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "No delivery code has been issued for this shipment. Ask dispatch, or take a signature.")
        if shipment.delivery_code_attempts >= MAX_CODE_ATTEMPTS:
            raise HTTPException(status.HTTP_409_CONFLICT, "Too many wrong codes. Ask dispatch to reissue it, or take a signature.")
        if not hmac.compare_digest(code, _code(shipment)):
            shipment.delivery_code_attempts += 1
            left = MAX_CODE_ATTEMPTS - shipment.delivery_code_attempts
            db.commit()
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                f"That delivery code is wrong. {left} attempt{'' if left == 1 else 's'} left." if left
                                else "That delivery code is wrong and is now locked. Ask dispatch to reissue it, or take a signature.")
        return ProofMethod.DELIVERY_CODE
    if strokes:
        return ProofMethod.SIGNATURE
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Proof of delivery is required: the customer's delivery code or a signature.")


def record(db: Session, shipment: Shipment, method: ProofMethod, recipient: str, strokes: Optional[Strokes], actor: User) -> DeliveryProof:
    proof = DeliveryProof(shipment_id=shipment.id, method=method, recipient_name=recipient,
                          signature=json.dumps(strokes, separators=(",", ":")) if method == ProofMethod.SIGNATURE else None,
                          captured_by_id=actor.id, captured_by_name=actor.full_name)
    db.add(proof)
    return proof
