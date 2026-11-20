"""
audit_report.py - Compliance audit trail report (US-008, Week 14 · Track B: Abhayraj Jaiswal)

Turns the append-only audit log into something an auditor can sign off:

  build_report()  summary for a period and filters: totals by action, entity, actor and day, plus three checks
                    - sequence: audit ids must be gap-free; a gap means an entry was removed
                    - snapshots: every STATUS_CHANGE / ASSET_UPDATED entry must carry before and after states
                    - coverage: every shipment that has left UNASSIGNED must have at least one audit entry
  audit_csv()     every entry in the period, one row each, safe to open in a spreadsheet (formula cells neutralised)
  audit_pdf()     the printable report: checks, totals and the full entry list

The checks run over the whole log (not just the filtered period), because a gap or an untracked shipment is a
problem whichever period the auditor happens to be looking at.
"""

from __future__ import annotations

import csv
import io
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.sanitize import csv_safe
from app.models.audit import AuditAction, AuditLog
from app.models.shipment import Shipment, ShipmentStatus

SNAPSHOT_ACTIONS = (AuditAction.STATUS_CHANGE, AuditAction.ASSET_UPDATED)
MAX_ROWS = 50_000


@dataclass(frozen=True)
class AuditFilters:
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    action_type: Optional[AuditAction] = None
    entity_type: Optional[str] = None
    actor_role: Optional[str] = None

    def label(self) -> str:
        parts = []
        if self.date_from or self.date_to:
            parts.append(f"{self.date_from or 'start'} to {self.date_to or 'today'}")
        if self.action_type:
            parts.append(f"action {self.action_type.value}")
        if self.entity_type:
            parts.append(f"entity {self.entity_type}")
        if self.actor_role:
            parts.append(f"role {self.actor_role}")
        return ", ".join(parts) or "entire audit trail"


def _query(db: Session, f: AuditFilters):
    q = db.query(AuditLog)
    if f.date_from:
        q = q.filter(AuditLog.created_at >= datetime.combine(f.date_from, time.min))
    if f.date_to:
        q = q.filter(AuditLog.created_at < datetime.combine(f.date_to + timedelta(days=1), time.min))
    if f.action_type:
        q = q.filter(AuditLog.action_type == f.action_type)
    if f.entity_type:
        q = q.filter(AuditLog.entity_type == f.entity_type)
    if f.actor_role:
        q = q.filter(AuditLog.actor_role == f.actor_role)
    return q.order_by(AuditLog.id.asc())


def entries(db: Session, f: AuditFilters) -> List[AuditLog]:
    return _query(db, f).limit(MAX_ROWS).all()


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def integrity_checks(db: Session) -> Dict:
    ids = [i for (i,) in db.query(AuditLog.id).order_by(AuditLog.id.asc()).all()]
    gaps = []
    for prev, nxt in zip(ids, ids[1:]):
        if nxt != prev + 1:
            gaps.append({"after_id": prev, "before_id": nxt, "missing": nxt - prev - 1})

    missing_snapshots = [
        {"id": e.id, "action_type": e.action_type.value, "entity": f"{e.entity_type}:{e.entity_id}"}
        for e in db.query(AuditLog).filter(AuditLog.action_type.in_(SNAPSHOT_ACTIONS))
        .filter((AuditLog.before_state.is_(None)) | (AuditLog.after_state.is_(None))).order_by(AuditLog.id).limit(200)
    ]

    audited = {i for (i,) in db.query(AuditLog.entity_id).filter(AuditLog.entity_type == "Shipment").distinct()}
    moved = db.query(Shipment.id, Shipment.tracking_number, Shipment.status).filter(Shipment.status != ShipmentStatus.UNASSIGNED).all()
    untracked = [{"id": sid, "tracking_number": tn, "status": st.value} for sid, tn, st in moved if sid not in audited]

    return {
        "sequence": {"ok": not gaps, "entries": len(ids), "first_id": ids[0] if ids else None, "last_id": ids[-1] if ids else None,
                     "gaps": gaps[:50]},
        "snapshots": {"ok": not missing_snapshots, "missing": missing_snapshots},
        "coverage": {"ok": not untracked, "shipments_checked": len(moved), "untracked": untracked[:200]},
    }


def build_report(db: Session, f: AuditFilters) -> Dict:
    rows = entries(db, f)
    by_day = Counter((e.created_at.date().isoformat() if e.created_at else "unknown") for e in rows)
    actors = Counter((e.actor_name, e.actor_role) for e in rows)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "filters": {"date_from": f.date_from.isoformat() if f.date_from else None,
                    "date_to": f.date_to.isoformat() if f.date_to else None,
                    "action_type": f.action_type.value if f.action_type else None,
                    "entity_type": f.entity_type, "actor_role": f.actor_role},
        "total": len(rows),
        "truncated": len(rows) >= MAX_ROWS,
        "first_entry_at": _iso(rows[0].created_at) if rows else None,
        "last_entry_at": _iso(rows[-1].created_at) if rows else None,
        "by_action": dict(Counter(e.action_type.value for e in rows).most_common()),
        "by_entity": dict(Counter(e.entity_type for e in rows).most_common()),
        "by_actor": [{"actor_name": n, "actor_role": r, "entries": c} for (n, r), c in actors.most_common()],
        "by_day": [{"date": d, "entries": by_day[d]} for d in sorted(by_day)],
        "checks": integrity_checks(db),
    }


CSV_COLUMNS = ["id", "timestamp_utc", "actor_name", "actor_role", "action_type", "entity_type", "entity_id", "details",
               "before_state", "after_state"]


def audit_csv(rows: List[AuditLog]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_COLUMNS)
    for e in rows:
        w.writerow([csv_safe(v) for v in (
            e.id, _iso(e.created_at), e.actor_name, e.actor_role, e.action_type.value, e.entity_type, e.entity_id, e.details,
            e.before_state or "", e.after_state or "")])
    return buf.getvalue()


def audit_pdf(report: Dict, rows: List[AuditLog], filters_label: str) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from xml.sax.saxutils import escape

    styles = getSampleStyleSheet()
    small = styles["BodyText"].clone("small", fontSize=7.5, leading=9)
    ink, accent, line = colors.HexColor("#1c1a2b"), colors.HexColor("#2a78d6"), colors.HexColor("#e3e0ee")
    good, bad = colors.HexColor("#0f7b3f"), colors.HexColor("#b42318")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm,
                            bottomMargin=14 * mm, title="Audit Trail Compliance Report", author="AI Fleet Route Optimizer")

    def table(data, widths, header=True):
        t = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1 if header else 0)
        cmds = [("FONT", (0, 0), (-1, -1), "Helvetica", 8.5), ("TEXTCOLOR", (0, 0), (-1, -1), ink),
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, line), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
        if header:
            cmds += [("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.5), ("TEXTCOLOR", (0, 0), (-1, 0), accent)]
        t.setStyle(TableStyle(cmds))
        return t

    c = report["checks"]
    verdict = [
        ("Sequence", c["sequence"]["ok"], f"{c['sequence']['entries']} entries, ids {c['sequence']['first_id']}-{c['sequence']['last_id']}"
         if c["sequence"]["ok"] else f"{len(c['sequence']['gaps'])} gap(s): entries are missing from the log"),
        ("Before / after snapshots", c["snapshots"]["ok"], "every status change and update has both states" if c["snapshots"]["ok"]
         else f"{len(c['snapshots']['missing'])} change entr(ies) without a full snapshot"),
        ("Shipment coverage", c["coverage"]["ok"], f"all {c['coverage']['shipments_checked']} dispatched shipments have audit history"
         if c["coverage"]["ok"] else f"{len(c['coverage']['untracked'])} shipment(s) changed status with no audit entry"),
    ]
    story: List = [
        Paragraph("Audit Trail Compliance Report", styles["Title"]),
        Paragraph(f"{escape(filters_label)} &middot; {report['total']} entries &middot; generated "
                  f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", styles["Normal"]),
        Spacer(1, 5 * mm),
        Paragraph("Integrity checks (whole log)", styles["Heading2"]),
    ]
    t = table([["Check", "Result", "Detail"]] + [[n, "PASS" if ok else "FAIL", d] for n, ok, d in verdict], [55 * mm, 22 * mm, 170 * mm])
    t.setStyle(TableStyle([("TEXTCOLOR", (1, i + 1), (1, i + 1), good if ok else bad) for i, (_, ok, _) in enumerate(verdict)]
                          + [("FONT", (1, 1), (1, -1), "Helvetica-Bold", 8.5)]))
    story += [t, Spacer(1, 5 * mm)]

    totals = [["Action", "Entries"]] + [[k, v] for k, v in report["by_action"].items()]
    entities = [["Entity", "Entries"]] + [[k, v] for k, v in report["by_entity"].items()]
    actors = [["Actor", "Role", "Entries"]] + [[a["actor_name"], a["actor_role"], a["entries"]] for a in report["by_actor"][:12]]
    story += [Paragraph("Totals", styles["Heading2"]),
              Table([[table(totals, [45 * mm, 18 * mm]), table(entities, [35 * mm, 18 * mm]), table(actors, [55 * mm, 30 * mm, 18 * mm])]],
                    hAlign="LEFT", style=[("VALIGN", (0, 0), (-1, -1), "TOP")]),
              Spacer(1, 5 * mm),
              Paragraph(f"Entries ({len(rows)})", styles["Heading2"])]

    entry_rows = [["#", "When (UTC)", "Actor", "Action", "Entity", "Details"]]
    for e in rows:
        when = _iso(e.created_at)[:19].replace("T", " ") if e.created_at else ""
        entry_rows.append([e.id, when, Paragraph(escape(f"{e.actor_name} ({e.actor_role})"), small), e.action_type.value,
                           f"{e.entity_type}:{e.entity_id}", Paragraph(escape(e.details or ""), small)])
    if len(entry_rows) == 1:
        entry_rows.append(["", "", "", "", "", "No entries for these filters."])
    story.append(table(entry_rows, [12 * mm, 32 * mm, 45 * mm, 38 * mm, 28 * mm, 114 * mm]))
    doc.build(story)
    return buf.getvalue()
