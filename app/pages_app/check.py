"""Check a floor plan: pick or upload a plan, confirm what was read, see the fix list and the
permits, then ask questions by typing or by voice. Runs through app/streamlit_app.py.

Five steps on one page, each in its own box:
  1 floor plan -> 2 business and location -> 3 what was read (editable) -> 4 results -> 5 ask
Steps 1 and 2 sit side by side; step 3 shows the drawing beside the reading. The boxes and columns are
layout only: every widget is drawn on every run under the same conditions as before, because Streamlit
drops the state of a widget that is not drawn.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import pandas as pd
import streamlit as st

from app import app_common as ac
from checker import agent, rules_engine, voice
from checker.extract import SPACE_USES

cases = ac.cases()
labels = ac.business_labels()
types = ac.rules()["business_types"]


# ----------------------------------------------------------------------------------
# State
# ----------------------------------------------------------------------------------
def _reset_results() -> None:
    """A different plan (source, demo plan or uploaded file): the reading and everything built on it go."""
    for key in (ac.KEY_EXTRACTION, ac.KEY_EXTRACTION_SOURCE, ac.KEY_PLAN_ID, ac.KEY_RESULT, ac.KEY_CHAT, ac.KEY_SPEAK):
        st.session_state.pop(key, None)


def _reset_check() -> None:
    """A step 2 answer changed (business, location): the old result no longer applies, but the reading of the plan does.

    Keeping the reading matters: typing in the zone box and then clicking "Run the check" reaches the app as one
    step, with this callback first. If it deleted the reading, step 3 and its button would vanish before the click counted.
    """
    for key in (ac.KEY_RESULT, ac.KEY_CHAT, ac.KEY_SPEAK):
        st.session_state.pop(key, None)


def _load_case() -> None:
    """Fill the business and zone fields from the chosen demo plan. (Called when the demo plan changes.)"""
    _reset_results()
    case = cases[st.session_state.get(ac.KEY_CASE) or next(iter(cases))]
    st.session_state[ac.KEY_BUSINESS] = case["intake"]["business_type"]
    st.session_state[ac.KEY_COOKING] = bool(case["intake"].get("cooking_on_site"))
    st.session_state[ac.KEY_ZONE_MODE] = ac.ZONE_BY_HAND
    st.session_state[ac.KEY_ZONE] = case.get("zoning", "")


def _source_changed() -> None:
    """Switching back to the demo plans fills step 2 from the demo plan again. The reading is handled by the fingerprint below."""
    if st.session_state.get(ac.KEY_SOURCE) == ac.SOURCE_DEMO:
        st.session_state[ac.KEY_CASE] = st.session_state.get(ac.KEY_CASE) or next(iter(cases))
        _load_case()


def _plan_id(case: dict | None, uploaded) -> str | None:
    """A fingerprint of the plan on the page now: the demo case, or the bytes of the uploaded file. None = no plan."""
    if case is not None:
        return f"demo:{case['id']}"
    return f"upload:{hashlib.sha1(uploaded.getvalue()).hexdigest()}" if uploaded is not None else None


# Fill in the first demo plan's answers once per session. Not "whenever KEY_CASE is missing": Streamlit drops a
# widget's key on any run where the widget is not drawn, and the demo-plan selectbox is never drawn in upload mode.
# Testing for KEY_CASE here re-ran _load_case() on every other rerun there, wiping an uploaded plan's reading and
# results (and the owner's business type and zone) whenever the page reran, for example after a voice recording.
if ac.KEY_READY not in st.session_state:
    st.session_state[ac.KEY_READY] = True
    st.session_state[ac.KEY_CASE] = next(iter(cases))
    _load_case()


# ----------------------------------------------------------------------------------
# 1. Floor plan
# ----------------------------------------------------------------------------------
_left, _right = st.columns(2)
step1 = _left.container(border=True)       # the two boxes are made first, so "Read the plan" can be drawn in
step2 = _right.container(border=True)      # step 1's box even though it runs after step 2's widgets
with step1:
    st.subheader("1. Your floor plan")
    source = st.radio("Plan", [ac.SOURCE_DEMO, ac.SOURCE_UPLOAD], key=ac.KEY_SOURCE, horizontal=True,
                      label_visibility="collapsed", on_change=_source_changed)
    uploaded = None
    if source == ac.SOURCE_DEMO:
        st.selectbox("Demo plan", list(cases), format_func=lambda cid: cases[cid]["title"],
                     key=ac.KEY_CASE, on_change=_load_case,
                     help="Fictional drawings with printed dimensions. We know the right answer for each one.")
        case = cases[st.session_state[ac.KEY_CASE]]
        with st.expander("Show the drawing"):
            st.image(str(ac.DEMO_DIR / case["plan"]))
        if ac.has_api_key():
            st.toggle("Read it with the vision model (off = use the saved reading)", key=ac.KEY_USE_VISION)
    else:
        case = None
        uploaded = st.file_uploader("Floor plan (PNG, JPG or PDF) with dimensions printed on it",
                                    type=["png", "jpg", "jpeg", "pdf"])
        if uploaded and uploaded.type != "application/pdf":
            with st.expander("Show the drawing"):
                st.image(uploaded)
        if not ac.has_api_key():
            st.info("Reading your own plan needs a Claude API key (ANTHROPIC_API_KEY in a .env file). "
                    "The demo plans work without one.", icon="🔑")


# ----------------------------------------------------------------------------------
# 2. Business and location
# ----------------------------------------------------------------------------------
with step2:
    st.subheader("2. Your business")
    st.selectbox("Kind of business", list(labels), format_func=labels.get, key=ac.KEY_BUSINESS, on_change=_reset_check)
    bt = types[st.session_state[ac.KEY_BUSINESS]]
    c1, c2 = st.columns(2)
    with c1:
        if bt.get("food"):
            st.checkbox("Cooking with a range, fryer or grill", key=ac.KEY_COOKING, on_change=_reset_check)
        if bt.get("alcohol"):
            st.checkbox("Serves alcohol", value=True, disabled=True, key="alcohol_fixed")
        else:
            st.checkbox("Serves alcohol", key=ac.KEY_ALCOHOL, on_change=_reset_check)
        st.checkbox("Outdoor seating on the sidewalk", key=ac.KEY_OUTDOOR, on_change=_reset_check)
    with c2:
        st.checkbox("Not on the ground floor", key=ac.KEY_UPPER, on_change=_reset_check)
        st.checkbox("Landmark building or historic district", key=ac.KEY_HISTORIC, on_change=_reset_check)

    zone_mode = st.radio("Location", [ac.ZONE_BY_HAND, ac.ZONE_BY_ADDRESS], key=ac.KEY_ZONE_MODE, horizontal=True,
                         on_change=_reset_check)
    if zone_mode == ac.ZONE_BY_HAND:
        st.text_input("Zone, as printed on the Seattle zoning map", key=ac.KEY_ZONE, placeholder='for example "NC2-55 (M)" or NR3',
                      on_change=_reset_check)
    else:
        st.text_input("Street address in Seattle", key=ac.KEY_ADDRESS, placeholder="123 Example St, Seattle, WA",
                      help="Looked up with the US Census geocoder and Seattle's zoning map. Needs internet.",
                      on_change=_reset_check)


def _intake() -> dict:
    cooking = bool(st.session_state.get(ac.KEY_COOKING)) and bool(bt.get("food"))
    return {"business_type": st.session_state[ac.KEY_BUSINESS], "cooking_on_site": cooking, "food_prep": cooking,
            "serves_alcohol": bool(st.session_state.get(ac.KEY_ALCOHOL)),
            "outdoor_seating": bool(st.session_state.get(ac.KEY_OUTDOOR)),
            "upper_floor": bool(st.session_state.get(ac.KEY_UPPER)),
            "historic_district": bool(st.session_state.get(ac.KEY_HISTORIC))}


def _read_with_model(path: Path) -> dict:
    from checker.extract import extract_floor_plan

    with st.spinner("Reading the drawing..."):
        return extract_floor_plan(path, f"business type: {bt['label']}")


# The reading and the results belong to one plan. They are cleared when the plan on the page is a different one
# (another demo plan, another file, no file, the other source), and never just because the page ran again.
plan_id = _plan_id(case, uploaded)
if ac.KEY_EXTRACTION in st.session_state and st.session_state.get(ac.KEY_PLAN_ID) != plan_id:
    _reset_results()

with step1:
    if st.button("Read the plan", type="primary", key="btn_read"):
        _reset_results()
        try:
            if case is not None:
                if st.session_state.get(ac.KEY_USE_VISION) and ac.has_api_key():
                    st.session_state[ac.KEY_EXTRACTION] = _read_with_model(ac.DEMO_DIR / case["plan"])
                    st.session_state[ac.KEY_EXTRACTION_SOURCE] = "the vision model"
                    st.session_state[ac.KEY_PLAN_ID] = plan_id
                else:
                    st.session_state[ac.KEY_EXTRACTION] = ac.truth_extraction(case["id"])
                    st.session_state[ac.KEY_EXTRACTION_SOURCE] = "the saved reading for this demo plan (no model call)"
                    st.session_state[ac.KEY_PLAN_ID] = plan_id
            elif uploaded is None:
                st.error("Upload a floor plan first.")
            elif not ac.has_api_key():
                st.error("No Claude API key is set, so an uploaded plan cannot be read. Use a demo plan, or add the key.")
            else:
                # written to a temporary file for the reader and deleted straight after (see app_common)
                st.session_state[ac.KEY_EXTRACTION] = ac.read_uploaded_plan(uploaded.getvalue(), uploaded.name, _read_with_model)
                st.session_state[ac.KEY_EXTRACTION_SOURCE] = "the vision model"
                st.session_state[ac.KEY_PLAN_ID] = plan_id
        except Exception as e:  # a failed model call should explain itself, not crash the page
            st.error(f"The plan could not be read: {e}")


# ----------------------------------------------------------------------------------
# 3. What was read from the plan (the owner can correct it)
# ----------------------------------------------------------------------------------
def _frame(items: list[dict], columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame([{c: i.get(c) for c in columns} for i in items or []], columns=columns)


def _records(df: pd.DataFrame, required: str) -> list[dict]:
    """Rows of an edited table as plain dicts: empty cells become None, rows without a name are dropped."""
    out = []
    for row in df.to_dict("records"):
        clean = {k: (None if pd.isna(v) else v.item() if hasattr(v, "item") else v) for k, v in row.items()}
        if clean.get(required):
            out.append(clean)
    return out


extraction = st.session_state.get(ac.KEY_EXTRACTION)
if extraction:
    with st.container(border=True):
        st.subheader("3. What was read from the plan")
        st.caption(f"Source: {st.session_state.get(ac.KEY_EXTRACTION_SOURCE)}. Correct anything that is wrong before "
                   "running the check; the check uses these numbers, not the drawing.")
        plan_col, facts_col = st.columns([7, 5])    # the drawing stays in view while the reading is corrected
        with plan_col:
            if case is not None:
                st.image(str(ac.DEMO_DIR / case["plan"]), width="stretch")
            elif uploaded is not None and uploaded.type != "application/pdf":
                st.image(uploaded, width="stretch")
            else:
                st.caption("No preview here for a PDF plan. Keep the file open beside this page while you check the reading.")
        with facts_col:
            n1, n2, n3 = st.columns(3)
            gross = n1.number_input("Total area (sq ft)", min_value=0.0, value=float(extraction.get("gross_area_sqft") or 0), step=10.0)
            seats = n2.number_input("Seats", min_value=0, value=int(extraction.get("seat_count") or 0), step=1)
            acc_known = extraction.get("accessible_seat_count") is not None
            acc_seats = n3.number_input("Accessible seats marked", min_value=0, value=int(extraction.get("accessible_seat_count") or 0),
                                        step=1, help="Leave at 0 if the plan does not mark any.")

            st.markdown("**Rooms**")
            spaces_df = st.data_editor(
                _frame(extraction.get("spaces"), ["name", "use", "area_sqft"]), key="ed_spaces", num_rows="dynamic", hide_index=True,
                column_config={"name": "Room", "use": st.column_config.SelectboxColumn("Use", options=SPACE_USES, required=True),
                               "area_sqft": st.column_config.NumberColumn("Area (sq ft)", min_value=0)})
            st.markdown("**Doors**")
            doors_df = st.data_editor(
                _frame(extraction.get("doors"), ["label", "clear_width_in", "is_exit", "swing", "serves"]), key="ed_doors",
                num_rows="dynamic", hide_index=True,
                column_config={"label": "Door", "clear_width_in": st.column_config.NumberColumn("Clear width (in.)", min_value=0),
                               "is_exit": st.column_config.CheckboxColumn("Exit?", default=False),
                               "swing": st.column_config.SelectboxColumn("Swing", options=["outward", "inward", "sliding", "unknown"]),
                               "serves": "Serves"})
            a1, a2 = st.container(), st.container()     # stacked: side by side is too narrow in this column
            with a1:
                st.markdown("**Aisles and routes**")
                aisles_df = st.data_editor(
                    _frame(extraction.get("aisles"), ["label", "min_width_in"]), key="ed_aisles", num_rows="dynamic", hide_index=True,
                    column_config={"label": "Aisle", "min_width_in": st.column_config.NumberColumn("Narrowest width (in.)", min_value=0)})
            with a2:
                st.markdown("**Restrooms**")
                rest_df = st.data_editor(
                    _frame(extraction.get("restrooms"), ["label", "designation", "water_closets", "lavatories",
                                                          "turning_circle_diameter_in", "door_clear_width_in"]),
                    key="ed_rest", num_rows="dynamic", hide_index=True,
                    column_config={"label": "Restroom",
                                   "designation": st.column_config.SelectboxColumn("For", options=["men", "women", "all_gender", "unknown"]),
                                   "water_closets": st.column_config.NumberColumn("Toilets", min_value=0, step=1),
                                   "lavatories": st.column_config.NumberColumn("Sinks", min_value=0, step=1),
                                   "turning_circle_diameter_in": st.column_config.NumberColumn("Turning circle (in.)", min_value=0),
                                   "door_clear_width_in": st.column_config.NumberColumn("Door (in.)", min_value=0)})
            if extraction.get("uncertainties"):
                st.warning("The reader was unsure about: " + "; ".join(extraction["uncertainties"]), icon="⚠️")
            with st.expander("Everything that was read (kitchen, fire safety and the rest)"):
                st.json({k: extraction.get(k) for k in ("kitchen", "fire_safety", "outdoor_seating_shown", "plan_title", "scale_note")})

        if st.button("Run the check", type="primary", key="btn_check"):
            edited = dict(extraction) | {
                "gross_area_sqft": gross or None, "seat_count": seats or None,
                "accessible_seat_count": acc_seats if (acc_seats or acc_known) else None,
                "spaces": _records(spaces_df, "name"), "doors": _records(doors_df, "label"),
                "aisles": _records(aisles_df, "label"), "restrooms": _records(rest_df, "label")}
            for key in (ac.KEY_CHAT, ac.KEY_SPEAK):
                st.session_state.pop(key, None)
            with st.spinner("Checking..."):
                st.session_state[ac.KEY_RESULT] = ac.run_audit(
                    edited, _intake(),
                    zone=st.session_state.get(ac.KEY_ZONE) if zone_mode == ac.ZONE_BY_HAND else None,
                    address=st.session_state.get(ac.KEY_ADDRESS) if zone_mode == ac.ZONE_BY_ADDRESS else None)


# ----------------------------------------------------------------------------------
# 4. Results
# ----------------------------------------------------------------------------------
ICON = {"fail": "❌", "review": "❓", "pass": "✅"}
# One colour per status, used the same way everywhere on this page, and never as the only signal: each status
# also has its icon and its words. The colours themselves are set in .streamlit/config.toml (red, orange, green).
# These are fixed strings; nothing read from a plan or typed by the owner is ever placed inside a colour.
STATUS_WORDS = {"fail": "Fix", "review": "Check with the city", "pass": "OK"}
STATUS_LABEL = {"fail": ":red[**Fix**]", "review": ":orange[**Check with the city**]", "pass": ":green[**OK**]"}

result = st.session_state.get(ac.KEY_RESULT)
if result:
    s = result["summary"]
    with st.container(border=True):
        st.subheader("4. Results")
        m1, m2, m3 = st.columns(3)
        m1.metric(f"{ICON['fail']} {STATUS_LABEL['fail']}", s["fails"], border=True,
                  help="Problems the rules found. Fix these before you submit.")
        m2.metric(f"{ICON['review']} {STATUS_LABEL['review']}", s["reviews"], border=True,
                  help="The plan does not show enough to decide. Confirm these.")
        m3.metric(f"{ICON['pass']} {STATUS_LABEL['pass']}", s["passes"], border=True, help="Checks the plan passed.")
        st.caption(f"Occupant load {s['occupant_load']} · Group {s['occupancy_group']} · "
                   f"Exits: {s['exits_shown']} shown, {s['exits_required']} required")

        open_items = [f for f in result["findings"] if f["status"] != "pass"]
        fix_col, side_col = st.columns([7, 5])
        with fix_col:
            st.markdown("**Fix list** (most serious first)")
            if not open_items:
                st.success("Nothing to fix on the items this tool checks.", icon="✅")
            for f in open_items:
                with st.container(border=True):
                    st.markdown(f"{ICON[f['status']]} {STATUS_LABEL[f['status']]} &nbsp; **{f['title']}** &nbsp; "
                                f"`{f['rule_id']}` · {f['severity']}")
                    st.write(f["detail"])
                    if f["fix"]:
                        st.markdown(f"**Fix:** {f['fix']}")
                    st.caption(f"Checked by: {f['reviewed_by'] or 'not routed'} · Code: {f['citation']}")

            with st.expander(f"Checks passed ({s['passes']})"):
                for f in result["findings"]:
                    if f["status"] == "pass":
                        st.markdown(f"{ICON['pass']} {STATUS_LABEL['pass']} &nbsp; **{f['title']}**: {f['detail']}  \n"
                                    f":gray[{f['citation']}]")

        with side_col:
            st.markdown("**Permits and approvals you will likely need**")
            st.table(pd.DataFrame(result["permits_likely_required"])[["name", "agency"]]
                     .rename(columns={"name": "Permit or approval", "agency": "Who issues it"}).set_index("Permit or approval"))

            review = result.get("local_review_data")
            if review:
                sm = review["summary"]
                st.markdown(f"**What Seattle's records show for {review['category_label']} build-outs**")
                d1, d2, d3 = st.columns(3)
                d1.metric("Needed 2+ review rounds", f"{sm['share_two_or_more_rounds']:.0%}", help=f"Of {sm['permits']} permits")
                d2.metric("Median days in plan review", f"{sm['median_days_in_review']:g}" if sm["median_days_in_review"] is not None else "n/a")
                d3.metric("Median days out for corrections", f"{sm['median_days_with_applicant']:g}" if sm["median_days_with_applicant"] is not None else "n/a")
                st.caption(f"Source: {review['source']}. See the Seattle's review records page for the breakdown.")
            elif ac.database_problem():
                st.error(ac.database_problem())      # an old database: the check above still ran, without the city's records
            elif not ac.has_database():
                st.caption("Seattle's review records are not downloaded yet. Run `python -m pipeline.run_pipeline --seattle` to add them here.")

            with st.expander("How the occupant load was calculated"):
                st.metric("Occupant load", s["occupant_load"], help=f"Classified Group {s['occupancy_group']}")
                st.dataframe(pd.DataFrame(result["occupant_load"]["by_space"])[["space", "use", "area_sqft", "factor", "load"]]
                             .rename(columns={"space": "Room", "use": "Use", "area_sqft": "Area (sq ft)",
                                              "factor": "Sq ft per person", "load": "People"}), hide_index=True, width="stretch")
                st.caption(result["code_basis"])

            try:
                report_file, sheet_file = ac.report_pdf(result), ac.permit_sheet_pdf(result)
            except Exception as e:  # a PDF that cannot be built should explain itself, not take the results off the page
                st.error(f"The PDF downloads could not be built: {e}")
            else:
                st.download_button("Download the report (PDF)", report_file, file_name="permit_precheck.pdf", type="primary",
                                   mime="application/pdf", key="dl_report_pdf",
                                   help="The results above, laid out to print: the fix list, the permits and how the occupant "
                                        "load was calculated.")
                st.download_button("Download the permit preparation sheet (PDF)", sheet_file, file_name="permit_preparation_sheet.pdf",
                                   mime="application/pdf", key="dl_sheet_pdf",
                                   help="What the city's application asks for, filled in from this result where it can be. "
                                        "It is a preparation aid, not the city's form.")
        st.caption(result["disclaimer"])

    # ------------------------------------------------------------------------------
    # 5. Ask about your results (typed or spoken)
    # ------------------------------------------------------------------------------
    with st.container(border=True):
        st.subheader("5. Ask about your results")
        ask_col, _spare = st.columns([7, 5])       # keeps the question box and the answers to a readable width
        with ask_col:
            v = voice.status()
            st.caption(f"Answers come only from the result above. Speech to text: {v['speech_to_text']}. "
                       f"Spoken answers: {v['text_to_speech']}.")

            def _ask(question: str) -> None:
                chat = st.session_state.setdefault(ac.KEY_CHAT, [])
                history = [{"role": m["role"], "content": m["content"]} for m in chat]
                reply = agent.answer(question, result, history=history, examples=ac.reviewer_examples(result))
                chat.append({"role": "user", "content": question, "by": ""})
                chat.append({"role": "assistant", "content": reply["text"], "by": reply["generated_by"]})
                st.session_state[ac.KEY_SPEAK] = agent.for_speech(reply["text"])

            with st.form("ask_form", clear_on_submit=True):
                question = st.text_input("Your question", key=ac.KEY_QUESTION,
                                         placeholder="Why do I need a second exit? What permits do I need?")
                asked = st.form_submit_button("Ask", type="primary")
            if asked and question.strip():
                _ask(question.strip())

            if voice.stt_available():
                recording = st.audio_input("Or ask by voice", key="mic")
                st.caption("Use Chrome for spoken questions. Recording does not work in Safari yet; there you can type the "
                           "question and the answer is still read aloud.")
                if recording is not None:
                    audio = recording.getvalue()
                    digest = hashlib.sha1(audio).hexdigest()
                    if digest != st.session_state.get("mic_done"):     # each recording is answered once
                        st.session_state["mic_done"] = digest
                        heard = voice.transcribe(audio)
                        if heard:
                            _ask(heard)
                        else:
                            st.warning("I could not make out that recording. Try again, or type the question.")

            if st.button("Read my results aloud", key="btn_summary"):
                summary = agent.spoken_summary(result)
                st.session_state.setdefault(ac.KEY_CHAT, []).append({"role": "assistant", "content": summary, "by": "template"})
                st.session_state[ac.KEY_SPEAK] = agent.for_speech(summary)

            for m in st.session_state.get(ac.KEY_CHAT, []):
                with st.chat_message(m["role"]):
                    st.write(m["content"])
                    if m["role"] == "assistant":
                        st.caption("Answered from your result by " + ("a fixed template (no model)" if m["by"] == "template" else m["by"]))

            to_speak = st.session_state.pop(ac.KEY_SPEAK, None)
            if to_speak:
                spoken = voice.synthesize(to_speak)
                if spoken:
                    st.audio(spoken[0], format=spoken[1], autoplay=True)
                else:
                    # Fixed markup from voice.py; the answer is embedded as an escaped string, never as HTML.
                    st.iframe(voice.browser_speech_html(to_speak), height=46)
