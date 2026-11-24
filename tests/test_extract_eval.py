"""The vision request (API mocked), the end-to-end audit, and the plan-reading evaluation."""
import copy

from checker import audit as audit_mod
from checker import extract, rules_engine
from evaluation import evaluate_extraction as ev
from tests.conftest import ROOT, FakeClient


def test_extract_builds_a_valid_request(load):
    fake = FakeClient(tool_input=load("flawed"))
    out = extract.extract_floor_plan(ROOT / "demo/flawed_plan.png", "business type: Café or restaurant", client=fake)
    kw = fake.kwargs
    assert out["seat_count"] == 56
    assert kw["tool_choice"] == {"type": "auto"}        # a forced tool is rejected by current models (400)
    assert kw["tools"][0]["name"] == "record_floor_plan" and len(kw["tools"]) == 1
    assert "Call record_floor_plan exactly once with what you read, and write nothing else." in kw["messages"][0]["content"][1]["text"]
    img = kw["messages"][0]["content"][0]["source"]
    assert img["media_type"] == "image/png" and len(img["data"]) > 10_000
    assert "Café or restaurant" in kw["messages"][0]["content"][1]["text"]
    uses = kw["tools"][0]["input_schema"]["properties"]["spaces"]["items"]["properties"]["use"]["enum"]
    factors = rules_engine.load_rules()["occupant_load_factors_sqft_per_person"]
    assert set(factors) <= set(uses)                 # every use the rules can count is one the reader may report


def test_extract_retries_once_when_the_model_does_not_call_the_tool(load):
    """With tool_choice "auto" the model may answer in words. Ask once more; if it still does not call the tool, say so."""
    from types import SimpleNamespace

    import pytest

    class Replies:
        def __init__(self, *replies):
            self.replies, self.calls = list(replies), []
            self.messages = SimpleNamespace(create=self._create)

        def _create(self, **kw):
            self.calls.append(kw)
            return SimpleNamespace(content=self.replies[len(self.calls) - 1])

    words = [SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text="This plan shows a café.")]
    reading = [SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="tool_use", name="record_floor_plan", input=load("flawed"))]
    plan = ROOT / "demo/flawed_plan.png"

    first_try = Replies(reading)
    assert extract.extract_floor_plan(plan, client=first_try)["seat_count"] == 56 and len(first_try.calls) == 1    # no needless second call

    second_try = Replies(words, reading)
    assert extract.extract_floor_plan(plan, client=second_try)["seat_count"] == 56
    assert len(second_try.calls) == 2 and second_try.calls[0] == second_try.calls[1]       # the same request, sent again

    never = Replies(words, words, reading)
    with pytest.raises(RuntimeError, match="did not call record_floor_plan in 2 attempts"):
        extract.extract_floor_plan(plan, client=never)
    assert len(never.calls) == 2                                                           # one retry, not more


def test_audit_end_to_end_with_mocked_vision(load):
    fake = FakeClient(tool_input=load("salon_flawed"))
    r = audit_mod.audit(str(ROOT / "demo/salon_flawed_plan.png"), {"business_type": "salon"},
                        zoning_override="NC2-55 (M)", client=fake)
    assert "Salon, barbershop or spa" in fake.kwargs["messages"][0]["content"][1]["text"]
    assert r["summary"]["fails"] == 3 and r["zoning"]["status"] == "likely_permitted"
    assert "800 sq ft, within the 25,000 sq ft limit" in r["zoning"]["detail"]
    assert r["intake"]["business_type"] == "salon"


def test_command_line_writes_both_reports(tmp_path, capsys):
    out = tmp_path / "report"
    code = audit_mod.main(["--extraction", str(ROOT / "demo/flawed_extraction.json"), "--business", "cafe_restaurant",
                           "--cooking", "--zoning", "NC2-55 (M)", "--db", str(tmp_path / "none.sqlite"), "--out", str(out)])
    assert code == 0 and "Fix before you apply: 11  |  Check with the city: 2  |  No issues found: 6" in capsys.readouterr().out
    assert out.with_suffix(".json").exists() and "Fix list" in out.with_suffix(".md").read_text(encoding="utf-8")


def test_demo_cases_flag_exactly_what_was_planted():
    for case in ev.load_cases():
        truth = ev.load_truth(case)
        r = audit_mod.audit(None, case["intake"], extraction=truth, zoning_override=case["zoning"])
        failed = {f["rule_id"] for f in r["findings"] if f["status"] == "fail"}
        assert failed == set(case["planted"]), case["id"]
        assert (ROOT / "demo" / case["plan"]).exists()


def test_a_perfect_reading_scores_100_percent():
    case = {c["id"]: c for c in ev.load_cases()}["cafe_flawed"]
    r = ev.evaluate_case(case, ev.load_truth(case))
    assert r["accuracy"] == 1.0 and r["facts"] == 38 and r["wrong"] == []
    assert r["problems"] == {"real_problems": 11, "caught": 11, "to_confirm": [], "missed": [], "false_alarms": []}
    assert r["matching"] == {"same label": 14}


def test_misreadings_are_counted_and_traced_to_problems():
    case = {c["id"]: c for c in ev.load_cases()}["cafe_flawed"]
    truth = ev.load_truth(case)
    pred = copy.deepcopy(truth)
    pred["doors"][1]["clear_width_in"] = 34          # misread a 30 in. door as 34: hides a real problem
    pred["doors"][1]["label"] = "restroom 1 DOOR"    # label differences alone must not count as an error
    pred["restrooms"][0]["door_clear_width_in"] = 34 # the same door, listed again under its restroom
    pred["aisles"][0]["min_width_in"] = None         # could not read the aisle
    pred["gross_area_sqft"] = 2430                   # 1.25% off: within tolerance
    pred["spaces"][0]["area_sqft"] = 1500            # 17% off: wrong
    pred["fire_safety"]["exit_signs_shown"] = 2      # invented exit signs
    r = ev.evaluate_case(case, pred)
    wrong = {w["field"] for w in r["wrong"]}
    assert wrong == {"Restroom 1 door: clear width (in.)", "Restroom 1: door width (in.)",
                     "Aisle A (between tables): width (in.)", "area of Dining Room", "fire_safety: exit_signs_shown"}
    assert r["correct"] == 33 and r["accuracy"] == round(33 / 38, 3)
    # the unread aisle is no longer missed: an unknown width is Check with the city, so the owner is pointed at it
    assert r["problems"]["caught"] == 8 and len(r["problems"]["missed"]) == 2
    assert r["problems"]["to_confirm"] == ["Widen the aisle: Aisle A (between tables)"]
    assert "Add an exit sign at each exit" in r["problems"]["missed"] and "Widen the door: Restroom 1 door (Restroom 1)" in r["problems"]["missed"]
    md = ev.to_markdown([r], "test")
    assert "| Café with planted problems | 38 | 33 | 87% | 11 | 8 | 1 | 2 | 0 |" in md and "Misread area of Dining Room: read 1500, should be 1280" in md


def test_an_invented_problem_is_a_false_alarm():
    case = {c["id"]: c for c in ev.load_cases()}["cafe_compliant"]
    pred = copy.deepcopy(ev.load_truth(case))
    pred["restrooms"][0]["turning_circle_diameter_in"] = 54
    p = ev.evaluate_case(case, pred)["problems"]
    assert p["real_problems"] == 0 and p["false_alarms"] == ["Widen the restroom so a wheelchair can turn: Restroom 1"]


def test_items_are_matched_by_number_then_words_then_order():
    m = ev.match_items
    doors = [{"label": "Door 1"}, {"label": "Restroom 1 door"}, {"label": "Restroom 2 door"}]
    read = [{"label": "Restroom 2 door", "w": 30}, {"label": "Door 1 - Main Entry / Exit", "w": 36}, {"label": "restroom 1 DOOR", "w": 31}]
    got = m(doors, read, "label")
    assert [(t["label"], p["label"], how) for t, p, how in got] == [
        ("Door 1", "Door 1 - Main Entry / Exit", "type and number"),          # the case from the first real run
        ("Restroom 1 door", "restroom 1 DOOR", "same label"),
        ("Restroom 2 door", "Restroom 2 door", "same label")]
    assert ev._type_and_number("Door 1 - Main Entry / Exit") == ev._type_and_number("Door 1") == "door 1"
    assert ev._type_and_number("Restroom 1 door") == "restroom 1" != ev._type_and_number("Door 1")       # not the same item
    assert ev._type_and_number("Aisle A (between tables, middle row)") == "aisle a" and ev._type_and_number("Corridor to restrooms") is None

    # no number: the most words in common, one to one
    got = m([{"label": "Corridor to restrooms"}, {"label": "Aisle A (between tables)"}],
            [{"label": "Aisle A (between ADA table and adjacent table, dining room row 2)"}, {"label": "Corridor (restroom corridor)"}], "label")
    assert [(p["label"][:8], how) for _t, p, how in got] == [("Corridor", "shared words"), ("Aisle A ", "type and number")]
    got = m([{"name": "Restroom"}, {"name": "Styling Floor"}],
            [{"name": "Styling Floor (6 styling stations, 2 shampoo bowls)"}, {"name": "All-Gender Restroom"}], "name")
    assert [(p["name"], how) for _t, p, how in got] == [("All-Gender Restroom", "shared words"),
                                                         ("Styling Floor (6 styling stations, 2 shampoo bowls)", "shared words")]

    # nothing in common: by order; and each of the model's items is used once
    got = m([{"label": "Front"}, {"label": "Back"}, {"label": "Side"}], [{"label": "Entrance"}, {"label": "Rear"}], "label")
    assert [(p and p["label"], how) for _t, p, how in got] == [("Entrance", "order"), ("Rear", "order"), (None, "not found")]
    two = m([{"label": "Door 1"}, {"label": "Door 1"}], [{"label": "Door 1 - Entry"}], "label")
    assert [how for _t, _p, how in two] == ["type and number", "not found"]
    assert m([{"label": "Door 1"}], [], "label") == [({"label": "Door 1"}, None, "not found")]


def test_a_fuller_label_is_not_a_misreading_but_a_wrong_value_still_is():
    case = {c["id"]: c for c in ev.load_cases()}["cafe_flawed"]
    truth = ev.load_truth(case)
    pred = copy.deepcopy(truth)
    pred["doors"][0]["label"] = "Door 1 - Main Entry / Exit"
    pred["aisles"][0]["label"] = "Aisle A (between tables, middle row)"
    pred["aisles"][1]["label"] = "Corridor (restroom corridor)"
    pred["spaces"][4]["name"] = "Restroom 1 (Women)"
    pred["restrooms"][0]["label"] = "Restroom 1 (Women)"
    pred["doors"][1]["serves"] = "Restroom 1 (Women)"
    before = copy.deepcopy(pred)
    r = ev.evaluate_case(case, pred)
    assert pred == before                                                   # scoring does not change the reading it is given
    assert r["accuracy"] == 1.0 and r["wrong"] == []
    assert r["problems"] == {"real_problems": 11, "caught": 11, "to_confirm": [], "missed": [], "false_alarms": []}
    assert r["matching"]["type and number"] >= 3 and r["matching"]["shared words"] == 1

    pred["doors"][0]["swing"] = "outward"                                   # same fuller label, now with a wrong value
    r = ev.evaluate_case(case, pred)
    assert [w["field"] for w in r["wrong"]] == ["Door 1: swing"] and r["problems"]["missed"] == ["Turn the exit door to swing outward: Door 1"]


def test_outcomes_are_counted_four_ways():
    """Caught as a problem, flagged to confirm, missed, and false alarms are reported separately."""
    case = {c["id"]: c for c in ev.load_cases()}["cafe_flawed"]
    truth = ev.load_truth(case)
    assert (truth["fire_safety"]["exit_signs_shown"], truth["kitchen"]["hand_sinks"]) == (0, 0)
    pred = copy.deepcopy(truth)
    pred["fire_safety"]["exit_signs_shown"] = None        # "not stated" where the truth is 0: the rule can only ask to confirm
    pred["kitchen"]["hand_sinks"] = None
    pred["doors"][1]["clear_width_in"] = 34               # a 30 in. door read as 34: the problem disappears
    pred["restrooms"][0]["door_clear_width_in"] = 34
    pred["doors"][2]["clear_width_in"] = None             # could not read the other door: asked to confirm instead
    pred["restrooms"][1]["door_clear_width_in"] = None
    pred["aisles"][1]["min_width_in"] = 30                # a 36 in. corridor read as 30: a problem that is not there
    r = ev.evaluate_case(case, pred)
    p = r["problems"]
    assert p["real_problems"] == 11 and p["caught"] == 7
    assert p["to_confirm"] == ["Add a handwashing sink in the food prep area", "Add an exit sign at each exit",
                               "Widen the door: Restroom 2 door (Restroom 2)"]
    assert p["missed"] == ["Widen the door: Restroom 1 door (Restroom 1)"]
    assert p["false_alarms"] == ["Widen the aisle: Corridor to restrooms"]
    assert p["caught"] + len(p["to_confirm"]) + len(p["missed"]) == p["real_problems"]
    # at the fact level, 0 read as "not stated" is a misread, like any other wrong value
    wrong = {w["field"]: (w["pred"], w["truth"]) for w in r["wrong"]}
    assert wrong["fire_safety: exit_signs_shown"] == (None, 0) and wrong["kitchen: hand_sinks"] == (None, 0)
    assert len(wrong) == 7 and r["correct"] == 31
    md = ev.to_markdown([r], "test")
    assert "| Real problems | Caught as a problem | Flagged to confirm | Missed | False alarms |" in md
    assert "| Café with planted problems | 38 | 31 | 82% | 11 | 7 | 3 | 1 | 1 |" in md
    assert "- Flagged to confirm, not as a problem: Add an exit sign at each exit" in md and "- False alarm: Widen the aisle: Corridor to restrooms" in md
    assert "Misread fire_safety: exit_signs_shown: read None, should be 0" in md


def test_saved_readings_can_be_rescored_without_a_model_call(tmp_path, monkeypatch, capsys):
    import json

    (tmp_path / "reports").mkdir()
    for case in ev.load_cases():
        reading = ev.load_truth(case)
        reading["doors"][0]["label"] = "Door 1 - Main Entry / Exit"
        (tmp_path / "reports" / f"{case['id']}_vision_extraction.json").write_text(json.dumps(reading), encoding="utf-8")
    monkeypatch.setattr(ev, "ROOT", tmp_path)
    monkeypatch.setattr(extract, "extract_floor_plan", lambda *a, **k: (_ for _ in ()).throw(AssertionError("no model call")))
    out = tmp_path / "eval.md"
    assert ev.main(["--saved", "--label", "a saved run", "--out", str(out)]) == 0
    report = out.read_text(encoding="utf-8")
    assert capsys.readouterr().out.strip() == report.strip() and "Extractions scored: a saved run." in report
    assert "| Café with planted problems | 38 | 38 | 100% | 11 | 11 | 0 | 0 | 0 |" in report
    assert "| Hair salon with planted problems | 25 | 25 | 100% | 3 | 3 | 0 | 0 | 0 |" in report
    assert "by type and number" in report and "Misread" not in report
