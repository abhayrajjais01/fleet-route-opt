"""
delivery.py - Proof of Delivery

One row per delivered shipment: how the handover was proven (the customer's delivery code, or a signature drawn on
the driver's screen), who received it, and who recorded it. Written once, with the DELIVERED transition.
"""

import enum

from sqlalchemy import Column, Enum, ForeignKey, Integer, String, Text

from app.core.database import Base
from app.models.base import TimestampMixin


class ProofMethod(str, enum.Enum):
    DELIVERY_CODE = "DELIVERY_CODE"   # 6-digit code verified by the server
    SIGNATURE = "SIGNATURE"           # strokes drawn by the recipient


class DeliveryProof(Base, TimestampMixin):
    __tablename__ = "delivery_proofs"

    id = Column(Integer, primary_key=True, index=True)
    shipment_id = Column(Integer, ForeignKey("shipments.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    method = Column(Enum(ProofMethod), nullable=False)
    recipient_name = Column(String(255), nullable=False)
    signature = Column(Text, nullable=True)            # JSON strokes, 0..1 coordinates; only for SIGNATURE
    captured_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    captured_by_name = Column(String(255), nullable=False)
