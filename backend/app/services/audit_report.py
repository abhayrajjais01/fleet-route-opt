"""
audit_report.py - Compliance audit trail report (US-008, Week 14 · Track B: Abhayraj Jaiswal)

Turns the append-only audit log into something an auditor can sign off:

  build_report()  summary for a period and filters: totals by action, entity, actor and day, plus three checks
                    - sequence: audit ids should be gap-free; on SQLite a gap means an entry was removed (fail), on
                      PostgreSQL it may be an aborted transaction (warn, for review)
                    - snapshots: every STATUS_CHANGE / ASSET_UPDATED entry must carry before and after states
                    - coverage: every shipment's current status must be the last status its audit history recorded
  audit_csv()     every entry in the period, one row each, safe to open in a spreadsheet (formula cells neutralised)
  audit_pdf()     the printable report: checks, totals and the full entry list

The checks run over the whole log (not just the filtered period), because a gap or an untracked shipment is a
problem whichever period the auditor happens to be looking at.
"""

from __future__ import annotations

import csv
import io
import json
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


def _dialect(db: Session) -> str:
    bind = db.get_bind()
    return bind.dialect.name if bind is not None else "unknown"


def _sequence_check(db: Session) -> Dict:
    """Gap-free ids. On SQLite an aborted insert does not consume an id, so a gap means a removed entry (fail).
    PostgreSQL sequences are never rolled back, so there a gap may just be an aborted transaction: it is reported
    for review (warn), not as tampering."""
    ids = [i for (i,) in db.query(AuditLog.id).order_by(AuditLog.id.asc()).all()]
    gaps = [{"after_id": prev, "before_id": nxt, "missing": nxt - prev - 1}
            for prev, nxt in zip(ids, ids[1:]) if nxt != prev + 1]
    gaps_prove_deletion = _dialect(db) == "sqlite"
    if not gaps:
        status, note = "pass", "Entries are numbered without gaps."
    elif gaps_prove_deletion:
        status, note = "fail", "Ids are missing from the log, so entries were removed."
    else:
        status, note = "warn", ("Ids are missing. On PostgreSQL an aborted transaction also skips ids, so check the "
                                "gaps against the application log before treating them as removed entries.")
    return {"ok": status != "fail", "status": status, "note": note, "entries": len(ids),
            "first_id": ids[0] if ids else None, "last_id": ids[-1] if ids else None, "gaps": gaps[:50]}


def _logged_statuses(db: Session) -> Dict[int, str]:
    """Each shipment's status as last recorded by the audit trail (the newest Shipment entry that carries one)."""
    logged: Dict[int, str] = {}
    rows = (db.query(AuditLog.entity_id, AuditLog.after_state)
            .filter(AuditLog.entity_type == "Shipment", AuditLog.after_state.isnot(None))
            .order_by(AuditLog.id.asc()))
    for entity_id, after in rows:
        try:
            status = json.loads(after).get("status")
        except (ValueError, AttributeError):
            continue
        if status:
            logged[entity_id] = status
    return logged


def _coverage_check(db: Session) -> Dict:
    """Every shipment's current status must be the last status the audit trail recorded for it. A shipment with no
    recorded status must still be UNASSIGNED (how every shipment starts, including batch imports, which are audited
    as one ShipmentBatch entry). A status changed behind the API therefore shows up even if the shipment has other
    audit entries."""
    logged = _logged_statuses(db)
    untracked = []
    rows = db.query(Shipment.id, Shipment.tracking_number, Shipment.status).order_by(Shipment.id).all()
    for sid, tracking, status in rows:
        expected = logged.get(sid, ShipmentStatus.UNASSIGNED.value)
        if status.value != expected:
            untracked.append({"id": sid, "tracking_number": tracking, "status": status.value,
                              "last_logged_status": logged.get(sid)})
    return {"ok": not untracked, "status": "pass" if not untracked else "fail", "shipments_checked": len(rows),
            "untracked": untracked[:200]}


def integrity_checks(db: Session) -> Dict:
    missing_snapshots = [
        {"id": e.id, "action_type": e.action_type.value, "entity": f"{e.entity_type}:{e.entity_id}"}
        for e in db.query(AuditLog).filter(AuditLog.action_type.in_(SNAPSHOT_ACTIONS))
        .filter((AuditLog.before_state.is_(None)) | (AuditLog.after_state.is_(None))).order_by(AuditLog.id).limit(200)
    ]
    return {
        "sequence": _sequence_check(db),
        "snapshots": {"ok": not missing_snapshots, "status": "pass" if not missing_snapshots else "fail",
                      "missing": missing_snapshots},
        "coverage": _coverage_check(db),
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
    good, bad, review = colors.HexColor("#0f7b3f"), colors.HexColor("#b42318"), colors.HexColor("#9a5b00")
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
    seq, cov = c["sequence"], c["coverage"]
    missing_ids = sum(g["missing"] for g in seq["gaps"])
    verdict = [
        ("Sequence", seq["status"], f"{seq['entries']} entries, ids {seq['first_id']}-{seq['last_id']}, no gaps" if seq["status"] == "pass"
         else f"{missing_ids} id(s) missing in {len(seq['gaps'])} gap(s). {seq['note']}"),
        ("Before / after snapshots", c["snapshots"]["status"], "every status change and update has both states" if c["snapshots"]["ok"]
         else f"{len(c['snapshots']['missing'])} change entr(ies) without a full snapshot"),
        ("Shipment coverage", cov["status"], f"all {cov['shipments_checked']} shipments match their last logged status" if cov["ok"]
         else f"{len(cov['untracked'])} shipment(s) in a status the audit trail never recorded: "
              + ", ".join(f"{u['tracking_number']} ({u['status']}, logged {u['last_logged_status'] or 'none'})" for u in cov["untracked"][:5])),
    ]
    story: List = [
        Paragraph("Audit Trail Compliance Report", styles["Title"]),
        Paragraph(f"{escape(filters_label)} &middot; {report['total']} entries &middot; generated "
                  f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", styles["Normal"]),
        Spacer(1, 5 * mm),
        Paragraph("Integrity checks (whole log)", styles["Heading2"]),
    ]
    shade = {"pass": good, "warn": review, "fail": bad}
    t = table([["Check", "Result", "Detail"]] + [[n, {"pass": "PASS", "warn": "REVIEW", "fail": "FAIL"}[st], Paragraph(escape(d), small)]
                                                  for n, st, d in verdict], [55 * mm, 22 * mm, 170 * mm])
    t.setStyle(TableStyle([("TEXTCOLOR", (1, i + 1), (1, i + 1), shade[st]) for i, (_, st, _) in enumerate(verdict)]
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
