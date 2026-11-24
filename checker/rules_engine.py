"""Deterministic compliance checks.

In:  the facts read from a floor plan (see extract.py), the owner's intake answers
     (business type, cooking, alcohol...), the rulebook JSON, and the zoning result.
Out: findings, each tied to a code citation and to the Seattle reviewer who checks it,
     plus the permits the project will likely need.

No model is involved here. Every number comes from checker/rules/seattle.json, so a
finding can always be traced to one line of the rulebook.

Every finding has status "pass", "fail" or "review" (not enough on the plan to decide).
Every finding also says whether its rule's values were checked against the code text (rule_verified) and
where the rule comes from (rule_source). Neither changes a finding's status.
"""
from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from itertools import product
from pathlib import Path
from typing import Any, Optional

RULES_DIR = Path(__file__).parent / "rules"
DEFAULT_RULES = "seattle"
DEFAULT_BUSINESS = "cafe_restaurant"
SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "info": 3}
# The line shown beside the results (report, PDF, assistant), and the longer caveat that closes the report.
PRECHECK_NOTE = "A pre-check from the checks we ran, not a city approval."
DISCLAIMER = ("Not a code determination: have a licensed design professional and the city's plan reviewer "
              "confirm the design.")


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
    rule_verified: bool = False  # the rule's values were read from the code text (rulebook: rules); never changes status
    rule_source: str = ""        # the code edition and section the rule comes from (rulebook: rules)

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
        reasons.append(f"{n} people, which is {rule['occupant_load']} or more")
    if rule.get("fire_area_sqft") and area > rule["fire_area_sqft"]:
        reasons.append(f"{area:,.0f} sq ft, which is over {rule['fire_area_sqft']:,} sq ft")
    if rule.get("upper_floor") and upper_floor:
        reasons.append("it is not on the ground floor")
    if not reasons:
        return None
    limits = [f"{rule['occupant_load']} people"] if rule.get("occupant_load") else []
    limits += [f"{rule['fire_area_sqft']:,} sq ft"] if rule.get("fire_area_sqft") else []
    return {"reasons": reasons, "cite": rule["cite"], "thresholds": " or ".join(limits)}


# ---------------------------------------------------------------- answers the owner is not sure of
# The intake answers an owner may leave as "Not sure" (null), and how the result names them.
# An unknown answer is never taken as "no": see run_checks().
UNSURE_ANSWERS = {
    "cooking_on_site": "whether there will be cooking that makes grease or smoke",
    "food_prep": "whether food will be prepared on site",
    "serves_alcohol": "whether alcohol will be served",
    "outdoor_seating": "whether there will be outdoor seating",
    "upper_floor": "whether the space is above or below the street-level floor",
    "historic_district": "whether the building is a landmark or in a historic district",
}
STATUS_ORDER = {"fail": 0, "review": 1, "pass": 2}


def run_checks(extraction: dict, intake: dict, rules: dict, zoning: Optional[dict] = None) -> dict[str, Any]:
    """The checks for one plan. An intake answer of None ("Not sure") is unknown, not "no".

    The checks are run with every unknown answer as no and as yes. A finding that comes out the same
    either way is kept as it is. One that differs, or appears only one way, gets status "review" with
    its citation and reviewer, and names the question; it is never "pass". A permit listed only one way
    is still listed, with "may_be_needed" naming the question. Leaving an answer out means "no", as before.
    """
    unsure = [k for k in UNSURE_ANSWERS if k in intake and intake[k] is None]
    if not unsure:
        return _run_checks(extraction, intake, rules, zoning)
    combos = list(product((False, True), repeat=len(unsure)))
    variants = {c: _run_checks(extraction, intake | dict(zip(unsure, c)), rules, zoning) for c in combos}
    return _merge_unsure(variants, unsure, rules)


def _numbered(result: dict) -> dict[tuple[str, int], dict]:
    """Findings keyed by rule id and how many of that rule came before (a rule can apply to several doors)."""
    seen: dict[str, int] = {}
    out = {}
    for f in result["findings"]:
        n = seen.get(f["rule_id"], 0)
        seen[f["rule_id"]] = n + 1
        out[(f["rule_id"], n)] = f
    return out


def _depends_on(unsure: list[str], value_for: dict[tuple, Any]) -> list[str]:
    """The unknown answers whose yes or no changes this value, holding the others fixed."""
    out = []
    for i, key in enumerate(unsure):
        for c, v in value_for.items():
            if not c[i] and value_for[c[:i] + (True,) + c[i + 1:]] != v:
                out.append(key)
                break
    return out or list(unsure)


def _questions(keys: list[str]) -> str:
    words = [UNSURE_ANSWERS[k] for k in keys]
    return words[0] if len(words) == 1 else ", ".join(words[:-1]) + " and " + words[-1]


def _merge_unsure(variants: dict[tuple, dict], unsure: list[str], rules: dict) -> dict[str, Any]:
    base = variants[tuple(False for _ in unsure)]
    numbered = {c: _numbered(r) for c, r in variants.items()}
    keys = list(dict.fromkeys(k for c in variants for k in numbered[c]))

    findings = []
    for key in keys:
        value_for = {c: numbered[c].get(key) for c in variants}
        present = [f for f in value_for.values() if f is not None]
        if len(present) == len(value_for) and all(f == present[0] for f in present):
            findings.append(present[0])
            continue
        worst = min(present, key=lambda f: (STATUS_ORDER[f["status"]], SEVERITY_ORDER[f["severity"]]))
        asked = _questions(_depends_on(unsure, value_for))
        findings.append(worst | {
            "status": "review",
            "severity": worst["severity"] if worst["status"] != "pass" else "medium",
            "detail": f"{worst['detail']} This depends on {asked}, which was answered Not sure.",
            "fix": worst["fix"] or f"Answer {asked}, then run the check again.",
        })
    findings.sort(key=lambda f: (STATUS_ORDER[f["status"]], SEVERITY_ORDER[f["severity"]]))

    listed = {c: {p["id"]: p for p in r["permits_likely_required"]} for c, r in variants.items()}
    permits = []
    for p in rules["permits"]:
        value_for = {c: p["id"] in listed[c] for c in variants}
        if not any(value_for.values()):
            continue
        entry = next(listed[c][p["id"]] for c in variants if value_for[c])
        if not all(value_for.values()):
            entry = entry | {"may_be_needed": f"May be needed: check with the city. It depends on "
                                              f"{_questions(_depends_on(unsure, value_for))}, which was answered Not sure."}
        permits.append(entry)

    count = lambda status: sum(f["status"] == status for f in findings)
    summary = base["summary"] | {"fails": count("fail"), "reviews": count("review"), "passes": count("pass")}
    return base | {"summary": summary, "findings": findings, "permits_likely_required": permits}


# ---------------------------------------------------------------- wording
def _count(n: float, one: str, many: Optional[str] = None) -> str:
    """'no exits', '1 exit', '2 exits': a count with its noun, instead of 'exit(s)'."""
    many = many or one + "s"
    return f"no {many}" if n == 0 else f"{n:g} {one if n == 1 else many}"


_NTH_EXIT = {1: "an exit", 2: "a second exit", 3: "a third exit"}


def _add_exits(have: int, more: int) -> str:
    """The title for missing exits: 'Add a second exit', 'Add 2 more exits', 'Add 2 exits'."""
    if more == 1:
        return f"Add {_NTH_EXIT.get(have + 1, 'an exit')}"
    return f"Add {more} more exits" if have else f"Add {more} exits"


def _zoning_title(status: str, district: Optional[str]) -> str:
    if not district:
        return "Look up the zone for this address"
    return {"pass": f"Zoning: {district}", "fail": f"Find a site zoned for this business: {district}"}.get(
        status, f"Confirm the zoning: {district}")


# ---------------------------------------------------------------- checks
def _run_checks(extraction: dict, intake: dict, rules: dict, zoning: Optional[dict] = None) -> dict[str, Any]:
    F: list[Finding] = []
    bt = business(rules, intake.get("business_type"))
    ol = occupant_load(extraction, rules, bt["key"])
    n = ol["total"]
    eg, acc, pl, fire, health = rules["egress"], rules["accessibility"], rules["plumbing"], rules["fire"], rules["health"]
    group = occupancy_group(n, bt, rules)

    if ol["missing_area"]:
        F.append(Finding("OL-0", "Add the missing room areas", "review", "high",
                         f"Your plan shows no area for {', '.join(ol['missing_area'])}. Without it, the count of people "
                         f"may come out too low.",
                         "SBC Table 1004.5", "Add dimensions or areas for these rooms to the plan."))
    if not ol["by_space"]:
        F.append(Finding("OL-0", "Label each room's use and area", "review", "high",
                         "Your plan shows no room with a use and an area we can read, so these checks treat the space as empty.",
                         "SBC Table 1004.5", "Label each room with its use and its area or dimensions."))
    F.append(Finding("OCC-1", "Occupancy classification", "pass", "info",
                     f"{bt['label']} for {n} people: Group {group}.",
                     rules["occupancy"]["cite"]))

    doors = extraction.get("doors", [])
    exits = [d for d in doors if d.get("is_exit")]

    # --- number of exits
    need = 1 + (n > eg["two_exits_above_occupant_load"]) + (n > eg["three_exits_above_occupant_load"])
    exits_seen = f"Your plan shows {_count(len(exits), 'exit')}. A space for {n} people needs {need}."
    if len(exits) >= need:
        F.append(Finding("EG-1", "Exits", "pass", "info", exits_seen, eg["exits_cite"]))
    else:
        more = need - len(exits)
        new = "it" if more == 1 else "them"
        where = (f"Place {new} far from the {'one' if len(exits) == 1 else 'ones'} you have" if exits
                 else "Place them far apart" if more > 1 else "Add an exit to the plan")
        F.append(Finding("EG-1", _add_exits(len(exits), more), "fail", "critical", exits_seen, eg["exits_cite"],
                         f"{where}, or make the public area smaller so the space holds "
                         f"{eg['two_exits_above_occupant_load']} people or fewer."))

    # --- exit door swing
    if n >= eg["outward_swing_at_occupant_load"]:
        for d in exits:
            if d.get("swing") == "inward":
                F.append(Finding("EG-2", f"Turn the exit door to swing outward: {d['label']}", "fail", "high",
                                 f"Your plan shows this exit door swinging inward. A space for {n} people needs exit doors "
                                 f"that swing out, the way people leave.",
                                 eg["swing_cite"], "Re-hang the door to swing outward. Check that it doesn't block the "
                                                   "sidewalk or a required clear space."))
            elif d.get("swing") == "unknown":
                F.append(Finding("EG-2", f"Show which way the exit door swings: {d['label']}", "review", "medium",
                                 "Your plan doesn't show which way this door swings.", eg["swing_cite"],
                                 "Show the door swing on the plan."))

    # --- door clear widths
    for d in doors:
        w = d.get("clear_width_in")
        who = d["label"] + (f" ({d['serves']})" if d.get("serves") else "")
        if w is None:
            F.append(Finding("EG-3", f"Show the door's clear width: {who}", "review", "medium",
                             "Your plan doesn't show this door's clear width.", eg["door_cite"],
                             "Write the clear opening width next to the door on the plan."))
        elif w < eg["door_min_clear_width_in"]:
            F.append(Finding("EG-3", f"Widen the door: {who}", "fail", "critical" if d.get("is_exit") else "high",
                             f"Your plan shows {w:g} in. clear. A door needs at least {eg['door_min_clear_width_in']} in.",
                             eg["door_cite"], f"Widen the opening to at least {eg['door_min_clear_width_in']} in. clear. "
                                              f"A 36 in. door usually gives this."))
    if not doors:
        F.append(Finding("EG-3", "Label the doors on the plan", "review", "high",
                         "Your plan shows no door with a label we can read.", eg["door_cite"],
                         "Label every door with its clear width and mark the exits."))

    # --- egress capacity
    widths = [d["clear_width_in"] for d in exits if d.get("clear_width_in")]
    if widths:
        required_w = n * eg["egress_width_in_per_occupant"]
        if sum(widths) + 1e-9 < required_w:
            F.append(Finding("EG-4", "Widen the exit doors", "fail", "high",
                             f"Your exit doors add up to {sum(widths):g} in. A space for {n} people needs {required_w:.1f} in. "
                             f"({n} x {eg['egress_width_in_per_occupant']} in.).",
                             eg["egress_width_cite"], "Widen the exit doors or add an exit."))

    # --- exit signs (not required where only one exit is required)
    fs = extraction.get("fire_safety") or {}
    signs = fs.get("exit_signs_shown")
    if need >= eg["exit_signs_when_exits_required"]:
        if signs is None:
            F.append(Finding("FS-1", "Show the exit signs", "review", "medium",
                             "Your plan doesn't show exit signs.", eg["exit_sign_cite"],
                             "Show an illuminated exit sign at each exit."))
        elif signs < need:
            F.append(Finding("FS-1", "Add an exit sign at each exit", "fail", "high",
                             f"Your plan shows {_count(signs, 'exit sign')}. Each of the {need} exits needs one.",
                             eg["exit_sign_cite"], "Add an illuminated exit sign at each required exit."))
        else:
            F.append(Finding("FS-1", "Exit signs", "pass", "info", f"Your plan shows {_count(signs, 'exit sign')}.",
                             eg["exit_sign_cite"]))

    # --- accessible routes
    for a in extraction.get("aisles", []):
        w = a.get("min_width_in")
        if w is not None and w < acc["route_min_width_in"]:
            F.append(Finding("ADA-1", f"Widen the aisle: {a['label']}", "fail", "high",
                             f"Your plan shows {w:g} in. A wheelchair route needs at least {acc['route_min_width_in']} in.",
                             acc["route_cite"], f"Move furniture or fixtures to give {acc['route_min_width_in']} in. clear."))
    if not extraction.get("aisles"):
        F.append(Finding("ADA-1", "Show the aisle widths", "review", "medium",
                         "Your plan doesn't show aisle or route widths.", acc["route_cite"],
                         "Add the width of the main path from the entrance to the service area and restrooms."))

    # --- restrooms: accessibility
    restrooms = extraction.get("restrooms", [])
    for r in restrooms:
        t = r.get("turning_circle_diameter_in")
        if t is None:
            F.append(Finding("ADA-2", f"Show the turning space: {r['label']}", "review", "medium",
                             "Your plan doesn't show a turning circle in this restroom.", acc["turning_cite"],
                             f"Show a {acc['turning_space_diameter_in']} in. turning circle (or T-turn) in the room."))
        elif t < acc["turning_space_diameter_in"]:
            F.append(Finding("ADA-2", f"Widen the restroom so a wheelchair can turn: {r['label']}", "fail", "high",
                             f"Your plan shows {t:g} in. of clear floor. A wheelchair needs {acc['turning_space_diameter_in']} in. to turn.",
                             acc["turning_cite"], f"Enlarge the room or rearrange fixtures to clear a {acc['turning_space_diameter_in']} in. circle."))
        dw = r.get("door_clear_width_in")
        if dw is not None and dw < eg["door_min_clear_width_in"]:
            already = any(f.rule_id == "EG-3" and r["label"] in f.title for f in F)
            if not already:
                F.append(Finding("ADA-3", f"Widen the restroom door: {r['label']}", "fail", "high",
                                 f"Your plan shows {dw:g} in. clear. A restroom door needs at least {eg['door_min_clear_width_in']} in.",
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
        F.append(Finding("PL-1", "Add a restroom", "fail", "critical",
                         f"Your plan shows no restroom. A space for {n} people needs {_count(fx['water_closets'], 'toilet')} "
                         f"({fx['profile']}).",
                         pl["cite"], "Add the restrooms to the plan."))
    elif have_total < fx["water_closets"] or (not fx["shared_room_allowed"] and short > allg):
        F.append(Finding("PL-1", "Add more toilets", "fail", "high",
                         f"Your plan shows {_count(have_total, 'toilet')} (men {men}, women {women}, all-gender {allg}). "
                         f"A space for {n} people needs {fx['water_closets']} ({fx['profile']}: {basis}).",
                         pl["cite"], "Add toilets, or ask the plan reviewer whether single-user all-gender rooms can count "
                                     "toward the total."))
    else:
        F.append(Finding("PL-1", "Toilet count", "pass", "info",
                         f"Your plan shows {_count(have_total, 'toilet')}. A space for {n} people needs {fx['water_closets']} "
                         f"({fx['profile']}: {basis}).", pl["cite"]))
    lav_have = sum(r.get("lavatories") or 0 for r in restrooms)
    lav_need = max(fx["lavatories"], len(restrooms))
    if restrooms and lav_have < lav_need:
        F.append(Finding("PL-2", "Add a sink to each restroom", "fail", "medium",
                         f"Your plan shows {_count(lav_have, 'restroom sink')}. This space needs at least {lav_need}, "
                         f"one in each toilet room.",
                         pl["cite"], "Add a sink to each toilet room."))

    # --- accessible seating (businesses with customer seating)
    seats, acc_seats = extraction.get("seat_count"), extraction.get("accessible_seat_count")
    if seats and bt.get("seating"):
        need_acc = max(1, math.ceil(seats * acc["accessible_seating_share"]))
        if acc_seats is None:
            F.append(Finding("ADA-4", "Mark the accessible seats", "review", "medium",
                             f"Your plan doesn't mark accessible seats. {need_acc} of your {seats} seats need to be at "
                             f"accessible tables.", acc["seating_cite"],
                             "Mark accessible tables (knee clearance, 28-34 in. surface height) on the plan."))
        elif acc_seats < need_acc:
            F.append(Finding("ADA-4", "Add accessible seats", "fail", "medium",
                             f"Your plan marks {_count(acc_seats, 'accessible seat')}. Your {seats} seats need {need_acc} "
                             f"({acc['accessible_seating_share']:.0%} of {seats}).",
                             acc["seating_cite"], "Mark more accessible tables, spread through the seating area."))

    # --- food preparation and cooking
    k = extraction.get("kitchen") or {}
    cooking = bool(intake.get("cooking_on_site")) or (bool(bt.get("food")) and bool(k.get("grease_producing_cooking")))
    food = bool(bt.get("food")) or bool(intake.get("food_prep")) or cooking
    if cooking and k.get("type1_hood_shown") is not True:
        no_hood = k.get("type1_hood_shown") is False
        F.append(Finding("MECH-1", ("Add" if no_hood else "Show") + " a Type I hood over the cooking line",
                         "fail" if no_hood else "review", "critical",
                         "Your plan doesn't show a Type I exhaust hood with fire suppression. Cooking that makes grease "
                         "or smoke needs one.",
                         fire["hood_cite"], "Add a Type I hood and suppression system over the cooking line, or limit the menu to equipment that does not need one."))
    if food:
        if not k.get("hand_sinks"):
            no_sink = k.get("hand_sinks") == 0
            F.append(Finding("HLTH-1", ("Add" if no_sink else "Show") + " a handwashing sink in the food prep area",
                             "fail" if no_sink else "review", "high",
                             "Your plan doesn't show a handwashing sink in the prep area. Food prep needs its own hand sink.",
                             health["cite"], "Add a hand sink in the prep area (separate from the dish sink)."))
        if k.get("three_compartment_sink") is not True:
            no_3comp = k.get("three_compartment_sink") is False
            F.append(Finding("HLTH-2", ("Add" if no_3comp else "Show") + " a three-compartment sink",
                             "fail" if no_3comp else "review", "medium",
                             "Your plan doesn't show a three-compartment sink. Washing dishes needs one, or a dish machine "
                             "that Public Health accepts.", health["cite"],
                             "Show the three-compartment sink or dish machine on the plan."))
        by_plumbing, by_health = pl.get("service_sink_required"), health.get("service_sink_required")
        if k.get("mop_or_service_sink") is not True and (by_plumbing or by_health):
            no_mop = k.get("mop_or_service_sink") is False
            F.append(Finding("PL-3" if by_plumbing else "HLTH-3", ("Add" if no_mop else "Show") + " a mop sink",
                             "fail" if no_mop else "review", "medium",
                             "Your plan doesn't show a mop sink. The space needs one.",
                             pl["cite"] if by_plumbing else health["cite"], "Add a mop sink."))

    # --- fire protection
    area = extraction.get("gross_area_sqft") or 0
    spk = sprinkler_trigger(group, n, area, bool(intake.get("upper_floor")), rules)
    if spk and fs.get("sprinklers_noted") is not True:
        no_spk = fs.get("sprinklers_noted") is False
        F.append(Finding("FS-2", "Add a sprinkler system" if no_spk else "Confirm the building has sprinklers",
                         "fail" if no_spk else "review", "critical",
                         f"Your plan {'says there are no sprinklers' if no_spk else 'does not show sprinklers'}. "
                         f"This Group {group} space needs them: {'; '.join(spk['reasons'])} (limit: {spk['thresholds']}).",
                         spk["cite"], "Ask the landlord whether the building has sprinklers and note it on the plan. If it "
                                      "has none, budget for a system or plan for fewer people."))
    if not fs.get("fire_extinguishers_shown"):
        F.append(Finding("FS-3", "Show the fire extinguishers", "review", "medium",
                         "Your plan doesn't show fire extinguishers.", fire["extinguisher_cite"],
                         "Show extinguisher locations" + ("; add a Class K unit at the cooking line." if cooking else ".")))
    elif cooking and fs.get("class_k_extinguisher_shown") is not True:
        F.append(Finding("FS-3", "Show a Class K extinguisher at the cooking line", "review", "medium",
                         "Your plan doesn't show a Class K extinguisher. Commercial cooking needs one nearby.",
                         fire["extinguisher_cite"], "Add a Class K extinguisher within reach of the cooking line."))

    # --- zoning
    if zoning:
        z = zoning
        sev = {"likely_permitted": "info", "needs_review": "high", "not_permitted": "critical", "unknown": "medium"}[z["status"]]
        st = {"likely_permitted": "pass", "not_permitted": "fail"}.get(z["status"], "review")
        cite = rules["zoning"]["cite"] + (f"; {z['cite']}" if z.get("cite") else "")
        F.append(Finding("ZN-1", _zoning_title(st, z.get("district")), st, sev, z["detail"], cite, z.get("fix", "")))

    # --- record a pass for every applicable check that raised nothing
    raised = {f.rule_id for f in F}
    spk_cite = spk["cite"] if spk else fire["sprinkler_cite_default"]
    all_doors = "The door on your plan is" if len(doors) == 1 else f"All {len(doors)} doors on your plan are"
    passes = [
        ("EG-2", "Exit door swing", "Every exit door on your plan swings outward.", eg["swing_cite"],
         n >= eg["outward_swing_at_occupant_load"] and bool(exits)),
        ("EG-3", "Door widths", f"{all_doors} at least {eg['door_min_clear_width_in']} in. clear.", eg["door_cite"], bool(doors)),
        ("EG-4", "Exit capacity", f"Your exit doors add up to {sum(widths):g} in. A space for {n} people needs "
                                  f"{n * eg['egress_width_in_per_occupant']:.1f} in.",
         eg["egress_width_cite"], bool(widths)),
        ("ADA-1", "Aisle and route widths", f"Every route width on your plan is at least {acc['route_min_width_in']} in.",
         acc["route_cite"], True),
        ("ADA-2", "Restroom turning space", f"Each restroom on your plan shows a {acc['turning_space_diameter_in']} in. turning circle.",
         acc["turning_cite"], bool(restrooms)),
        ("ADA-4", "Accessible seating", f"Your plan marks {acc_seats} of {seats} seats as accessible.", acc["seating_cite"],
         bool(seats) and bool(bt.get("seating"))),
        ("PL-2", "Restroom sinks", f"Your plan shows {_count(lav_have, 'restroom sink')}.", pl["cite"], bool(restrooms)),
        ("MECH-1", "Kitchen hood", "Your plan shows a Type I hood with fire suppression over the cooking line.", fire["hood_cite"], cooking),
        ("HLTH-1", "Handwashing sink", "Your plan shows a hand sink in the food prep area.", health["cite"], food),
        ("HLTH-2", "Warewashing", "Your plan shows a three-compartment sink.", health["cite"], food),
        ("FS-2", "Sprinklers", "This space needs sprinklers, and your plan shows them.", spk_cite, bool(spk)),
        ("FS-3", "Fire extinguishers", f"Your plan shows {_count(fs.get('fire_extinguishers_shown') or 0, 'fire extinguisher')}.",
         fire["extinguisher_cite"], True),
    ]
    for rule_id, title, detail, cite, applies in passes:
        if applies and rule_id not in raised:
            F.append(Finding(rule_id, title, "pass", "info", detail, cite))

    routing = rules.get("review_routing") or {}
    for f in F:
        route = routing.get(f.rule_id) or routing.get(f.rule_id.split("-")[0]) or {}   # exact rule, then its family
        f.reviewed_by = route.get("label", "")

    checked = rules.get("rules") or {}
    for f in F:
        entry = checked.get(f.rule_id) or {}   # a rule missing from the rulebook counts as unverified
        f.rule_verified = entry.get("verified") is True
        f.rule_source = entry.get("source", "")

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
# The three status names a person reads (CONTENT.md rule 11). The API's values stay "fail", "review", "pass".
STATUS_WORD = {"fail": "Fix before you apply", "review": "Check with the city", "pass": "No issues found"}
NOTHING_OPEN = "No issues found in the checks we ran."
# Beside a finding whose rule values were not yet read from the code text, and once on a report that uses one.
UNVERIFIED_NOTE = "This rule's value is still being checked against the code."
SOME_UNVERIFIED = "Some rule values are still being checked against the code."


def to_markdown(result: dict, title: Optional[str] = None) -> str:
    s = result["summary"]
    out = [f"# {title or 'Permit pre-check: ' + s['business_label']}", "",
           f"**Business:** {s['business_label']}  |  **Occupant load:** {s['occupant_load']}  |  "
           f"**Occupancy group:** {s['occupancy_group']}  |  **Exits:** {s['exits_shown']} shown / {s['exits_required']} required",
           f"**{STATUS_WORD['fail']}: {s['fails']}  |  {STATUS_WORD['review']}: {s['reviews']}  |  "
           f"{STATUS_WORD['pass']}: {s['passes']}**", "",
           f"_{PRECHECK_NOTE}_", "",
           *([f"_{SOME_UNVERIFIED}_", ""] if any(not f.get("rule_verified") for f in result["findings"]) else []),
           "## Fix list", ""]
    for f in result["findings"]:
        if f["status"] == "pass":
            continue
        out.append(f"- **{f['title']}** ({STATUS_WORD[f['status']]}, {f['severity']}): {f['detail']}  ")
        if f["fix"]:
            out.append(f"  Fix: {f['fix']}  ")
        if f.get("reviewed_by"):
            out.append(f"  Checked by: {f['reviewed_by']}  ")
        out.append(f"  Code: {f['citation']}")
        if not f.get("rule_verified"):
            out.append(f"  {UNVERIFIED_NOTE}")
    if not (s["fails"] or s["reviews"]):
        out.append(NOTHING_OPEN)
    out += ["", f"## {STATUS_WORD['pass']}", ""]
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
    if sm.get("share_two_or_more_rounds") is not None:
        out.append(f"- {sm['share_two_or_more_rounds']:.0%} needed two or more review rounds.")
    if sm.get("median_days_in_review") is not None:
        out.append(f"- Half spent {sm['median_days_in_review']:g} days or more in plan review.")
    if sm.get("median_days_with_applicant") is not None:
        out.append(f"- Half spent {sm['median_days_with_applicant']:g} days or more waiting on the applicant's corrections.")
    rows = d.get("corrections_by_review_type") or []
    if rows:
        out += ["", "| Review | Projects reviewed | Sent back for corrections in round 1 |", "|---|---|---|"]
        out += [f"| {r['review_type']} | {r['permits']} | {r['share_corrections']:.0%} |" for r in rows]
    subj = d.get("top_comment_subjects") or []
    if subj:
        out += ["", "Most common subjects of reviewer comments:", ""]
        out += [f"- {r['subject']}: {r['comments']} comments on {r['permits']} projects" for r in subj]
    return out
