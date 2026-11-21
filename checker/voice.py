"""Voice: speech in, speech out, around the agent.

    microphone -> transcribe() -> agent.answer() -> synthesize() or the browser's own voice

This is push-to-talk: the owner records a question, the app answers. It is not a live
two-way call; Streamlit reruns the page on each interaction, so a streaming pipeline
(Pipecat, LiveKit) would have to run as its own service beside the app.

In:  transcribe() takes the WAV bytes of a recorded question; synthesize() takes the answer text.
Out: transcribe() returns the text heard; synthesize() returns (WAV bytes, mime type).
     Either returns None when its model is missing or fails, and the page then falls back
     to typed questions and the browser's voice. Neither ever raises.

Speech to text: faster-whisper, an open Whisper implementation that runs on a laptop CPU.
Text to speech: the browser's built-in voice by default (no model, no key, no download),
or Kokoro, a small open model run with kokoro-onnx, when PERMIT_TTS=kokoro.

Both models are optional. Install them with `pip install -r requirements-voice.txt`, then
run `PERMIT_TTS=kokoro python -m checker.voice`: it speaks a sentence into voice_test.wav
and prints what it heard back. Measured results: reports/voice_eval.md.

STATUS: both models have run on one computer (macOS 14, Intel, Python 3.13, 20 November
2026), on machine-spoken audio only. A question recorded by a person through the app's
microphone box has NOT been tried yet.
"""
from __future__ import annotations

import html
import io
import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

STT_MODEL = os.environ.get("PERMIT_STT_MODEL", "base.en")   # tiny.en is faster, small.en more accurate
TTS_VOICE = os.environ.get("PERMIT_TTS_VOICE", "af_heart")
KOKORO_SAMPLE_RATE = 24000

# Whisper takes a short text as "what was said just before" and leans towards its words. Without
# it, building-code words are misheard on noisy audio: egress -> "regrets", lavatories ->
# "laboratories", SDCI -> "SBCI" (measured; see reports/voice_eval.md). It holds words only,
# no rules and no numbers. PERMIT_STT_PROMPT=off turns it off.
STT_VOCABULARY = (
    "Questions from a small-business owner in Seattle about a building permit pre-check: egress, exits, "
    "exit door swing, occupancy group, occupant load, lavatory, water closet, restroom, accessible route, "
    "wheelchair turning space, sprinklers, kitchen hood, zoning, change of use, plan review, SDCI."
)

# Kokoro's two files (the model and the voices) are not fetched by the kokoro-onnx library,
# so _model_file() downloads them once from the library's release page into MODEL_DIR.
MODEL_DIR = Path(os.environ.get("PERMIT_MODEL_DIR", Path(__file__).resolve().parents[1] / "data" / "models"))
KOKORO_FILES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
KOKORO_MODEL_FILE = os.environ.get("PERMIT_TTS_MODEL", "kokoro-v1.0.onnx")   # 325 MB; kokoro-v1.0.int8.onnx is 92 MB
KOKORO_VOICES_FILE = "voices-v1.0.bin"                                        # 28 MB


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


def transcribe(audio: bytes, *, vocabulary: bool = True) -> Optional[str]:
    """Text of a recorded question (WAV bytes from st.audio_input), or None if speech to text is unavailable.

    vocabulary=False leaves out the code-word prompt; the evaluation uses it to measure the difference.
    """
    if not audio or not stt_available():
        return None
    prompt = STT_VOCABULARY if vocabulary and _setting("PERMIT_STT_PROMPT", "on") != "off" else None
    try:
        segments, _info = _whisper().transcribe(io.BytesIO(audio), language="en", initial_prompt=prompt)
        return " ".join(s.text.strip() for s in segments).strip() or None
    except Exception as e:   # no model, no internet, unreadable audio: the owner types instead
        log.warning("speech to text failed, falling back to typing: %s: %s", e.__class__.__name__, e)
        return None


# ---------------------------------------------------------------- text to speech
def _model_file(name: str) -> Path:
    """Path of a Kokoro file in MODEL_DIR, downloaded on first use."""
    path = MODEL_DIR / name
    if not path.exists():
        import urllib.request

        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        part = path.with_name(path.name + ".part")   # so a download that stops half-way is never used as a model
        log.warning("downloading %s to %s (once)", name, MODEL_DIR)
        urllib.request.urlretrieve(KOKORO_FILES_URL + name, part)
        part.replace(path)
    return path


@lru_cache(maxsize=1)
def _kokoro():
    from kokoro_onnx import Kokoro

    return Kokoro(str(_model_file(KOKORO_MODEL_FILE)), str(_model_file(KOKORO_VOICES_FILE)))


def tts_backend() -> str:
    """'kokoro' if asked for and installed, else 'browser'."""
    if _setting("PERMIT_TTS", "browser") == "kokoro":
        try:
            import kokoro_onnx  # noqa: F401
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

        samples, sample_rate = _kokoro().create(text, voice=TTS_VOICE, speed=1.0, lang="en-us")
        pcm = (np.clip(np.asarray(samples, dtype="float32"), -1, 1) * 32767).astype("<i2")
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sample_rate)
            w.writeframes(pcm.tobytes())
        return buf.getvalue(), "audio/wav"
    except Exception as e:   # a missing file, no internet, a bad voice name: use the browser voice instead
        log.warning("Kokoro failed, using the browser voice: %s: %s", e.__class__.__name__, e)
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
    logging.basicConfig(level=logging.WARNING)
    print(status())
    out = synthesize("This is the permit checker. Your plan has two problems to fix.")
    if out:
        open("voice_test.wav", "wb").write(out[0])
        print("wrote voice_test.wav;", "heard back:", transcribe(out[0]))
    else:
        print("Kokoro is not active (set PERMIT_TTS=kokoro and install requirements-voice.txt).")
