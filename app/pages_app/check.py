"""Check a floor plan: pick or upload a plan, confirm what was read, see the fix list and the
permits, then ask questions by typing or by voice. Runs through app/streamlit_app.py.

Five steps on one page:
  1 floor plan -> 2 business and location -> 3 what was read (editable) -> 4 results -> 5 ask
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
    for key in (ac.KEY_EXTRACTION, ac.KEY_EXTRACTION_SOURCE, ac.KEY_RESULT, ac.KEY_CHAT, ac.KEY_SPEAK):
        st.session_state.pop(key, None)


def _load_case() -> None:
    """Fill the business and zone fields from the chosen demo plan."""
    _reset_results()
    case = cases[st.session_state[ac.KEY_CASE]]
    st.session_state[ac.KEY_BUSINESS] = case["intake"]["business_type"]
    st.session_state[ac.KEY_COOKING] = bool(case["intake"].get("cooking_on_site"))
    st.session_state[ac.KEY_ZONE_MODE] = ac.ZONE_BY_HAND
    st.session_state[ac.KEY_ZONE] = case.get("zoning", "")


if ac.KEY_CASE not in st.session_state:
    st.session_state[ac.KEY_CASE] = next(iter(cases))
    _load_case()


# ----------------------------------------------------------------------------------
# 1. Floor plan
# ----------------------------------------------------------------------------------
st.subheader("1. Your floor plan")
source = st.radio("Plan", [ac.SOURCE_DEMO, ac.SOURCE_UPLOAD], key=ac.KEY_SOURCE, horizontal=True,
                  label_visibility="collapsed", on_change=_reset_results)
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
                                type=["png", "jpg", "jpeg", "pdf"], on_change=_reset_results)
    if uploaded and uploaded.type != "application/pdf":
        with st.expander("Show the drawing"):
            st.image(uploaded)
    if not ac.has_api_key():
        st.info("Reading your own plan needs a Claude API key (ANTHROPIC_API_KEY in a .env file). "
                "The demo plans work without one.", icon="🔑")


# ----------------------------------------------------------------------------------
# 2. Business and location
# ----------------------------------------------------------------------------------
st.subheader("2. Your business")
st.selectbox("Kind of business", list(labels), format_func=labels.get, key=ac.KEY_BUSINESS, on_change=_reset_results)
bt = types[st.session_state[ac.KEY_BUSINESS]]
c1, c2 = st.columns(2)
with c1:
    if bt.get("food"):
        st.checkbox("Cooking with a range, fryer or grill", key=ac.KEY_COOKING, on_change=_reset_results)
    if bt.get("alcohol"):
        st.checkbox("Serves alcohol", value=True, disabled=True, key="alcohol_fixed")
    else:
        st.checkbox("Serves alcohol", key=ac.KEY_ALCOHOL, on_change=_reset_results)
    st.checkbox("Outdoor seating on the sidewalk", key=ac.KEY_OUTDOOR, on_change=_reset_results)
with c2:
    st.checkbox("Not on the ground floor", key=ac.KEY_UPPER, on_change=_reset_results)
    st.checkbox("Landmark building or historic district", key=ac.KEY_HISTORIC, on_change=_reset_results)

zone_mode = st.radio("Location", [ac.ZONE_BY_HAND, ac.ZONE_BY_ADDRESS], key=ac.KEY_ZONE_MODE, horizontal=True,
                     on_change=_reset_results)
if zone_mode == ac.ZONE_BY_HAND:
    st.text_input("Zone, as printed on the Seattle zoning map", key=ac.KEY_ZONE, placeholder='for example "NC2-55 (M)" or NR3',
                  on_change=_reset_results)
else:
    st.text_input("Street address in Seattle", key=ac.KEY_ADDRESS, placeholder="123 Example St, Seattle, WA",
                  help="Looked up with the US Census geocoder and Seattle's zoning map. Needs internet.",
                  on_change=_reset_results)


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


if st.button("Read the plan", type="primary", key="btn_read"):
    _reset_results()
    try:
        if case is not None:
            if st.session_state.get(ac.KEY_USE_VISION) and ac.has_api_key():
                st.session_state[ac.KEY_EXTRACTION] = _read_with_model(ac.DEMO_DIR / case["plan"])
                st.session_state[ac.KEY_EXTRACTION_SOURCE] = "the vision model"
            else:
                st.session_state[ac.KEY_EXTRACTION] = ac.truth_extraction(case["id"])
                st.session_state[ac.KEY_EXTRACTION_SOURCE] = "the saved reading for this demo plan (no model call)"
        elif uploaded is None:
            st.error("Upload a floor plan first.")
        elif not ac.has_api_key():
            st.error("No Claude API key is set, so an uploaded plan cannot be read. Use a demo plan, or add the key.")
        else:
            # written to a temporary file for the reader and deleted straight after (see app_common)
            st.session_state[ac.KEY_EXTRACTION] = ac.read_uploaded_plan(uploaded.getvalue(), uploaded.name, _read_with_model)
            st.session_state[ac.KEY_EXTRACTION_SOURCE] = "the vision model"
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
    st.subheader("3. What was read from the plan")
    st.caption(f"Source: {st.session_state.get(ac.KEY_EXTRACTION_SOURCE)}. Correct anything that is wrong before "
               "running the check; the check uses these numbers, not the drawing.")
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
    a1, a2 = st.columns(2)
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

result = st.session_state.get(ac.KEY_RESULT)
if result:
    s = result["summary"]
    st.divider()
    st.subheader("4. Results")
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Problems", s["fails"])
    m2.metric("To confirm", s["reviews"])
    m3.metric("Checks passed", s["passes"])
    m4.metric("Occupant load", s["occupant_load"], help=f"Classified Group {s['occupancy_group']}")

    open_items = [f for f in result["findings"] if f["status"] != "pass"]
    st.markdown("**Fix list** (most serious first)")
    if not open_items:
        st.success("Nothing to fix on the items this tool checks.", icon="✅")
    for f in open_items:
        with st.container(border=True):
            st.markdown(f"{ICON[f['status']]} **{f['title']}** &nbsp; `{f['rule_id']}` · {f['severity']}")
            st.write(f["detail"])
            if f["fix"]:
                st.markdown(f"**Fix:** {f['fix']}")
            st.caption(f"Checked by: {f['reviewed_by'] or 'not routed'} · Code: {f['citation']}")

    with st.expander(f"Checks passed ({s['passes']})"):
        for f in result["findings"]:
            if f["status"] == "pass":
                st.markdown(f"{ICON['pass']} **{f['title']}**: {f['detail']}  \n:gray[{f['citation']}]")

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
        st.dataframe(pd.DataFrame(result["occupant_load"]["by_space"])[["space", "use", "area_sqft", "factor", "load"]]
                     .rename(columns={"space": "Room", "use": "Use", "area_sqft": "Area (sq ft)",
                                      "factor": "Sq ft per person", "load": "People"}), hide_index=True, width="stretch")
        st.caption(result["code_basis"])

    try:
        report_file, sheet_file = ac.report_pdf(result), ac.permit_sheet_pdf(result)
    except Exception as e:  # a PDF that cannot be built should explain itself, not take the results off the page
        st.error(f"The PDF downloads could not be built: {e}")
    else:
        st.download_button("Download the report (PDF)", report_file, file_name="permit_precheck.pdf",
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
    st.divider()
    st.subheader("5. Ask about your results")
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
        asked = st.form_submit_button("Ask")
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
