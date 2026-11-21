"""Do spoken questions survive the round trip? Speak ten owner questions, transcribe them back, time both steps.

In:  the ten questions in QUESTIONS, spoken by Kokoro (checker/voice.py: synthesize).
Out: reports/voice_eval.md, a table with what faster-whisper heard (checker/voice.py: transcribe),
     whether it is the same words, whether the agent would give the same answer, and the seconds
     each step took.

  python -m evaluation.evaluate_voice            # needs requirements-voice.txt; no key

Each clip is transcribed four ways: as spoken and with hiss added (NOISE_SNR_DB), each with and
without the code-word vocabulary that transcribe() passes to Whisper. That shows what the
vocabulary is worth.

Read the numbers for what they are: the questions are machine-spoken, in a clear voice with no
accent, no hesitation and no room noise. Real voices on a laptop microphone will do worse. The
hiss rows are a rough stand-in for that, not a measurement of it.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import platform
import re
import time
import wave
from datetime import date
from pathlib import Path
from typing import Any, Callable, Optional

from checker import agent, rules_engine, voice, zoning

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reports" / "voice_eval.md"
NOISE_SNR_DB = 5      # hiss this many decibels quieter than the speech: loud, like a busy room
DEMO_CASE = "cafe_flawed"

QUESTIONS = [
    "Do I need a second exit?",
    "Is my restroom door wide enough?",
    "What is my occupant load?",
    "How many lavatories do I need?",
    "Do I need sprinklers?",
    "Does the egress door swing the right way?",
    "What permits do I need?",
    "How long will plan review take?",
    "Is my business allowed in this zoning?",
    "What occupancy group is my restaurant?",
]


def normalize(text: Optional[str]) -> list[str]:
    """Words only: case, punctuation and hyphens do not count as mistakes."""
    return re.sub(r"[^a-z0-9 ]", "", (text or "").lower().replace("-", " ")).split()


def add_noise(wav: bytes, snr_db: float, seed: int = 0) -> bytes:
    """The same recording with white noise added, snr_db decibels below the speech. Same seed, same noise."""
    import numpy as np

    with wave.open(io.BytesIO(wav)) as w:
        params = w.getparams()
        samples = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype("float32")
    noise = np.random.default_rng(seed).normal(0, samples.std() / 10 ** (snr_db / 20), samples.shape)
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setparams(params)
        w.writeframes(np.clip(samples + noise, -32768, 32767).astype("<i2").tobytes())
    return out.getvalue()


def audio_seconds(wav: bytes) -> float:
    with wave.open(io.BytesIO(wav)) as w:
        return w.getnframes() / w.getframerate()


def demo_result() -> dict:
    """The audit of the demo café, to see whether a misheard question would still get the same answer."""
    rules = rules_engine.load_rules()
    case = next(c for c in json.loads((ROOT / "demo" / "cases.json").read_text(encoding="utf-8")) if c["id"] == DEMO_CASE)
    extraction = json.loads((ROOT / "demo" / case["extraction"]).read_text(encoding="utf-8"))
    z = zoning.classify(case.get("zoning"), rules, business_type=case["intake"]["business_type"],
                        area_sqft=extraction.get("gross_area_sqft"))
    return rules_engine.run_checks(extraction, case["intake"], rules, z) | {"zoning": z}


def evaluate(questions: list[str], result: dict, *,
             synthesize: Callable[[str], Optional[tuple[bytes, str]]] = voice.synthesize,
             transcribe: Callable[..., Optional[str]] = voice.transcribe) -> list[dict[str, Any]]:
    """One row per question. Raises RuntimeError if Kokoro produced no audio."""
    rows = []
    for question in questions:
        t0 = time.perf_counter()
        spoken = synthesize(question)
        t1 = time.perf_counter()
        if not spoken:
            raise RuntimeError("Kokoro produced no audio. Install requirements-voice.txt; see the warning above for the cause.")
        heard = transcribe(spoken[0])
        t2 = time.perf_counter()
        noisy = add_noise(spoken[0], NOISE_SNR_DB)
        row: dict[str, Any] = {
            "question": question, "heard": heard or "",
            "audio_s": audio_seconds(spoken[0]), "speak_s": t1 - t0, "hear_s": t2 - t1,
            "exact": normalize(heard) == normalize(question),
            # what the owner cares about: does the agent answer the heard question as it would the real one?
            "same_answer": bool(heard) and agent.template_answer(heard, result) == agent.template_answer(question, result),
            "heard_no_vocab": transcribe(spoken[0], vocabulary=False) or "",
            "heard_noisy": transcribe(noisy) or "",
            "heard_noisy_no_vocab": transcribe(noisy, vocabulary=False) or "",
        }
        for k in ("heard_no_vocab", "heard_noisy", "heard_noisy_no_vocab"):
            row[k.replace("heard", "exact")] = normalize(row[k]) == normalize(question)
        rows.append(row)
    return rows


def to_markdown(rows: list[dict], setup: str) -> str:
    n = len(rows)

    def count(key: str) -> str:
        return f"{sum(r[key] for r in rows)} of {n}"

    def mean(key: str) -> float:
        return sum(r[key] for r in rows) / n

    yes = {True: "yes", False: "**no**"}
    out = ["# Voice evaluation: spoken question -> text", "",
           f"{setup}", "",
           f"**{count('exact')} questions came back word for word, and {count('same_answer')} would get the same answer "
           f"from the agent.** Speaking a question took {mean('speak_s'):.1f} s on average and transcribing it "
           f"{mean('hear_s'):.1f} s (models already loaded).", "",
           "> **These questions were machine-spoken.** Kokoro's voice is clear, with no accent, hesitation, "
           "background noise or laptop microphone. Real voices will do worse than this table. "
           "It shows the two models work together on this computer; it does not show how well the app hears people.", "",
           "| # | Question spoken by Kokoro | Heard by faster-whisper | Same words | Same answer | Audio (s) | Speak (s) | Transcribe (s) |",
           "|---|---|---|---|---|---|---|---|"]
    for i, r in enumerate(rows, 1):
        out.append(f"| {i} | {r['question']} | {r['heard'] or '(nothing)'} | {yes[r['exact']]} | {yes[r['same_answer']]} | "
                   f"{r['audio_s']:.1f} | {r['speak_s']:.1f} | {r['hear_s']:.1f} |")
    out += ["", "\"Same words\" ignores capitals and punctuation. \"Same answer\" means the template agent gives the "
            f"identical answer to the heard text and to the real question, on the demo plan `{DEMO_CASE}`.", "",
            "## Does the code-word vocabulary help?", "",
            "`transcribe()` gives Whisper a short list of expected words (egress, lavatory, occupancy and so on). "
            f"The same ten clips, as spoken and with hiss added {NOISE_SNR_DB} dB below the speech:", "",
            "| Audio | With vocabulary | Without |", "|---|---|---|",
            f"| As spoken | {count('exact')} | {count('exact_no_vocab')} |",
            f"| With hiss | {count('exact_noisy')} | {count('exact_noisy_no_vocab')} |"]
    misses = [(r["question"], label, r[key]) for r in rows for key, label in
              (("heard", "as spoken, with vocabulary"), ("heard_no_vocab", "as spoken, without"),
               ("heard_noisy", "with hiss, with vocabulary"), ("heard_noisy_no_vocab", "with hiss, without"))
              if not r[key.replace("heard", "exact")]]
    if misses:
        out += ["", "What was misheard:", ""]
        out += [f"- \"{q}\" ({label}): heard \"{h or '(nothing)'}\"" for q, label, h in misses]
    out += ["", "_Ten questions is a small sample: one question is ten percentage points. "
            "The hiss is added by the script, so it is a rough stand-in for a noisy room, not a recording of one._", ""]
    return "\n".join(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Speak ten owner questions with Kokoro, transcribe them back, write reports/voice_eval.md")
    ap.add_argument("--out", default=str(REPORT))
    args = ap.parse_args(argv)

    os.environ.setdefault("PERMIT_TTS", "kokoro")
    if not voice.stt_available() or voice.tts_backend() != "kokoro":
        print("The speech models are not installed. Run: python -m pip install -r requirements-voice.txt")
        return 1
    t0 = time.perf_counter()
    warm = voice.synthesize("Warming up.")      # first use loads (and, the very first time, downloads) each model
    t1 = time.perf_counter()
    voice.transcribe(warm[0]) if warm else None
    t2 = time.perf_counter()
    try:
        rows = evaluate(QUESTIONS, demo_result())
    except RuntimeError as e:
        print(e)
        return 1
    setup = (f"Run on {date.today():%d %B %Y}: {platform.system()} {platform.release()} ({platform.machine()}), CPU only, "
             f"Python {platform.python_version()}. Text to speech: Kokoro, voice `{voice.TTS_VOICE}`, file "
             f"`{voice.KOKORO_MODEL_FILE}`. Speech to text: faster-whisper `{voice.STT_MODEL}`. "
             f"Loading the models took {t1 - t0:.1f} s (Kokoro) and {t2 - t1:.1f} s (Whisper), once per session.")
    report = to_markdown(rows, setup)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(report, encoding="utf-8")
    print(report)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
