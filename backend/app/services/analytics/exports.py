"""
exports.py - CSV Audit Export & PDF Executive Summary (US-007, Week 14 · Track A)

  stops_csv()   one row per delivery attempt: the raw data behind every KPI, for operational audits
  stops_xlsx()  the same rows as an Excel workbook, plus KPI and per-hub sheets
  summary_pdf() a one-to-two page executive trip summary (KPIs, per-hub table, worst late deliveries)

Both take the same filtered TripRecords the metrics API uses, so an export always matches what the
dashboard showed for the same filters.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Sequence

from app.services.analytics.metrics import Metrics, TripRecord, breakdown, compute_metrics

CSV_COLUMNS = [
    "date", "trip_id", "hub", "vehicle", "vehicle_type", "driver", "shipment_id", "customer", "priority", "weight_kg",
    "window_close", "actual_arrival", "minutes_late", "delivered", "in_full", "on_time", "otif",
    "trip_distance_km", "trip_duration_min",
]


def _hhmm(m: float | None) -> str:
    if m is None:
        return ""
    m = int(round(m)) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def _safe_cell(value):
    """Neutralise spreadsheet formula injection (OWASP): text starting with = + - @ or a control char is prefixed with '."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def _stop_rows(trips: Iterable[TripRecord]) -> List[List]:
    rows = []
    for t in trips:
        for s in t.stops:
            late = round(max(0.0, s.arrival - s.window_close), 1) if s.arrival is not None else ""
            rows.append([t.date, t.trip_id, t.hub, t.vehicle_id, t.vehicle_type, t.driver, s.shipment_id, s.customer, s.priority,
                         s.weight_kg, _hhmm(s.window_close), _hhmm(s.arrival), late,
                         s.delivered, s.in_full, s.on_time, s.otif, t.distance_km, t.duration_min])
    return rows


def stops_csv(trips: Iterable[TripRecord]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_COLUMNS)
    for row in _stop_rows(trips):
        w.writerow([_safe_cell(v) for v in row])
    return buf.getvalue()


def stops_xlsx(trips: Sequence[TripRecord], fuel_price_per_l: float, driver_cost_per_hour: float) -> bytes:
    """Excel workbook: every delivery attempt, the KPIs with their definitions, and the per-hub breakdown."""
    from app.services.analytics.xlsx import workbook
    m = compute_metrics(trips, fuel_price_per_l, driver_cost_per_hour)
    by_hub = breakdown(trips, lambda t: t.hub, fuel_price_per_l=fuel_price_per_l, driver_cost_per_hour=driver_cost_per_hour)
    kpi_rows = [["metric", "value"]] + [[k, v] for k, v in m.as_dict().items()]
    hub_cols = ["trips", "stops", "otif_pct", "on_time_pct", "total_km", "total_cost", "co2_kg", "overtime_hours", "saving_vs_separate"]
    hub_rows = [["hub", *hub_cols]] + [[h, *(getattr(x, c) for c in hub_cols)] for h, x in by_hub.items()]
    return workbook([("Deliveries", [CSV_COLUMNS, *_stop_rows(trips)]), ("KPIs", kpi_rows), ("By hub", hub_rows)])


def summary_pdf(trips: Sequence[TripRecord], title_filters: str, fuel_price_per_l: float, driver_cost_per_hour: float) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    m: Metrics = compute_metrics(trips, fuel_price_per_l, driver_cost_per_hour)
    by_hub: Dict[str, Metrics] = breakdown(trips, lambda t: t.hub, fuel_price_per_l=fuel_price_per_l, driver_cost_per_hour=driver_cost_per_hour)
    dates = sorted({t.date for t in trips})

    styles = getSampleStyleSheet()
    ink, accent, line = colors.HexColor("#1c1a2b"), colors.HexColor("#6d28d9"), colors.HexColor("#e3e0ee")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title="Executive Trip Summary", author="AI Fleet Route Optimizer")
    story: List = [
        Paragraph("Executive Trip Summary", styles["Title"]),
        Paragraph(f"{dates[0] if dates else '-'} to {dates[-1] if dates else '-'} &middot; {title_filters} &middot; "
                  f"generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", styles["Normal"]),
        Spacer(1, 8 * mm),
    ]

    def table(rows, widths, header=True):
        t = Table(rows, colWidths=widths, hAlign="LEFT")
        cmds = [("FONT", (0, 0), (-1, -1), "Helvetica", 9), ("TEXTCOLOR", (0, 0), (-1, -1), ink),
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, line), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]
        if header:
            cmds += [("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9), ("TEXTCOLOR", (0, 0), (-1, 0), accent)]
        t.setStyle(TableStyle(cmds))
        return t

    kpis = [
        ["Metric", "Value", "Definition"],
        ["OTIF", f"{m.otif_pct}%", "on time and in full / all stops"],
        ["On-time deliveries", f"{m.on_time_pct}%", "arrival before window close"],
        ["SLA breach rate", f"{m.sla_breach_pct}%", "arrivals after window close"],
        ["Failed deliveries", f"{m.failed_pct}%", "not delivered"],
        ["Trips / stops", f"{m.trips} / {m.stops}", ""],
        ["Average transit", f"{m.avg_transit_min / 60:.1f} h", "hub departure to return"],
        ["Route efficiency index", f"{m.route_efficiency_index}x", "separate-trip km / actual km"],
        ["Distance driven", f"{m.total_km:,.0f} km", ""],
        ["Fuel burn", f"{m.fuel_l_per_100km} L/100 km", f"{m.fuel_l:,.0f} L in total"],
        ["Cost per ton-km", f"Rs {m.cost_per_ton_km}", f"fuel Rs {fuel_price_per_l:g}/L + driver Rs {driver_cost_per_hour:g}/h"],
        ["Fleet utilisation", f"{m.fleet_utilisation_pct}%", "load / payload"],
        ["Operating cost", f"Rs {m.total_cost:,.0f}", f"energy Rs {m.energy_cost:,.0f} + drivers Rs {m.driver_cost:,.0f}"],
        ["Driver overtime", f"{m.overtime_hours:,.1f} h", f"Rs {m.overtime_cost:,.0f} extra (2x rate after 8 h, MTW Act s.27)"],
        ["CO2 emitted", f"{m.co2_kg:,.0f} kg", f"{m.co2_kg_per_100km} kg/100 km (diesel 2.68 kg/L, EV grid 0.716 kg/kWh)"],
        ["Saved by consolidation", f"Rs {m.saving_vs_separate:,.0f}", f"and {m.co2_saved_kg:,.0f} kg CO2 vs one trip per customer"],
    ]
    story += [Paragraph("Key performance indicators", styles["Heading2"]), table(kpis, [55 * mm, 35 * mm, 80 * mm]), Spacer(1, 6 * mm)]

    hub_rows = [["Hub", "Trips", "Stops", "OTIF", "On time", "km", "Cost/ton-km"]] + [
        [hub, x.trips, x.stops, f"{x.otif_pct}%", f"{x.on_time_pct}%", f"{x.total_km:,.0f}", f"Rs {x.cost_per_ton_km}"] for hub, x in by_hub.items()]
    story += [Paragraph("By hub", styles["Heading2"]), table(hub_rows, [32 * mm, 18 * mm, 18 * mm, 22 * mm, 22 * mm, 22 * mm, 30 * mm]), Spacer(1, 6 * mm)]

    late = sorted(((t, s) for t in trips for s in t.stops if s.arrival is not None and s.arrival > s.window_close),
                  key=lambda ts: ts[1].window_close - (ts[1].arrival or 0))[:10]
    late_rows = [["Date", "Shipment", "Customer", "Vehicle", "Window close", "Arrived", "Late"]] + [
        [t.date, s.shipment_id[-6:], s.customer, t.vehicle_id, _hhmm(s.window_close), _hhmm(s.arrival), f"{round(s.arrival - s.window_close)} min"]
        for t, s in late]
    story += [Paragraph("Latest-arriving deliveries (top 10)", styles["Heading2"]),
              table(late_rows, [22 * mm, 18 * mm, 32 * mm, 30 * mm, 24 * mm, 20 * mm, 18 * mm]) if late else Paragraph("No late deliveries in this period.", styles["Normal"]),
              Spacer(1, 6 * mm),
              Paragraph("Source: simulated dispatch history produced by the VRPTW solver and ETA engine. Figures are for demonstration.", styles["Italic"])]
    doc.build(story)
    return buf.getvalue()
