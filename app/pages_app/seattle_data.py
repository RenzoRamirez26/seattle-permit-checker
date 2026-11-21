"""Seattle's review records: how often plans are sent back, how long review takes, and what the
reviewers' comments are about. Runs through app/streamlit_app.py.

Everything on this page is read from data/permits.sqlite, which pipeline/run_pipeline.py builds
from the city's open data. Nothing here is produced by a model.
"""
from __future__ import annotations

import pandas as pd
import streamlit as st

from app import app_common as ac
from pipeline import db, query
from pipeline.classify import CATEGORIES

st.subheader("Seattle's review records")
st.caption("Source: Seattle Department of Construction and Inspections open data (Building Permits, Plan Review, "
           "Plan Comments). Tenant build-outs only: additions and alterations, not new buildings.")

# Queried by hand on 20 November 2026 with the portal's text search for "restaurant".
PREVIEW = pd.DataFrame({
    "What": ["Restaurant-related alteration permits that went through plan review (applied since 2019)",
             "Passed in one round", "Needed two or more rounds",
             "Building-code (Ordinance) review, round 1: sent back / approved",
             "Zoning review, round 1: sent back / approved"],
    "Number": ["529", "67 (13%)", "462 (87%)", "153 / 24", "188 / 406"],
})

if not ac.has_database():
    if ac.database_problem():
        st.error(ac.database_problem())      # built with older column names: say how to rebuild it, show the preview meanwhile
    else:
        st.info("The database has not been built on this computer yet. From the repository root run:\n\n"
                "`python -m pipeline.run_pipeline --seattle`\n\n"
                "It needs internet, no key, and takes a few minutes.", icon="⬇️")
    st.markdown("**Preview: numbers queried directly from the city's portal on 20 November 2026**")
    st.dataframe(PREVIEW, hide_index=True, width="stretch")
    st.caption("These used the portal's text search for the word \"restaurant\", so the pipeline's own numbers "
               "will differ a little. Use the pipeline's numbers once it has run.")
    st.stop()

con = db.connect(ac.DB_PATH)
counts = query.category_counts(con)
options = [c for c in CATEGORIES if counts.get(c)] or CATEGORIES
category = st.selectbox("Kind of business", options, format_func=lambda c: query.CATEGORY_LABELS[c].capitalize())
data = query.review_data(con, category)
if not data:
    st.warning("No permits in this category have plan-review data yet.")
    st.stop()

sm = data["summary"]
c1, c2, c3, c4 = st.columns(4)
c1.metric("Permits with plan review", sm["permits"])
c2.metric("Passed in one round", f"{sm['share_one_round']:.0%}")
c3.metric("Median days in review", f"{sm['median_days_in_review']:g}" if sm["median_days_in_review"] is not None else "n/a")
c4.metric("Median days out for corrections",
          f"{sm['median_days_with_applicant']:g}" if sm["median_days_with_applicant"] is not None else "n/a",
          help="Days the applicant held the plans making corrections. This is the part a pre-check can shorten.")

st.markdown("**Who sends plans back in round 1**")
by_type = pd.DataFrame(data["corrections_by_review_type"])
if len(by_type):
    by_type["Sent back"] = (by_type["share_corrections"] * 100).round().astype(int).astype(str) + "%"
    st.dataframe(by_type.rename(columns={"review_type": "Review", "permits": "Projects reviewed", "sent_back": "Sent back (count)"})
                 [["Review", "Projects reviewed", "Sent back (count)", "Sent back"]], hide_index=True, width="stretch")
else:
    st.caption("Not enough reviews in this category.")

st.markdown("**What the reviewers' comments are about**")
subjects = pd.DataFrame(data["top_comment_subjects"])
if len(subjects):
    st.bar_chart(subjects.set_index("subject")["permits"], horizontal=True, x_label="Projects with at least one comment on the subject")
    st.caption("The comments dataset is a sample: about 26,000 comments on about 700 permits (2022 to 2025).")
    chapter = st.selectbox("Read real comments on", [int(c) for c in subjects["chapter"].dropna().unique()],
                           format_func=lambda ch: subjects.loc[subjects["chapter"] == ch, "subject"].iloc[0])
    for c in query.example_comments(con, int(chapter), category, limit=5):
        with st.container(border=True):
            st.write(c["comment"])
            st.caption(f"{c['review_type']} review, round {c['review_round']}, {c['letter_date']} · permit {c['permit_number']}")
else:
    st.caption("No reviewer comments are published for permits in this category.")

st.markdown("**Projects with the most review rounds**")
slow = pd.DataFrame(query.slowest_examples(con, category, limit=8))
if len(slow):
    st.dataframe(slow.rename(columns={"permit_number": "Permit", "estimated_cost": "Cost ($)", "applied_date": "Applied",
                                      "issued_date": "Issued", "review_rounds": "Rounds", "days_in_review": "Days in review",
                                      "days_with_applicant": "Days out for corrections",
                                      "description": "Description"})
                 [["Permit", "Description", "Cost ($)", "Applied", "Issued", "Rounds", "Days in review", "Days out for corrections"]],
                 hide_index=True, width="stretch")
con.close()
