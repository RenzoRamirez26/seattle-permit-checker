"""Shared test helpers."""
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from checker import rules_engine

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"


@pytest.fixture(scope="session")
def rules():
    return rules_engine.load_rules()


@pytest.fixture
def load():
    """load("flawed") -> the ground-truth reading of demo/flawed_plan.png (a fresh copy each time)."""
    def _load(name):
        return json.loads((ROOT / "demo" / f"{name}_extraction.json").read_text(encoding="utf-8"))
    return _load


def ids(result, status):
    return {f["rule_id"] for f in result["findings"] if f["status"] == status}


class FakeClient:
    """Stands in for anthropic.Anthropic(): records the request and returns a canned reply."""

    def __init__(self, tool_input=None, text=None, error=None):
        self.tool_input, self.text, self.error, self.kwargs = tool_input, text, error, None
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        self.kwargs = kw
        if self.error:
            raise self.error
        content = []
        if self.tool_input is not None:
            content.append(SimpleNamespace(type="tool_use", input=self.tool_input))
        if self.text is not None:
            content.append(SimpleNamespace(type="text", text=self.text))
        return SimpleNamespace(content=content)
