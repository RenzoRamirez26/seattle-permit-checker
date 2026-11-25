"""The agent (answers about one audit) and the voice helpers, with the model mocked."""
import re

import pytest

from checker import agent, rules_engine, voice, zoning
from tests.conftest import FakeClient


@pytest.fixture
def salon(rules, load):
    z = zoning.classify("NR3", rules, business_type="salon", area_sqft=800)
    return rules_engine.run_checks(load("salon_flawed"), {"business_type": "salon"}, rules, z) | {"zoning": z}


def test_template_answers_need_no_model(salon, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    summary = agent.answer("", salon)
    assert summary["generated_by"] == "template" and "3 items to fix before you apply and 2 to check with the city" in summary["text"]
    restroom = agent.answer("Is my restroom ok?", salon)
    assert {"EG-3", "ADA-2"} <= set(restroom["cited_rules"]) and "30 in. clear" in restroom["text"]
    assert "Department of Licensing" not in restroom["text"]
    permits = agent.answer("What permits do I need?", salon)
    assert "Construction permit" in permits["text"] and "more in the permit list" in permits["text"]
    exits = agent.answer("Do I have enough exits?", salon)
    assert exits["text"].startswith("Widen the door") or "EG-1" in exits["cited_rules"]
    assert "no Seattle review data" in agent.answer("How long will review take?", salon)["text"]
    unrelated = agent.answer("Tell me about parking", salon)
    assert unrelated["text"] == agent.spoken_summary(salon)


def test_review_time_answer_uses_seattle_records(salon):
    data = {"category_label": "salon and barbershop", "source": "x",
            "summary": {"permits": 40, "share_two_or_more_rounds": 0.8, "median_days_in_review": 55.0}}
    text = agent.template_answer("how long does it take?", salon | {"local_review_data": data})
    assert "80% of 40 salon and barbershop build-outs" in text and "55 days" in text


def test_model_answer_is_used_when_grounded(salon):
    fake = FakeClient(text="Your restroom door is 30 inches clear and needs 32, under SBC 1010.1.1. [EG-3]")
    out = agent.answer("Is the restroom door ok?", salon, client=fake, model="test-model",
                       history=[{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}])
    assert out["generated_by"] == "test-model" and out["cited_rules"] == ["EG-3"] and out["problems"] == []
    kw = fake.kwargs
    assert kw["model"] == "test-model" and "answer only from the audit" in kw["system"].lower()
    assert [m["role"] for m in kw["messages"]] == ["user", "assistant", "user"]
    last = kw["messages"][-1]["content"]
    assert "<audit>" in last and '"rule_id": "EG-3"' in last and last.endswith("Question: Is the restroom door ok?")
    assert "NR3" in last and "salon_license" in last


def test_ungrounded_model_answer_is_replaced(salon):
    for bad in ("You also need a second exit. [EG-9]",                    # a rule id the audit does not have
                "The door must be 36 inches under SBC 1010.9.9. [EG-3]",  # a code section the audit does not have
                ""):
        out = agent.answer("Is the restroom door ok?", salon, client=FakeClient(text=bad), model="test-model")
        assert out["generated_by"] == "template" and out["problems"], bad
        assert "30 in. clear" in out["text"]
    failed = agent.answer("Is the restroom door ok?", salon, client=FakeClient(error=TimeoutError("slow")), model="m")
    assert failed["generated_by"] == "template" and "TimeoutError" in failed["problems"][0]


def test_context_carries_review_records_and_real_comments(salon):
    data = {"category_label": "salon and barbershop", "source": "SDCI", "summary": {"permits": 9},
            "corrections_by_review_type": [], "top_comment_subjects": []}
    ctx = agent.build_context(salon | {"local_review_data": data},
                              examples=[{"review_type": "Ordinance", "subject_raw": "11 Accessibility", "comment": "Show the turning space.", "permit_number": "X"}])
    assert '"seattle_review_records"' in ctx and "Show the turning space." in ctx and '"permit_number"' not in ctx
    assert '"review_type": "Ordinance"' in ctx and '"subject_raw": "11 Accessibility"' in ctx


def test_for_speech_drops_rule_ids_and_markdown():
    assert agent.for_speech("**Door too narrow** [EG-3]. Fix it.  [ADA-2]") == "Door too narrow. Fix it."


@pytest.mark.parametrize("written, spoken", [
    # inches: only "in." with its full stop, and the stop is kept when it also ended the sentence
    ("The door is 30 in. clear and needs 32 in. Widen it.", "The door is 30 inches clear and needs 32 inches. Widen it."),
    ("The aisle is 21.2 in. wide, with a 1 in. gap.", "The aisle is 21.2 inches wide, with a 1 inch gap."),
    ("There are 2 in the fix list.", "There are 2 in the fix list."),
    ("Widen to 32 in. clear (a 36 in. door leaf does this).", "Widen to 32 inches clear (a 36 inch door leaf does this)."),
    # square feet and feet
    ("The space is 2,400 sq ft. Over 25,000 sq ft needs review.", "The space is 2,400 square feet. Over 25,000 square feet needs review."),
    ("800 sqft, or 1 sq. ft. more", "800 square feet, or 1 square foot more"),
    ("within 10 ft of the door", "within 10 feet of the door"),
    # code sections: the code's name, then the number the way a reviewer says it
    ("Widen it under SBC 1010.1.1.", "Widen it under Seattle Building Code section ten ten point one point one."),
    ("SBC Table 2902.1 sets the count", "Seattle Building Code table twenty-nine oh two point one sets the count"),
    ("SBC Chapter 11 applies", "Seattle Building Code chapter eleven applies"),
    ("SBC 303.1.1 and SBC 903.2.1.2", "Seattle Building Code section three oh three point one point one and "
                                      "Seattle Building Code section nine oh three point two point one point two"),
    ("ADA 304.3.1 and 603.2.1", "A.D.A. section three oh four point three point one and six oh three point two point one"),
    ("SMC 23.47A, then SMC 23.44.020.E", "Seattle Municipal Code section twenty-three point forty-seven A, then "
                                         "Seattle Municipal Code section twenty-three point forty-four point zero two zero point E"),
    ("SBC Table 1006.2.1 and Section 1006.3", "Seattle Building Code table ten oh six point two point one and section ten oh six point three"),
    ("ICC A117.1", "I.C.C. section A one seventeen point one"),
    # shorthand from the fix list
    ("2 exit(s) and 1 lavatory(ies), 2 water closet(s)", "2 exits and 1 lavatory, 2 water closets"),
    ("a 50/50 split for this addition/alteration, e.g. hood & duct", "a 50 50 split for this addition or alteration, for example hood and duct"),
])
def test_for_speech_says_units_and_code_sections_naturally(written, spoken):
    assert agent.for_speech(written) == spoken


def test_for_speech_leaves_no_abbreviations_in_real_answers(salon):
    """Every template answer for a real audit, worded for speech: no 'in.', 'sq ft', code initials or rule ids left."""
    for question in ("", "Is my restroom ok?", "Do I have enough exits?", "What permits do I need?", "Is the zoning ok?"):
        spoken = agent.for_speech(agent.template_answer(question, salon) if question else agent.spoken_summary(salon))
        assert not re.search(r"\d\s?in\.|sq\.? ?ft|\bSBC\b|\bSMC\b|\[[A-Z]+-\d+\]|\(s\)|\d{3,4}\.\d", spoken), spoken


def test_voice_falls_back_cleanly(monkeypatch):
    monkeypatch.setenv("PERMIT_STT", "off")
    monkeypatch.delenv("PERMIT_TTS", raising=False)
    assert voice.stt_available() is False and voice.transcribe(b"RIFF....") is None
    assert voice.tts_backend() == "browser" and voice.synthesize("hello") is None
    assert voice.status() == {"speech_to_text": "not installed: type your question", "text_to_speech": "browser voice"}
    assert voice.transcribe(b"") is None and voice.synthesize("") is None


def test_browser_speech_page_escapes_the_text():
    page = voice.browser_speech_html('He said "stop" </script><script>alert(1)</script>')
    assert "speechSynthesis" in page and "Play answer" in page
    assert "</script><script>alert(1)" not in page.split("<noscript>")[0].split("const text =")[1].split("\n")[0]
    assert "&lt;script&gt;" in page.split("<noscript>")[1]


def test_local_models_are_used_when_installed(monkeypatch, tmp_path):
    """The optional models are not installed in CI, so stand-ins check the wiring around them."""
    import sys
    import types

    class Seg:
        def __init__(self, text): self.text = text

    class FakeWhisper:
        def __init__(self, *a, **k): pass
        prompts = []
        def transcribe(self, audio, language=None, initial_prompt=None):
            assert audio.read(4) == b"RIFF" and language == "en"
            self.prompts.append(initial_prompt)
            return iter([Seg(" Do I need"), Seg(" a second exit? ")]), None

    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=FakeWhisper))
    monkeypatch.delenv("PERMIT_STT", raising=False)
    voice._whisper.cache_clear()
    assert voice.stt_available() and voice.transcribe(b"RIFF0000") == "Do I need a second exit?"
    assert voice.transcribe(b"RIFF0000", vocabulary=False) == "Do I need a second exit?"
    # Whisper is told the code words it should expect, unless asked not to
    assert FakeWhisper.prompts == [voice.STT_VOCABULARY, None]
    assert all(word in voice.STT_VOCABULARY for word in ("egress", "lavatory", "occupancy"))
    voice._whisper.cache_clear()

    np = pytest.importorskip("numpy")

    class FakeKokoro:
        def __init__(self, model_path, voices_path):
            assert model_path.endswith(".onnx") and voices_path.endswith("voices-v1.0.bin")
        def create(self, text, voice=None, speed=1.0, lang=None):
            assert (voice, lang) == (voice_module.TTS_VOICE, "en-us")
            # the second half is out of range: it must be clipped, not wrapped
            return np.concatenate([np.zeros(2400, dtype="float32"), np.ones(2400, dtype="float32") * 2]), 24000

    voice_module = voice
    monkeypatch.setitem(sys.modules, "kokoro_onnx", types.SimpleNamespace(Kokoro=FakeKokoro))
    monkeypatch.setattr(voice, "_model_file", lambda name: tmp_path / name)   # no download in tests
    monkeypatch.setenv("PERMIT_TTS", "kokoro")
    voice._kokoro.cache_clear()
    audio, mime = voice.synthesize("hello")
    voice._kokoro.cache_clear()
    import io
    import wave
    with wave.open(io.BytesIO(audio)) as w:
        assert (mime, w.getframerate(), w.getnchannels(), w.getnframes()) == ("audio/wav", 24000, 1, 4800)
        frames = np.frombuffer(w.readframes(4800), dtype="<i2")
    assert frames[0] == 0 and frames[-1] == 32767


def test_failing_speech_models_fall_back_instead_of_crashing(monkeypatch):
    """Installed but broken (no internet for the model, unreadable audio): None, so the page uses typing and the browser voice."""
    import sys
    import types

    def broken(*a, **k):
        raise OSError("no internet")

    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=broken))
    monkeypatch.setitem(sys.modules, "kokoro_onnx", types.SimpleNamespace(Kokoro=broken))
    monkeypatch.setattr(voice, "_model_file", broken)
    monkeypatch.delenv("PERMIT_STT", raising=False)
    monkeypatch.setenv("PERMIT_TTS", "kokoro")
    voice._whisper.cache_clear(); voice._kokoro.cache_clear()
    assert voice.transcribe(b"RIFF0000") is None
    assert voice.tts_backend() == "kokoro" and voice.synthesize("hello") is None
    voice._whisper.cache_clear(); voice._kokoro.cache_clear()


def test_voice_evaluation_scores_and_reports(salon):
    """evaluation/evaluate_voice.py with stand-in models: the scoring and the report, no audio models needed."""
    import io
    import wave

    np = pytest.importorskip("numpy")
    from evaluation import evaluate_voice as ev

    assert ev.normalize("Do I need a Second-Exit?") == ["do", "i", "need", "a", "second", "exit"]
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000)
        w.writeframes((np.sin(np.arange(24000) / 20) * 8000).astype("<i2").tobytes())
    clip = buf.getvalue()
    assert ev.audio_seconds(clip) == 1.0
    noisy = ev.add_noise(clip, 5)
    assert noisy != clip and ev.audio_seconds(noisy) == 1.0 and noisy == ev.add_noise(clip, 5)   # repeatable

    said = []
    def fake_synthesize(text):
        said.append(text)
        return clip, "audio/wav"
    def fake_transcribe(audio, vocabulary=True):
        heard = said[-1].lower().rstrip("?")                       # same words, different case and punctuation
        return heard if vocabulary else heard.replace("lavatories", "laboratories")

    rows = ev.evaluate(["Do I have enough exits?", "How many lavatories do I need?"], salon,
                       synthesize=fake_synthesize, transcribe=fake_transcribe)
    assert [r["exact"] for r in rows] == [True, True] and all(r["same_answer"] for r in rows)
    assert [r["exact_no_vocab"] for r in rows] == [True, False] and rows[1]["heard_no_vocab"].count("laboratories") == 1
    report = ev.to_markdown(rows, "Test setup.")
    assert "2 of 2 questions came back word for word" in report and "machine-spoken" in report
    assert "Real voices will do worse" in report and "| As spoken | 2 of 2 | 1 of 2 |" in report
    assert 'heard "how many laboratories do i need"' in report
    with pytest.raises(RuntimeError):
        ev.evaluate(["Hello"], salon, synthesize=lambda text: None, transcribe=fake_transcribe)


def test_template_answers_say_when_a_rule_value_is_still_being_checked(salon):
    """The assistant's template answers claim no more than the pages: every path gives a finding's level, and the
    summary ends with the rulebook's counts."""
    assert all(f["check_level"] == "unchecked" for f in salon["findings"])
    assert agent.spoken_summary(salon).endswith(rules_engine.result_counts_sentence(salon))
    assert "Some rule values" not in agent.spoken_summary(salon)
    open_hit = agent.template_answer("What about the aisle?", salon)
    assert rules_engine.UNVERIFIED_NOTE in open_hit
    none_open = salon | {"findings": [f for f in salon["findings"] if f["status"] == "pass"]}
    passed = agent.template_answer("Tell me about the toilets and restrooms", none_open)
    hits = [f for f in none_open["findings"] if f["rule_id"].startswith("PL")]
    assert hits and passed.startswith("No issues found there.")
    assert passed.count(rules_engine.UNVERIFIED_NOTE) == len(hits[:2]) > 0
    checked = salon | {"findings": [f | {"check_level": "transcribed"} for f in salon["findings"]]}
    answer = agent.template_answer("What about the aisle?", checked)
    assert rules_engine.UNVERIFIED_NOTE not in answer and rules_engine.TRANSCRIBED_NOTE in answer
    reviewed = salon | {"findings": [f | {"check_level": "reviewed", "rule_reviewed_by": "B. Expert, architect",
                                          "rule_reviewed_on": "2026-12-02"} for f in salon["findings"]]}
    assert "Reviewed by B. Expert, architect, 2026-12-02." in agent.template_answer("What about the aisle?", reviewed)
    assert '"check_level"' in agent.build_context(salon) and '"rule_levels"' in agent.build_context(salon)
    assert agent.check_grounded(agent.template_answer("What about the aisle?", reviewed), reviewed) == []


def test_the_permit_answer_carries_may_be_needed_and_the_unchecked_note(rules, load):
    """The template answer names a permit the way the pages do: with May be needed, and with the unchecked note when it
    is listed because of a value still being checked."""
    cafe = rules_engine.run_checks(load("flawed"), {"business_type": "cafe_restaurant", "cooking_on_site": None}, rules)
    permits = [p for p in cafe["permits_likely_required"] if p.get("may_be_needed") or p.get("check_level") == "unchecked"]
    assert permits
    first = cafe | {"permits_likely_required": permits}
    answer = agent.template_answer("Which permits will I need?", first)
    for p in permits[:5]:
        assert p["name"] in answer
    assert answer.count("listed because of a value still being checked against the code") == \
        sum(p.get("check_level") == "unchecked" for p in permits[:5])
    assert answer.count("may be needed: check with the city") == sum(bool(p.get("may_be_needed")) for p in permits[:5])


def test_sonnet_answers_are_asked_not_to_think_and_other_models_get_no_thinking_field(salon):
    sonnet = FakeClient(text="Your restroom door needs 32 inches clear. [EG-3]")
    agent.answer("Is the restroom door ok?", salon, client=sonnet, model="claude-sonnet-5-5")
    assert sonnet.kwargs["thinking"] == {"type": "between_tools"} and sonnet.kwargs["max_tokens"] == 1000
    other = FakeClient(text="Your restroom door needs 32 inches clear. [EG-3]")
    agent.answer("Is the restroom door ok?", salon, client=other, model="test-model")
    assert "thinking" not in other.kwargs


def test_a_thinking_only_reply_falls_back_to_the_template_and_logs_no_user_text(salon, caplog):
    from types import SimpleNamespace

    class ThinkingOnly:
        def __init__(self):
            self.messages = self

        def create(self, **kw):
            return SimpleNamespace(stop_reason="max_tokens", content=[SimpleNamespace(type="thinking", thinking="")])

    question = "Is my restroom door wide enough for a wheelchair?"
    with caplog.at_level("WARNING", logger="checker.agent"):
        out = agent.answer(question, salon, client=ThinkingOnly(), model="claude-sonnet-5-5")
    assert out["generated_by"] == "template" and out["problems"] == ["empty answer"]
    assert out["text"] == agent.template_answer(question, salon)
    logged = " ".join(r.getMessage() for r in caplog.records)
    assert "no text" in logged and "max_tokens" in logged and "thinking" in logged
    assert "restroom" not in logged.lower() and "wheelchair" not in logged.lower()
