"""The rules engine: occupant load, exits, accessibility, plumbing, fire, permits, for each business type."""
from checker import rules_engine, zoning
from tests.conftest import ids

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
