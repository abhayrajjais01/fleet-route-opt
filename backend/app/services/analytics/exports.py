"""
exports.py - CSV Audit Export & PDF Executive Summary (US-007, Week 14 · Track A)

  stops_csv()   one row per delivery attempt: the raw data behind every KPI, for operational audits
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


def stops_csv(trips: Iterable[TripRecord]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_COLUMNS)
    for t in trips:
        for s in t.stops:
            late = max(0.0, (s.arrival or 0) - s.window_close) if s.arrival is not None else ""
            w.writerow([
                t.date, t.trip_id, t.hub, t.vehicle_id, t.vehicle_type, t.driver, s.shipment_id, s.customer, s.priority,
                s.weight_kg, _hhmm(s.window_close), _hhmm(s.arrival), round(late, 1) if late != "" else "",
                s.delivered, s.in_full, s.on_time, s.otif, t.distance_km, t.duration_min,
            ])
    return buf.getvalue()


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
