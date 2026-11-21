"""Site photo notes, with the model mocked. The photos are made in memory; none are stored in the repository."""
import base64
import copy
import io
import json

import pytest

from checker import photos, rules_engine, zoning
from tests.conftest import FakeClient

V, N, U = photos.VISIBLE, photos.NOT_VISIBLE, photos.UNCLEAR


def _photo(size=(64, 48), color=(120, 90, 60), fmt="PNG") -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format=fmt)
    return buf.getvalue()


def _reply(**status_and_photos) -> dict:
    """_reply(exit_sign=(V, [1])) -> the tool input a model would send; items not named are 'not visible'."""
    return {"items": [{"item": key, "status": status_and_photos.get(key, (N, []))[0],
                       "seen_in": status_and_photos.get(key, (N, []))[1]} for key in photos.PHOTO_ITEMS]}


def _by_item(notes) -> dict:
    return {n["item"]: n for n in notes}


def test_request_sends_the_photos_and_forbids_dimensions_and_compliance():
    fake = FakeClient(tool_input=_reply(exit_sign=(V, [2]), fire_extinguisher=(U, [])))
    notes = photos.read_photos([_photo(), _photo(fmt="JPEG"), _photo(size=(4000, 3000))], client=fake, model="test-model")
    kw = fake.kwargs
    assert kw["model"] == "test-model" and kw["tool_choice"] == {"type": "tool", "name": "record_photo_notes"}
    assert kw["tools"][0]["input_schema"] is photos.PHOTO_NOTES_SCHEMA

    system = kw["system"].lower()
    assert "do not estimate any dimension" in system and "do not judge compliance" in system
    assert "do not identify or describe people" in system

    content = kw["messages"][0]["content"]
    images = [b for b in content if b["type"] == "image"]
    texts = [b["text"] for b in content if b["type"] == "text"]
    assert len(images) == 3 and texts[:3] == ["Photo 1:", "Photo 2:", "Photo 3:"]
    assert all(key in texts[-1] for key in photos.PHOTO_ITEMS) and "3 photo(s)" in texts[-1]

    from PIL import Image
    sizes = [Image.open(io.BytesIO(base64.b64decode(b["source"]["data"]))).size for b in images]
    assert sizes[0] == (64, 48) and max(sizes[2]) == photos.MAX_SIDE_PX       # the large photo is shrunk, in memory
    assert all(b["source"]["media_type"] == "image/jpeg" for b in images)

    got = _by_item(notes)
    assert list(got) == list(photos.PHOTO_ITEMS)                               # always all six, in a fixed order
    assert (got["exit_sign"]["status"], got["exit_sign"]["seen_in"]) == (V, [2])
    assert got["exit_sign"]["label"] == "Illuminated exit sign"
    assert got["fire_extinguisher"]["status"] == U and got["grab_bars"]["status"] == N


def test_the_schema_has_no_room_for_text_or_numbers():
    """The model can only pick an item, one of three statuses and photo numbers: no notes, sizes or verdicts."""
    entry = photos.PHOTO_NOTES_SCHEMA["properties"]["items"]["items"]["properties"]
    assert set(entry) == {"item", "status", "seen_in"}
    assert entry["status"]["enum"] == ["visible", "not visible in these photos", "unclear"]
    assert entry["item"]["enum"] == ["exit_sign", "fire_extinguisher", "entrance_step", "sprinkler_heads",
                                     "kitchen_hood", "grab_bars"]
    assert entry["seen_in"]["items"] == {"type": "integer"}


def test_unexpected_replies_become_unclear():
    raw = {"items": [
        {"item": "exit_sign", "status": "compliant", "seen_in": [1]},            # not one of the three statuses
        {"item": "fire_extinguisher", "status": V, "seen_in": [7, 0, True]},     # visible, but in no real photo
        {"item": "sprinkler_heads", "status": V, "seen_in": [2, 2, 9, 1]},       # duplicates and a photo that does not exist
        {"item": "kitchen_hood", "status": N, "seen_in": [1]},                   # not visible keeps no photo number
        {"item": "door_width", "status": V, "seen_in": [1], "width_in": 30},     # an item nobody asked for
        "nonsense",
    ]}                                                                           # grab_bars and entrance_step are missing
    got = _by_item(photos.clean_notes(raw, photo_count=2))
    assert set(got) == set(photos.PHOTO_ITEMS)
    assert got["exit_sign"]["status"] == U and got["fire_extinguisher"]["status"] == U
    assert (got["sprinkler_heads"]["status"], got["sprinkler_heads"]["seen_in"]) == (V, [1, 2])
    assert (got["kitchen_hood"]["status"], got["kitchen_hood"]["seen_in"]) == (N, [])
    assert got["grab_bars"]["status"] == U and got["entrance_step"]["status"] == U
    assert all(set(n) == {"item", "label", "status", "seen_in"} for n in got.values())
    assert [n["status"] for n in photos.clean_notes(None, 1)] == [U] * 6


def test_photo_limit_and_failures():
    with pytest.raises(ValueError, match="At most 4 photos"):
        photos.read_photos([_photo()] * 5, client=FakeClient(tool_input=_reply()))
    with pytest.raises(ValueError, match="at least one"):
        photos.read_photos([], client=FakeClient(tool_input=_reply()))
    with pytest.raises(RuntimeError):
        photos.read_photos([_photo()], client=FakeClient(text="I see a nice café."))      # no structured reply
    with pytest.raises(Exception):
        photos.read_photos([b"this is not an image"], client=FakeClient(tool_input=_reply()))
    assert len(photos.read_photos([_photo()] * 4, client=FakeClient(tool_input=_reply()))) == 6


def test_differences_from_the_plan_reading_ask_the_owner_to_confirm(load):
    plan = load("salon_flawed")                      # reads: 0 exit signs, 0 extinguishers, no sprinklers, no hood
    assert plan["fire_safety"]["exit_signs_shown"] == 0
    notes = photos.clean_notes(_reply(exit_sign=(V, [1, 3]), sprinkler_heads=(V, [2]), kitchen_hood=(U, []),
                                      entrance_step=(V, [1]), grab_bars=(V, [4])), photo_count=4)
    diffs = {d["item"]: d["text"] for d in photos.compare_with_plan(notes, plan)}
    assert set(diffs) == {"exit_sign", "sprinkler_heads"}       # unclear is not a difference; step and grab bars are not on the plan
    assert diffs["exit_sign"].startswith("Photos 1 and 3 show an exit sign, but the plan reading shows none.")
    assert diffs["sprinkler_heads"].startswith("Photo 2 shows sprinkler heads, but")
    assert "Please confirm" in diffs["exit_sign"] and "as it is today" in diffs["exit_sign"]

    plan = load("flawed") | {"fire_safety": {"exit_signs_shown": 2, "fire_extinguishers_shown": 1, "sprinklers_noted": True},
                             "kitchen": {"type1_hood_shown": True}}
    nothing_seen = photos.clean_notes(_reply(), photo_count=1)
    texts = {d["item"]: d["text"] for d in photos.compare_with_plan(nothing_seen, plan)}
    assert set(texts) == {"exit_sign", "fire_extinguisher", "sprinkler_heads", "kitchen_hood"}
    assert texts["exit_sign"].startswith("The plan reading shows 2 exit signs, but none appears in these photos.")
    assert texts["fire_extinguisher"].startswith("The plan reading shows 1 fire extinguisher,")
    assert "may simply not cover it" in texts["kitchen_hood"]

    agree = photos.clean_notes(_reply(exit_sign=(V, [1]), fire_extinguisher=(V, [1]), sprinkler_heads=(V, [1]),
                                      kitchen_hood=(V, [1])), photo_count=1)
    assert photos.compare_with_plan(agree, plan) == []
    assert photos.compare_with_plan(nothing_seen, {}) == []      # an empty plan reading and nothing seen: nothing to say


def test_photo_notes_never_change_a_finding_or_produce_a_pass_or_fail(rules, load):
    """Run a check, then read photos that contradict the plan on every item: the audit result must not move."""
    plan = load("flawed")
    z = zoning.classify("NC2-55 (M)", rules, business_type="cafe_restaurant", area_sqft=plan.get("gross_area_sqft"))
    intake = {"business_type": "cafe_restaurant", "cooking_on_site": True}
    result = rules_engine.run_checks(plan, intake, rules, z)
    before_result, before_plan = copy.deepcopy(result), copy.deepcopy(plan)
    open_ids = [(f["rule_id"], f["status"]) for f in result["findings"]]
    assert ("FS-2", "fail") in open_ids and ("MECH-1", "fail") in open_ids        # the plan says no sprinklers, no hood

    everything_seen = _reply(**{key: (V, [1]) for key in photos.PHOTO_ITEMS})      # photos "show" sprinklers, a hood, signs...
    for reply in (everything_seen, _reply()):
        notes = photos.read_photos([_photo()], client=FakeClient(tool_input=reply))
        diffs = photos.compare_with_plan(notes, plan)

        assert result == before_result and plan == before_plan                    # nothing was written to the audit or the reading
        assert rules_engine.run_checks(plan, intake, rules, z) == before_result    # and a re-run gives the same findings
        assert {n["status"] for n in notes} <= set(photos.STATUSES)                # only the three note statuses exist
        shown = json.dumps([notes, diffs]).lower()
        assert not any(word in shown for word in ("pass", "fail", "complies", "compliant", "violat", "meets"))
        assert all(set(n) == {"item", "label", "status", "seen_in"} for n in notes)   # no rule id, severity or citation
        assert all(set(d) == {"item", "text"} for d in diffs)
    assert len(photos.compare_with_plan(photos.clean_notes(everything_seen, 1), plan)) >= 2   # the differences are reported...
    assert [(f["rule_id"], f["status"]) for f in result["findings"]] == open_ids              # ...and the fix list is as it was


def test_the_module_does_not_reach_the_rules_engine():
    import inspect

    source = inspect.getsource(photos)
    assert "rules_engine" not in source.split('"""', 2)[2] and "import audit" not in source
