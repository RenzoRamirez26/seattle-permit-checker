"""The website (web/) holds no rules: the build guard, run from python -m pytest so it holds whichever test command is run.

Also checks that the front end's generated API types and its test fixtures match the API as it is now.
Needs Node.js (and web/node_modules for the types check); skipped where Node.js is not installed.
"""
import json
import shutil
import subprocess
import sys

import pytest

from tests.conftest import ROOT

WEB = ROOT / "web"
GUARD = WEB / "scripts" / "guard.mjs"
NODE = shutil.which("node")
needs_node = pytest.mark.skipif(NODE is None, reason="Node.js is not installed")


def _guard(*args):
    return subprocess.run([NODE, str(GUARD), *map(str, args)], capture_output=True, text=True, cwd=WEB)


@needs_node
def test_the_front_end_source_passes_the_guard():
    r = _guard("src")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "src is clean" in r.stdout


PLANTED = {
    "a code number": ("src/content/planted.ts", 'export const tip = "Doors must be 32 in. wide";\n', "code-number"),
    "a code section": ("src/content/planted2.ts", 'export const cite = "See IBC 1010.1.1";\n', "code-section"),
    "a status decided in TypeScript": ("src/components/plan/planted.ts",
                                       'export const s = (d: { clear_width_in: number }) => d.clear_width_in < 30 ? "fail" : "pass";\n',
                                       "decision"),
    "a status literal outside status.ts": ("src/components/plan/planted3.ts", 'export const s = "review";\n', "status-literal"),
    "an anthropic import": ("src/api/planted.ts", 'import Anthropic from "@anthropic-ai/sdk";\nexport const c = new Anthropic();\n', "model-call"),
    "a request to another host": ("src/api/planted4.ts", 'export const r = () => fetch("https://example.com/x");\n', "other-host"),
    "browser speech recognition": ("src/voice/planted.ts", "export const r = new window.webkitSpeechRecognition();\n", "speech-recognition"),
    "speech recognition that may leave the device": ("src/voice/planted6.ts", "export const off = (r: { processLocally: boolean }) => { r.processLocally = false; };\n", "speech-not-local"),
    "model output as HTML": ("src/components/planted.tsx", "export const A = (p: { t: string }) => <div dangerouslySetInnerHTML={{ __html: p.t }} />;\n", "raw-html"),
    "a rulebook import": ("src/content/planted5.ts", 'import rules from "../../../checker/rules/seattle.json";\nexport default rules;\n', "rulebook-import"),
}


@needs_node
@pytest.mark.parametrize("what", list(PLANTED))
def test_the_guard_fails_on_a_planted_file(tmp_path, what):
    path, text, rule = PLANTED[what]
    copy = tmp_path / "src"
    shutil.copytree(WEB / "src", copy)
    planted = copy / path.removeprefix("src/")
    planted.parent.mkdir(parents=True, exist_ok=True)
    planted.write_text(text, encoding="utf-8")
    r = _guard("src", copy)
    assert r.returncode == 1, r.stdout
    assert rule in r.stderr and planted.name in r.stderr and ":1:" in r.stderr


@needs_node
def test_the_guard_finds_a_key_in_the_built_site(tmp_path):
    (tmp_path / "index.html").write_text("<script>const k='sk-ant-xyz'</script>", encoding="utf-8")
    r = _guard("out", tmp_path)
    assert r.returncode == 1 and "key-in-build" in r.stderr


@needs_node
@pytest.mark.skipif(not (WEB / "node_modules" / ".bin" / "openapi-typescript").exists(), reason="run npm ci in web/ first")
def test_the_generated_api_types_match_the_api():
    r = subprocess.run(["sh", "scripts/openapi.sh", "--check"], capture_output=True, text=True, cwd=WEB,
                       env={"PATH": __import__("os").environ["PATH"], "PYTHON": sys.executable})
    assert r.returncode == 0, r.stdout + r.stderr


def test_the_front_end_fixtures_match_the_api():
    r = subprocess.run([sys.executable, "web/scripts/make-fixtures.py", "--check"], capture_output=True, text=True, cwd=ROOT)
    assert r.returncode == 0, r.stdout + r.stderr


@needs_node
def test_the_guard_requires_on_device_recognition_to_stay_on_the_device(tmp_path):
    """src/voice/ondevice.ts, the one file that may use SpeechRecognition, must set processLocally = true."""
    copy = tmp_path / "src"
    shutil.copytree(WEB / "src", copy)
    od = copy / "voice" / "ondevice.ts"
    od.write_text(od.read_text(encoding="utf-8").replace("r.processLocally = true;", "r.lang = LANGS[0];"), encoding="utf-8")
    r = _guard("src", copy)
    assert r.returncode == 1 and "speech-not-local" in r.stderr and "ondevice.ts" in r.stderr


def test_both_static_hosts_send_the_same_security_headers():
    """vercel.json and netlify.toml (either host may be used) carry the same headers, and they include what the launch
    needs: frame-ancestors none, HSTS, nosniff, a referrer policy and microphone for the site only."""
    import tomllib

    vercel = {h["key"]: h["value"] for h in json.loads((WEB / "vercel.json").read_text())["headers"][0]["headers"]}
    netlify = tomllib.loads((WEB / "netlify.toml").read_text())["headers"][0]["values"]
    assert vercel == netlify
    assert "frame-ancestors 'none'" in vercel["Content-Security-Policy"]
    assert vercel["Strict-Transport-Security"].startswith("max-age=") and vercel["X-Content-Type-Options"] == "nosniff"
    assert "microphone=(self)" in vercel["Permissions-Policy"] and "camera=()" in vercel["Permissions-Policy"]
    assert vercel["Referrer-Policy"] == "strict-origin-when-cross-origin"
