"""
executive_exports.py - CSV and PDF exports of the Executive KPI dashboard (US-008, Week 13 · Track B: Abhayraj Jaiswal)

  section_csv(report, section)  one CSV per dashboard view (kpis, daily, hours, drivers, density), so every chart and
                                table on the page can be opened in Excel exactly as it was shown
  summary_pdf(report)           a printable executive summary: headline KPIs with the change vs the previous period,
                                weekly volume, the weakest delivery hours and the driver ranking

Both take the dict built by executive_analytics.executive_report(), so an export always matches the dashboard
for the same filters.
"""

from __future__ import annotations

import csv
import io
from collections import OrderedDict
from datetime import date, datetime, timezone
from typing import Callable, Dict, List, Sequence

KPI_LABELS: Dict[str, str] = {
    "on_time_pct": "On-time delivery rate (%)",
    "otif_pct": "OTIF (%)",
    "deliveries": "Deliveries",
    "total_cost": "Total operating cost (INR)",
    "cost_per_delivery": "Cost per delivery (INR)",
    "fleet_utilisation_pct": "Fleet utilisation (%)",
    "total_km": "Total distance (km)",
    "failed_pct": "Failed deliveries (%)",
}

SECTIONS = ("kpis", "daily", "hours", "drivers", "density")


def _rows_kpis(r: Dict) -> List[List]:
    rows = [["kpi", "label", "value", "previous_period", "change", "change_pct", "higher_is_better"]]
    for k in r["kpis"]:
        rows.append([k["key"], KPI_LABELS.get(k["key"], k["key"]), k["value"], k["previous"], k["change"], k["change_pct"],
                     k["higher_is_better"]])
    return rows


def _rows_daily(r: Dict) -> List[List]:
    rows = [["date", "stops", "deliveries", "on_time", "late", "failed", "on_time_pct", "cost_inr", "km"]]
    rows += [[d["date"], d["stops"], d["deliveries"], d["on_time"], d["late"], d["failed"], d["on_time_pct"], d["cost"], d["km"]]
             for d in r["daily"]]
    return rows


def _rows_hours(r: Dict) -> List[List]:
    rows = [["hour", "stops", "on_time", "late", "failed", "on_time_pct"]]
    rows += [[f"{h['hour']:02d}:00", h["stops"], h["on_time"], h["late"], h["failed"], h["on_time_pct"]] for h in r["sla_by_hour"]]
    return rows


def _rows_drivers(r: Dict) -> List[List]:
    rows = [["rank", "driver", "hubs", "vehicle_types", "trips", "stops", "deliveries", "on_time_pct", "stops_per_hour",
             "km_per_stop", "cost_per_delivery_inr", "utilisation_pct"]]
    rows += [[d["rank"], d["driver"], " ".join(d["hubs"]), " ".join(d["vehicle_types"]), d["trips"], d["stops"], d["deliveries"],
              d["on_time_pct"], d["stops_per_hour"], d["km_per_stop"], d["cost_per_delivery"], d["utilisation_pct"]]
             for d in r["drivers"]]
    return rows


def _rows_density(r: Dict) -> List[List]:
    rows = [["cell_center_lat", "cell_center_lon", "stops", "on_time", "failed", "on_time_pct"]]
    rows += [[c["lat"], c["lon"], c["stops"], c["on_time"], c["failed"], c["on_time_pct"]] for c in r["density"]["cells"]]
    return rows


_BUILDERS: Dict[str, Callable[[Dict], List[List]]] = {
    "kpis": _rows_kpis, "daily": _rows_daily, "hours": _rows_hours, "drivers": _rows_drivers, "density": _rows_density,
}


def section_csv(report: Dict, section: str) -> str:
    if section not in _BUILDERS:
        raise ValueError(f"section must be one of: {', '.join(SECTIONS)}")
    buf = io.StringIO()
    w = csv.writer(buf)
    # Two comment-style header lines so a downloaded file says what it covers.
    w.writerow([f"# Executive KPIs - {section}", f"{report['period']['date_from']} to {report['period']['date_to']}"])
    active = [f"{k}={v}" for k, v in report["filters"].items() if v]
    w.writerow(["# filters"] + (active or ["none"]))
    w.writerows(_BUILDERS[section](report))
    return buf.getvalue()


def export_filename(report: Dict, section: str, ext: str) -> str:
    p = report["period"]
    return f"executive-{section}-{p['date_from']}-to-{p['date_to']}.{ext}"


def _weekly(daily: Sequence[Dict]) -> List[Dict]:
    weeks: "OrderedDict[str, Dict]" = OrderedDict()
    for d in daily:
        day = date.fromisoformat(d["date"])
        key = f"{day.isocalendar()[0]}-W{day.isocalendar()[1]:02d}"
        w = weeks.setdefault(key, {"week": key, "first": d["date"], "last": d["date"], "stops": 0, "on_time": 0, "late": 0,
                                   "failed": 0, "cost": 0.0})
        w["last"] = d["date"]
        for f in ("stops", "on_time", "late", "failed"):
            w[f] += d[f]
        w["cost"] += d["cost"]
    return list(weeks.values())


def _fmt_kpi(key: str, v) -> str:
    if v is None:
        return "-"
    if key.endswith("_pct"):
        return f"{v:.1f}%"
    if key in ("total_cost", "cost_per_delivery"):
        return f"INR {v:,.0f}"
    if key == "total_km":
        return f"{v:,.0f} km"
    return f"{v:,.0f}"


def _fmt_change(k: Dict) -> str:
    if k["change"] is None:
        return "-"
    if k["change"] == 0:
        return "no change"
    better = (k["change"] > 0) == k["higher_is_better"]
    unit = " pts" if k["key"].endswith("_pct") else ""
    pct = f" ({k['change_pct']:+.1f}%)" if k["change_pct"] is not None and not k["key"].endswith("_pct") else ""
    return f"{k['change']:+,.1f}{unit}{pct} {'better' if better else 'worse'}"


def summary_pdf(report: Dict, filters_label: str) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    styles = getSampleStyleSheet()
    ink, accent, line = colors.HexColor("#1c1a2b"), colors.HexColor("#2a78d6"), colors.HexColor("#e3e0ee")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title="Executive KPI Summary", author="AI Fleet Route Optimizer")
    p, pp = report["period"], report["previous_period"]
    story: List = [
        Paragraph("Executive KPI Summary", styles["Title"]),
        Paragraph(f"{p['date_from']} to {p['date_to']} ({p['days']} days) &middot; {filters_label} &middot; "
                  f"compared with {pp['date_from']} to {pp['date_to']} &middot; "
                  f"generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", styles["Normal"]),
        Spacer(1, 6 * mm),
    ]

    def table(rows, widths, align_right_from: int = 1):
        t = Table(rows, colWidths=widths, hAlign="LEFT", repeatRows=1)
        t.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, -1), "Helvetica", 9), ("TEXTCOLOR", (0, 0), (-1, -1), ink),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9), ("TEXTCOLOR", (0, 0), (-1, 0), accent),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, line), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (align_right_from, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        return t

    story += [Paragraph("Headline KPIs", styles["Heading2"]),
              table([["KPI", "This period", "Previous period", "Change"]] +
                    [[KPI_LABELS.get(k["key"], k["key"]), _fmt_kpi(k["key"], k["value"]), _fmt_kpi(k["key"], k["previous"]),
                      _fmt_change(k)] for k in report["kpis"]], [62 * mm, 32 * mm, 32 * mm, 48 * mm]),
              Spacer(1, 6 * mm)]

    weeks = _weekly(report["daily"])
    story += [Paragraph("Volume by week", styles["Heading2"]),
              table([["Week", "Days", "Stops", "On time", "Late", "Failed", "On-time %", "Cost"]] +
                    [[w["week"], f"{w['first'][5:]} - {w['last'][5:]}", w["stops"], w["on_time"], w["late"], w["failed"],
                      f"{100 * w['on_time'] / w['stops']:.1f}%" if w["stops"] else "-", f"INR {w['cost']:,.0f}"] for w in weeks],
                    [22 * mm, 26 * mm, 18 * mm, 20 * mm, 16 * mm, 18 * mm, 22 * mm, 32 * mm], align_right_from=2),
              Spacer(1, 6 * mm)]

    hours = [h for h in report["sla_by_hour"] if h["stops"]]
    weakest = sorted(hours, key=lambda h: (h["on_time_pct"] if h["on_time_pct"] is not None else 101))[:5]
    story += [Paragraph("Weakest delivery hours", styles["Heading2"]),
              table([["Hour of arrival", "Stops", "On time", "Late", "Failed", "On-time %"]] +
                    [[f"{h['hour']:02d}:00 - {h['hour']:02d}:59", h["stops"], h["on_time"], h["late"], h["failed"],
                      f"{h['on_time_pct']:.1f}%"] for h in weakest], [40 * mm, 22 * mm, 22 * mm, 22 * mm, 22 * mm, 26 * mm]),
              Spacer(1, 6 * mm)]

    story += [Paragraph("Driver ranking", styles["Heading2"]),
              table([["#", "Driver", "Trips", "Stops", "On-time %", "Stops / h", "km / stop", "Cost / delivery"]] +
                    [[d["rank"], d["driver"], d["trips"], d["stops"], f"{d['on_time_pct']:.1f}%", f"{d['stops_per_hour']:.2f}",
                      f"{d['km_per_stop']:.1f}", f"INR {d['cost_per_delivery']:,.0f}"] for d in report["drivers"]],
                    [10 * mm, 40 * mm, 16 * mm, 16 * mm, 22 * mm, 20 * mm, 20 * mm, 30 * mm], align_right_from=2),
              Spacer(1, 6 * mm)]

    a = report["assumptions"]
    story.append(Paragraph(
        f"Source: {report['source']}. Costs assume fuel at INR {a['fuel_price_per_l']:.0f}/L and drivers at "
        f"INR {a['driver_cost_per_hour']:.0f}/h. With a priority filter, distance and cost cover the whole trips that "
        f"served those stops.", styles["Italic"]))
    doc.build(story)
    return buf.getvalue()
