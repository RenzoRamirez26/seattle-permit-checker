"""The writing rules that must not drift (CONTENT.md), checked on the website copy and the two PDFs.

In: web/src (string literals and JSX text, comments left out), the PDF templates (string constants in checker/pdf.py
and checker/rules_engine.py, whose findings the PDFs print), and the PDFs rendered for the demo plans.
Out: pass/fail. The API's own status values ("pass", "fail", "review") are data, not copy, and are not checked.
"""
from __future__ import annotations

import ast
import json
import re
from pathlib import Path

import pypdfium2 as pdfium
import pytest

from checker import audit, pdf

ROOT = Path(__file__).resolve().parents[1]
BANNED = re.compile(r"\b(?:approved|compliant|invalid|illegal|please|sorry|oops)\b", re.I)
STATUS_WORD = re.compile(r"\b(?:OK|Pass|Passed|PASS)\b")      # as a status label
STATUS_NAMES = ("Fix before you apply", "Check with the city", "No issues found")


def _web_copy(code: str) -> list[str]:
    """String literals and JSX text per line, with comments blanked out (the same reading as the build guard)."""
    code = re.sub(r"/\*[\s\S]*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), code)
    code = re.sub(r"(^|[^:\"'`])//.*$", r"\1", code, flags=re.M)
    out = []
    for line in code.split("\n"):
        bits = [m.group(2) for m in re.finditer(r"([\"'`])((?:\\.|(?!\1)[^\\])*)\1", line)]
        bits += re.findall(r">([^<>{}]*[A-Za-z][^<>{}]*)<", line)
        out.append(" | ".join(bits))
    return out


def test_no_banned_words_in_the_website_copy():
    bad = []
    for path in (ROOT / "web" / "src").rglob("*"):
        if path.suffix not in {".ts", ".tsx"} or path.name.endswith(".d.ts"):
            continue
        for i, copy in enumerate(_web_copy(path.read_text(encoding="utf-8")), 1):
            m = BANNED.search(copy) or STATUS_WORD.search(copy)
            if m:
                bad.append(f"{path.relative_to(ROOT)}:{i}: {m.group(0)}")
    assert bad == []


def _strings(path: Path) -> list[tuple[int, str]]:
    """Every string constant in a Python file except docstrings."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    docstrings = {id(n.body[0].value) for n in ast.walk(tree)
                  if isinstance(n, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
                  and n.body and isinstance(n.body[0], ast.Expr) and isinstance(n.body[0].value, ast.Constant)}
    return [(n.lineno, n.value) for n in ast.walk(tree)
            if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in docstrings]


@pytest.mark.parametrize("name", ["pdf.py", "rules_engine.py"])
def test_no_banned_words_in_the_pdf_templates(name):
    bad = [f"{name}:{line}: {text[:60]!r}" for line, text in _strings(ROOT / "checker" / name)
           if BANNED.search(text) or STATUS_WORD.search(text)]
    assert bad == []


def _text(data: bytes) -> str:
    doc = pdfium.PdfDocument(data)
    return re.sub(r"\s+", " ", " ".join(doc[i].get_textpage().get_text_range() for i in range(len(doc))))


CASES = [
    ("flawed_extraction.json", {"business_type": "cafe_restaurant", "cooking_on_site": True}, "NC2-55 (M)"),
    ("compliant_extraction.json", {"business_type": "cafe_restaurant", "cooking_on_site": True}, "NC2-55 (M)"),
    ("salon_flawed_extraction.json", {"business_type": "salon"}, "NR3"),
]


@pytest.mark.parametrize("extraction, intake, zone", CASES)
def test_the_rendered_pdfs_follow_the_writing_rules(extraction, intake, zone):
    facts = json.loads((ROOT / "demo" / extraction).read_text(encoding="utf-8"))
    result = audit.audit(None, intake, extraction=facts, zoning_override=zone)
    for data in (pdf.report_pdf(result), pdf.permit_sheet_pdf(result)):
        text = _text(data)
        assert not BANNED.search(text), BANNED.search(text).group(0)
        assert not STATUS_WORD.search(text), STATUS_WORD.search(text).group(0)
    report = _text(pdf.report_pdf(result))
    assert "A pre-check from the checks we ran, not a city approval." in report     # the caveat beside the result
    s = result["summary"]
    for name, count in zip(STATUS_NAMES, (s["fails"], s["reviews"], s["passes"])):
        if count:
            assert name in report
