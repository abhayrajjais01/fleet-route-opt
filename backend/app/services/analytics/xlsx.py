"""
xlsx.py - Minimal, dependency-free Excel (.xlsx) writer (Week 14 · Track A)

An .xlsx file is a zip of a few XML parts (Office Open XML, ECMA-376). This writes workbooks with one or more
sheets of plain rows: numbers stay numbers, everything else is an inline string, the header row is bold and
frozen. Enough for operational exports without pulling a spreadsheet library into the API image.

    data = workbook([("Deliveries", [["date", "km"], ["2026-11-20", 41.5]]), ("KPIs", [...])])
"""

from __future__ import annotations

import io
import zipfile
from typing import Iterable, List, Sequence, Tuple
from xml.sax.saxutils import escape

Sheet = Tuple[str, Sequence[Sequence[object]]]


def _col(n: int) -> str:
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def _cell(ref: str, value: object, header: bool) -> str:
    style = ' s="1"' if header else ""
    if isinstance(value, bool) or value is None:
        value = "" if value is None else ("TRUE" if value else "FALSE")
    if isinstance(value, (int, float)) and not header:
        return f'<c r="{ref}"{style}><v>{value}</v></c>'
    text = str(value)
    if text[:1] in ("=", "+", "-", "@"):        # never let a value become a formula (OWASP CSV/formula injection)
        text = "'" + text
    return f'<c r="{ref}" t="inlineStr"{style}><is><t xml:space="preserve">{escape(text)}</t></is></c>'


def _sheet_xml(rows: Sequence[Sequence[object]]) -> str:
    body = []
    for r, row in enumerate(rows, start=1):
        cells = "".join(_cell(f"{_col(c)}{r}", v, r == 1) for c, v in enumerate(row, start=1))
        body.append(f'<row r="{r}">{cells}</row>')
    widths = [max((len(str(row[i])) for row in rows if i < len(row)), default=8) for i in range(max((len(r) for r in rows), default=0))]
    cols = "".join(f'<col min="{i}" max="{i}" width="{min(60, w + 2)}" customWidth="1"/>' for i, w in enumerate(widths, start=1))
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            f'{"<cols>" + cols + "</cols>" if cols else ""}<sheetData>{"".join(body)}</sheetData></worksheet>')


def workbook(sheets: Iterable[Sheet]) -> bytes:
    sheets = list(sheets)
    names: List[str] = []
    for name, _ in sheets:                      # Excel: max 31 chars, no []:*?/\\, unique
        clean = "".join(ch for ch in name if ch not in '[]:*?/\\')[:31] or "Sheet"
        while clean in names:
            clean = clean[:28] + f"_{len(names)}"
        names.append(clean)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                   '<Default Extension="xml" ContentType="application/xml"/>'
                   '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                   '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                   + "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                             for i in range(1, len(sheets) + 1)) + "</Types>")
        z.writestr("_rels/.rels",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                   "</Relationships>")
        z.writestr("xl/workbook.xml",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                   'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
                   + "".join(f'<sheet name="{escape(n)}" sheetId="{i}" r:id="rId{i}"/>' for i, n in enumerate(names, start=1))
                   + "</sheets></workbook>")
        z.writestr("xl/_rels/workbook.xml.rels",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   + "".join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
                             for i in range(1, len(sheets) + 1))
                   + f'<Relationship Id="rId{len(sheets) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                   "</Relationships>")
        z.writestr("xl/styles.xml",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                   '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
                   '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
                   '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
                   '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
                   '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
                   '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
                   "</styleSheet>")
        for i, (_, rows) in enumerate(sheets, start=1):
            z.writestr(f"xl/worksheets/sheet{i}.xml", _sheet_xml(rows))
    return buf.getvalue()
