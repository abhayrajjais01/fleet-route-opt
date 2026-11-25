"""
documents.py - Printable route manifest and customer delivery receipt (Week 14 · Track A)

  manifest_pdf()  the driver's stop sheet for one route: trip header, a stop table with booked windows, planned
                  ETAs, weights, hazard classes and a proof-of-delivery box per stop, then turn-by-turn directions
                  per leg. Hazmat routes carry the placard / endorsement reminder from SOP-HZ-001.
  receipt_pdf()   a proof-of-delivery receipt for one consignment (who received it, when, how it was verified).

Both are built only from data the caller passes plus computed ETAs, so a document always matches the plan.
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Sequence

from app.services.optimizer.eta_engine import RouteEvaluation
from app.services.optimizer.hazmat import PLACARD_KG, normalise
from app.services.optimizer.route_explainer import LegGuide, StopInfo
from app.services.optimizer.vrptw_solver import Stop


def _clock(m: float) -> str:
    m = int(round(m)) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def _styles():
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    s = getSampleStyleSheet()
    return s, colors.HexColor("#1c1a2b"), colors.HexColor("#6d28d9"), colors.HexColor("#e3e0ee")


def _table(rows, widths, ink, accent, line, header=True, font_size=8.5):
    from reportlab.platypus import Table, TableStyle
    t = Table(rows, colWidths=widths, hAlign="LEFT", repeatRows=1 if header else 0)
    cmds = [("FONT", (0, 0), (-1, -1), "Helvetica", font_size), ("TEXTCOLOR", (0, 0), (-1, -1), ink),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, line), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]
    if header:
        cmds += [("FONT", (0, 0), (-1, 0), "Helvetica-Bold", font_size), ("TEXTCOLOR", (0, 0), (-1, 0), accent)]
    t.setStyle(TableStyle(cmds))
    return t


def manifest_pdf(hub_name: str, vehicle_label: str, driver_name: Optional[str], stops: Sequence[Stop], info: dict,
                 evaluation: RouteEvaluation, depart_min: int, legs: List[LegGuide], service_date: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    styles, ink, accent, line = _styles()
    by_id = {s.id: s for s in stops}
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                            title=f"Route manifest {vehicle_label} {service_date}", author="AI Fleet Route Optimizer")
    classes = sorted({c for c in (normalise(s.hazard_class) for s in stops) if c})
    hazmat_kg = sum(s.weight_kg for s in stops if normalise(s.hazard_class))
    story: List = [
        Paragraph(f"Route manifest &middot; {vehicle_label}", styles["Title"]),
        Paragraph(f"{service_date} &middot; {hub_name} &middot; driver: {driver_name or 'not assigned'} &middot; leaves {_clock(depart_min)}, "
                  f"back about {_clock(evaluation.return_min)} &middot; {evaluation.distance_km:.1f} km &middot; "
                  f"{evaluation.load_kg:g} kg / {evaluation.load_m3:g} m³ ({evaluation.utilisation * 100:.0f}% of capacity)", styles["Normal"]),
        Spacer(1, 4 * mm),
    ]
    if classes:
        story.append(Paragraph(
            f"<b>DANGEROUS GOODS:</b> Class {', '.join(classes)} on board ({hazmat_kg:g} kg). Hazmat-endorsed driver required (SOP-HZ-001 §2)"
            + (f"; {hazmat_kg:g} kg is a placarded load: display placards (SOP-HZ-001 §3)" if hazmat_kg >= PLACARD_KG else "")
            + ". Carry shipping papers and emergency information.", styles["Normal"]))
        story.append(Spacer(1, 3 * mm))
    if evaluation.violations:
        story.append(Paragraph("<b>Check before departure:</b> " + "; ".join(evaluation.violations), styles["Normal"]))
        story.append(Spacer(1, 3 * mm))

    rows = [["#", "Customer and address", "Booked slot", "Planned ETA", "kg", "Hazard", "Received by / OTP"]]
    for e in evaluation.stops:
        s, i = by_id[e.stop_id], info.get(e.stop_id, StopInfo(e.stop_id))
        who = Paragraph(f"<b>{i.name}</b><br/>{i.address or ''}", styles["BodyText"])
        rows.append([str(e.sequence), who, f"{_clock(s.window_open)}–{_clock(s.window_close)}", _clock(e.arrival) + (" (late)" if e.minutes_late > 0 else ""),
                     f"{s.weight_kg:g}", f"Class {normalise(s.hazard_class)}" if normalise(s.hazard_class) else "", ""])
    story += [_table(rows, [8 * mm, 62 * mm, 22 * mm, 22 * mm, 12 * mm, 16 * mm, 40 * mm], ink, accent, line), Spacer(1, 6 * mm)]

    story.append(Paragraph("Directions", styles["Heading2"]))
    for n, leg in enumerate(legs, start=1):
        title = f"{n}. To {leg.to}" if n < len(legs) else f"Return to {leg.to}"
        story.append(Paragraph(f"<b>{title}</b> &middot; {leg.km:.1f} km, about {round(leg.minutes)} min, arrive {leg.arrive}", styles["BodyText"]))
        story.append(Paragraph(" → ".join(leg.steps), styles["BodyText"]))
        story.append(Spacer(1, 2 * mm))
    story += [Spacer(1, 4 * mm), Paragraph(
        "Proof of delivery is required for every stop: recipient name and OTP or signature (SOP-OP-002 §5). Report a delay as soon as you "
        "expect to be more than 15 minutes late (SOP-OP-001 §3).", styles["Italic"])]
    doc.build(story)
    return buf.getvalue()


@dataclass
class Receipt:
    tracking_number: str
    customer_name: str
    address: str
    service_date: str
    delivered_at: str          # HH:MM
    recipient: str
    verified_by: str           # e.g. "OTP", "signature"
    weight_kg: float
    vehicle: str
    driver: Optional[str]
    hub: str
    in_full: bool = True
    notes: str = ""

    @property
    def number(self) -> str:
        digest = hashlib.sha256(f"{self.tracking_number}|{self.service_date}|{self.delivered_at}".encode()).hexdigest()[:8].upper()
        return f"POD-{self.service_date.replace('-', '')}-{digest}"


def receipt_pdf(r: Receipt) -> bytes:
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    styles, ink, accent, line = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A5, leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm, bottomMargin=12 * mm,
                            title=f"Delivery receipt {r.tracking_number}", author="AI Fleet Route Optimizer")
    rows = [
        ["Receipt no.", r.number],
        ["Consignment", r.tracking_number],
        ["Delivered to", r.customer_name],
        ["Address", Paragraph(r.address, styles["BodyText"])],
        ["Date and time", f"{r.service_date} at {r.delivered_at}"],
        ["Received by", r.recipient],
        ["Verified by", r.verified_by],
        ["Weight", f"{r.weight_kg:g} kg" + ("" if r.in_full else " (short delivery: see notes)")],
        ["Vehicle / driver", f"{r.vehicle} / {r.driver or '-'}"],
        ["Dispatched from", r.hub],
    ]
    if r.notes:
        rows.append(["Notes", Paragraph(r.notes, styles["BodyText"])])
    story = [Paragraph("Delivery receipt", styles["Title"]), Spacer(1, 2 * mm),
             _table(rows, [32 * mm, 88 * mm], ink, accent, line, header=False, font_size=9.5), Spacer(1, 6 * mm),
             Paragraph(f"Issued {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}. Keep this receipt for your records; quote the "
                       "receipt number for any query about this delivery.", styles["Italic"])]
    doc.build(story)
    return buf.getvalue()
