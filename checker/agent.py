"""The agent: answers an owner's questions about their pre-check, in plain language.

In:  a question (typed, or transcribed from speech by voice.py) and one audit result.
Out: a short answer that can be shown or spoken, with the rule ids it relied on.

How it stays reliable: it is not trained on anything and it does not decide compliance.
It is given the audit result (the facts read from the plan, the findings, the permits,
Seattle's review data) and told to answer only from that. check_grounded() then rejects
an answer that cites a rule or code section the audit does not contain, and the template
answer is used instead.

Without ANTHROPIC_API_KEY the template answers every question, so the app still works.

STATUS: the request and the grounding check are tested with the API mocked. No real
model call has been made from this code yet.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Optional

DEFAULT_MODEL = os.environ.get("PERMIT_AGENT_MODEL", "claude-sonnet-5-5")
MAX_HISTORY_TURNS = 6

SYSTEM = (
    "You explain a permit pre-check to a small-business owner in Seattle. They are not an "
    "architect. Answer only from the audit inside the <audit> tags: the facts read from their "
    "floor plan, the findings, the permit list and the city's review data.\n"
    "- When you rely on a finding, put its rule id in square brackets, like [EG-1].\n"
    "- Quote code sections only as they appear in the audit. Never add a section, number or "
    "requirement that is not there.\n"
    "- If the audit does not answer the question, say so and name who to ask, using the "
    "agencies listed in the audit.\n"
    "- This is a pre-submission check, not a code determination. Do not tell them the plan "
    "will be approved.\n"
    "- Your answer may be read aloud: two to five plain sentences, no lists, no markdown."
)

# Words in a question -> rule-id families, used by the template answer.
TOPICS = {
    "EG": ("exit", "door", "egress", "swing", "way out"),
    "ADA": ("accessib", "wheelchair", "ada", "aisle", "turning", "seat"),
    "PL": ("toilet", "restroom", "bathroom", "lavator", "plumb"),
    "FS": ("sprinkler", "fire", "extinguisher", "alarm", "exit sign"),
    "MECH": ("hood", "kitchen", "cook", "fryer", "range", "grill"),
    "HLTH": ("health", "sink", "hand", "food"),
    "ZN": ("zon", "allowed here", "location", "address", "lease"),
    "OCC": ("occupan", "how many people", "capacity"),
}
_STOPWORDS = {"what", "when", "where", "which", "does", "need", "have", "that", "this", "with", "about", "should",
              "would", "could", "there", "plan", "problem", "problems", "wrong", "okay", "pass", "fail", "much",
              "many", "more", "tell", "show", "shown", "enough", "required", "from", "your", "mine"}
_RULE_ID = re.compile(r"\[([A-Z]{2,5}-\d+)\]")
_SECTION = re.compile(r"\b(?:SBC|SMC|IBC|ADA)\s+(?:Table\s+|Chapter\s+|Section\s+)?\d[\w.]*", re.I)


# ---------------------------------------------------------------- context
def build_context(result: dict, examples: Optional[list[dict]] = None) -> str:
    """The audit, trimmed to what an answer needs, as JSON."""
    ctx: dict[str, Any] = {
        "summary": result["summary"],
        "findings": [{k: f[k] for k in ("rule_id", "title", "status", "severity", "detail", "fix", "citation", "reviewed_by")}
                     for f in result["findings"]],
        "permits_likely_required": result["permits_likely_required"],
        "occupant_load_by_space": result["occupant_load"]["by_space"],
        "toilets_required": result.get("fixtures_required"),
        "code_basis": result["code_basis"],
        "disclaimer": result["disclaimer"],
    }
    if result.get("zoning"):
        ctx["zoning"] = {k: result["zoning"].get(k) for k in ("district", "status", "detail", "fix", "overlays")}
    if result.get("local_review_data"):
        d = result["local_review_data"]
        ctx["seattle_review_records"] = {k: d.get(k) for k in ("category_label", "source", "summary",
                                                               "corrections_by_review_type", "top_comment_subjects")}
    if examples:
        ctx["real_reviewer_comments"] = [{k: e.get(k) for k in ("review_type", "subject_raw", "comment")} for e in examples]
    return json.dumps(ctx, indent=1, default=str)


# ---------------------------------------------------------------- template (no model)
def _say(f: dict) -> str:
    fix = f" {f['fix']}" if f.get("fix") else ""
    return f"{f['title']}: {f['detail']}{fix} [{f['rule_id']}]"


def spoken_summary(result: dict, limit: int = 3) -> str:
    """A short spoken overview of the result. No model involved."""
    s = result["summary"]
    open_items = [f for f in result["findings"] if f["status"] != "pass"]
    if not open_items:
        return (f"I checked this {s['business_label'].lower()} plan and found nothing to fix on the items I check. "
                f"The occupant load is {s['occupant_load']}. {result['disclaimer']}")
    head = (f"I found {s['fails']} problem{'s' if s['fails'] != 1 else ''} and {s['reviews']} "
            f"item{'s' if s['reviews'] != 1 else ''} to confirm. The occupant load is {s['occupant_load']}, "
            f"which makes this Group {s['occupancy_group']}. The most serious: ")
    top = " ".join(f"{f['title']}. [{f['rule_id']}]" for f in open_items[:limit])
    more = f" There are {len(open_items) - limit} more in the fix list." if len(open_items) > limit else ""
    return head + top + more


def template_answer(question: str, result: dict) -> str:
    """Answer from the findings by matching the question's topic. Used with no API key and as the fallback."""
    q = question.lower()
    if any(w in q for w in ("permit", "licen", "approval", "who do i", "which agenc")):
        names = "; ".join(f"{p['name']} from {p['agency']}" for p in result["permits_likely_required"][:5])
        more = len(result["permits_likely_required"]) - 5
        return f"You will likely need: {names}" + (f"; and {more} more in the permit list." if more > 0 else ".")
    if any(w in q for w in ("how long", "how many rounds", "wait", "timeline", "delay")):
        d = result.get("local_review_data")
        if d:
            sm = d["summary"]
            return (f"In Seattle's records, {sm['share_two_or_more_rounds']:.0%} of {sm['permits']} {d['category_label']} "
                    f"build-outs needed two or more review rounds, and half spent {sm['median_days_in_review']:g} "
                    f"days or more in plan review.")
        return "I have no Seattle review data loaded, so I cannot say how long review takes. Run the data pipeline first."
    families = [fam for fam, words in TOPICS.items() if any(w in q for w in words)]
    words = set(re.findall(r"[a-z]{4,}", q)) - _STOPWORDS
    hits = [f for f in result["findings"]
            if f["rule_id"].split("-")[0] in families or any(w in f["title"].lower() for w in words)]
    open_hits = [f for f in hits if f["status"] != "pass"]
    if open_hits:
        return " ".join(_say(f) for f in open_hits[:3])
    if hits:
        return "That part passed. " + " ".join(f"{f['title']}: {f['detail']} [{f['rule_id']}]" for f in hits[:2])
    return spoken_summary(result)


# ---------------------------------------------------------------- grounding check
def check_grounded(text: str, result: dict) -> list[str]:
    """Things the answer cites that the audit does not contain. Empty list = grounded."""
    known_rules = {f["rule_id"] for f in result["findings"]}
    haystack = build_context(result).lower()
    problems = [f"unknown rule id {r}" for r in _RULE_ID.findall(text) if r not in known_rules]
    for section in _SECTION.findall(text):
        if section.lower().rstrip(".") not in haystack:
            problems.append(f"code section not in the audit: {section}")
    return problems


# ---------------------------------------------------------------- answer
def answer(question: str, result: dict, *, client=None, model: str = DEFAULT_MODEL,
           history: Optional[list[dict]] = None, examples: Optional[list[dict]] = None) -> dict[str, Any]:
    """Answer one question about one audit.

    Returns {"text", "cited_rules", "generated_by", "problems"}. generated_by is the model
    name, or "template" when no model was used or its answer failed the grounding check.
    """
    question = (question or "").strip()
    if not question:
        return _out(spoken_summary(result), "template", [])
    if client is None and not os.environ.get("ANTHROPIC_API_KEY"):
        return _out(template_answer(question, result), "template", [])
    try:
        if client is None:
            import anthropic

            client = anthropic.Anthropic()
        messages = [{"role": m["role"], "content": m["content"]} for m in (history or [])[-MAX_HISTORY_TURNS:]]
        messages.append({"role": "user",
                         "content": f"<audit>\n{build_context(result, examples)}\n</audit>\n\nQuestion: {question}"})
        resp = client.messages.create(model=model, max_tokens=500, system=SYSTEM, messages=messages)
        text = " ".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
    except Exception as e:  # network, key or quota trouble must not break the demo
        return _out(template_answer(question, result), "template", [f"model call failed: {e.__class__.__name__}"])
    problems = check_grounded(text, result)
    if not text or problems:
        return _out(template_answer(question, result), "template", problems or ["empty answer"])
    return _out(text, model, [])


def _out(text: str, generated_by: str, problems: list[str]) -> dict[str, Any]:
    return {"text": text, "cited_rules": sorted(set(_RULE_ID.findall(text))),
            "generated_by": generated_by, "problems": problems}


# ---------------------------------------------------------------- wording for a voice
# A voice reads "32 in." as the word "in" and "SBC 1010.1.1" as a long number. for_speech()
# rewrites these the way a person would say them. Only the spoken copy changes; the text
# on the page (and the text check_grounded() sees) keeps the exact citation.
_CODE_NAMES = {"SBC": "Seattle Building Code", "SMC": "Seattle Municipal Code", "IBC": "International Building Code",
               "ADA": "A.D.A.", "ICC": "I.C.C."}
_NUMBER = r"[A-Z]?\d[\w.]*"
_SPOKEN_SECTION = re.compile(
    rf"\b({'|'.join(_CODE_NAMES)})\s+(?:(Table|Chapter|Section)\s+)?({_NUMBER})"
    rf"((?:\s*(?:,|and|or)\s+\d{{3,4}}(?:\.\w+)+)*)")           # "ADA 304.3.1 and 603.2.1"
_BARE_SECTION = re.compile(rf"\b(Table|Chapter|Section)\s+({_NUMBER})", re.I)
_SENTENCE_END = r"(?=\s+[A-Z(]|\s*$)"                             # the unit's full stop also ended the sentence
_UNITS = [
    (re.compile(r"(\d[\d,.]*)\s?(?:sq\.?\s?ft|sqft)\b\.?"), "square foot", "square feet"),
    (re.compile(r"(\d[\d,.]*)\s?ft\b\.?"), "foot", "feet"),
    (re.compile(r"(\d[\d,.]*)\s?in\."), "inch", "inches"),      # only with the full stop: "2 in the list" is a word
]
_ONES = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
         "sixteen seventeen eighteen nineteen").split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def _two_digits(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return _TENS[n // 10] + (f"-{_ONES[n % 10]}" if n % 10 else "")


def _pair(digits: str) -> str:
    """The last two digits of a section number: 10 -> ten, 04 -> oh four, 00 -> hundred."""
    n = int(digits)
    return "hundred" if n == 0 else f"oh {_ONES[n]}" if n < 10 else _two_digits(n)


def _say_number(part: str) -> str:
    """One dot-separated piece of a section number, the way reviewers say it: 1010 -> ten ten, 2902 -> twenty-nine oh two."""
    m = re.fullmatch(r"([A-Za-z]*)(\d*)([A-Za-z]*)", part)
    if not m:
        return part
    before, digits, after = m.groups()
    if not digits:
        said = ""
    elif digits.startswith("0") or len(digits) > 4:
        said = " ".join(_ONES[int(d)] for d in digits)
    elif len(digits) <= 2:
        said = _two_digits(int(digits))
    elif len(digits) == 3:
        said = f"{_ONES[int(digits[0])]} {_pair(digits[1:])}"
    else:
        said = f"{_two_digits(int(digits[:2]))} {_pair(digits[2:])}"
    return " ".join(x for x in (before.upper(), said, after.upper()) if x)


def _say_section(number: str) -> tuple[str, str]:
    """('ten ten point one point one', trailing full stop if the number ended the sentence)."""
    stop = "." if number.endswith(".") else ""
    return " point ".join(_say_number(p) for p in number.rstrip(".").split(".")), stop


def _spoken_section(m: re.Match) -> str:
    code, kind, number, more = m.groups()
    said, stop = _say_section(number)
    out = f"{_CODE_NAMES[code]} {(kind or 'section').lower()} {said}"
    for joiner, extra in re.findall(r"(,|and|or)\s+(\S+)", more or ""):
        said, stop = _say_section(extra)
        out += ("," if joiner == "," else f" {joiner}") + f" {said}"
    return out + stop


def _bare_section(m: re.Match) -> str:
    said, stop = _say_section(m.group(2))
    return f"{m.group(1).lower()} {said}{stop}"


def for_speech(text: str) -> str:
    """The same answer, worded for a voice: no rule ids or markdown, units and code sections spelled out.

    "32 in." -> "32 inches", "800 sq ft" -> "800 square feet",
    "SBC 1010.1.1" -> "Seattle Building Code section ten ten point one point one".
    """
    text = re.sub(r"[*_#`]", "", _RULE_ID.sub("", text))
    text = _BARE_SECTION.sub(_bare_section, _SPOKEN_SECTION.sub(_spoken_section, text))
    for pattern, one, many in _UNITS:
        def unit(m: re.Match, one=one, many=many) -> str:
            stop = "." if m.group(0).endswith(".") and re.match(_SENTENCE_END, m.string[m.end():]) else ""
            before_noun = re.search(r"\b(?:a|an)\s$", m.string[:m.start()], re.I)     # "a 36 in. door" -> "a 36 inch door"
            return f"{m.group(1)} {one if m.group(1) == '1' or before_noun else many}{stop}"
        text = pattern.sub(unit, text)
    text = text.replace("&", " and ").replace("e.g.", "for example")
    text = re.sub(r"\b1 (\w+)\((?:s|ies)\)", r"1 \1", text)               # "1 exit(s)" -> "1 exit"
    text = re.sub(r"y\(ies\)", "ies", text).replace("(s)", "s")           # "2 exit(s)", "2 lavatory(ies)"
    text = re.sub(r"(?<=\d)/(?=\d)", " ", text)                           # "50/50 split"
    text = re.sub(r"(?<=[A-Za-z])\s?/\s?(?=[A-Za-z])", " or ", text)       # "addition/alteration"
    text = re.sub(r"\s+([.,;:?!])", r"\1", text)                          # the gap a removed rule id leaves
    return re.sub(r"\s{2,}", " ", text).strip()
