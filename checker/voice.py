"""Voice: speech in, speech out, around the agent.

    microphone -> transcribe() -> agent.answer() -> synthesize() or the browser's own voice

This is push-to-talk: the owner records a question, the app answers. It is not a live
two-way call; Streamlit reruns the page on each interaction, so a streaming pipeline
(Pipecat, LiveKit) would have to run as its own service beside the app.

Speech to text: faster-whisper, an open Whisper implementation that runs on a laptop CPU.
Text to speech: the browser's built-in voice by default (no model, no key, no download),
or Kokoro, a small open model, when PERMIT_TTS=kokoro.

Both models are optional. Install them with `pip install -r requirements-voice.txt`.
Without them transcribe() and synthesize() return None and the app falls back to typed
questions and the browser voice.

STATUS: the fallbacks and the browser voice are tested. The faster-whisper and Kokoro
calls are written from each library's documented usage and have NOT been run here (the
build sandbox could not download the models). Run `python -m checker.voice` once to try them.
"""
from __future__ import annotations

import html
import io
import json
import os
from functools import lru_cache
from typing import Optional

STT_MODEL = os.environ.get("PERMIT_STT_MODEL", "base.en")   # tiny.en is faster, small.en more accurate
TTS_VOICE = os.environ.get("PERMIT_TTS_VOICE", "af_heart")
KOKORO_SAMPLE_RATE = 24000


def _setting(name: str, default: str) -> str:
    return os.environ.get(name, default).strip().lower()


# ---------------------------------------------------------------- speech to text
@lru_cache(maxsize=1)
def _whisper():
    from faster_whisper import WhisperModel   # downloads the model from Hugging Face on first use

    return WhisperModel(STT_MODEL, device="cpu", compute_type="int8")


def stt_available() -> bool:
    if _setting("PERMIT_STT", "faster-whisper") == "off":
        return False
    try:
        import faster_whisper  # noqa: F401
        return True
    except ImportError:
        return False


def transcribe(audio: bytes) -> Optional[str]:
    """Text of a recorded question (WAV bytes from st.audio_input), or None if speech to text is unavailable."""
    if not audio or not stt_available():
        return None
    try:
        segments, _info = _whisper().transcribe(io.BytesIO(audio), language="en")
        return " ".join(s.text.strip() for s in segments).strip() or None
    except Exception:
        return None


# ---------------------------------------------------------------- text to speech
@lru_cache(maxsize=1)
def _kokoro():
    from kokoro import KPipeline   # downloads the model from Hugging Face on first use

    return KPipeline(lang_code="a")   # "a" = American English


def tts_backend() -> str:
    """'kokoro' if asked for and installed, else 'browser'."""
    if _setting("PERMIT_TTS", "browser") == "kokoro":
        try:
            import kokoro  # noqa: F401
            return "kokoro"
        except ImportError:
            pass
    return "browser"


def synthesize(text: str) -> Optional[tuple[bytes, str]]:
    """(audio bytes, mime type) for st.audio, or None when the browser voice should be used instead."""
    if not text or tts_backend() != "kokoro":
        return None
    try:
        import wave

        import numpy as np

        chunks = [np.asarray(audio, dtype="float32") for _, _, audio in _kokoro()(text, voice=TTS_VOICE)]
        pcm = (np.clip(np.concatenate(chunks), -1, 1) * 32767).astype("<i2")
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(KOKORO_SAMPLE_RATE)
            w.writeframes(pcm.tobytes())
        return buf.getvalue(), "audio/wav"
    except Exception:
        return None


def browser_speech_html(text: str, autoplay: bool = True) -> str:
    """A small page that reads `text` aloud with the browser's built-in voice.

    Rendered inside the app with st.iframe. The text is embedded as an escaped JavaScript
    string, never as markup. The Play button is there because browsers may block speech
    that was not started by a click.
    """
    # JSON makes the text a safe JavaScript string; the two replacements stop it closing the <script> tag.
    payload = json.dumps(text).replace("</", "<\\/").replace("<!--", "<\\!--")
    return f"""<div style="font-family: sans-serif; font-size: 14px; display: flex; gap: 8px; align-items: center;">
  <button id="play" style="padding: 4px 12px; cursor: pointer;">&#128266; Play answer</button>
  <button id="stop" style="padding: 4px 12px; cursor: pointer;">Stop</button>
  <span id="note" style="color: #555;"></span>
</div>
<script>
  const text = {payload};
  const note = document.getElementById("note");
  function speak() {{
    if (!("speechSynthesis" in window)) {{ note.textContent = "This browser has no built-in voice."; return; }}
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = 1.0;
    window.speechSynthesis.speak(u);
  }}
  document.getElementById("play").onclick = speak;
  document.getElementById("stop").onclick = () => window.speechSynthesis.cancel();
  if ({str(autoplay).lower()}) {{ try {{ speak(); }} catch (e) {{}} }}
</script>
<noscript>{html.escape(text)}</noscript>
"""


def status() -> dict[str, str]:
    """What the app shows under the voice controls."""
    return {
        "speech_to_text": f"faster-whisper ({STT_MODEL})" if stt_available() else "not installed: type your question",
        "text_to_speech": f"Kokoro ({TTS_VOICE})" if tts_backend() == "kokoro" else "browser voice",
    }


if __name__ == "__main__":   # quick manual check of both optional models
    print(status())
    out = synthesize("This is the permit checker. Your plan has two problems to fix.")
    if out:
        open("voice_test.wav", "wb").write(out[0])
        print("wrote voice_test.wav;", "heard back:", transcribe(out[0]))
    else:
        print("Kokoro is not active (set PERMIT_TTS=kokoro and install requirements-voice.txt).")
