"""The agent (answers about one audit) and the voice helpers, with the model mocked."""
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
    assert summary["generated_by"] == "template" and "3 problems and 2 items to confirm" in summary["text"]
    restroom = agent.answer("Is my restroom ok?", salon)
    assert {"EG-3", "ADA-2"} <= set(restroom["cited_rules"]) and "30 in. clear" in restroom["text"]
    assert "Department of Licensing" not in restroom["text"]
    permits = agent.answer("What permits do I need?", salon)
    assert "Construction permit" in permits["text"] and "more in the permit list" in permits["text"]
    exits = agent.answer("Do I have enough exits?", salon)
    assert exits["text"].startswith("Door too narrow") or "EG-1" in exits["cited_rules"]
    assert "no Seattle review data" in agent.answer("How long will review take?", salon)["text"]
    unrelated = agent.answer("Tell me about parking", salon)
    assert unrelated["text"] == agent.spoken_summary(salon)


def test_review_time_answer_uses_seattle_records(salon):
    data = {"category_label": "salon and barbershop", "source": "x",
            "summary": {"permits": 40, "share_two_or_more_cycles": 0.8, "median_days_plan_review": 55.0}}
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
                              examples=[{"Review_Type": "Ordinance", "Subject_Raw": "11 Accessibility", "Comment": "Show the turning space.", "Permit_id": "X"}])
    assert '"seattle_review_records"' in ctx and "Show the turning space." in ctx and '"Permit_id"' not in ctx


def test_for_speech_drops_rule_ids_and_markdown():
    assert agent.for_speech("**Door too narrow** [EG-3]. Fix it.  [ADA-2]") == "Door too narrow . Fix it."


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


def test_local_models_are_used_when_installed(monkeypatch):
    """The optional models are not installed in CI, so stand-ins check the wiring around them."""
    import sys
    import types

    class Seg:
        def __init__(self, text): self.text = text

    class FakeWhisper:
        def __init__(self, *a, **k): pass
        def transcribe(self, audio, language=None):
            assert audio.read(4) == b"RIFF" and language == "en"
            return iter([Seg(" Do I need"), Seg(" a second exit? ")]), None

    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=FakeWhisper))
    monkeypatch.delenv("PERMIT_STT", raising=False)
    voice._whisper.cache_clear()
    assert voice.stt_available() and voice.transcribe(b"RIFF0000") == "Do I need a second exit?"
    voice._whisper.cache_clear()

    np = pytest.importorskip("numpy")

    class FakePipeline:
        def __init__(self, lang_code): assert lang_code == "a"
        def __call__(self, text, voice=None):
            yield "g", "p", np.zeros(2400, dtype="float32")
            yield "g", "p", np.ones(2400, dtype="float32") * 2      # out of range: must be clipped, not wrapped

    monkeypatch.setitem(sys.modules, "kokoro", types.SimpleNamespace(KPipeline=FakePipeline))
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
