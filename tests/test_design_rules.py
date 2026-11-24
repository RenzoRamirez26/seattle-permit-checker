"""The design rules that must not drift (DESIGN.md), checked from Python as well as by the build guard.

In: web/src/styles/tokens.css (the colour and type tokens), web/src/styles/contrast-pairs.json (every text colour and
the backgrounds it sits on), and the web source. Out: pass/fail. No browser, no network, no key.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

WEB = Path(__file__).resolve().parents[1] / "web"
TOKENS = (WEB / "src" / "styles" / "tokens.css").read_text(encoding="utf-8")
PAIRS = json.loads((WEB / "src" / "styles" / "contrast-pairs.json").read_text(encoding="utf-8"))


def _colours() -> dict[str, str]:
    return {m[1]: m[2] for m in re.finditer(r"--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})", TOKENS)}


def _luminance(hex_colour: str) -> float:
    channels = [int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a: str, b: str) -> float:
    la, lb = _luminance(a), _luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def test_contrast_formula_matches_known_values():
    assert round(contrast("#000000", "#FFFFFF"), 1) == 21.0
    assert round(contrast("#1F4E8C", "#FFFFFF"), 2) == 8.31


def test_every_text_and_background_pair_reaches_4_5_to_1():
    colours = _colours()
    assert PAIRS["minimum"] == 4.5
    low = []
    for fg, bg in PAIRS["pairs"]:
        assert fg in colours and bg in colours, f"no colour token for {fg} or {bg}"
        ratio = contrast(colours[fg], colours[bg])
        if ratio < 4.5:
            low.append(f"{fg} on {bg}: {ratio:.2f}")
    assert low == []


def test_every_text_colour_token_is_checked_on_paper_or_its_own_band():
    texts = {fg for fg, _ in PAIRS["pairs"]}
    for token in ("ink", "ink-muted", "blue", "fix", "white", "hero-text", "hero-muted", "band-text", "band-muted"):
        assert token in texts


def test_the_amber_and_green_tokens_are_gone():
    colours = _colours()
    for gone in ("city", "city-tint", "ok", "ok-tint", "fix-tint"):
        assert gone not in colours
    assert "#7a4f00" not in TOKENS.lower() and "#1e6b3a" not in TOKENS.lower()


def test_the_type_scale_has_at_most_three_sizes():
    sizes = [n for n in re.findall(r"--text-([a-z0-9-]+?)\s*:", TOKENS) if "--" not in n]
    assert len(sizes) <= 3, sizes
    assert set(sizes) == {"title", "heading", "body"}


def test_no_other_type_size_in_the_web_source():
    bad = []
    pattern = re.compile(r"\btext-(?:xs|sm|base|lg|[2-9]?xl)\b|\btext-\[\d|font-size:\s*(?!var\(|100%|inherit)[\d.]+"
                         r"|\bfont:[^;]*?\b\d+(?:\.\d+)?(?:px|rem|em)\b")       # the font shorthand too
    for path in (WEB / "src").rglob("*"):
        if path.suffix in {".ts", ".tsx", ".css"} and not path.name.endswith(".d.ts"):
            for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if pattern.search(line):
                    bad.append(f"{path.relative_to(WEB)}:{i}")
    assert bad == []


def test_no_side_stripe_borders_or_all_caps_labels():
    bad = []
    for path in (WEB / "src").rglob("*.tsx"):
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"\bborder-l-(?:\d|\[)|\buppercase\b|\btracking-(?:wide|wider|widest)\b", line):
                bad.append(f"{path.relative_to(WEB)}:{i}")
    assert bad == []
