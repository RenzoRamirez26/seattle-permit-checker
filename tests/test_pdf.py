"""The PDF downloads (checker/pdf.py): the report and the preparation sheet for the café and salon demo cases."""
import copy
import json
import re

import pypdfium2 as pdfium
import pytest

from checker import audit, pdf, permit_draft, rules_engine

LETTER = (612, 792)                 # US Letter in points
MARGIN_PT = pdf.MARGIN / 25.4 * 72


@pytest.fixture(scope="module")
def cafe():
    from tests.conftest import ROOT
    extraction = json.loads((ROOT / "demo" / "flawed_extraction.json").read_text(encoding="utf-8"))
    return audit.audit(None, {"business_type": "cafe_restaurant", "cooking_on_site": True},
                       extraction=extraction, zoning_override="NC2-55 (M)")


@pytest.fixture(scope="module")
def salon():
    from tests.conftest import ROOT
    extraction = json.loads((ROOT / "demo" / "salon_flawed_extraction.json").read_text(encoding="utf-8"))
    return audit.audit(None, {"business_type": "salon"}, extraction=extraction, zoning_override="NR3")


def _pages(data: bytes) -> list[str]:
    """Text of each page, with line breaks and repeated spaces folded so wrapped sentences can be matched."""
    doc = pdfium.PdfDocument(data)
    return [re.sub(r"\s+", " ", doc[i].get_textpage().get_text_range()) for i in range(len(doc))]


def _text(data: bytes) -> str:
    return " ".join(_pages(data))


@pytest.mark.parametrize("case, title, finding, permit", [
    ("cafe", "Permit pre-check: Café or restaurant", "Not enough exits", "Food service plan review (before construction)"),
    ("salon", "Permit pre-check: Salon, barbershop or spa", "Door too narrow: Restroom door (Restroom)", "Salon or shop licence"),
])
def test_report_pdf(case, title, finding, permit, request):
    result = request.getfixturevalue(case)
    data = pdf.report_pdf(result)
    assert data[:5] == b"%PDF-" and isinstance(data, bytes)
    doc = pdfium.PdfDocument(data)
    assert len(doc) >= 1 and all(tuple(round(v) for v in doc[i].get_size()) == LETTER for i in range(len(doc)))

    pages, s = _pages(data), result["summary"]
    first, last, text = pages[0], pages[-1], " ".join(pages)
    notice = result["disclaimer"]
    assert "Pre-submission check only. Not a code determination" in notice
    assert first.startswith(title) and first.index(notice) < first.index("Fix list")      # title, then the notice, at the top
    assert notice in last and last.index(notice) > last.index("Code basis:")              # and the disclaimer closes the last page
    assert finding in text and any(permit in p["name"] and permit in text for p in result["permits_likely_required"])
    for n, page in enumerate(pages, 1):
        assert f"Page {n} of {len(pages)}" in page

    # the summary numbers, and the fix list in the audit's order with fix, reviewer and code section
    assert f"{s['fails']} {s['reviews']} {s['passes']} {s['occupant_load']} Group {s['occupancy_group']}" in first
    assert f"{s['exits_shown']} shown / {s['exits_required']} required" in first
    open_items = [f for f in result["findings"] if f["status"] != "pass"]
    positions = [text.index(f"{i}. [{rules_engine.STATUS_WORD[f['status']]} / {f['severity']}] {f['title']}")
                 for i, f in enumerate(open_items, 1)]
    assert positions == sorted(positions)
    for f in open_items:
        assert f["detail"] in text and f"Code: {f['citation']}" in text
        assert not f["fix"] or f"Fix: {f['fix']}" in text
        assert not f["reviewed_by"] or f"Checked by: {f['reviewed_by']}" in text
    # tables: every permit with its agency, every room of the occupant-load calculation
    for p in result["permits_likely_required"]:
        assert p["name"] in text and p["agency"] in text
    for r in result["occupant_load"]["by_space"]:
        assert f"{r['space']} {r['use']} {r['area_sqft']:g} {r['factor']} {r['load']}" in text


@pytest.mark.parametrize("case, finding, permit", [
    ("cafe", "Not enough exits", "Food service plan review (before construction)"),
    ("salon", "Aisle too narrow: Aisle A (between chairs)", "Salon or shop licence"),
])
def test_permit_sheet_pdf(case, finding, permit, request):
    result = request.getfixturevalue(case)
    data = pdf.permit_sheet_pdf(result)
    assert data[:5] == b"%PDF-"
    doc = pdfium.PdfDocument(data)
    assert len(doc) >= 1 and tuple(round(v) for v in doc[0].get_size()) == LETTER

    pages = _pages(data)
    first, last, text = pages[0], pages[-1], " ".join(pages)
    d = permit_draft.sheet(result)
    assert first.startswith(d["title"]) and "preparation aid, not the City of Seattle's official form" in first
    assert first.index(permit_draft.NOTICE) < first.index(permit_draft.SECTIONS[0])
    assert permit_draft.CURRENCY in first and "dated 2016" in first
    assert last.rstrip().split(" Permit application preparation sheet")[0].endswith(result["disclaimer"])   # last thing before the footer
    assert finding in text and any(permit in p["name"] and permit in text for p in result["permits_likely_required"])
    # each open problem is one line, title and severity; the fix and the code section are left to the report
    open_items = [f for f in result["findings"] if f["status"] != "pass"]
    assert d["open_items"] and len(d["open_items"]) == len(open_items)
    for line, f in zip(d["open_items"], open_items):
        assert line in text and line.endswith(f"{f['title']} ({f['severity']})")
        assert f["detail"] not in text and (not f["fix"] or f["fix"] not in text)
    assert permit_draft.OPEN_POINTER in text and "Code:" not in text

    # the same rows as the Markdown sheet, including the label on what the applicant must fill in
    for field, value, source in d["portal"] + d["plans"]:
        assert f"{field} {value or permit_draft.UNFILLED} {source}" in text, field
    assert text.count(permit_draft.UNFILLED) >= 10
    for item, source in d["uploads"]:
        assert f"{item} ({source})" in text
    for section in permit_draft.SECTIONS:
        assert section in text


def test_accents_quotes_and_marks_print(salon):
    """The embedded font must carry these; the fonts built into PDF cannot."""
    result = copy.deepcopy(salon)
    result["summary"]["business_label"] = "Café “Señor Müller’s” – crêpes & piñatas"
    result["findings"][0]["title"] = "Door too narrow: the “back” door, 30″ at 90°"
    result["findings"][0]["detail"] = "30\" clear at 90°; naïve façade 5′ 6″ wide, ±½ in., ≥ 32 in., 20 °C."
    in_both = ("Café “Señor Müller’s” – crêpes & piñatas", "the “back” door, 30″ at 90°")
    in_report_only = ('30" clear at 90°', "naïve façade 5′ 6″ wide", "±½ in., ≥ 32 in., 20 °C")     # the sheet lists titles only
    report, sheet = _text(pdf.report_pdf(result)), _text(pdf.permit_sheet_pdf(result))
    for needle in in_both + in_report_only:
        assert needle in report, needle
    for needle in in_both:
        assert needle in sheet, needle
    assert "Café or restaurant" in _text(pdf.report_pdf(rules_engine_result_for_cafe()))


def rules_engine_result_for_cafe() -> dict:
    from tests.conftest import ROOT
    extraction = json.loads((ROOT / "demo" / "flawed_extraction.json").read_text(encoding="utf-8"))
    return audit.audit(None, {"business_type": "cafe_restaurant"}, extraction=extraction)       # no zoning: still a valid report


def test_long_text_wraps_and_nothing_leaves_the_page(salon):
    result = copy.deepcopy(salon)
    unbroken = "https://www.seattle.gov/" + "a-very-long-address-with-no-spaces/" * 6
    result["findings"][0]["title"] = "Door too narrow " + "and this title keeps going " * 10
    result["findings"][0]["detail"] = unbroken
    result["findings"][0]["fix"] = "Widen it. " * 80
    result["permits_likely_required"][0]["name"] = "A very long permit name that must wrap inside its cell " * 6 + unbroken
    result["permits_likely_required"][0]["agency"] = "Seattle Department of Construction and Inspections " * 5
    result["occupant_load"]["by_space"][0]["space"] = "Waiting / Reception, front of house " * 8
    result["zoning"]["address"] = "1234 Northeast Very Long Boulevard, Suite 5678, Seattle, WA 98105 " * 4
    for data in (pdf.report_pdf(result), pdf.permit_sheet_pdf(result)):
        doc = pdfium.PdfDocument(data)
        for i in range(len(doc)):
            page = doc[i]
            width, height = page.get_size()
            textpage = page.get_textpage()
            assert textpage.count_rects() > 0
            for k in range(textpage.count_rects()):
                left, bottom, right, top = textpage.get_rect(k)
                assert left >= MARGIN_PT - 1 and right <= width - MARGIN_PT + 1, f"text leaves the side margin on page {i + 1}"
                assert bottom >= 28 and top <= height - 28, f"text leaves the top or bottom on page {i + 1}"
        text = _text(data)
        assert "this title keeps going and this title keeps going" in text and "must wrap inside its cell" in text
    assert "Widen it. Widen it." in _text(pdf.report_pdf(result))                    # the fix is in the report...
    sheet = _text(pdf.permit_sheet_pdf(result))
    assert "Widen it." not in sheet and "1234 Northeast Very Long Boulevard" in sheet   # ...and not repeated on the sheet


def test_the_pdfs_add_no_numbers_of_their_own(cafe, salon):
    """Every number printed is in the Markdown version of the same document (which is built from the audit) or is a page number."""
    for result in (cafe, salon):
        before = copy.deepcopy(result)
        pairs = ((pdf.report_pdf(result), rules_engine.to_markdown(result)),
                 (pdf.permit_sheet_pdf(result), permit_draft.to_markdown(result)))
        assert result == before                                             # building a PDF changes nothing in the result
        for data, markdown in pairs:
            pages = _pages(data)
            allowed = markdown.replace(",", "") + " " + " ".join(str(n) for n in range(1, len(pages) + 1))
            allowed += f" {len([f for f in result['findings'] if f['status'] != 'pass'])}"       # the fix list is numbered and counted
            allowed += f" {len([f for f in result['findings'] if f['status'] == 'pass'])}"
            allowed += " " + " ".join(str(i) for i in range(1, len(result["findings"]) + 1))
            for number in set(re.findall(r"\d[\d,]*\.?\d*", " ".join(pages))):
                assert number.replace(",", "").rstrip(".") in allowed, f"{number!r} is in the PDF but not in the Markdown"


def test_the_fonts_and_their_licence_are_in_the_repository():
    assert (pdf.FONT_DIR / "DejaVuSans.ttf").stat().st_size > 100_000 and (pdf.FONT_DIR / "DejaVuSans-Bold.ttf").exists()
    licence = (pdf.FONT_DIR / "LICENSE_DEJAVU").read_text(encoding="utf-8")
    assert "Bitstream Vera Fonts Copyright" in licence and "DejaVu" in licence
    assert "matplotlib" not in "".join(line for line in open(pdf.__file__, encoding="utf-8") if "import" in line)


def test_command_line_also_writes_the_pdf(tmp_path, capsys):
    out = tmp_path / "report"
    assert audit.main(["--extraction", "demo/salon_flawed_extraction.json", "--business", "salon", "--zoning", "NR3",
                       "--db", str(tmp_path / "none.sqlite"), "--out", str(out)]) == 0
    capsys.readouterr()
    assert out.with_suffix(".md").exists() and out.with_suffix(".json").exists()             # still written, as before
    data = out.with_suffix(".pdf").read_bytes()
    assert data[:5] == b"%PDF-" and "Permit pre-check: Salon, barbershop or spa" in _text(data)
    assert not (tmp_path / "report_sheet.pdf").exists() and len(list(tmp_path.glob("*.pdf"))) == 1   # the report only
