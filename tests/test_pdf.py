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
    ("cafe", "Permit pre-check: Café or restaurant", "Add a second exit", "Food service plan review (before construction)"),
    ("salon", "Permit pre-check: Salon, barbershop or spa", "Widen the door: Restroom door (Restroom)", "Salon or shop licence"),
])
def test_report_pdf(case, title, finding, permit, request):
    result = request.getfixturevalue(case)
    data = pdf.report_pdf(result)
    assert data[:5] == b"%PDF-" and isinstance(data, bytes)
    doc = pdfium.PdfDocument(data)
    assert len(doc) >= 1 and all(tuple(round(v) for v in doc[i].get_size()) == LETTER for i in range(len(doc)))

    pages, s = _pages(data), result["summary"]
    first, last, text = pages[0], pages[-1], " ".join(pages)
    note, notice = rules_engine.PRECHECK_NOTE, result["disclaimer"]
    assert note == "A pre-check from the checks we ran, not a city approval." and "Not a code determination" in notice
    assert first.startswith(title) and first.index(note) < first.index("Fix list")        # title, then the note beside the results
    assert text.count(note) == 1 and text.count(notice) == 1                              # each caveat once
    assert notice in last and last.index(notice) > last.index("Code basis:")              # and the disclaimer closes the last page
    labels = ("Fix before you apply", "Check with the city", "No issues found")
    assert first.index(note) > max(first.index(x) for x in labels)                        # beside the three status counts
    assert not re.search(r"\b(OK|Pass|Passed|MUST FIX|FAIL|CONFIRM)\b", text) and "Checked by" not in text
    assert finding in text and any(permit in p["name"] and permit in text for p in result["permits_likely_required"])
    for n, page in enumerate(pages, 1):
        assert f"Page {n} of {len(pages)}" in page

    # the summary numbers, and the fix list in the audit's order with fix, reviewer and code section
    assert f"{s['fails']} {s['reviews']} {s['passes']} {s['occupant_load']} Group {s['occupancy_group']}" in first
    assert f"{s['exits_shown']} shown / {s['exits_required']} required" in first
    open_items = [f for f in result["findings"] if f["status"] != "pass"]
    positions = [text.index(f"{i}. {f['title']} {rules_engine.STATUS_WORD[f['status']]} ({f['severity']})")
                 for i, f in enumerate(open_items, 1)]
    assert positions == sorted(positions)
    for f in open_items:
        assert f["detail"] in text and f"Code: {f['citation']}" in text
        assert f"Code: {f['citation']} {rules_engine.level_words(f)}" in text           # the level right after the code section
        assert not f["fix"] or f"Fix: {f['fix']}" in text
        assert not f["reviewed_by"] or f"Who to ask: {f['reviewed_by']}" in text
    # the counts: one line on the first page, beside the pre-check note; then each finding's level
    counts = rules_engine.result_counts_sentence(result)
    assert first.index(counts) > first.index(note) and "Some rule values" not in text
    assert first.index(counts) < first.index("Fix list") and text.count(counts) == 1
    flowing = re.sub(rf" {re.escape(pdf.REPORT_NAME)}: {re.escape(s['business_label'])} Page \d+ of \d+ ", " ", text)
    unchecked = [f for f in result["findings"] if f["check_level"] == "unchecked"]
    assert unchecked and flowing.count(rules_engine.UNVERIFIED_NOTE) == len(unchecked)  # a note may run across a page break
    assert (rules_engine.UNVERIFIED_FACTORS in flowing) is (result["occupant_load"]["check_level"] == "unchecked")
    # tables: every permit with its agency, every room of the occupant-load calculation
    for p in result["permits_likely_required"]:
        assert p["name"] in text and p["agency"] in text
    for r in result["occupant_load"]["by_space"]:
        assert f"{r['space']} {r['use']} {r['area_sqft']:g} {r['factor']} {r['load']}" in text


@pytest.mark.parametrize("case, finding, permit", [
    ("cafe", "Add a second exit", "Food service plan review (before construction)"),
    ("salon", "Widen the aisle: Aisle A (between chairs)", "Salon or shop licence"),
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
    assert d["levels"] in first and first.index(d["levels"]) < first.index(permit_draft.SECTIONS[0])
    assert d["levels"] == rules_engine.result_counts_sentence(result)
    assert (permit_draft.UNVERIFIED_FACTORS in text) is (result["occupant_load"]["check_level"] == "unchecked")   # under the rooms table
    assert last.rstrip().split(" Permit application preparation sheet")[0].endswith(result["disclaimer"])   # last thing before the footer
    assert finding in text and any(permit in p["name"] and permit in text for p in result["permits_likely_required"])
    # each open problem is one line, title and severity; the fix and the code section are left to the report
    open_items = [f for f in result["findings"] if f["status"] != "pass"]
    assert d["open_items"] and len(d["open_items"]) == len(open_items)
    flowing = re.sub(rf" {re.escape(d['title'])} Page \d+ of \d+ ", " ", text)         # a line may run across a page break
    for line, f in zip(d["open_items"], open_items):
        note = f". {rules_engine.level_words(f)}"
        assert line in flowing and line == f"{permit_draft.STATUS_LABEL[f['status']]}: {f['title']} ({f['severity']}){note}"
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


def test_a_permit_that_may_be_needed_says_so_in_both_pdfs():
    """Q1/Q9: the PDFs use the site's words for a permit that depends on an answer left as Not sure."""
    from tests.conftest import ROOT
    extraction = json.loads((ROOT / "demo" / "flawed_extraction.json").read_text(encoding="utf-8"))
    result = audit.audit(None, {"business_type": "cafe_restaurant", "cooking_on_site": True, "serves_alcohol": None},
                         extraction=extraction, zoning_override="NC2-55 (M)")
    for data in (pdf.report_pdf(result), pdf.permit_sheet_pdf(result)):
        text = _text(data)
        assert "May be needed: check with the city." in text and "whether alcohol will be served" in text


def test_the_pdfs_give_each_level_in_its_own_words(cafe):
    """With every finding transcribed or reviewed, neither PDF says a value is still being checked, and the first page
    gives the result's own counts."""
    for level, words in (("transcribed", rules_engine.TRANSCRIBED_NOTE), ("reviewed", "Reviewed by B. Expert, architect, 2026-12-02.")):
        checked = cafe | {"findings": [f | {"check_level": level, "rule_reviewed_by": "B. Expert, architect",
                                            "rule_reviewed_on": "2026-12-02"} for f in cafe["findings"]],
                          "rule_levels": {"rules": 21, "unchecked": 0, "transcribed": 21, "reviewed": 0}}
        report = " ".join(_pages(pdf.report_pdf(checked)))
        assert rules_engine.UNVERIFIED_NOTE not in report and words in report
        assert "All 21 rules are checked against the code text; none reviewed by an expert." in report
        sheet = " ".join(_pages(pdf.permit_sheet_pdf(checked)))
        assert rules_engine.UNVERIFIED_NOTE not in sheet and "All 21 rules are checked against the code text" in sheet


def test_the_sheet_uses_the_engine_s_words_for_unverified_rules():
    assert permit_draft.UNVERIFIED_NOTE == rules_engine.UNVERIFIED_NOTE
    assert permit_draft.TRANSCRIBED_NOTE == rules_engine.TRANSCRIBED_NOTE
    assert permit_draft.REVIEWED_NOTE == rules_engine.REVIEWED_NOTE
    assert permit_draft.LEVELS_UNKNOWN == rules_engine.LEVELS_UNKNOWN
    for counts in ({"rules": 21, "unchecked": 21, "transcribed": 0, "reviewed": 0},
                   {"rules": 21, "unchecked": 20, "transcribed": 1, "reviewed": 0},
                   {"rules": 21, "unchecked": 5, "transcribed": 10, "reviewed": 6},
                   {"rules": 21, "unchecked": 0, "transcribed": 0, "reviewed": 21}, None):
        assert permit_draft.counts_sentence(counts) == rules_engine.rules_checked_sentence(counts)
    for f in ({"check_level": "unchecked"}, {"check_level": "transcribed"}, {},
              {"check_level": "reviewed", "rule_reviewed_by": "B. Expert, architect", "rule_reviewed_on": "2026-12-02"},
              {"check_level": "reviewed"}):
        assert permit_draft.level_words(f) == rules_engine.level_words(f)
    assert permit_draft.UNVERIFIED_FACTORS == rules_engine.UNVERIFIED_FACTORS
    assert permit_draft.UNVERIFIED_PERMIT == rules_engine.UNVERIFIED_PERMIT
    assert permit_draft.UNVERIFIED_ENTRY == rules_engine.UNVERIFIED_ENTRY


def test_the_report_marks_the_figures_and_the_assembly_permit_beside_them(cafe):
    """Group A-2, the occupant load and the exits required, and a permit listed because of the number of people,
    each say they rest on values still being checked, next to them, not only on page one."""
    first = _pages(pdf.report_pdf(cafe))[0]
    assert first.index(rules_engine.UNVERIFIED_FIGURES) < first.index(rules_engine.PRECHECK_NOTE)   # right under the figures
    text = " ".join(_pages(pdf.report_pdf(cafe)))
    assembly = [p for p in cafe["permits_likely_required"] if p.get("check_level") == "unchecked"]
    assert assembly and all(pdf.permit_name(p).endswith(rules_engine.UNVERIFIED_PERMIT) for p in assembly)
    assert text.count(rules_engine.UNVERIFIED_PERMIT) == len(assembly)
    sheet = " ".join(_pages(pdf.permit_sheet_pdf(cafe)))
    assert f"Group {cafe['summary']['occupancy_group']} (calculated by the pre-check; your designer confirms). " \
           f"{permit_draft.UNVERIFIED_VALUE}" in sheet and sheet.count(rules_engine.UNVERIFIED_PERMIT) == len(assembly)
