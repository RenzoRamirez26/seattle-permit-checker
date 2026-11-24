"""About page. Runs through app/streamlit_app.py."""
import streamlit as st

from app import app_common as ac
from checker import voice

st.subheader("About")
st.markdown(ac.about_note())
v = voice.status()
st.caption(f"Plan reading and the agent: {'Claude API key found' if ac.has_api_key() else 'no API key set, using saved readings and template answers'} · "
           f"Speech to text: {v['speech_to_text']} · Text to speech: {v['text_to_speech']} · "
           f"Seattle database: {'loaded' if ac.has_database() else 'not downloaded yet'}")
