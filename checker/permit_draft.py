"""Permit application preparation sheet: a short sheet that gathers what Seattle asks for, filled in from a pre-check.

In:  one audit result (from checker/audit.py, or rules_engine.run_checks plus "zoning" and "extraction").
Out: to_markdown(result) returns the sheet as Markdown. sheet(result) returns the same content as plain
     data, which checker/pdf.py lays out as a PDF.

It is a preparation aid, not the city's form, and it does not fill in the city's form. The
fields are the ones SDCI's published pages say a tenant-improvement applicant is asked for;
docs/permit_draft.md lists the source of each one and what was left out.

This module adds no rules and no numbers. Every value is copied from the audit result. A
field the result cannot fill is printed as UNFILLED, never guessed.
"""
from __future__ import annotations

from typing import Any, Optional

UNFILLED = "to be filled in by the applicant"
# The same words as rules_engine's level notes and counts sentence (this module imports no rules; a test keeps them equal).
UNVERIFIED_NOTE = "This rule's value is still being checked against the code."
TRANSCRIBED_NOTE = "Checked against the code text by our team."
REVIEWED_NOTE = "Reviewed by {reviewed_by}, {reviewed_on}."
LEVELS_UNKNOWN = "How many of these rules are checked against the code text isn't known for this result."
UNVERIFIED_FACTORS = "Some of these square-feet-per-person values are still being checked against the code."
UNVERIFIED_VALUE = "Still being checked against the code."
UNVERIFIED_PERMIT = "Listed because of a value still being checked against the code."
UNVERIFIED_ENTRY = "This permit entry is still being checked against the agency's own rules."

NOTICE = ("This is a preparation aid, not the City of Seattle's official form. It gathers, in one place, what the "
          "city's published pages say you will be asked for. You apply in the Seattle Services Portal.")
# Keep these two in step with docs/permit_draft.md.
SOURCES_READ = "20-21 November 2026"
CURRENCY = (f"The list of fields comes from SDCI pages read on {SOURCES_READ}. One of them, SDCI's commercial tenant "
            "improvement screening standards, is dated 2016. Check SDCI's current pages before relying on this list.")

# Short names for the city sources; docs/permit_draft.md has the titles, dates and links.
TIP_102 = "SDCI Tip 102"
TIP_103 = "SDCI Tip 103"
PERMIT_PAGE = "SDCI permit page"
PORTAL_HELP = "Portal help"
TI_STANDARDS = "TI standards (2016)"
TI_CHECKLIST = "TI checklist"

# The documents the city lists for a small-business tenant improvement, in its order. The sheet does not
# decide which apply: where the city sets a condition, the line points to the city's own page for it.
UPLOADS = [
    ("Floor plan of the tenant space", TIP_102),
    ("Key plan, if the building has more than one tenant", TIP_102),
    ("Site plan with parking details (a key location plan is accepted for interior-only work)", f"{TIP_102}; {TIP_103}"),
    ("Statement of Financial Responsibility / Agent Authorization", f"{TIP_102}; {TI_CHECKLIST}"),
    ("Waste Diversion Plan, for projects above the area stated in Tip 102", f"{TIP_102}; {TI_STANDARDS}"),
]


# Headings shared by the Markdown and the PDF.
SECTIONS = ["1. For the Seattle Services Portal pre-application", "2. For the cover sheet and the plans",
            "3. Documents the city lists for upload", "4. From your pre-check (not part of the city's application)"]
TABLE_COLUMNS = ["What you will be asked for", "For this project", "City source"]
ROOM_COLUMNS = ["Room", "Use", "Area (sq ft)", "Sq ft per person", "People"]
PERMITS_HEADING = "Permits and approvals you will likely need"
OPEN_HEADING = "To fix or check before you apply"
# The site's status names (CONTENT.md rule 11), here because this module imports nothing from the engine.
STATUS_LABEL = {"fail": "Fix before you apply", "review": "Check with the city"}
OPEN_POINTER = "The pre-check report gives the fix and the code section for each of these."


def _cell(text: Any) -> str:
    """Text made safe for one Markdown table cell."""
    return str(text).replace("|", "/").replace("\n", " ").strip()


def _table(rows: list[tuple[str, Optional[str], str]]) -> list[str]:
    out = ["| " + " | ".join(TABLE_COLUMNS) + " |", "|---|---|---|"]
    out += [f"| {_cell(field)} | {_cell(value) if value else f'_{UNFILLED}_'} | {_cell(source)} |" for field, value, source in rows]
    return out


def _description(label: str, area: Optional[float]) -> str:
    size = f", {area:,g} sq ft" if area else ""
    return f"Suggested, edit before use: \"Tenant improvement for a {label.lower()}{size}.\""


def _sprinklers(noted: Optional[bool]) -> str:
    seen = {True: "The plan notes sprinklers.", False: "The plan says there are no sprinklers."}.get(
        noted, "The plan does not show whether there are sprinklers.")
    return f"{seen} System type: {UNFILLED}."


def _exit_doors(extraction: dict) -> str:
    doors = [d for d in extraction.get("doors") or [] if d.get("is_exit")]
    return "; ".join(f"{d.get('label', 'door')}: swing {d.get('swing') or 'unknown'}" for d in doors)


def sheet(result: dict) -> dict[str, Any]:
    """The preparation sheet as plain data, so the Markdown and the PDF (checker/pdf.py) lay out the same content.

    "portal" and "plans" are rows of (what is asked for, value or None when the applicant must fill it in, city source).
    """
    s = result["summary"]
    extraction = result.get("extraction") or {}
    zoning = result.get("zoning") or {}
    area = extraction.get("gross_area_sqft")
    spaces = result["occupant_load"]["by_space"]
    exit_doors = _exit_doors(extraction)
    return {
        "title": f"Permit application preparation sheet: {s['business_label']}",
        "notice": NOTICE,
        "currency": CURRENCY,
        "portal": [
            ("Project address", zoning.get("address") or None, f"{TIP_102}; {PORTAL_HELP}"),
            ("Applicant contact", None, f"{TIP_102}; {PORTAL_HELP}"),
            ("Owner contact", None, f"{TIP_102}; {PORTAL_HELP}"),
            ("Contractor contact", None, PORTAL_HELP),
            ("Application name and project description", _description(s["business_label"], area), TIP_102),
            ("Project value (labor and materials)", None, f"{TIP_102}; {PORTAL_HELP}"),
            ("Building code used", result["code_basis"], f"{PORTAL_HELP}; {TI_STANDARDS}"),
            ("Change to the building use or occupancy from the last permit?", None, f"{PORTAL_HELP}; {TI_CHECKLIST}"),
            ("King County parcel number", None, f"{PERMIT_PAGE}; {TIP_103}"),
            ("Legal description of the property", None, f"{PERMIT_PAGE}; {TIP_103}"),
        ],
        "plans": [
            ("Zone", zoning.get("district") or None, f"{TI_STANDARDS}; {TI_CHECKLIST}"),
            ("Existing use (last permitted use)", None, f"{TI_STANDARDS}; {TI_CHECKLIST}"),
            ("Proposed use", s["business_label"], TI_STANDARDS),
            ("Area of proposed use", f"{area:,g} sq ft (from the plan reading)" if area else None, TI_STANDARDS),
            ("Type of occupancy", f"Group {s['occupancy_group']} (calculated by the pre-check; your designer confirms)"
             + _unchecked(_checked(result, "OCC-1")), TI_STANDARDS),
            ("Occupant load calculations", f"{s['occupant_load']} people (table below)"
             + _unchecked(not _is_unchecked(result["occupant_load"])) if spaces else None, TI_STANDARDS),
            ("Exits", f"{s['exits_shown']} shown on the plan; the pre-check calculates {s['exits_required']} required"
             + _unchecked(_checked(result, "EG-1")), TI_STANDARDS),
            ("Exit doors and swing", f"As read from the plan: {exit_doors}" if exit_doors else None, TI_STANDARDS),
            ("Construction type", None, TI_STANDARDS),
            ("Number of stories", None, TI_STANDARDS),
            ("Sprinkler system type, where provided", _sprinklers((extraction.get("fire_safety") or {}).get("sprinklers_noted")),
             TI_STANDARDS),
        ],
        "rooms": spaces,
        # under the rooms table when some of its factors are not yet read from the code text (rule OL-0)
        "rooms_unverified": UNVERIFIED_FACTORS if _is_unchecked(result["occupant_load"]) else None,
        "uploads": UPLOADS,
        "permits": result["permits_likely_required"],
        # one line each, to keep the sheet short: the report has the detail, the fix and the code section
        "open_items": [f"{STATUS_LABEL[f['status']]}: {f['title']} ({f['severity']})"
                       + f". {level_words(f)}"
                       for f in result["findings"] if f["status"] != "pass"],
        # once, at the top: how many rules are checked against the code text and reviewed (the result's own counts)
        "levels": counts_sentence(result.get("rule_levels")),
        "open_pointer": OPEN_POINTER,
        "nothing_open": "No issues found in the checks we ran.",
        "disclaimer": result["disclaimer"],
    }


def _checked(result: dict, rule_id: str) -> bool:
    """Whether the finding for this rule says it is transcribed or reviewed (check_level)."""
    return any(f["rule_id"] == rule_id and not _is_unchecked(f) for f in result["findings"])


def _is_unchecked(item: Optional[dict]) -> bool:
    return not item or item.get("check_level") not in ("transcribed", "reviewed")


def level_words(item: dict) -> str:
    """The level line for a finding, as rules_engine.level_words."""
    if item.get("check_level") == "reviewed" and item.get("rule_reviewed_by") and item.get("rule_reviewed_on"):
        return REVIEWED_NOTE.format(reviewed_by=item["rule_reviewed_by"], reviewed_on=item["rule_reviewed_on"])
    return UNVERIFIED_NOTE if _is_unchecked(item) else TRANSCRIBED_NOTE


def counts_sentence(counts: Optional[dict]) -> str:
    """The counts sentence, as rules_engine.rules_checked_sentence."""
    if not counts or not counts.get("rules"):
        return LEVELS_UNKNOWN
    n, r = counts["rules"], counts.get("reviewed", 0)
    c = counts.get("transcribed", 0) + r
    if not c:
        checked = f"None of the {n} rules is checked against the code text yet"
    elif c == n:
        checked = f"All {n} rules are checked against the code text"
    else:
        checked = f"{c} of the {n} rules {'is' if c == 1 else 'are'} checked against the code text"
    reviewed = "none" if not r else ("all" if r == n else str(r))
    return f"{checked}; {reviewed} reviewed by an expert."


def _unchecked(checked: Optional[bool]) -> str:
    return "" if checked else f". {UNVERIFIED_VALUE}"


def to_markdown(result: dict) -> str:
    """The preparation sheet for one audit result, as Markdown."""
    d = sheet(result)
    out = [f"# {d['title']}", "", f"> **{d['notice']}**", ">", f"> {d['currency']}", "",
           f"> {d['levels']}", "",
           f"## {SECTIONS[0]}", ""]
    out += _table(d["portal"])
    out += ["", f"## {SECTIONS[1]}", ""]
    out += _table(d["plans"])
    if d["rooms"]:
        out += ["", "| " + " | ".join(ROOM_COLUMNS) + " |", "|---|---|---|---|---|"]
        out += [f"| {_cell(r['space'])} | {_cell(r['use'])} | {r['area_sqft']:g} | {r['factor']} | {r['load']} |" for r in d["rooms"]]
        if d["rooms_unverified"]:
            out += ["", d["rooms_unverified"]]

    out += ["", f"## {SECTIONS[2]}", ""]
    out += [f"- [ ] {item} ({source})" for item, source in d["uploads"]]

    out += ["", f"## {SECTIONS[3]}", "", f"**{PERMITS_HEADING}**", ""]
    out += [f"- {p['name']}{'. ' + UNVERIFIED_PERMIT if 'check_level' in p and _is_unchecked(p) else ''}"
            f"{'' if p.get('entry_verified', True) else '. ' + UNVERIFIED_ENTRY}: {p['agency']}" for p in d["permits"]]
    out += ["", f"**{OPEN_HEADING} ({len(d['open_items'])})**", ""]
    out += [f"- {line}" for line in d["open_items"]] or [f"- {d['nothing_open']}"]
    if d["open_items"]:
        out += ["", d["open_pointer"]]

    out += ["", f"_{d['disclaimer']}_", ""]
    return "\n".join(out)
