"""The Streamlit app, run headlessly: every page loads and the main flow works for two business types."""
import pytest
from streamlit.testing.v1 import AppTest

from pipeline import db, seattle
from tests.conftest import FIXTURES, ROOT

APP = str(ROOT / "app" / "streamlit_app.py")


@pytest.fixture
def app(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)      # no model calls from tests
    monkeypatch.setenv("PERMIT_STT", "off")
    from app import app_common

    monkeypatch.setattr(app_common, "DB_PATH", ROOT / "data" / "does_not_exist.sqlite")
    return AppTest.from_file(APP, default_timeout=30).run()


def _metrics(at):
    return {m.label: m.value for m in at.metric}


def _permits(at):
    """Names in the permits table."""
    return next(t.value for t in at.table if t.value.index.name == "Permit or approval").index.tolist()


def _click(at, label):
    next(b for b in at.button if b.label == label).click().run()
    return at


def test_cafe_flow(app):
    at = app
    assert not at.exception and [b.label for b in at.button] == ["Read the plan"]
    at.button(key="btn_read").click().run()
    assert any("saved reading for this demo plan" in c.value for c in at.caption)
    at.button(key="btn_check").click().run()
    assert not at.exception
    m = _metrics(at)
    assert (m["Problems"], m["To confirm"], m["Checks passed"], m["Occupant load"]) == ("11", "2", "6", "106")
    text = " ".join(x.value for x in at.markdown)
    assert "Not enough exits" in text and "No Type I hood over cooking equipment" in text
    assert any("Checked by: SDCI Ordinance" in c.value for c in at.caption)
    assert any("review records are not downloaded yet" in c.value for c in at.caption)


def test_salon_flow_and_questions(app):
    at = app
    at.selectbox(key="demo_case").set_value("salon_flawed").run()
    assert at.selectbox(key="business_type").value == "salon" and at.text_input(key="zone_text").value == "NR3"
    assert "Cooking with a range, fryer or grill" not in [c.label for c in at.checkbox]     # not a food business
    at.button(key="btn_read").click().run()
    at.button(key="btn_check").click().run()
    m = _metrics(at)
    assert (m["Problems"], m["To confirm"], m["Occupant load"]) == ("3", "2", "15")
    permits = _permits(at)
    assert any("Salon or shop licence" in p for p in permits) and not any("Food service" in p for p in permits)

    at.text_input(key="question").set_value("What permits do I need?")
    _click(at, "Ask")
    assert not at.exception and [c.name for c in at.chat_message] == ["user", "assistant"]
    assert "You will likely need: Construction permit" in at.chat_message[1].markdown[0].value
    assert "fixed template" in at.chat_message[1].caption[0].value
    _click(at, "Read my results aloud")
    assert "I found 3 problems and 2 items to confirm" in at.chat_message[2].markdown[0].value

    # changing the business clears the old result instead of showing it under the wrong heading
    at.selectbox(key="business_type").set_value("retail").run()
    assert not at.metric and [b.label for b in at.button] == ["Read the plan"]


def test_business_type_changes_the_answer(app):
    at = app
    at.selectbox(key="demo_case").set_value("salon_flawed").run()
    at.selectbox(key="business_type").set_value("bar_taproom").run()        # a bar is not allowed in NR3
    at.button(key="btn_read").click().run()
    at.button(key="btn_check").click().run()
    assert not at.exception and "is not one of the uses allowed here" in " ".join(x.value for x in at.markdown)
    assert any("Liquor license" in p for p in _permits(at))


def test_upload_without_a_key_explains_itself(app):
    at = app
    at.radio(key="plan_source").set_value("Upload my own plan").run()
    assert not at.exception and any("needs a Claude API key" in i.value for i in at.info)
    at.button(key="btn_read").click().run()
    assert any("Upload a floor plan first" in e.value for e in at.error)


def test_other_pages_load_without_a_database(app):
    at = app
    at.switch_page("pages_app/seattle_data.py").run()
    assert not at.exception and any("python -m pipeline.run_pipeline --seattle" in i.value for i in at.info)
    assert at.dataframe[0].value["Number"].tolist()[2] == "462 (87%)"
    at.switch_page("pages_app/evidence.py").run()
    assert not at.exception and any("No results yet" in w.value for w in at.warning)
    rows = at.dataframe[0].value.to_dict("records")
    assert [(r["Planted problems"], r["Flagged"], r["Missed"], r["Other problems flagged"]) for r in rows] == \
        [(9, 9, "none", "none"), (0, 0, "none", "none"), (3, 3, "none", "none")]
    for page in ("pages_app/limits.py", "pages_app/about.py"):
        at.switch_page(page).run()
        assert not at.exception


def test_pages_with_the_seattle_database(monkeypatch, tmp_path):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("PERMIT_STT", "off")
    con = db.connect(tmp_path / "permits.sqlite")
    db.upsert(con, seattle.parse_permits(FIXTURES / "seattle_building_permits.json"))
    db.upsert_reviews(con, seattle.parse_reviews(FIXTURES / "seattle_plan_review.json"))
    db.replace_comments(con, seattle.parse_comments(FIXTURES / "seattle_plan_comments.json"))
    con.close()
    from app import app_common

    monkeypatch.setattr(app_common, "DB_PATH", tmp_path / "permits.sqlite")
    at = AppTest.from_file(APP, default_timeout=30).run()
    at.button(key="btn_read").click().run()
    at.button(key="btn_check").click().run()
    m = _metrics(at)
    assert m["Needed 2+ review rounds"] == "67%" and m["Median days in plan review"] == "120"
    at.text_input(key="question").set_value("How long does review take?")
    _click(at, "Ask")
    assert "67% of 3 food and drink build-outs needed two or more review rounds" in at.chat_message[1].markdown[0].value

    at.switch_page("pages_app/seattle_data.py").run()
    assert not at.exception
    m = _metrics(at)
    assert m["Permits with plan review"] == "3" and m["Passed in one round"] == "33%"
    assert any("Paraphrased for the test" in x.value for x in at.markdown)       # a reviewer comment is shown
    at.selectbox[0].set_value("salon").run()
    assert not at.exception and _metrics(at)["Permits with plan review"] == "1"
