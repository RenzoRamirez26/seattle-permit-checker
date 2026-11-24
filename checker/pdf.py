"""PDF downloads: the pre-check report and the permit application preparation sheet, as printable pages.

In:  one audit result (the same dict rules_engine.to_markdown() and permit_draft.to_markdown() take).
Out: report_pdf(result) and permit_sheet_pdf(result) each return the bytes of a PDF: US Letter,
     black text with borders (no colour needed), page numbers, the one-line pre-check note beside the
     results at the top and the disclaimer at the end. When any finding uses a rule whose values are still
     being checked against the code, the first page says so once and each such finding says so too.

This module only lays content out. It adds no rules and no numbers: the report is built from the
audit result and the preparation sheet from permit_draft.sheet(), the same data the Markdown
versions print. Wording that is not in the result comes from rules_engine or permit_draft.

Font: DejaVu Sans 2.35, embedded from checker/fonts/ so that accented letters ("Café"),
quotation marks and other marks print correctly; the fonts built into the PDF format cannot.
The font is from the DejaVu Fonts project (https://dejavu-fonts.github.io) under the Bitstream
Vera licence, which allows embedding and redistribution; the licence is checker/fonts/LICENSE_DEJAVU.

Built with fpdf2 (pure Python, pinned in requirements.txt).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Optional, Sequence

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from fpdf.fonts import FontFace

from . import permit_draft, rules_engine

FONT_DIR = Path(__file__).resolve().parent / "fonts"
FONT = "DejaVu"
MARGIN = 16          # mm, all four sides
BODY, SMALL, H1, H2 = 9.5, 8.5, 16, 11.5      # point sizes
LINE = 4.6           # mm, line height of body text
GREY = 232           # light fill behind headings and the notice: prints as pale grey, text stays black

REPORT_NAME = "PermitOS"


class _Doc(FPDF):
    """A US Letter page with the embedded font, margins, and 'Page n of N' at the foot of every page."""

    def __init__(self, title: str, footer_text: str):
        super().__init__(orientation="portrait", unit="mm", format="Letter")
        self.footer_text = footer_text
        self.add_font(FONT, "", FONT_DIR / "DejaVuSans.ttf")
        self.add_font(FONT, "B", FONT_DIR / "DejaVuSans-Bold.ttf")
        self.set_margins(MARGIN, MARGIN, MARGIN)
        self.set_auto_page_break(True, margin=MARGIN + 6)
        self.set_title(title)
        self.set_creator(REPORT_NAME)
        self.add_page()
        self.set_font(FONT, "", BODY)

    # ------------------------------------------------------------ page furniture
    def footer(self) -> None:
        self.set_y(-MARGIN)
        self.set_font(FONT, "", 7.5)
        self.cell(self.epw / 2, 4, self.footer_text, align="L")
        self.cell(self.epw / 2, 4, f"Page {self.page_no()} of {{nb}}", align="R")

    # ------------------------------------------------------------ building blocks
    def _text(self, text: str, size: float = BODY, bold: bool = False, gap: float = 1.5, indent: float = 0) -> None:
        self.set_font(FONT, "B" if bold else "", size)
        self.set_x(self.l_margin + indent)
        self.multi_cell(self.epw - indent, LINE * size / BODY, text, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(gap)

    def big_title(self, text: str) -> None:
        self._text(text, H1, bold=True, gap=2.5)

    def heading(self, text: str) -> None:
        if self.get_y() > self.h - self.b_margin - 25:      # do not leave a heading alone at the foot of a page
            self.add_page()
        self.ln(2)
        self._text(text, H2, bold=True, gap=1.5)

    def paragraph(self, text: str, bold: bool = False) -> None:
        self._text(text, BODY, bold=bold)

    def bullet(self, text: str, mark: str = "•") -> None:
        self.set_font(FONT, "", BODY)
        self.set_x(self.l_margin + 1)
        self.cell(5, LINE, mark)
        self.multi_cell(self.epw - 6, LINE, text, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(0.8)

    def box(self, parts: Sequence[tuple[str, bool]], fill: bool = False) -> None:
        """Paragraphs inside one bordered box that is never split across pages. parts = [(text, bold), ...]."""
        pad, width = 2.5, self.epw - 5

        def height() -> float:
            total = 0.0
            for text, bold in parts:
                self.set_font(FONT, "B" if bold else "", BODY)
                total += self.multi_cell(width, LINE, text, align="L", dry_run=True, output="HEIGHT") + 1
            return total + 2 * pad - 1

        h = height()
        if self.get_y() + h > self.h - self.b_margin and h < self.h - self.t_margin - self.b_margin:
            self.add_page()
        top = self.get_y()
        if h < self.h - self.t_margin - self.b_margin:      # a box taller than a page is left to flow, without a frame
            self.set_fill_color(GREY)
            self.rect(self.l_margin, top, self.epw, h, style="DF" if fill else "D")
        self.set_y(top + pad)
        for text, bold in parts:
            self.set_font(FONT, "B" if bold else "", BODY)
            self.set_x(self.l_margin + pad)
            self.multi_cell(width, LINE, text, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.ln(1)
        self.set_y(max(self.get_y(), top + h) + 2.5)

    def grid(self, columns: Sequence[str], rows: Sequence[Sequence[Any]], widths: Sequence[float]) -> None:
        """A table with a shaded heading row. Long text wraps inside its cell; headings repeat on a new page."""
        self.set_font(FONT, "", SMALL)
        self.set_fill_color(255)            # body rows stay white; only the heading row is shaded
        with self.table(col_widths=tuple(widths), width=self.epw, align="LEFT", text_align="LEFT",
                        line_height=LINE * SMALL / BODY, padding=0.8,
                        headings_style=FontFace(emphasis="BOLD", fill_color=GREY)) as table:
            head = table.row()
            for c in columns:
                head.cell(str(c))
            for r in rows:
                row = table.row()
                for value in r:
                    row.cell(str(value))
        self.set_font(FONT, "", BODY)
        self.ln(2.5)

    def finish(self) -> bytes:
        return bytes(self.output())


def _markdown_lines(pdf: _Doc, lines: list[str]) -> None:
    """Lay out the few Markdown shapes rules_engine.local_data_markdown() produces: a heading, sentences, bullets, a table."""
    table: list[list[str]] = []

    def flush() -> None:
        if table:
            pdf.grid(table[0], table[1:], [2] + [1.4] * (len(table[0]) - 1))
            table.clear()

    for line in lines:
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if not all(set(c) <= set("-: ") for c in cells):
                table.append(cells)
            continue
        flush()
        if line.startswith("## "):
            pdf.heading(line[3:])
        elif line.startswith("- "):
            pdf.bullet(line[2:])
        elif line.strip():
            pdf.paragraph(line)
    flush()


# ---------------------------------------------------------------- the pre-check report
def report_pdf(result: dict, title: Optional[str] = None) -> bytes:
    """The pre-check report: the same content as rules_engine.to_markdown(result)."""
    s = result["summary"]
    heading = title or f"Permit pre-check: {s['business_label']}"
    pdf = _Doc(heading, f"{REPORT_NAME}: {s['business_label']}")
    pdf.big_title(heading)
    label = rules_engine.STATUS_WORD
    pdf.grid([label["fail"], label["review"], label["pass"], "Occupant load", "Occupancy group", "Exits"],
             [[s["fails"], s["reviews"], s["passes"], s["occupant_load"], f"Group {s['occupancy_group']}",
               f"{s['exits_shown']} shown / {s['exits_required']} required"]], [1.2, 1.2, 1.1, 1.1, 1.2, 1.6])
    if figures_unverified(result):
        pdf.paragraph(rules_engine.UNVERIFIED_FIGURES)                    # right under the figures it qualifies
    some_unverified = any(not f.get("rule_verified") for f in result["findings"])
    pdf.box([(rules_engine.PRECHECK_NOTE, True)]                           # beside the results it qualifies
            + ([(rules_engine.SOME_UNVERIFIED, False)] if some_unverified else []), fill=True)

    open_items = [f for f in result["findings"] if f["status"] != "pass"]   # already sorted, most serious first
    pdf.heading(f"Fix list ({len(open_items)}, most serious first)")
    if not open_items:
        pdf.paragraph(rules_engine.NOTHING_OPEN)
    for i, f in enumerate(open_items, 1):
        parts = [(f"{i}. {f['title']}", True), (f"{label[f['status']]} ({f['severity']})", False), (f["detail"], False)]
        if f.get("fix"):
            parts.append((f"Fix: {f['fix']}", False))
        if f.get("reviewed_by"):
            parts.append((f"Who to ask: {f['reviewed_by']}", False))
        parts.append((f"Code: {f['citation']}", False))
        if not f.get("rule_verified"):
            parts.append((rules_engine.UNVERIFIED_NOTE, False))
        pdf.box(parts)

    pdf.heading("Permits and approvals you will likely need")
    pdf.grid(["Permit or approval", "Who issues it"],
             [[permit_name(p), p["agency"]] for p in result["permits_likely_required"]], [1.25, 1])

    _markdown_lines(pdf, rules_engine.local_data_markdown(result.get("local_review_data")))

    pdf.heading("How the occupant load was calculated")
    pdf.grid(["Space", "Use", "Area (sq ft)", "Sq ft per person", "Load"],
             [[r["space"], r["use"], f"{r['area_sqft']:g}", r["factor"], r["load"]] for r in result["occupant_load"]["by_space"]],
             [2.2, 1.4, 1, 1.1, 0.8])
    if not result["occupant_load"].get("rule_verified"):
        pdf.paragraph(rules_engine.UNVERIFIED_FACTORS)

    passed = [f for f in result["findings"] if f["status"] == "pass"]
    if passed:
        pdf.heading(f"{label['pass']} ({len(passed)})")
        for f in passed:
            note = "" if f.get("rule_verified") else f" {rules_engine.UNVERIFIED_NOTE}"
            pdf.bullet(f"{f['title']}: {f['detail']} ({f['citation']}){note}")

    pdf.ln(2)
    pdf.box([(f"Code basis: {result['code_basis']}", False), (result["disclaimer"], True)], fill=True)   # last thing in the document
    return pdf.finish()


def permit_name(p: dict) -> str:
    """A permit's name, with the rules engine's "May be needed" sentence when it depends on an answer left as Not sure,
    and the unchecked note when it is listed because of a value still being checked against the code."""
    name = f"{p['name']}. {p['may_be_needed']}" if p.get("may_be_needed") else p["name"]
    name = name if p.get("rule_verified", True) else f"{name}. {rules_engine.UNVERIFIED_PERMIT}"
    return name if p.get("entry_verified", True) else f"{name}. {rules_engine.UNVERIFIED_ENTRY}"


def figures_unverified(result: dict) -> bool:
    """The occupant load, the group (OCC-1) or the exits required (EG-1) rest on values not yet checked."""
    checked = {f["rule_id"]: f.get("rule_verified") for f in result["findings"]}
    return not (result["occupant_load"].get("rule_verified") and checked.get("OCC-1") and checked.get("EG-1"))


# ---------------------------------------------------------------- the permit application preparation sheet
def permit_sheet_pdf(result: dict) -> bytes:
    """The preparation sheet: the same content as permit_draft.to_markdown(result)."""
    d = permit_draft.sheet(result)
    pdf = _Doc(d["title"], d["title"])
    pdf.big_title(d["title"])
    pdf.box([(d["notice"], True), (d["currency"], False)] + ([(d["unverified"], False)] if d["unverified"] else []), fill=True)

    def fields(rows: list[tuple[str, Optional[str], str]]) -> None:
        pdf.grid(permit_draft.TABLE_COLUMNS, [[field, value or permit_draft.UNFILLED, source] for field, value, source in rows],
                 [1.25, 2, 1])

    pdf.heading(permit_draft.SECTIONS[0])
    fields(d["portal"])
    pdf.heading(permit_draft.SECTIONS[1])
    fields(d["plans"])
    if d["rooms"]:
        pdf.grid(permit_draft.ROOM_COLUMNS,
                 [[r["space"], r["use"], f"{r['area_sqft']:g}", r["factor"], r["load"]] for r in d["rooms"]], [2.2, 1.4, 1, 1.1, 0.8])
        if d["rooms_unverified"]:
            pdf.paragraph(d["rooms_unverified"])

    pdf.heading(permit_draft.SECTIONS[2])
    for item, source in d["uploads"]:
        pdf.bullet(f"{item} ({source})", mark="☐")                    # an empty box to tick on paper

    pdf.heading(permit_draft.SECTIONS[3])
    pdf.paragraph(permit_draft.PERMITS_HEADING, bold=True)
    pdf.grid(["Permit or approval", "Who issues it"], [[permit_name(p), p["agency"]] for p in d["permits"]], [1.25, 1])
    pdf.paragraph(f"{permit_draft.OPEN_HEADING} ({len(d['open_items'])})", bold=True)
    for line in d["open_items"]:
        pdf.bullet(line)
    pdf.paragraph(d["open_pointer"] if d["open_items"] else d["nothing_open"])

    pdf.ln(2)
    pdf.box([(d["disclaimer"], True)], fill=True)
    return pdf.finish()
