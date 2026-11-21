"""Deterministic compliance checks.

In:  the facts read from a floor plan (see extract.py), the owner's intake answers
     (business type, cooking, alcohol...), the rulebook JSON, and the zoning result.
Out: findings, each tied to a code citation and to the Seattle reviewer who checks it,
     plus the permits the project will likely need.

No model is involved here. Every number comes from checker/rules/seattle.json, so a
finding can always be traced to one line of the rulebook.

Every finding has status "pass", "fail" or "review" (not enough on the plan to decide).
"""
from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional

RULES_DIR = Path(__file__).parent / "rules"
DEFAULT_RULES = "seattle"
DEFAULT_BUSINESS = "cafe_restaurant"
SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "info": 3}
DISCLAIMER = ("Pre-submission check only. Not a code determination; have a licensed design "
              "professional and the plan reviewer confirm.")


@dataclass
class Finding:
    rule_id: str
    title: str
    status: str          # pass | fail | review
    severity: str        # critical | high | medium | info
    detail: str
    citation: str
    fix: str = ""
    reviewed_by: str = ""  # who checks this in Seattle's plan review (rulebook: review_routing)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def load_rules(name: str = DEFAULT_RULES) -> dict[str, Any]:
    return json.loads((RULES_DIR / f"{name}.json").read_text(encoding="utf-8"))


def business(rules: dict, key: Optional[str]) -> dict[str, Any]:
    """The rulebook entry for a business type; unknown keys fall back to the default."""
    types = rules["business_types"]
    key = key if key in types else DEFAULT_BUSINESS
    return types[key] | {"key": key}


# ---------------------------------------------------------------- occupant load
def occupant_load(extraction: dict, rules: dict, business_type: Optional[str] = None) -> dict[str, Any]:
    bt = business(rules, business_type)
    factors = rules["occupant_load_factors_sqft_per_person"]
    rows, total, missing = [], 0, []
    for s in extraction.get("spaces", []):
        f = factors.get(s.get("use"))
        if not f:
            continue  # restrooms, corridors: accessory, no separate load
        area = s.get("area_sqft")
        if area is None and s.get("width_ft") and s.get("length_ft"):
            area = s["width_ft"] * s["length_ft"]
        if area is None:
            missing.append(s.get("name", "?"))
            continue
        load = math.ceil(area / f["factor"])
        total += load
        rows.append({"space": s.get("name"), "use": s["use"], "area_sqft": area,
                     "factor": f["factor"], "load": load, "cite": f["cite"]})
    seats = extraction.get("seat_count")
    seated_load = sum(r["load"] for r in rows if r["use"] in ("dining", "counter_service", "standing"))
    if bt.get("seating") and seats and seats > seated_load:
        total += seats - seated_load  # the actual number governs when it is higher than the calculated one
    return {"total": total, "by_space": rows, "missing_area": missing,
            "seat_count": seats, "calculated_dining_load": seated_load}


def occupancy_group(n: int, bt: dict, rules: dict) -> str:
    """Assembly-type businesses under the threshold are classified Group B (SBC 303.1.1)."""
    if bt.get("assembly_group"):
        return bt["assembly_group"] if n >= rules["occupancy"]["assembly_threshold"] else "B"
    return bt["group"]


# ---------------------------------------------------------------- plumbing fixtures
def _by_ratio(persons: float, per: Optional[int], tiers: Optional[list]) -> int:
    """Fixtures for a head count: a flat ratio, or tiers such as 1 per 25 for the first 50, then 1 per 50."""
    if persons <= 0:
        return 0
    if tiers:
        need, left = 0, persons
        for cap, ratio in tiers:
            part = left if cap is None else min(left, cap)
            need += math.ceil(part / ratio)
            left -= part
            if left <= 0:
                break
        return need
    return math.ceil(persons / per)


def fixtures_required(n: int, bt: dict, rules: dict) -> dict[str, Any]:
    pl = rules["plumbing"]
    prof = pl["fixture_profiles"][bt["fixture_profile"]]
    exempt_at = bt.get("separate_facilities_exempt_at_or_below", pl["separate_facilities_exempt_default"])
    shared_ok = n <= exempt_at
    half = n / 2
    men = _by_ratio(half, prof.get("wc_per_male"), prof.get("wc_tiers"))
    women = _by_ratio(half, prof.get("wc_per_female"), prof.get("wc_tiers"))
    one_room = max(1, _by_ratio(n, prof.get("wc_per_female"), prof.get("wc_tiers"))) if n else 0
    return {
        "profile": prof["label"], "shared_room_allowed": shared_ok, "shared_room_limit": exempt_at,
        "men": men, "women": women,
        "water_closets": one_room if shared_ok else men + women,
        "lavatories": max(1, _by_ratio(n, prof.get("lav_per"), prof.get("lav_tiers"))) if n else 0,
    }


# ---------------------------------------------------------------- sprinklers
def sprinkler_trigger(group: str, n: int, area: float, upper_floor: bool, rules: dict) -> Optional[dict[str, Any]]:
    """The reason sprinklers are required for this occupancy group, or None."""
    rule = rules["fire"]["sprinklers"].get(group)
    if not rule:
        return None
    reasons = []
    if rule.get("occupant_load") and n >= rule["occupant_load"]:
        reasons.append(f"occupant load {n} is {rule['occupant_load']} or more")
    if rule.get("fire_area_sqft") and area > rule["fire_area_sqft"]:
        reasons.append(f"{area:,.0f} sq ft is over {rule['fire_area_sqft']:,} sq ft")
    if rule.get("upper_floor") and upper_floor:
        reasons.append("the space is not on the ground floor")
    if not reasons:
        return None
    limits = [f"{rule['occupant_load']} occupants"] if rule.get("occupant_load") else []
    limits += [f"{rule['fire_area_sqft']:,} sq ft"] if rule.get("fire_area_sqft") else []
    return {"reasons": reasons, "cite": rule["cite"], "thresholds": " or ".join(limits)}


# ---------------------------------------------------------------- checks
def run_checks(extraction: dict, intake: dict, rules: dict, zoning: Optional[dict] = None) -> dict[str, Any]:
    F: list[Finding] = []
    bt = business(rules, intake.get("business_type"))
    ol = occupant_load(extraction, rules, bt["key"])
    n = ol["total"]
    eg, acc, pl, fire, health = rules["egress"], rules["accessibility"], rules["plumbing"], rules["fire"], rules["health"]
    group = occupancy_group(n, bt, rules)

    if ol["missing_area"]:
        F.append(Finding("OL-0", "Room areas missing", "review", "high",
                         f"No area could be read for: {', '.join(ol['missing_area'])}. Occupant load may be understated.",
                         "SBC Table 1004.5", "Add dimensions or areas for these rooms to the plan."))
    if not ol["by_space"]:
        F.append(Finding("OL-0", "No rooms with a readable use and area", "review", "high",
                         "The occupant load could not be calculated, so the checks below assume an empty space.",
                         "SBC Table 1004.5", "Label each room with its use and its area or dimensions."))
    F.append(Finding("OCC-1", "Occupancy classification", "pass", "info",
                     f"{bt['label']} with a calculated occupant load of {n}: classified Group {group}.",
                     rules["occupancy"]["cite"]))

    doors = extraction.get("doors", [])
    exits = [d for d in doors if d.get("is_exit")]

    # --- number of exits
    need = 1 + (n > eg["two_exits_above_occupant_load"]) + (n > eg["three_exits_above_occupant_load"])
    if len(exits) >= need:
        F.append(Finding("EG-1", "Number of exits", "pass", "info",
                         f"{len(exits)} exit(s) shown; {need} required for an occupant load of {n}.", eg["exits_cite"]))
    else:
        F.append(Finding("EG-1", "Not enough exits", "fail", "critical",
                         f"{len(exits)} exit(s) shown; {need} required for an occupant load of {n}.",
                         eg["exits_cite"],
                         f"Add {need - len(exits)} exit(s), placed remotely from the existing one, or reduce the "
                         f"public area so the occupant load is {eg['two_exits_above_occupant_load']} or less."))

    # --- exit door swing
    if n >= eg["outward_swing_at_occupant_load"]:
        for d in exits:
            if d.get("swing") == "inward":
                F.append(Finding("EG-2", f"Exit door swings inward: {d['label']}", "fail", "high",
                                 f"With an occupant load of {n}, exit doors must swing in the direction of egress.",
                                 eg["swing_cite"], "Re-hang the door to swing outward (check it does not block the sidewalk or required clearances)."))
            elif d.get("swing") == "unknown":
                F.append(Finding("EG-2", f"Exit door swing not shown: {d['label']}", "review", "medium",
                                 "Swing direction could not be read from the plan.", eg["swing_cite"],
                                 "Show the door swing on the plan."))

    # --- door clear widths
    for d in doors:
        w = d.get("clear_width_in")
        who = d["label"] + (f" ({d['serves']})" if d.get("serves") else "")
        if w is None:
            F.append(Finding("EG-3", f"Door width not shown: {who}", "review", "medium",
                             "No clear width could be read.", eg["door_cite"], "Dimension the door's clear opening."))
        elif w < eg["door_min_clear_width_in"]:
            F.append(Finding("EG-3", f"Door too narrow: {who}", "fail", "critical" if d.get("is_exit") else "high",
                             f"{w:g} in. clear; minimum is {eg['door_min_clear_width_in']} in.",
                             eg["door_cite"], f"Widen to at least {eg['door_min_clear_width_in']} in. clear (a 36 in. door leaf typically provides this)."))
    if not doors:
        F.append(Finding("EG-3", "No doors could be read", "review", "high",
                         "The plan shows no door with a readable label.", eg["door_cite"],
                         "Label every door with its clear width and mark the exits."))

    # --- egress capacity
    widths = [d["clear_width_in"] for d in exits if d.get("clear_width_in")]
    if widths:
        required_w = n * eg["egress_width_in_per_occupant"]
        if sum(widths) + 1e-9 < required_w:
            F.append(Finding("EG-4", "Exit doors too narrow in total", "fail", "high",
                             f"Exit doors total {sum(widths):g} in.; {required_w:.1f} in. required ({n} x {eg['egress_width_in_per_occupant']}).",
                             eg["egress_width_cite"], "Widen exit doors or add an exit."))

    # --- exit signs (not required where only one exit is required)
    fs = extraction.get("fire_safety") or {}
    signs = fs.get("exit_signs_shown")
    if need >= eg["exit_signs_when_exits_required"]:
        if signs is None:
            F.append(Finding("FS-1", "Exit signs not shown", "review", "medium",
                             "The plan does not show exit signs.", eg["exit_sign_cite"],
                             "Show an illuminated exit sign at each exit."))
        elif signs < need:
            F.append(Finding("FS-1", "Missing exit signs", "fail", "high",
                             f"{signs} exit sign(s) shown; one is needed at each of the {need} required exits.",
                             eg["exit_sign_cite"], "Add illuminated exit signs at every required exit."))
        else:
            F.append(Finding("FS-1", "Exit signs", "pass", "info", f"{signs} exit sign(s) shown.", eg["exit_sign_cite"]))

    # --- accessible routes
    for a in extraction.get("aisles", []):
        w = a.get("min_width_in")
        if w is not None and w < acc["route_min_width_in"]:
            F.append(Finding("ADA-1", f"Aisle too narrow: {a['label']}", "fail", "high",
                             f"{w:g} in. wide; accessible routes need {acc['route_min_width_in']} in. minimum.",
                             acc["route_cite"], f"Move furniture or fixtures to give {acc['route_min_width_in']} in. clear."))
    if not extraction.get("aisles"):
        F.append(Finding("ADA-1", "Aisle widths not dimensioned", "review", "medium",
                         "No aisle or route widths could be read.", acc["route_cite"],
                         "Dimension the main path from the entrance to the service area and restrooms."))

    # --- restrooms: accessibility
    restrooms = extraction.get("restrooms", [])
    for r in restrooms:
        t = r.get("turning_circle_diameter_in")
        if t is None:
            F.append(Finding("ADA-2", f"Turning space not shown: {r['label']}", "review", "medium",
                             "No turning circle is drawn or dimensioned.", acc["turning_cite"],
                             f"Show a {acc['turning_space_diameter_in']} in. turning circle (or T-turn) in the room."))
        elif t < acc["turning_space_diameter_in"]:
            F.append(Finding("ADA-2", f"Restroom too tight to turn a wheelchair: {r['label']}", "fail", "high",
                             f"{t:g} in. turning circle; {acc['turning_space_diameter_in']} in. required.",
                             acc["turning_cite"], f"Enlarge the room or rearrange fixtures to clear a {acc['turning_space_diameter_in']} in. circle."))
        dw = r.get("door_clear_width_in")
        if dw is not None and dw < eg["door_min_clear_width_in"]:
            already = any(f.rule_id == "EG-3" and r["label"] in f.title for f in F)
            if not already:
                F.append(Finding("ADA-3", f"Restroom door too narrow: {r['label']}", "fail", "high",
                                 f"{dw:g} in. clear; {eg['door_min_clear_width_in']} in. required.",
                                 eg["door_cite"], "Install a 36 in. door."))

    # --- restrooms: fixture count
    fx = fixtures_required(n, bt, rules)
    wc = lambda r: (r.get("water_closets") or 0) + (r.get("urinals") or 0)
    men = sum(wc(r) for r in restrooms if r.get("designation") == "men")
    women = sum(r.get("water_closets") or 0 for r in restrooms if r.get("designation") == "women")
    allg = sum(r.get("water_closets") or 0 for r in restrooms if r.get("designation") in ("all_gender", "unknown"))
    have_total = men + women + allg
    short = max(0, fx["men"] - men) + max(0, fx["women"] - women)
    basis = (f"one shared toilet room is allowed up to {fx['shared_room_limit']} occupants" if fx["shared_room_allowed"]
             else f"{fx['men']} for men and {fx['women']} for women")
    if not restrooms:
        F.append(Finding("PL-1", "No restroom shown", "fail", "critical",
                         f"{fx['water_closets']} water closet(s) required for an occupant load of {n} ({fx['profile']}).",
                         pl["cite"], "Add restroom(s) to the plan."))
    elif have_total < fx["water_closets"] or (not fx["shared_room_allowed"] and short > allg):
        F.append(Finding("PL-1", "Not enough toilets", "fail", "high",
                         f"{have_total} water closet(s) shown (men {men}, women {women}, all-gender {allg}); "
                         f"{fx['water_closets']} required for an occupant load of {n} ({fx['profile']}: {basis}).",
                         pl["cite"], "Add fixtures, or confirm with the plan reviewer whether single-user all-gender rooms can satisfy the count."))
    else:
        F.append(Finding("PL-1", "Toilet count", "pass", "info",
                         f"{have_total} water closet(s) shown; {fx['water_closets']} required for an occupant load "
                         f"of {n} ({fx['profile']}: {basis}).", pl["cite"]))
    lav_have = sum(r.get("lavatories") or 0 for r in restrooms)
    lav_need = max(fx["lavatories"], len(restrooms))
    if restrooms and lav_have < lav_need:
        F.append(Finding("PL-2", "Not enough lavatories", "fail", "medium",
                         f"{lav_have} lavatory(ies) shown; at least {lav_need} needed (one per toilet room).",
                         pl["cite"], "Add a lavatory to each toilet room."))

    # --- accessible seating (businesses with customer seating)
    seats, acc_seats = extraction.get("seat_count"), extraction.get("accessible_seat_count")
    if seats and bt.get("seating"):
        need_acc = max(1, math.ceil(seats * acc["accessible_seating_share"]))
        if acc_seats is None:
            F.append(Finding("ADA-4", "Accessible seating not marked", "review", "medium",
                             f"{need_acc} of the {seats} seats should be at accessible tables.", acc["seating_cite"],
                             "Mark accessible tables (knee clearance, 28-34 in. surface height) on the plan."))
        elif acc_seats < need_acc:
            F.append(Finding("ADA-4", "Too few accessible seats", "fail", "medium",
                             f"{acc_seats} accessible seat(s) marked; {need_acc} required (5% of {seats}).",
                             acc["seating_cite"], "Designate more accessible tables, spread through the seating area."))

    # --- food preparation and cooking
    k = extraction.get("kitchen") or {}
    cooking = bool(intake.get("cooking_on_site")) or (bool(bt.get("food")) and bool(k.get("grease_producing_cooking")))
    food = bool(bt.get("food")) or bool(intake.get("food_prep")) or cooking
    if cooking and k.get("type1_hood_shown") is not True:
        F.append(Finding("MECH-1", "No Type I hood over cooking equipment",
                         "fail" if k.get("type1_hood_shown") is False else "review", "critical",
                         "Grease-producing cooking is planned but the plan shows no Type I exhaust hood with fire suppression.",
                         fire["hood_cite"], "Add a Type I hood and suppression system over the cooking line, or limit the menu to equipment that does not need one."))
    if food:
        if not k.get("hand_sinks"):
            F.append(Finding("HLTH-1", "No handwashing sink in the food prep area",
                             "fail" if k.get("hand_sinks") == 0 else "review", "high",
                             "A dedicated handwashing sink is needed where food is prepared.", health["cite"],
                             "Add a hand sink in the prep area (separate from the dish sink)."))
        if k.get("three_compartment_sink") is not True:
            F.append(Finding("HLTH-2", "Three-compartment sink not shown",
                             "fail" if k.get("three_compartment_sink") is False else "review", "medium",
                             "Warewashing needs a three-compartment sink or an approved dish machine.", health["cite"],
                             "Show the three-compartment sink or dish machine on the plan."))
        by_plumbing, by_health = pl.get("service_sink_required"), health.get("service_sink_required")
        if k.get("mop_or_service_sink") is not True and (by_plumbing or by_health):
            F.append(Finding("PL-3" if by_plumbing else "HLTH-3", "Service (mop) sink not shown",
                             "fail" if k.get("mop_or_service_sink") is False else "review", "medium",
                             "One service sink is required.", pl["cite"] if by_plumbing else health["cite"],
                             "Add a mop/service sink."))

    # --- fire protection
    area = extraction.get("gross_area_sqft") or 0
    spk = sprinkler_trigger(group, n, area, bool(intake.get("upper_floor")), rules)
    if spk and fs.get("sprinklers_noted") is not True:
        no_spk = fs.get("sprinklers_noted") is False
        F.append(Finding("FS-2", "Sprinkler system required" + (", plan says none" if no_spk else " but not noted"),
                         "fail" if no_spk else "review", "critical",
                         f"Group {group}: {'; '.join(spk['reasons'])} (threshold: {spk['thresholds']}).",
                         spk["cite"], "Confirm the building is sprinklered and note it on the plan; if not, budget for a system or reduce the occupant load."))
    if not fs.get("fire_extinguishers_shown"):
        F.append(Finding("FS-3", "Fire extinguishers not shown", "review", "medium",
                         "No portable fire extinguishers are shown.", fire["extinguisher_cite"],
                         "Show extinguisher locations" + ("; add a Class K unit at the cooking line." if cooking else ".")))
    elif cooking and fs.get("class_k_extinguisher_shown") is not True:
        F.append(Finding("FS-3", "No Class K extinguisher at the cooking line", "review", "medium",
                         "Commercial cooking needs a Class K extinguisher nearby.", fire["extinguisher_cite"],
                         "Add a Class K extinguisher within reach of the cooking line."))

    # --- zoning
    if zoning:
        z = zoning
        sev = {"likely_permitted": "info", "needs_review": "high", "not_permitted": "critical", "unknown": "medium"}[z["status"]]
        st = {"likely_permitted": "pass", "not_permitted": "fail"}.get(z["status"], "review")
        cite = rules["zoning"]["cite"] + (f"; {z['cite']}" if z.get("cite") else "")
        F.append(Finding("ZN-1", f"Zoning: {z.get('district') or 'not found'}", st, sev, z["detail"], cite, z.get("fix", "")))

    # --- record a pass for every applicable check that raised nothing
    raised = {f.rule_id for f in F}
    spk_cite = spk["cite"] if spk else fire["sprinkler_cite_default"]
    passes = [
        ("EG-2", "Exit door swing", "All exit doors swing in the direction of egress.", eg["swing_cite"],
         n >= eg["outward_swing_at_occupant_load"] and bool(exits)),
        ("EG-3", "Door widths", f"All {len(doors)} doors are at least {eg['door_min_clear_width_in']} in. clear.", eg["door_cite"], bool(doors)),
        ("EG-4", "Exit capacity", f"Exit doors total {sum(widths):g} in.; {n * eg['egress_width_in_per_occupant']:.1f} in. required.",
         eg["egress_width_cite"], bool(widths)),
        ("ADA-1", "Aisle and route widths", f"All dimensioned routes are at least {acc['route_min_width_in']} in. wide.", acc["route_cite"], True),
        ("ADA-2", "Restroom turning space", f"Each restroom shows a {acc['turning_space_diameter_in']} in. turning circle.", acc["turning_cite"], bool(restrooms)),
        ("ADA-4", "Accessible seating", f"{acc_seats} accessible seats marked of {seats}.", acc["seating_cite"], bool(seats) and bool(bt.get("seating"))),
        ("PL-2", "Lavatories", f"{lav_have} lavatory(ies) shown.", pl["cite"], bool(restrooms)),
        ("MECH-1", "Kitchen hood", "Type I hood with fire suppression shown over the cooking line.", fire["hood_cite"], cooking),
        ("HLTH-1", "Handwashing sink", "Hand sink shown in the food prep area.", health["cite"], food),
        ("HLTH-2", "Warewashing", "Three-compartment sink shown.", health["cite"], food),
        ("FS-2", "Sprinklers", "Sprinkler system required and noted on the plan.", spk_cite, bool(spk)),
        ("FS-3", "Fire extinguishers", f"{fs.get('fire_extinguishers_shown')} extinguisher(s) shown.", fire["extinguisher_cite"], True),
    ]
    for rule_id, title, detail, cite, applies in passes:
        if applies and rule_id not in raised:
            F.append(Finding(rule_id, title, "pass", "info", detail, cite))

    routing = rules.get("review_routing") or {}
    for f in F:
        route = routing.get(f.rule_id) or routing.get(f.rule_id.split("-")[0]) or {}   # exact rule, then its family
        f.reviewed_by = route.get("label", "")

    F.sort(key=lambda f: ({"fail": 0, "review": 1, "pass": 2}[f.status], SEVERITY_ORDER[f.severity]))

    # --- permits
    assembly_permit_at = fire.get("assembly_permit_occupant_load")
    overlays = (zoning or {}).get("overlays") or {}
    flags = {
        "always": True, "cooking": cooking, "food": food,
        "assembly_permit": bool(assembly_permit_at) and n >= assembly_permit_at,
        "sprinkler": bool(spk),
        "alcohol": bool(intake.get("serves_alcohol")) or bool(bt.get("alcohol")),
        "signage": intake.get("new_signage", True),
        "outdoor_seating": bool(extraction.get("outdoor_seating_shown") or intake.get("outdoor_seating")),
        "historic": bool(overlays.get("historic")) or bool(intake.get("historic_district")),
        bt["key"]: True,   # permits that apply to one business type, e.g. "salon"
    }
    permits = [{k: p[k] for k in ("id", "name", "agency")} for p in rules["permits"] if flags.get(p["when"])]

    return {
        "summary": {
            "business_type": bt["key"], "business_label": bt["label"],
            "occupant_load": n, "occupancy_group": group, "exits_required": need, "exits_shown": len(exits),
            "fails": sum(f.status == "fail" for f in F), "reviews": sum(f.status == "review" for f in F),
            "passes": sum(f.status == "pass" for f in F),
        },
        "occupant_load": ol,
        "fixtures_required": fx,
        "findings": [f.to_dict() for f in F],
        "permits_likely_required": permits,
        "code_basis": rules["_meta"]["code_basis"],
        "disclaimer": DISCLAIMER,
    }


# ---------------------------------------------------------------- report
STATUS_WORD = {"fail": "FAIL", "review": "CONFIRM", "pass": "OK"}


def to_markdown(result: dict, title: Optional[str] = None) -> str:
    s = result["summary"]
    out = [f"# {title or 'Permit pre-check: ' + s['business_label']}", "",
           f"**Business:** {s['business_label']}  |  **Occupant load:** {s['occupant_load']}  |  "
           f"**Occupancy group:** {s['occupancy_group']}  |  **Exits:** {s['exits_shown']} shown / {s['exits_required']} required",
           f"**{s['fails']} problems, {s['reviews']} items to confirm, {s['passes']} checks passed**", "",
           "## Fix list", ""]
    for f in result["findings"]:
        if f["status"] == "pass":
            continue
        out.append(f"- **[{STATUS_WORD[f['status']]} / {f['severity']}] {f['title']}**: {f['detail']}  ")
        if f["fix"]:
            out.append(f"  Fix: {f['fix']}  ")
        if f.get("reviewed_by"):
            out.append(f"  Checked by: {f['reviewed_by']}  ")
        out.append(f"  Code: {f['citation']}")
    if not (s["fails"] or s["reviews"]):
        out.append("Nothing to fix on the items this tool checks.")
    out += ["", "## Passed", ""]
    out += [f"- {f['title']}: {f['detail']} ({f['citation']})" for f in result["findings"] if f["status"] == "pass"]
    out += ["", "## Permits and approvals you will likely need", ""]
    out += [f"- **{p['name']}**: {p['agency']}" for p in result["permits_likely_required"]]
    out += local_data_markdown(result.get("local_review_data"))
    out += ["", "## How the occupant load was calculated", "",
            "| Space | Use | Area (sq ft) | Sq ft per person | Load |", "|---|---|---|---|---|"]
    out += [f"| {r['space']} | {r['use']} | {r['area_sqft']:g} | {r['factor']} | {r['load']} |"
            for r in result["occupant_load"]["by_space"]]
    out += ["", f"_Code basis: {result['code_basis']}_", "", f"_{result['disclaimer']}_", ""]
    return "\n".join(out)


def local_data_markdown(d: Optional[dict]) -> list[str]:
    """Report section built from Seattle's own plan-review records (see pipeline/query.py)."""
    if not d or not d.get("summary") or not d["summary"].get("permits"):
        return []
    sm, label = d["summary"], d.get("category_label", "small-business")
    out = ["", f"## What Seattle's plan-review records show for {label} projects", "",
           f"From {sm['permits']} {label} tenant build-out permits that went through plan review "
           f"({d.get('source', 'city open data')}):", ""]
    if sm.get("share_two_or_more_cycles") is not None:
        out.append(f"- {sm['share_two_or_more_cycles']:.0%} needed two or more review rounds.")
    if sm.get("median_days_plan_review") is not None:
        out.append(f"- Half spent {sm['median_days_plan_review']:g} days or more in plan review.")
    if sm.get("median_days_out_corrections") is not None:
        out.append(f"- Half spent {sm['median_days_out_corrections']:g} days or more waiting on the applicant's corrections.")
    rows = d.get("corrections_by_review_type") or []
    if rows:
        out += ["", "| Review | Projects reviewed | Sent back for corrections in round 1 |", "|---|---|---|"]
        out += [f"| {r['review_type']} | {r['permits']} | {r['share_corrections']:.0%} |" for r in rows]
    subj = d.get("top_comment_subjects") or []
    if subj:
        out += ["", "Most common subjects of reviewer comments:", ""]
        out += [f"- {r['subject']}: {r['comments']} comments on {r['permits']} projects" for r in subj]
    return out
