"""The Streamlit app, run headlessly: every page loads and the main flow works for two business types."""
import pytest
from streamlit.testing.v1 import AppTest

from pipeline import db, seattle
from tests.conftest import FIXTURES, ROOT

APP = str(ROOT / "app" / "streamlit_app.py")


@pytest.fixture
def app(monkeypatch, tmp_path):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)      # no model calls from tests
    monkeypatch.setenv("PERMIT_STT", "off")
    from app import app_common

    monkeypatch.setattr(app_common, "DB_PATH", ROOT / "data" / "does_not_exist.sqlite")
    monkeypatch.setattr(app_common, "REPORTS_DIR", tmp_path / "reports")      # empty: tests never read the real reports/ folder
    return AppTest.from_file(APP, default_timeout=30).run()


def _plain(label: str) -> str:
    """A count's label without its icon and colour: '❌ :red[**Fix**]' -> 'Fix'."""
    import re

    return re.sub(r":\w+\[\*\*(.*?)\*\*\]", r"\1", label).lstrip("❌❓✅ ").strip()


def _metrics(at):
    return {_plain(m.label): m.value for m in at.metric}


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
    assert (m["Fix"], m["Check with the city"], m["OK"], m["Occupant load"]) == ("11", "2", "6", "106")
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
    assert (m["Fix"], m["Check with the city"], m["Occupant load"]) == ("3", "2", "15")
    permits = _permits(at)
    assert any("Salon or shop licence" in p for p in permits) and not any("Food service" in p for p in permits)

    at.text_input(key="question").set_value("What permits do I need?")
    _click(at, "Ask")
    assert not at.exception and [c.name for c in at.chat_message] == ["user", "assistant"]
    assert "You will likely need: Construction permit" in at.chat_message[1].markdown[0].value
    assert "fixed template" in at.chat_message[1].caption[0].value
    _click(at, "Read my results aloud")
    assert "I found 3 problems and 2 items to confirm" in at.chat_message[2].markdown[0].value

    # changing the business clears the old result (and the chat) instead of showing it under the wrong heading,
    # and keeps the reading of the plan, so the check can be run again without reading the plan a second time
    at.selectbox(key="business_type").set_value("retail").run()
    assert not at.metric and not at.chat_message
    assert [b.label for b in at.button] == ["Read the plan", "Run the check"]


def test_pdf_downloads_are_offered_with_the_results(app):
    import pypdfium2 as pdfium

    at = app
    assert not at.get("download_button")                                   # nothing to download before a check
    at.button(key="btn_read").click().run()
    at.button(key="btn_check").click().run()
    assert not at.exception and not at.error
    buttons = at.get("download_button")
    assert [b.proto.label for b in buttons] == ["Download the report (PDF)", "Download the permit preparation sheet (PDF)"]
    assert not any("Markdown" in b.proto.label for b in buttons)           # the owner downloads are PDFs only

    # the page offers exactly what checker/pdf.py builds for this result, under the agreed file names
    from app import app_common
    from pathlib import Path

    result = at.session_state["result"]
    for build, first_words in ((app_common.report_pdf, "Permit pre-check: Café or restaurant"),
                               (app_common.permit_sheet_pdf, "Permit application preparation sheet: Café or restaurant")):
        data = build(result)
        assert data[:5] == b"%PDF-" and pdfium.PdfDocument(data)[0].get_textpage().get_text_range().startswith(first_words)
    page = (Path(app_common.ROOT) / "app" / "pages_app" / "check.py").read_text(encoding="utf-8")
    assert 'file_name="permit_precheck.pdf"' in page and 'file_name="permit_preparation_sheet.pdf"' in page
    assert page.count('mime="application/pdf"') == 2 and "text/markdown" not in page


def test_editing_step_2_and_clicking_run_the_check_in_one_go_still_runs_the_check(app):
    """In a browser, typing in the zone box and then clicking "Run the check" arrives as one step:
    the text is committed and the button is clicked together. The reading must survive that."""
    at = app
    at.selectbox(key="demo_case").set_value("salon_flawed").run()
    at.button(key="btn_read").click().run()
    assert any(h.value == "3. What was read from the plan" for h in at.subheader)
    at.text_input(key="zone_text").set_value("NC2-55 (M)")       # typed, not yet committed...
    at.button(key="btn_check").click()                           # ...then the button, in the same step
    at.run()
    assert not at.exception
    assert any(h.value == "3. What was read from the plan" for h in at.subheader)      # step 3 is still there
    assert _metrics(at)["Occupant load"] == "15"                                        # and the check ran
    assert any("Zoning: NC2-55 (M)" in m.value for m in at.markdown)                    # with the zone just typed


def test_step_2_changes_keep_the_reading_and_drop_the_old_result(app):
    at = app
    at.selectbox(key="demo_case").set_value("salon_flawed").run()
    at.button(key="btn_read").click().run()
    reading = at.session_state["extraction"]

    def step_3_shown():
        return any(h.value == "3. What was read from the plan" for h in at.subheader)

    changes = (lambda: at.text_input(key="zone_text").set_value("NC2-55 (M)"),
               lambda: at.checkbox(key="outdoor").set_value(True),
               lambda: at.checkbox(key="upper_floor").set_value(True),
               lambda: at.checkbox(key="historic").set_value(True),
               lambda: at.selectbox(key="business_type").set_value("cafe_restaurant"),
               lambda: at.checkbox(key="cooking").set_value(True),
               lambda: at.checkbox(key="alcohol").set_value(True),
               lambda: at.radio(key="zone_mode").set_value("Look up an address"),
               lambda: at.text_input(key="address_text").set_value("123 Example St, Seattle, WA"),
               lambda: at.radio(key="zone_mode").set_value("Enter the zone"))
    for change in changes:                                   # every step 2 widget, one after another
        at.button(key="btn_check").click().run()
        at.text_input(key="question").set_value("What permits do I need?")
        _click(at, "Ask")
        assert at.metric and at.chat_message and "result" in at.session_state
        change()
        at.run()
        assert not at.exception
        assert step_3_shown() and at.session_state["extraction"] == reading          # the reading survives
        assert not at.metric and not at.chat_message                                  # the old result and its chat do not
        assert "result" not in at.session_state and "chat" not in at.session_state and "speak_text" not in at.session_state
        assert "Run the check" in [b.label for b in at.button]


def test_a_different_plan_still_clears_everything(app):
    at = app
    at.button(key="btn_read").click().run()
    at.button(key="btn_check").click().run()
    assert at.metric and "extraction" in at.session_state
    at.selectbox(key="demo_case").set_value("salon_flawed").run()            # another demo plan
    assert not at.metric and "extraction" not in at.session_state and "result" not in at.session_state
    assert [b.label for b in at.button] == ["Read the plan"]

    at.button(key="btn_read").click().run()
    at.button(key="btn_check").click().run()
    assert at.metric and "extraction" in at.session_state
    at.radio(key="plan_source").set_value("Upload my own plan").run()        # another plan source
    assert not at.metric and "extraction" not in at.session_state and "result" not in at.session_state
    assert [b.label for b in at.button] == ["Read the plan"]


def _seed_an_uploaded_plan_check(at):
    """Upload mode with a reading and a result in place, as after reading and checking an uploaded plan.
    (The test tool cannot drive the file uploader or the microphone, so the state is put there directly.)"""
    import json

    from checker import audit

    at.radio(key="plan_source").set_value("Upload my own plan").run()
    at.selectbox(key="business_type").set_value("salon").run()
    at.text_input(key="zone_text").set_value("NR3").run()
    facts = json.loads((ROOT / "demo" / "salon_flawed_extraction.json").read_text(encoding="utf-8"))
    at.session_state["extraction"] = facts
    at.session_state["extraction_source"] = "the vision model"
    at.session_state["result"] = audit.audit(None, {"business_type": "salon"}, extraction=facts, zoning_override="NR3")
    at.run()
    return facts


def test_an_uploaded_plans_reading_and_results_survive_page_reruns(app):
    """Stopping a voice recording reruns the page. In upload mode that used to wipe the reading, the results and
    the owner's business type and zone: Streamlit drops the demo-plan selectbox's key there, and the page took a
    missing key to mean "first visit" and loaded the first demo plan again."""
    at = app
    facts = _seed_an_uploaded_plan_check(at)
    for _ in range(6):                                           # any rerun at all, several times over
        at.run()
        assert not at.exception
        assert at.session_state["extraction"] == facts and "result" in at.session_state
        assert _metrics(at)["Occupant load"] == "15"
        assert any(h.value == "3. What was read from the plan" for h in at.subheader)
        assert at.selectbox(key="business_type").value == "salon" and at.text_input(key="zone_text").value == "NR3"
    assert "demo_case" not in at.session_state                   # Streamlit did drop the key; it no longer matters

    at.text_input(key="question").set_value("What permits do I need?")       # asking a question is a rerun too
    _click(at, "Ask")
    assert _metrics(at)["Occupant load"] == "15" and [c.name for c in at.chat_message] == ["user", "assistant"]
    assert at.selectbox(key="business_type").value == "salon"


def test_the_reading_is_cleared_only_when_the_plan_is_a_different_one(app):
    at = app
    facts = _seed_an_uploaded_plan_check(at)
    at.session_state["plan_id"] = "upload:0123abcd"              # the reading belongs to a file that is no longer on the page
    at.run()
    assert "extraction" not in at.session_state and "result" not in at.session_state and not at.metric
    assert at.selectbox(key="business_type").value == "salon"    # the owner's answers are not touched

    # a demo plan: the reading remembers which plan it came from, survives reruns, and goes when the plan changes
    at.radio(key="plan_source").set_value("Use a demo plan").run()
    assert at.selectbox(key="demo_case").value == "cafe_flawed" and at.selectbox(key="business_type").value == "cafe_restaurant"
    at.button(key="btn_read").click().run()
    at.button(key="btn_check").click().run()
    assert at.session_state["plan_id"] == "demo:cafe_flawed"
    for _ in range(3):
        at.run()
        assert at.session_state["plan_id"] == "demo:cafe_flawed" and _metrics(at)["Occupant load"] == "106"
    at.selectbox(key="demo_case").set_value("salon_flawed").run()
    assert "extraction" not in at.session_state and "plan_id" not in at.session_state and not at.metric
    assert facts["gross_area_sqft"] == 800


def test_layout_of_the_check_page(app):
    """Presentation only: five numbered steps, three result counts in order, one primary button per step,
    and the same widgets as before under the same keys."""
    at = app
    assert [h.value for h in at.subheader] == ["1. Your floor plan", "2. Your business"]
    at.button(key="btn_read").click().run()
    at.button(key="btn_check").click().run()
    assert not at.exception
    assert [h.value for h in at.subheader] == ["1. Your floor plan", "2. Your business", "3. What was read from the plan",
                                               "4. Results", "5. Ask about your results"]
    assert [_plain(m.label) for m in at.metric][:3] == ["Fix", "Check with the city", "OK"]  # the top row, in this order
    # colour is never the only signal: each count carries its icon, its words and its colour
    assert [m.label for m in at.metric][:3] == ["❌ :red[**Fix**]", "❓ :orange[**Check with the city**]", "✅ :green[**OK**]"]
    assert [m.value for m in at.metric][:3] == ["11", "2", "6"]
    assert any(c.value.startswith("Occupant load 106 · Group A-2 · Exits: 1 shown, 2 required") for c in at.caption)

    # the fix list: problems first, then items to confirm; passed checks are not in it
    titles = [m.value for m in at.markdown if m.value.startswith(("❌", "❓"))]
    assert len(titles) == 13 and [t[0] for t in titles] == ["❌"] * 11 + ["❓"] * 2
    assert all(t.startswith("❌ :red[**Fix**] ") for t in titles[:11])                         # icon, colour and words on each finding
    assert all(t.startswith("❓ :orange[**Check with the city**] ") for t in titles[11:])
    # red and amber are used for nothing else on the page, and no finding's own text sits inside a colour
    page_text = " ".join(m.value for m in at.markdown) + " ".join(c.value for c in at.caption)
    import re
    assert set(re.findall(r":(red|orange|green)\[(.*?)\]", page_text)) == {("red", "**Fix**"), ("orange", "**Check with the city**"), ("green", "**OK**")}
    assert any(e.label == "Checks passed (6)" for e in at.expander)

    # one primary button per step: read (1), run (3), download the report (4), ask (5); everything else is secondary
    kinds = {b.label: b.proto.type for b in at.button}
    assert kinds == {"Read the plan": "primary", "Run the check": "primary", "Ask": "primary", "Read my results aloud": "secondary"}
    downloads = {b.proto.label: b.proto.type for b in at.get("download_button")}
    assert downloads == {"Download the report (PDF)": "primary", "Download the permit preparation sheet (PDF)": "secondary"}

    # the stateful widgets are all still there, under the same keys
    keys = {w.key for kind in ("radio", "selectbox", "checkbox", "text_input", "button", "toggle") for w in at.get(kind) if w.key}
    assert {"plan_source", "demo_case", "business_type", "cooking", "alcohol", "outdoor", "upper_floor", "historic",
            "zone_mode", "zone_text", "question", "btn_read", "btn_check", "btn_summary"} <= keys
    assert len(at.number_input) == 3


def test_business_type_changes_the_answer(app):
    at = app
    at.selectbox(key="demo_case").set_value("salon_flawed").run()
    at.selectbox(key="business_type").set_value("bar_taproom").run()        # a bar is not allowed in NR3
    at.button(key="btn_read").click().run()
    at.button(key="btn_check").click().run()
    assert not at.exception and "is not one of the uses allowed here" in " ".join(x.value for x in at.markdown)
    assert any("Liquor license" in p for p in _permits(at))


def test_microphone_box_says_which_browser_to_use(app, monkeypatch):
    from checker import voice

    at = app
    at.button(key="btn_read").click().run()
    at.button(key="btn_check").click().run()
    assert not any("Use Chrome for spoken questions" in c.value for c in at.caption)      # no microphone box, no note
    monkeypatch.setattr(voice, "stt_available", lambda: True)                            # as if faster-whisper were installed
    at.run()
    assert not at.exception and any("Use Chrome for spoken questions" in c.value and "Safari" in c.value for c in at.caption)


def test_upload_without_a_key_explains_itself(app):
    at = app
    at.radio(key="plan_source").set_value("Upload my own plan").run()
    assert not at.exception and any("needs a Claude API key" in i.value for i in at.info)
    at.button(key="btn_read").click().run()
    assert any("Upload a floor plan first" in e.value for e in at.error)


def test_uploaded_plan_file_is_deleted_after_it_is_read():
    """An uploaded floor plan is written to a temporary file for the reader; no copy may be left behind."""
    from pathlib import Path

    from app import app_common

    seen = []

    def reader(path: Path) -> dict:
        seen.append(path)
        assert path.exists() and path.suffix == ".pdf" and path.read_bytes() == b"%PDF-plan"   # the reader gets the upload
        return {"spaces": []}

    assert app_common.read_uploaded_plan(b"%PDF-plan", "My Plan.pdf", reader) == {"spaces": []}
    assert len(seen) == 1 and not seen[0].exists()

    def failing_reader(path: Path) -> dict:
        seen.append(path)
        raise RuntimeError("the model call failed")

    with pytest.raises(RuntimeError, match="the model call failed"):       # the error still reaches the page...
        app_common.read_uploaded_plan(b"png-bytes", "plan.png", failing_reader)
    assert len(seen) == 2 and seen[1].suffix == ".png" and not seen[1].exists()   # ...and the file is gone anyway


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


def test_an_old_seattle_database_is_explained_on_the_page(monkeypatch, tmp_path):
    """A database built before the columns were renamed: the pages say how to rebuild it and keep working without it."""
    import sqlite3

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("PERMIT_STT", "off")
    old = sqlite3.connect(tmp_path / "permits.sqlite")
    old.executescript((FIXTURES / "old_database_schema.sql").read_text(encoding="utf-8"))
    old.commit(); old.close()
    from app import app_common

    monkeypatch.setattr(app_common, "DB_PATH", tmp_path / "permits.sqlite")
    assert not app_common.has_database() and "python -m pipeline.run_pipeline --seattle" in app_common.database_problem()

    at = AppTest.from_file(APP, default_timeout=30).run()
    at.button(key="btn_read").click().run()
    at.button(key="btn_check").click().run()
    assert not at.exception and _metrics(at)["Fix"] == "11"                    # the check itself is unaffected
    assert any("different column names" in e.value and "python -m pipeline.run_pipeline --seattle" in e.value for e in at.error)
    at.switch_page("pages_app/seattle_data.py").run()
    assert not at.exception and any("different column names" in e.value for e in at.error)
    assert at.dataframe[0].value["Number"].tolist()[2] == "462 (87%)"                 # the preview is shown meanwhile


def test_evidence_page_shows_a_report_when_there_is_one(app, tmp_path):
    """With no report the page says so (checked above); with one, it shows that report. Neither depends on the real reports/ folder."""
    at = app
    at.switch_page("pages_app/evidence.py").run()
    assert any("No results yet" in w.value for w in at.warning)
    (tmp_path / "reports").mkdir()
    (tmp_path / "reports" / "extraction_eval.md").write_text("# Plan-reading evaluation\n\nA test report: 38 of 38.\n", encoding="utf-8")
    at.run()
    assert not at.exception and not any("No results yet" in w.value for w in at.warning)
    assert any("A test report: 38 of 38." in m.value for m in at.markdown)


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
