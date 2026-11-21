# Voice: what is built and what the other options are

## What is built

Push-to-talk inside the Streamlit page:

    microphone (st.audio_input) -> faster-whisper -> agent -> browser voice or Kokoro -> speaker

- **Speech to text**: faster-whisper with the `base.en` model, on the laptop's CPU. Optional install. Whisper is given a short list of the words to expect (egress, lavatory, occupancy, SDCI and so on), because it otherwise mishears them on noisy audio.
- **The agent**: `checker/agent.py`, the same one that answers typed questions.
- **Text to speech**: the browser's built-in voice by default (nothing to install). Kokoro, an open model, if `PERMIT_TTS=kokoro`. It runs through the `kokoro-onnx` package, because the original `kokoro` package needs PyTorch, which has no build for Python 3.13 on an Intel Mac.
- **Wording for a voice**: before an answer is spoken, `agent.for_speech()` rewrites what a voice reads badly. "32 in." becomes "32 inches", "800 sq ft" becomes "800 square feet", and "SBC 1010.1.1" becomes "Seattle Building Code section ten ten point one point one". The text on the page keeps the exact citation.
- **If a model is missing or fails** (not installed, no internet for the first download, an unreadable recording), the page does not stop: the owner types the question and the browser's voice reads the answer. The cause is written to the terminal.

It answers one question at a time. You cannot interrupt it and it does not listen continuously.

## Why not a live two-way call in Streamlit

Streamlit reruns the whole page on every interaction and has no long-lived audio stream to the browser. A live pipeline needs a WebRTC or websocket connection that stays open, so it has to run as its own small service next to the app.

| Option | What it is | Fits this project when |
| --- | --- | --- |
| Push-to-talk in Streamlit (built) | Record, transcribe, answer, speak | The demo. No extra service, works offline except the agent |
| Pipecat | Python framework that chains speech to text, a model and text to speech over a live connection | You want interruptions and a natural back-and-forth, and can run a second process |
| LiveKit Agents | The same idea on a WebRTC server | You need many users at once and low delay |
| Hosted speech-to-speech (OpenAI Realtime, Gemini Live) | One model hears and speaks | You accept a second paid provider and want the fastest replies |
| Open speech-to-speech (Ultravox, Moshi) | The same, run locally | You have a GPU |

The agent's code would not change for any of these: each one would call `agent.answer(question, result)` with the transcribed question.

## Status

The browser voice and the fallbacks are tested. Both models were installed and run on 20 November 2026 on one laptop (macOS 14, Intel i5, CPU only, Python 3.13):

- `PERMIT_TTS=kokoro python -m checker.voice` speaks a sentence and hears it back correctly.
- `python -m evaluation.evaluate_voice` speaks ten typical owner questions with Kokoro and transcribes them: 9 of 10 came back word for word and all 10 would get the same answer from the agent. Speaking took about 0.8 s per question and transcribing about 0.7 s. The table is in [reports/voice_eval.md](../reports/voice_eval.md).
- **The questions were machine-spoken, so real voices will do worse.** A person speaking into the app's microphone box has not been measured yet.

Two things had to change to make the models run, both recorded in `requirements-voice.txt`:

1. `kokoro` could not be installed (no PyTorch for this computer), so `kokoro-onnx` is used. Its two model files (about 350 MB) download into `data/models/` the first time Kokoro speaks.
2. faster-whisper 1.2.1 failed on every recording with the newest PyAV (`av` 19), which removed an argument it uses. `av` is pinned to 18.1.0.

### Does the word list help Whisper?

Yes, on harder audio. A one-off check on this laptop used ten questions full of code words, six machine voices (three Kokoro voices and three of macOS's own), as spoken and with loud hiss added: 120 clips. Word-for-word transcripts rose from 80 to 100 with the word list. Typical repairs: "regrets" back to "egress", "laboratories" to "lavatories", "SBCI" to "SDCI". On Kokoro's clean voice alone it made no difference (29 of 30 either way), which is why the report's main table looks the same with and without it. `evaluate_voice.py` repeats a small version of this check (ten clips, with and without hiss) on every run.
