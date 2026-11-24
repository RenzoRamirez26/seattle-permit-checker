"""The rules engine: occupant load, exits, accessibility, plumbing, fire, permits, for each business type."""
import json
import re

import pytest

from checker import rules_engine, zoning
from tests.conftest import ROOT, ids

CAFE = {"business_type": "cafe_restaurant", "cooking_on_site": True}


def test_occupant_load(rules, load):
    ol = rules_engine.occupant_load(load("compliant"), rules, "cafe_restaurant")
    assert ol["total"] == 106 and [r["load"] for r in ol["by_space"]] == [86, 16, 3, 1]


def test_compliant_cafe_is_clean(rules, load):
    z = zoning.classify("NC2-55 (M)", rules, business_type="cafe_restaurant", area_sqft=2400)
    r = rules_engine.run_checks(load("compliant"), CAFE, rules, z)
    assert r["summary"]["fails"] == 0 and r["summary"]["reviews"] == 0 and r["summary"]["passes"] == 17
    assert r["summary"]["occupancy_group"] == "A-2" and r["summary"]["business_label"] == "Café or restaurant"
    assert all(f["reviewed_by"] for f in r["findings"])


def test_flawed_cafe_flags_every_planted_problem(rules, load):
    z = zoning.classify("LR3 (M)", rules, business_type="cafe_restaurant")
    r = rules_engine.run_checks(load("flawed"), CAFE, rules, z)
    assert {"EG-1", "EG-2", "EG-3", "FS-1", "FS-2", "ADA-1", "ADA-2", "MECH-1", "HLTH-1", "ZN-1"} <= ids(r, "fail")
    assert {"ADA-4", "FS-3"} <= ids(r, "review")
    permit_ids = {p["id"] for p in r["permits_likely_required"]}
    assert {"building", "mechanical", "hood_fire", "health", "sprinkler", "assembly"} <= permit_ids
    assert not {"alcohol", "historic", "salon_license"} & permit_ids
    by_id = {f["rule_id"]: f for f in r["findings"]}
    assert "Ch. 10" in by_id["EG-1"]["reviewed_by"] and "Fire" in by_id["FS-2"]["reviewed_by"]
    assert "Ch. 10" in by_id["FS-1"]["reviewed_by"]            # exit signs are an egress item, not a Fire review
    assert "Public Health" in by_id["HLTH-1"]["reviewed_by"] and "SBC" in by_id["EG-1"]["citation"]
    assert "100 or more" in by_id["FS-2"]["detail"] and "903.2.1.2" in by_id["FS-2"]["citation"]


def test_flawed_salon(rules, load):
    z = zoning.classify("NR3", rules, business_type="salon", area_sqft=800)
    r = rules_engine.run_checks(load("salon_flawed"), {"business_type": "salon"}, rules, z)
    s = r["summary"]
    assert (s["occupant_load"], s["occupancy_group"], s["exits_required"]) == (15, "B", 1)   # 400/150 + 160/15 + 120/300
    assert ids(r, "fail") == {"EG-3", "ADA-1", "ADA-2"} and ids(r, "review") == {"ZN-1", "FS-3"}
    assert "PL-1" in ids(r, "pass") and "one shared toilet room is allowed up to 25" in \
        next(f["detail"] for f in r["findings"] if f["rule_id"] == "PL-1")
    # no restaurant checks on a salon, and no exit signs or sprinklers for a one-exit Group B space
    assert not {"MECH-1", "HLTH-1", "HLTH-2", "HLTH-3", "ADA-4", "FS-1", "FS-2"} & (ids(r, "fail") | ids(r, "review") | ids(r, "pass"))
    permit_ids = [p["id"] for p in r["permits_likely_required"]]
    assert "salon_license" in permit_ids and not {"health", "grease", "mechanical", "assembly"} & set(permit_ids)


def test_small_cafe_is_group_b_with_one_exit(rules, load):
    ex = load("compliant")
    ex["spaces"] = [{"name": "Dining", "use": "dining", "area_sqft": 600}, {"name": "Prep", "use": "kitchen", "area_sqft": 150}]
    ex["doors"] = ex["doors"][:1]; ex["seat_count"] = 20; ex["accessible_seat_count"] = 4
    r = rules_engine.run_checks(ex, {"business_type": "cafe_restaurant"}, rules)
    assert r["summary"]["occupant_load"] == 41 and r["summary"]["occupancy_group"] == "B"
    assert r["summary"]["exits_required"] == 1 and "EG-1" in ids(r, "pass")
    assert "sprinkler" not in {p["id"] for p in r["permits_likely_required"]}


def test_seattle_specific_rules(rules, load):
    # the mop sink is a health-code item in Seattle (the building code's service sink is struck out)
    ex = load("compliant"); ex["kitchen"]["mop_or_service_sink"] = False
    r = rules_engine.run_checks(ex, CAFE, rules)
    assert "HLTH-3" in ids(r, "fail") and "PL-3" not in ids(r, "fail")
    # dining spaces with 30 or fewer occupants may share one all-gender toilet room (SBC 2902.2 exc. 7)
    small = load("compliant")
    small["spaces"] = [{"name": "Dining", "use": "dining", "area_sqft": 300}, {"name": "Prep", "use": "kitchen", "area_sqft": 150}]
    small["doors"] = small["doors"][:1]; small["seat_count"] = 16; small["accessible_seat_count"] = 2
    small["restrooms"] = [{"label": "Restroom", "designation": "all_gender", "water_closets": 1, "lavatories": 1,
                           "turning_circle_diameter_in": 60, "door_clear_width_in": 34}]
    r = rules_engine.run_checks(small, {"business_type": "cafe_restaurant"}, rules)
    assert r["summary"]["occupant_load"] == 21 and "PL-1" in ids(r, "pass")
    small["spaces"][0]["area_sqft"] = 600          # 41 occupants: over 30, so one shared room is no longer enough
    assert "PL-1" in ids(rules_engine.run_checks(small, {"business_type": "cafe_restaurant"}, rules), "fail")
    # the Fire Department assembly permit starts at 100 people, not at Group A-2 (50)
    mid = load("compliant"); mid["spaces"] = [{"name": "Dining", "use": "dining", "area_sqft": 900}]; mid["seat_count"] = 50
    r = rules_engine.run_checks(mid, {"business_type": "cafe_restaurant"}, rules)
    assert r["summary"]["occupancy_group"] == "A-2" and "assembly" not in {p["id"] for p in r["permits_likely_required"]}
    # a historic overlay from the zoning layer adds the Certificate of Approval
    z = zoning.classify("PSM 100/100-120", rules) | {"overlays": {"historic": "PS"}}
    assert "historic" in {p["id"] for p in rules_engine.run_checks(load("compliant"), CAFE, rules, z)["permits_likely_required"]}


def _shop(area, use, **extra):
    """A one-room business with two good exits and two good restrooms, so only the rule under test varies."""
    door = lambda n: {"label": f"Door {n}", "clear_width_in": 36, "is_exit": True, "swing": "outward"}
    rest = lambda who: {"label": f"Restroom {who}", "designation": who, "water_closets": 1, "lavatories": 1,
                        "turning_circle_diameter_in": 60, "door_clear_width_in": 34}
    base = {"gross_area_sqft": area, "spaces": [{"name": "Main", "use": use, "area_sqft": area}],
            "doors": [door(1), door(2)], "aisles": [{"label": "Main aisle", "min_width_in": 44}],
            "restrooms": [rest("men"), rest("women")],
            "fire_safety": {"exit_signs_shown": 2, "fire_extinguishers_shown": 2, "sprinklers_noted": False}}
    return base | extra


def test_occupancy_group_and_load_by_business_type(rules):
    cases = [  # business, room use, area, expected load, expected group
        ("retail", "retail", 3000, 50, "M"),             # 60 sq ft per person
        ("office_studio", "office", 3000, 20, "B"),      # 150
        ("salon", "service", 1500, 10, "B"),
        ("fitness", "exercise", 2000, 40, "B"),          # 50; under 50 occupants an assembly use is Group B
        ("fitness", "exercise", 3000, 60, "A-3"),
        ("bar_taproom", "standing", 300, 60, "A-2"),     # 5 sq ft per person standing
    ]
    for business, use, area, load, group in cases:
        s = rules_engine.run_checks(_shop(area, use), {"business_type": business}, rules)["summary"]
        assert (s["occupant_load"], s["occupancy_group"]) == (load, group), business


def test_toilet_counts_by_business_type(rules):
    fx = lambda n, business: rules_engine.fixtures_required(n, rules_engine.business(rules, business), rules)
    assert fx(106, "cafe_restaurant")["water_closets"] == 2 and fx(160, "cafe_restaurant")["water_closets"] == 4  # 1 per 75 each sex
    assert fx(100, "bar_taproom")["water_closets"] == 4 and fx(100, "bar_taproom")["lavatories"] == 2             # 1 per 40; lav 1 per 75
    assert fx(200, "fitness") == fx(200, "fitness") | {"men": 1, "women": 2, "water_closets": 3}                  # 1 per 125 men, 1 per 65 women
    assert fx(120, "office_studio")["men"] == 3        # 60 men: 2 for the first 50, 1 for the next 10
    assert fx(20, "salon")["shared_room_allowed"] and fx(20, "salon")["water_closets"] == 1                        # business, 25 or fewer
    assert not fx(26, "salon")["shared_room_allowed"] and fx(26, "salon")["water_closets"] == 2
    assert fx(100, "retail")["shared_room_allowed"] and not fx(101, "retail")["shared_room_allowed"]              # mercantile, 100 or fewer
    assert fx(600, "retail")["water_closets"] == 2 and fx(600, "retail")["lavatories"] == 1                        # 1 per 500; lav 1 per 750


def test_sprinklers_by_occupancy_group(rules):
    t = lambda group, n, area, upper=False: rules_engine.sprinkler_trigger(group, n, area, upper, rules)
    assert t("A-2", 99, 5000) is None and t("A-2", 100, 1000) and t("A-2", 20, 5001) and t("A-2", 20, 1000, upper=True)
    assert t("A-3", 299, 12000) is None and t("A-3", 300, 1000)
    assert t("M", 500, 12000) is None and t("M", 10, 12001) and t("M", 10, 1000, upper=True) is None
    assert t("B", 400, 50000) is None                    # no Group B trigger in SBC 903.2
    big_shop = rules_engine.run_checks(_shop(13000, "retail"), {"business_type": "retail"}, rules)
    assert "FS-2" in ids(big_shop, "fail") and "903.2.7" in next(f["citation"] for f in big_shop["findings"] if f["rule_id"] == "FS-2")
    assert "sprinkler" in {p["id"] for p in big_shop["permits_likely_required"]}


def test_food_checks_only_for_food_businesses(rules):
    kitchenette = {"kitchen": {"grease_producing_cooking": True, "type1_hood_shown": False, "hand_sinks": 0}}
    office = rules_engine.run_checks(_shop(1500, "office", **kitchenette), {"business_type": "office_studio"}, rules)
    assert not {"MECH-1", "HLTH-1", "HLTH-2"} & ids(office, "fail")      # a staff kitchenette is not a restaurant kitchen
    bar = rules_engine.run_checks(_shop(600, "dining", **kitchenette), {"business_type": "bar_taproom"}, rules)
    assert {"MECH-1", "HLTH-1"} <= ids(bar, "fail")
    assert {"alcohol", "health"} <= {p["id"] for p in bar["permits_likely_required"]}   # a bar always needs the liquor licence


def test_missing_information_becomes_a_question_not_a_pass(rules):
    r = rules_engine.run_checks({"spaces": [], "doors": [], "restrooms": []}, {"business_type": "retail"}, rules)
    assert {"OL-0", "EG-3", "ADA-1", "FS-3"} <= ids(r, "review") and "PL-1" in ids(r, "fail")
    unknown = rules_engine.run_checks(_shop(900, "retail"), {"business_type": "no such type"}, rules)
    assert unknown["summary"]["business_type"] == "cafe_restaurant"      # falls back to the default, does not crash


def test_report_markdown(rules, load):
    z = zoning.classify("NR3", rules, business_type="salon", area_sqft=800)
    md = rules_engine.to_markdown(rules_engine.run_checks(load("salon_flawed"), {"business_type": "salon"}, rules, z))
    assert md.startswith("# Permit pre-check: Salon, barbershop or spa") and "Checked by: SDCI Ordinance" in md
    assert "Washington State Department of Licensing" in md and "Atlanta" not in md and "Georgia" not in md


# ---------------------------------------------------------------- Q1: "Not sure" answers are unknown, never "no"
UNSURE = list(rules_engine.UNSURE_ANSWERS)


def _cases(load):
    """Plans and business types where each answer can matter: food, sprinklers, permits."""
    retail = load("compliant") | {"kitchen": load("compliant")["kitchen"] | {"grease_producing_cooking": False}}
    return [("cafe_restaurant", load("flawed")), ("cafe_restaurant", load("compliant")), ("salon", load("salon_flawed")),
            ("retail", retail), ("bar", load("compliant"))]


def _numbered(result):
    return rules_engine._numbered(result)


@pytest.mark.parametrize("answer", UNSURE)
def test_a_not_sure_answer_turns_every_finding_that_depends_on_it_into_review(rules, load, answer):
    findings_differ = permits_differ = False
    for business, facts in _cases(load):
        base = {"business_type": business}
        yes, no = (rules_engine.run_checks(facts, base | {answer: v}, rules) for v in (True, False))
        unsure = rules_engine.run_checks(facts, base | {answer: None}, rules)
        y, n, u = _numbered(yes), _numbered(no), _numbered(unsure)
        assert set(u) == set(y) | set(n)                                    # nothing dropped, nothing invented
        for key in u:
            if y.get(key) == n.get(key):
                assert u[key] == y[key], key                                # does not depend on the answer: unchanged
            else:
                findings_differ = True
                assert u[key]["status"] == "review", (business, key)          # depends on it: never pass, never decided
                assert u[key]["citation"] == (y.get(key) or n.get(key))["citation"]
                assert u[key]["reviewed_by"] == (y.get(key) or n.get(key))["reviewed_by"]
                assert rules_engine.UNSURE_ANSWERS[answer] in u[key]["detail"] and "Not sure" in u[key]["detail"]
        assert not [f for f in unsure["findings"] if f["status"] == "pass" and (f != y.get((f["rule_id"], 0)) or f != n.get((f["rule_id"], 0)))]
        s = unsure["summary"]
        assert set(s) == set(no["summary"])                                  # the same summary fields, recounted
        assert (s["fails"], s["reviews"], s["passes"]) == tuple(sum(f["status"] == x for f in unsure["findings"]) for x in ("fail", "review", "pass"))
        listed = lambda r: {p["id"] for p in r["permits_likely_required"]}
        permits_differ |= listed(yes) != listed(no)
    assert findings_differ or permits_differ, f"{answer} changes nothing in these cases: the test would prove nothing"


@pytest.mark.parametrize("answer, permit", [("serves_alcohol", "alcohol"), ("outdoor_seating", "patio"), ("historic_district", "historic")])
def test_a_permit_that_depends_on_a_not_sure_answer_is_listed_as_may_be_needed(rules, load, answer, permit):
    facts, base = load("flawed"), {"business_type": "cafe_restaurant", "cooking_on_site": True}
    by_id = lambda r: {p["id"]: p for p in r["permits_likely_required"]}
    yes, no, unsure = (by_id(rules_engine.run_checks(facts, base | {answer: v}, rules)) for v in (True, False, None))
    assert permit in yes and "may_be_needed" not in yes[permit]                  # yes: listed as today
    assert permit not in no                                                       # no: not listed
    note = unsure[permit]["may_be_needed"]                                        # not sure: listed, and says why
    assert note.startswith("May be needed: check with the city.") and rules_engine.UNSURE_ANSWERS[answer] in note
    assert {k: v for k, v in unsure[permit].items() if k != "may_be_needed"} == yes[permit]
    assert [k for k, p in unsure.items() if "may_be_needed" in p] == [permit]
    assert rules_engine.run_checks(facts, base | {answer: None}, rules)["findings"] == rules_engine.run_checks(facts, base, rules)["findings"]


def test_several_not_sure_answers_at_once(rules, load):
    facts = _cases(load)[3][1]
    all_unsure = rules_engine.run_checks(facts, {"business_type": "retail", **{k: None for k in UNSURE}}, rules)
    assert all_unsure["summary"]["passes"] <= rules_engine.run_checks(facts, {"business_type": "retail"}, rules)["summary"]["passes"]
    for f in all_unsure["findings"]:
        if "answered Not sure" in f["detail"]:
            assert f["status"] == "review"
    notes = [p for p in all_unsure["permits_likely_required"] if p.get("may_be_needed")]
    assert {p["id"] for p in notes} >= {"alcohol", "patio", "historic", "mechanical", "health"}


def test_an_omitted_answer_and_an_explicit_false_give_todays_results(rules, load):
    for case in json.loads((ROOT / "demo" / "cases.json").read_text(encoding="utf-8")):
        facts = json.loads((ROOT / "demo" / case["extraction"]).read_text(encoding="utf-8"))
        z = zoning.classify(case["zoning"], rules, business_type=case["intake"]["business_type"], area_sqft=facts.get("gross_area_sqft"))
        omitted = rules_engine.run_checks(facts, case["intake"], rules, z)
        explicit = rules_engine.run_checks(facts, {k: False for k in UNSURE} | case["intake"], rules, z)
        assert omitted == explicit == rules_engine._run_checks(facts, case["intake"], rules, z)
        if case["id"] == "cafe_flawed":
            assert (omitted["summary"]["fails"], omitted["summary"]["reviews"], omitted["summary"]["passes"]) == (11, 2, 6)
        assert not any("may_be_needed" in p for p in omitted["permits_likely_required"])


def test_the_command_line_audit_is_unchanged(tmp_path, capsys):
    from checker import audit as audit_mod

    out = tmp_path / "r"
    audit_mod.main(["--extraction", str(ROOT / "demo" / "flawed_extraction.json"), "--business", "cafe_restaurant", "--cooking",
                    "--zoning", "NC2-55 (M)", "--db", str(tmp_path / "none.sqlite"), "--out", str(out)])
    result = json.loads(out.with_suffix(".json").read_text(encoding="utf-8"))
    assert (result["summary"]["fails"], result["summary"]["reviews"], result["summary"]["passes"]) == (11, 2, 6)
    assert "Not sure" not in capsys.readouterr().out and "may_be_needed" not in json.dumps(result)


# ---------------------------------------------------------------- rule verification (rulebook: rules)
ENGINE_RULE_IDS = set(re.findall(r'"([A-Z]+-\d+)"', (ROOT / "checker" / "rules_engine.py").read_text(encoding="utf-8")))
SECTION = re.compile(r"\b(\d{3,4}(?:\.\d+)+)\b")        # 1010.1.2.1, 903.2.7; not an edition year


def _rule_entries(rules):
    return {k: v for k, v in rules["rules"].items() if not k.startswith("_")}


def test_every_rule_has_verified_and_source(rules):
    """Every rule in the rulebook says whether its values were checked against the code text, and where it comes from."""
    entries = _rule_entries(rules)
    for rule_id, entry in entries.items():
        assert isinstance(entry.get("verified"), bool), f"{rule_id} has no verified true/false"
        assert isinstance(entry.get("source"), str) and entry["source"].strip(), f"{rule_id} has no source"
    assert ENGINE_RULE_IDS <= set(entries), f"rules missing from the rulebook: {sorted(ENGINE_RULE_IDS - set(entries))}"


def test_a_rule_is_verified_only_with_evidence_in_the_rulebook(rules):
    """verified: true needs every section it names to be listed under _meta.checked_against_city_sources."""
    checked = " ".join(rules["_meta"]["checked_against_city_sources"])
    verified = {k: v for k, v in _rule_entries(rules).items() if v["verified"]}
    assert verified, "no rule is verified: the test would prove nothing"
    for rule_id, entry in verified.items():
        sections = SECTION.findall(entry["source"])
        assert sections, f"{rule_id} is verified but names no section"
        for s in sections:
            assert s in checked, f"{rule_id} is verified but {s} is not in _meta.checked_against_city_sources"
    # The rules _meta.verify names as from memory stay unverified.
    for rule_id in ("OCC-1", "EG-1", "FS-3", "ADA-1", "ADA-2", "ADA-4", "MECH-1", "HLTH-1", "ZN-1", "PL-1"):
        assert _rule_entries(rules)[rule_id]["verified"] is False


def test_findings_carry_the_rule_verification_and_source(rules, load):
    entries = _rule_entries(rules)
    for business, facts in _cases(load):
        for f in rules_engine.run_checks(facts, {"business_type": business, "cooking_on_site": True}, rules)["findings"]:
            assert f["rule_verified"] is rules_engine.rule_checked(rules, f["rule_id"])
            assert f["rule_source"] == entries[f["rule_id"]]["source"]
            assert not f["rule_verified"] or entries[f["rule_id"]]["verified"]       # never more than the rulebook says


def test_a_rule_counts_as_checked_only_when_the_rules_it_depends_on_are(rules, load):
    """FS-2's sprinkler triggers were read from the code, but the occupant load and group it uses were not (OL-0, OCC-1)."""
    entries = _rule_entries(rules)
    assert entries["FS-2"]["verified"] and set(entries["FS-2"]["depends_on"]) == {"OL-0", "OCC-1"}
    assert not rules_engine.rule_checked(rules, "FS-2") and not rules_engine.rule_checked(rules, "FS-1")
    assert rules_engine.rule_checked(rules, "EG-3")                    # a door width needs no occupant load
    for rule_id, entry in entries.items():                              # every dependency is a rule in the rulebook
        assert set(entry.get("depends_on", [])) <= set(entries), rule_id
    loads_on_occupants = {"OCC-1", "EG-1", "EG-2", "EG-4", "FS-2", "PL-1", "PL-2"}
    assert all("OL-0" in entries[r]["depends_on"] for r in loads_on_occupants)

    fixed = json.loads(json.dumps(rules))
    fixed["rules"]["OL-0"]["verified"] = fixed["rules"]["OCC-1"]["verified"] = True
    assert rules_engine.rule_checked(fixed, "FS-2") and rules_engine.rule_checked(fixed, "EG-2")
    loop = json.loads(json.dumps(rules))
    loop["rules"]["EG-3"]["depends_on"] = ["ADA-3"]; loop["rules"]["ADA-3"]["depends_on"] = ["EG-3"]
    assert not rules_engine.rule_checked(loop, "EG-3")                 # a loop never counts as checked

    cafe = rules_engine.run_checks(load("flawed"), {"business_type": "cafe_restaurant", "cooking_on_site": True}, rules)
    sprinklers = next(f for f in cafe["findings"] if f["rule_id"] == "FS-2")
    assert sprinklers["status"] == "fail" and sprinklers["rule_verified"] is False
    assert cafe["occupant_load"]["rule_verified"] is False and cafe["occupant_load"]["rule_source"] == entries["OL-0"]["source"]


def test_verification_never_changes_a_finding(rules, load):
    """Fix stays Fix, Check with the city stays as it is, and nothing unknown becomes No issues found."""
    def strip(result):
        return [{k: v for k, v in f.items() if k not in ("rule_verified", "rule_source")} for f in result["findings"]]
    all_true = json.loads(json.dumps(rules))
    all_false = json.loads(json.dumps(rules))
    for k in _rule_entries(rules):
        all_true["rules"][k]["verified"] = True
        all_false["rules"][k]["verified"] = False
    no_section = {k: v for k, v in rules.items() if k != "rules"}
    for business, facts in _cases(load):
        intake = {"business_type": business, "cooking_on_site": True, "serves_alcohol": None}
        base = rules_engine.run_checks(facts, intake, rules)
        for other in (all_true, all_false, no_section):
            r = rules_engine.run_checks(facts, intake, other)
            assert strip(r) == strip(base) and r["summary"] == base["summary"]
    # With no rules section at all, every finding counts as unverified.
    r = rules_engine.run_checks(load("flawed"), {"business_type": "cafe_restaurant"}, no_section)
    assert all(f["rule_verified"] is False and f["rule_source"] == "" for f in r["findings"])


def test_report_markdown_marks_unverified_rules(rules, load):
    result = rules_engine.run_checks(load("flawed"), {"business_type": "cafe_restaurant", "cooking_on_site": True}, rules)
    md = rules_engine.to_markdown(result)
    assert rules_engine.SOME_UNVERIFIED in md and rules_engine.UNVERIFIED_FACTORS in md
    unverified_open = [f for f in result["findings"] if f["status"] != "pass" and not f["rule_verified"]]
    assert unverified_open and md.count(rules_engine.UNVERIFIED_NOTE) == len(unverified_open)


# ---------------------------------------------------------------- message numbers come from the rulebook
import ast  # noqa: E402

MESSAGE_MODULES = [ROOT / "checker" / "rules_engine.py", ROOT / "checker" / "zoning.py"]
_KEY = re.compile(r"^([A-Z]+-\d+|[a-z0-9_]+|utf-8)$")      # rule ids, dict keys and field names, not words a person reads


def _written_numbers(path):
    """Every string a person could read, written in the source, that contains a digit. Docstrings, format specs
    (':.1f'), rule ids and dict keys are left out: the guard is about message, title and fix text."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    skip = set()
    for n in ast.walk(tree):
        body = getattr(n, "body", None)
        if isinstance(body, list) and body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
            skip.add(id(body[0].value))
        if isinstance(n, ast.FormattedValue) and n.format_spec:
            skip.update(id(m) for m in ast.walk(n.format_spec))
    return [(n.lineno, n.value) for n in ast.walk(tree)
            if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in skip
            and re.search(r"\d", n.value) and not _KEY.match(n.value)]


@pytest.mark.parametrize("path", MESSAGE_MODULES, ids=lambda p: p.name)
def test_no_rule_message_or_fix_writes_a_number_itself(path):
    """A finding's title, message and fix get every number from seattle.json or from the plan, never from the source."""
    assert _written_numbers(path) == []


def test_the_guard_catches_a_written_number(tmp_path):
    bad = tmp_path / "bad.py"
    bad.write_text('def f(eg):\n    """SBC 1010.1.1 in a docstring is fine."""\n'
                   '    return Finding("ADA-3", "Widen", "fail", "high", f"{eg[\'w\']:.1f} in.", "c", "Install a 36 in. door.")\n')
    assert _written_numbers(bad) == [(3, "Install a 36 in. door.")]


def test_the_door_size_in_fix_text_comes_from_the_rulebook(rules, load):
    plan = load("flawed")
    plan["restrooms"][0]["door_clear_width_in"] = 28
    plan["doors"] = [d for d in plan["doors"] if plan["restrooms"][0]["label"] not in d["label"]]
    bigger = json.loads(json.dumps(rules))
    bigger["egress"]["door_nominal_width_in"] = 40
    fixes = [f["fix"] for f in rules_engine.run_checks(plan, {"business_type": "cafe_restaurant"}, bigger)["findings"]
             if f["rule_id"] == "ADA-3"]
    assert fixes == ["Install a 40 in. door."]


def test_every_no_issues_found_row_says_what_the_plan_shows_and_what_is_needed(rules, load):
    """Two sentences each: the observation, then the requirement it meets (CONTENT.md rule 2)."""
    seen = set()
    for business, facts in _cases(load):
        result = rules_engine.run_checks(facts, {"business_type": business, "cooking_on_site": True}, rules)
        for f in result["findings"]:
            if f["status"] != "pass" or f["rule_id"] == "ZN-1":
                continue
            seen.add(f["rule_id"])
            sentences = [x for x in re.split(r"(?<=\.)\s+(?=[A-Z])", f["detail"]) if x]
            assert len(sentences) >= 2, f"{f['rule_id']}: {f['detail']}"
            assert re.search(r"\b(need|needs|puts)\b", sentences[-1]), f"{f['rule_id']}: {f['detail']}"
    assert {"EG-1", "EG-3", "FS-1", "PL-1", "PL-2", "OCC-1"} <= seen
