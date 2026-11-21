# Voice: what is built and what the other options are

## What is built

Push-to-talk inside the Streamlit page:

    microphone (st.audio_input) -> faster-whisper -> agent -> browser voice or Kokoro -> speaker

- **Speech to text**: faster-whisper with the `base.en` model, on the laptop's CPU. Optional install.
- **The agent**: `checker/agent.py`, the same one that answers typed questions.
- **Text to speech**: the browser's built-in voice by default (nothing to install). Kokoro, an open model, if `PERMIT_TTS=kokoro`.

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

The browser voice and the fallbacks are tested. faster-whisper and Kokoro were not installed or run in the build sandbox. Run `python -m checker.voice` to try both.
