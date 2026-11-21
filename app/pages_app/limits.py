"""Limits page: what this prototype does not do. Runs through app/streamlit_app.py."""
import streamlit as st

from app import app_common as ac

st.subheader("Limits")
st.markdown(ac.LIMITS_NOTE)
