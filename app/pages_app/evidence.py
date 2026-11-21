"""How we know it works: the plan-reading evaluation and a check of the rules on the demo plans.
Runs through app/streamlit_app.py."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from app import app_common as ac
from checker import rules_engine, zoning
from evaluation import evaluate_extraction as ev

st.subheader("How we know it works")
st.markdown(
    "The tool has two parts that can be wrong in different ways, so they are tested separately:\n\n"
    "1. **Reading the drawing** is done by a vision model and can misread a number.\n"
    "2. **Applying the rules** is plain code and gives the same answer every time.")

st.markdown("**1. Reading the drawing**")
report = ac.REPORTS_DIR / "extraction_eval.md"
if report.exists():
    st.markdown(report.read_text(encoding="utf-8"))
else:
    st.warning("No results yet. The vision model has not been run on the demo plans from this repository. "
               "With a Claude API key set, run `python -m evaluation.evaluate_extraction --vision` and this "
               "section will show how many facts it read correctly on each plan.", icon="🚧")

st.markdown("**2. Applying the rules**")
st.caption("Each demo plan has problems planted in it on purpose. This runs the rules on the hand-written "
           "correct reading of each plan and checks that every planted problem is flagged. It tests the "
           "rules, not the reading.")
rules = ac.rules()
rows = []
for case in ev.load_cases():
    truth = ev.load_truth(case)
    z = zoning.classify(case.get("zoning"), rules, business_type=case["intake"]["business_type"],
                        area_sqft=truth.get("gross_area_sqft"))
    result = rules_engine.run_checks(truth, case["intake"], rules, z)
    failed = {f["rule_id"] for f in result["findings"] if f["status"] == "fail"}
    planted = set(case["planted"])
    rows.append({"Plan": case["title"], "Planted problems": len(planted), "Flagged": len(planted & failed),
                 "Missed": ", ".join(sorted(planted - failed)) or "none",
                 "Other problems flagged": ", ".join(sorted(failed - planted)) or "none"})
st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
st.caption("A planted problem is counted by its rule family, so two narrow doors count once. "
           "\"Other problems flagged\" on a plan with nothing planted would be a false alarm.")
