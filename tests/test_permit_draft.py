"""The permit application preparation sheet, for the café and salon demo cases."""
import copy
import re

import pytest

from checker import audit, permit_draft
from tests.conftest import ROOT

UNFILLED = "_to be filled in by the applicant_"


@pytest.fixture
def cafe(load):
    return audit.audit(None, {"business_type": "cafe_restaurant", "cooking_on_site": True},
                       extraction=load("flawed"), zoning_override="NC2-55 (M)")


@pytest.fixture
def salon(load):
    return audit.audit(None, {"business_type": "salon"}, extraction=load("salon_flawed"), zoning_override="NR3")


def _rows(sheet: str) -> dict[str, str]:
    """Field -> value, from the sheet's two field tables."""
    return {cells[1].strip(): cells[2].strip() for line in sheet.splitlines()
            if line.startswith("| ") and len(cells := line.split("|")) == 5 and cells[1].strip() != "What you will be asked for"}


def test_says_what_it_is_at_the_top_and_carries_the_report_disclaimer(cafe):
    sheet = permit_draft.to_markdown(cafe)
    lines = sheet.splitlines()
    assert lines[0] == "# Permit application preparation sheet: Café or restaurant"
    assert "preparation aid, not the City of Seattle's official form" in lines[2]              # right under the title
    assert "read on 20-21 November 2026" in lines[4] and "dated 2016" in lines[4] and "Check SDCI's current pages" in lines[4]
    assert sheet.rstrip().endswith(f"_{cafe['disclaimer']}_")
    assert "pre-fill" not in sheet.lower() and "official form" in sheet


def test_cafe_sheet_is_filled_from_the_audit(cafe):
    s = cafe["summary"]
    sheet = permit_draft.to_markdown(cafe)
    rows = _rows(sheet)
    assert rows["Proposed use"] == "Café or restaurant"
    assert rows["Area of proposed use"] == "2,400 sq ft (from the plan reading)"
    assert rows["Zone"] == "NC2-55 (M)"
    assert rows["Type of occupancy"].startswith(f"Group {s['occupancy_group']} ") and s["occupancy_group"] == "A-2"
    assert rows["Occupant load calculations"] == "106 people (table below)" and s["occupant_load"] == 106
    assert rows["Exits"] == "1 shown on the plan; the pre-check calculates 2 required"
    assert rows["Building code used"] == cafe["code_basis"]
    assert "Tenant improvement for a café or restaurant, 2,400 sq ft." in rows["Application name and project description"]
    assert rows["Application name and project description"].startswith("Suggested, edit before use")
    assert rows["Sprinkler system type, where provided"] == \
        "The plan says there are no sprinklers. System type: to be filled in by the applicant."
    assert "swing inward" in rows["Exit doors and swing"]

    # the room-by-room table is the audit's own
    for r in cafe["occupant_load"]["by_space"]:
        assert f"| {r['space']} | {r['use']} | {r['area_sqft']:g} | {r['factor']} | {r['load']} |" in sheet

    # every permit; every open problem as one line (title and severity), with a pointer to the report; nothing that passed
    for p in cafe["permits_likely_required"]:
        assert f"- {p['name']}: {p['agency']}" in sheet
    open_items = [f for f in cafe["findings"] if f["status"] != "pass"]
    assert f"To fix or check before you apply ({len(open_items)})" in sheet and len(open_items) == 13
    lines = sheet.splitlines()
    for f in open_items:
        word = "Fix before you apply" if f["status"] == "fail" else "Check with the city"
        assert f"- {word}: {f['title']} ({f['severity']})" in lines
        assert f["detail"] not in sheet and (not f["fix"] or f["fix"] not in sheet)      # the detail and the fix stay in the report
    assert "- Fix before you apply: Add a second exit (critical)" in lines and any(line.startswith("- Check with the city: ") for line in lines)
    assert "The pre-check report gives the fix and the code section for each of these." in lines
    assert "SBC 1010.1.1" not in sheet
    assert not any(f["title"] in sheet for f in cafe["findings"] if f["status"] == "pass" and f["title"] != "Occupancy classification")
    assert "From your pre-check (not part of the city's application)" in sheet


def test_salon_sheet_differs_where_the_audit_differs(salon):
    sheet = permit_draft.to_markdown(salon)
    rows = _rows(sheet)
    assert sheet.startswith("# Permit application preparation sheet: Salon")
    assert rows["Zone"] == "NR3" and rows["Area of proposed use"] == "800 sq ft (from the plan reading)"
    assert rows["Type of occupancy"].startswith("Group B ") and rows["Occupant load calculations"] == "15 people (table below)"
    assert rows["Exits"] == "1 shown on the plan; the pre-check calculates 1 required"
    assert any("Salon or shop licence" in p["name"] and p["name"] in sheet for p in salon["permits_likely_required"])
    assert "Food service" not in sheet and "To fix or check before you apply (5)" in sheet
    assert "Confirm the zoning: NR3" in sheet                                    # the zoning question is an open item, not hidden


def test_fields_the_audit_cannot_fill_are_labelled_never_guessed(cafe, salon):
    for result in (cafe, salon):
        rows = _rows(permit_draft.to_markdown(result))
        for field in ("Project address", "Applicant contact", "Owner contact", "Contractor contact",
                      "Project value (labor and materials)", "Change to the building use or occupancy from the last permit?",
                      "King County parcel number", "Legal description of the property",
                      "Existing use (last permitted use)", "Construction type", "Number of stories"):
            assert rows[field] == UNFILLED, field
    assert permit_draft.UNFILLED == "to be filled in by the applicant"

    # an address that was looked up is used; one that was not is not invented
    with_address = copy.deepcopy(cafe)
    with_address["zoning"]["address"] = "123 Example St, Seattle, WA"
    assert _rows(permit_draft.to_markdown(with_address))["Project address"] == "123 Example St, Seattle, WA"

    # a result with no zone, no area, no doors and no rooms: those fields fall back to the label too
    bare = copy.deepcopy(salon)
    bare.pop("zoning")
    bare["extraction"] = {}
    bare["occupant_load"]["by_space"] = []
    rows = _rows(permit_draft.to_markdown(bare))
    for field in ("Zone", "Area of proposed use", "Occupant load calculations", "Exit doors and swing"):
        assert rows[field] == UNFILLED, field
    assert "sq ft" not in rows["Application name and project description"]
    assert rows["Sprinkler system type, where provided"].startswith("The plan does not show whether there are sprinklers.")


def test_the_sheet_adds_no_numbers_or_rules_of_its_own(cafe, salon):
    """Every number on the sheet is in the audit result (or is a source's date); the result itself is not changed."""
    import inspect
    import json

    for result in (cafe, salon):
        before = copy.deepcopy(result)
        sheet = permit_draft.to_markdown(result)
        assert result == before
        known = json.dumps(result, default=str) + " ".join(f"{r['area_sqft']:g} {r['load']}" for r in result["occupant_load"]["by_space"])
        own_text = " ".join([permit_draft.CURRENCY, " ".join(i + s for i, s in permit_draft.UPLOADS),
                             "1. 2. 3. 4. Tip 102 Tip 103 (2016)"])
        for number in set(re.findall(r"\d[\d,]*\.?\d*", sheet)):
            plain = number.replace(",", "").rstrip(".")
            assert plain in known.replace(",", "") or number in own_text, f"{number!r} is not from the audit"
    source = inspect.getsource(permit_draft)
    # it imports nothing from the engine or the rulebook: it can only copy what the result already holds
    assert not re.search(r"^\s*(from|import)\s.*(rules_engine|zoning|audit|json)", source, re.M)
    assert "Restroom fixtures" not in permit_draft.to_markdown(cafe)          # left out: no city source asks for it


def test_every_source_named_on_the_sheet_is_documented(cafe):
    doc = (ROOT / "docs" / "permit_draft.md").read_text(encoding="utf-8")
    assert "1 January 2016" in doc and "20 and 21 November 2026" in doc and "not the city's form" in doc
    for field in _rows(permit_draft.to_markdown(cafe)):
        key = field.split(" (")[0].split(",")[0].replace("King County parcel", "Parcel").replace(" of the property", "")
        key = key.replace(" from the last permit?", "").replace("Exit doors and swing", "Exits and door swing")
        assert key.lower() in doc.lower(), f"{field!r} is on the sheet but not in docs/permit_draft.md"
