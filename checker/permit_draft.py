"""Permit application preparation sheet: one page that gathers what Seattle asks for, filled in from a pre-check.

In:  one audit result (from checker/audit.py, or rules_engine.run_checks plus "zoning" and "extraction").
Out: to_markdown(result) returns the sheet as Markdown.

It is a preparation aid, not the city's form, and it does not fill in the city's form. The
fields are the ones SDCI's published pages say a tenant-improvement applicant is asked for;
docs/permit_draft.md lists the source of each one and what was left out.

This module adds no rules and no numbers. Every value is copied from the audit result. A
field the result cannot fill is printed as UNFILLED, never guessed.
"""
from __future__ import annotations

from typing import Any, Optional

UNFILLED = "to be filled in by the applicant"

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


def _cell(text: Any) -> str:
    """Text made safe for one Markdown table cell."""
    return str(text).replace("|", "/").replace("\n", " ").strip()


def _table(rows: list[tuple[str, Optional[str], str]]) -> list[str]:
    out = ["| What you will be asked for | For this project | City source |", "|---|---|---|"]
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


def to_markdown(result: dict) -> str:
    """The preparation sheet for one audit result."""
    s = result["summary"]
    extraction = result.get("extraction") or {}
    zoning = result.get("zoning") or {}
    area = extraction.get("gross_area_sqft")
    spaces = result["occupant_load"]["by_space"]
    exit_doors = _exit_doors(extraction)

    out = [f"# Permit application preparation sheet: {s['business_label']}", "",
           f"> **{NOTICE}**", ">", f"> {CURRENCY}", "",
           "## 1. For the Seattle Services Portal pre-application", ""]
    out += _table([
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
    ])
    out += ["", "## 2. For the cover sheet and the plans", ""]
    out += _table([
        ("Zone", zoning.get("district") or None, f"{TI_STANDARDS}; {TI_CHECKLIST}"),
        ("Existing use (last permitted use)", None, f"{TI_STANDARDS}; {TI_CHECKLIST}"),
        ("Proposed use", s["business_label"], TI_STANDARDS),
        ("Area of proposed use", f"{area:,g} sq ft (from the plan reading)" if area else None, TI_STANDARDS),
        ("Type of occupancy", f"Group {s['occupancy_group']} (calculated by the pre-check; your designer confirms)", TI_STANDARDS),
        ("Occupant load calculations", f"{s['occupant_load']} people (table below)" if spaces else None, TI_STANDARDS),
        ("Exits", f"{s['exits_shown']} shown on the plan; the pre-check calculates {s['exits_required']} required", TI_STANDARDS),
        ("Exit doors and swing", f"As read from the plan: {exit_doors}" if exit_doors else None, TI_STANDARDS),
        ("Construction type", None, TI_STANDARDS),
        ("Number of stories", None, TI_STANDARDS),
        ("Sprinkler system type, where provided", _sprinklers((extraction.get("fire_safety") or {}).get("sprinklers_noted")),
         TI_STANDARDS),
    ])
    if spaces:
        out += ["", "| Room | Use | Area (sq ft) | Sq ft per person | People |", "|---|---|---|---|---|"]
        out += [f"| {_cell(r['space'])} | {_cell(r['use'])} | {r['area_sqft']:g} | {r['factor']} | {r['load']} |" for r in spaces]

    out += ["", "## 3. Documents the city lists for upload", ""]
    out += [f"- [ ] {item} ({source})" for item, source in UPLOADS]

    out += ["", "## 4. From your pre-check (not part of the city's application)", "",
            "**Permits and approvals you will likely need**", ""]
    out += [f"- {p['name']}: {p['agency']}" for p in result["permits_likely_required"]]
    open_items = [f for f in result["findings"] if f["status"] != "pass"]
    out += ["", f"**Open problems to fix before submitting ({len(open_items)})**", ""]
    for f in open_items:
        word = "Fix" if f["status"] == "fail" else "Confirm"
        fix = f" {f['fix']}" if f.get("fix") else ""
        out.append(f"- **{word}: {f['title']}.** {f['detail']}{fix} ({f['citation']})")
    if not open_items:
        out.append("- Nothing to fix on the items this tool checks.")

    out += ["", f"_{result['disclaimer']}_", ""]
    return "\n".join(out)
