"""
PermitOS: the demo app.

This file is the entrypoint: page config, the header and the navigation. The pages live in
app/pages_app/ (not app/pages/, so Streamlit's legacy page auto-discovery stays off); shared
helpers are in app/app_common.py.

Run from the repository root:
    python -m streamlit run app/streamlit_app.py

The app holds no rules of its own. Every finding comes from checker/, the same functions the
tests and the command line call, so the app cannot show a result the engine did not produce.
"""
from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
try:  # keys in a local .env file (never committed)
    from dotenv import load_dotenv

    load_dotenv(_ROOT / ".env")
except ImportError:
    pass
from app import app_common as ac  # noqa: E402

st.set_page_config(page_title="PermitOS (demo)", page_icon="📐", layout="wide")

st.title("PermitOS")
st.caption("A student prototype. It is a pre-submission check, not a code determination, and it is "
           "not affiliated with the City of Seattle.")

pages = {
    "Check": [st.Page(ac.PAGE_CHECK, title="Check a floor plan", default=True)],
    "Evidence": [
        st.Page(ac.PAGE_DATA, title="Seattle's review records"),
        st.Page(ac.PAGE_EVIDENCE, title="How we know it works"),
    ],
    "Reference": [
        st.Page(ac.PAGE_LIMITS, title="Limits"),
        st.Page(ac.PAGE_ABOUT, title="About"),
    ],
}
page = st.navigation(pages, position="top")
if page.title == "Check a floor plan":
    page.run()                               # uses the full width: the drawing sits beside the reading
else:
    _, middle, _ = st.columns([1, 3, 1])     # the reading pages keep a comfortable line length on a wide screen
    with middle:
        page.run()
