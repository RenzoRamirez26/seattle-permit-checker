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
    assert code == 0 and "11 problems, 2 items to confirm, 6 checks passed" in capsys.readouterr().out
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
    assert r["problems"] == {"real_problems": 11, "caught": 11, "missed": [], "false_alarms": []}


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
    assert r["problems"]["caught"] == 8 and len(r["problems"]["missed"]) == 3
    assert "Missing exit signs" in r["problems"]["missed"] and "Door too narrow: Restroom 1 door (Restroom 1)" in r["problems"]["missed"]
    md = ev.to_markdown([r], "test")
    assert "| Café with planted problems | 38 | 33 | 87% | 11 | 8 | 0 |" in md and "Misread area of Dining Room: read 1500, should be 1280" in md


def test_an_invented_problem_is_a_false_alarm():
    case = {c["id"]: c for c in ev.load_cases()}["cafe_compliant"]
    pred = copy.deepcopy(ev.load_truth(case))
    pred["restrooms"][0]["turning_circle_diameter_in"] = 54
    p = ev.evaluate_case(case, pred)["problems"]
    assert p["real_problems"] == 0 and p["false_alarms"] == ["Restroom too tight to turn a wheelchair: Restroom 1"]
