"""Vision step: turn a floor plan image or PDF into structured facts.

The model only reports what it can read off the drawing. It never decides
whether anything complies; that is rules_engine.py's job.

Needs ANTHROPIC_API_KEY in the environment. Model is set by PERMIT_VISION_MODEL
(default claude-sonnet-5-5).

STATUS: the request is tested with the API mocked. No real model has read the demo plans
from this code yet; run `python -m evaluation.evaluate_extraction --vision` to do that.
"""
from __future__ import annotations

import base64
import io
import json
import os
from pathlib import Path
from typing import Any

DEFAULT_MODEL = os.environ.get("PERMIT_VISION_MODEL", "claude-sonnet-5-5")
MAX_SIDE_PX = 2000

_NUM = {"type": ["number", "null"]}
_INT = {"type": ["integer", "null"]}
_BOOL = {"type": ["boolean", "null"]}

# Uses the rules engine has an occupant load factor for, plus the accessory ones it skips.
SPACE_USES = ["dining", "standing", "counter_service", "kitchen", "retail", "service", "exercise", "waiting",
              "office", "storage", "restroom", "corridor", "other"]

FLOOR_PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "plan_title": {"type": ["string", "null"]},
        "scale_note": {"type": ["string", "null"], "description": "Scale text printed on the plan, if any."},
        "overall_width_ft": _NUM,
        "overall_length_ft": _NUM,
        "gross_area_sqft": {**_NUM, "description": "Total tenant area. Use a printed figure if present, else width x length."},
        "spaces": {
            "type": "array",
            "description": "Every room or zone drawn on the plan.",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "use": {"type": "string", "enum": SPACE_USES,
                            "description": "dining = tables and chairs; standing = bar or queue area; "
                                           "counter_service = order counter; retail = sales floor; "
                                           "service = salon or treatment floor; exercise = gym floor or studio; "
                                           "waiting = reception or waiting area."},
                    "area_sqft": _NUM,
                    "width_ft": _NUM,
                    "length_ft": _NUM,
                },
                "required": ["name", "use", "area_sqft"],
            },
        },
        "seat_count": {**_INT, "description": "Seats drawn or stated."},
        "accessible_seat_count": {**_INT, "description": "Seats or tables marked accessible / wheelchair."},
        "doors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "location": {"type": "string", "description": "e.g. 'front entry, south wall'"},
                    "clear_width_in": _NUM,
                    "is_exit": {"type": "boolean", "description": "True if the door leads outside or to an exit path."},
                    "swing": {"type": "string", "enum": ["outward", "inward", "sliding", "unknown"],
                              "description": "For exit doors: outward = swings in the direction of travel out of the space."},
                    "serves": {"type": ["string", "null"], "description": "Room the door serves, e.g. 'Restroom 1'."},
                },
                "required": ["label", "clear_width_in", "is_exit", "swing"],
            },
        },
        "aisles": {
            "type": "array",
            "description": "Aisles, corridors and paths between furniture with a readable width.",
            "items": {
                "type": "object",
                "properties": {"label": {"type": "string"}, "min_width_in": _NUM},
                "required": ["label", "min_width_in"],
            },
        },
        "restrooms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "designation": {"type": "string", "enum": ["men", "women", "all_gender", "unknown"]},
                    "water_closets": _INT,
                    "urinals": _INT,
                    "lavatories": _INT,
                    "turning_circle_diameter_in": {**_NUM, "description": "Diameter of the clear turning circle drawn or dimensioned."},
                    "door_clear_width_in": _NUM,
                },
                "required": ["label", "designation", "water_closets", "lavatories"],
            },
        },
        "kitchen": {
            "type": "object",
            "properties": {
                "cooking_appliances": {"type": "array", "items": {"type": "string"},
                                       "description": "Appliances shown: range, fryer, griddle, oven, espresso machine..."},
                "grease_producing_cooking": {**_BOOL, "description": "True if a range, fryer, griddle, grill or similar is shown."},
                "type1_hood_shown": _BOOL,
                "hand_sinks": _INT,
                "three_compartment_sink": _BOOL,
                "mop_or_service_sink": _BOOL,
                "grease_interceptor_shown": _BOOL,
            },
        },
        "fire_safety": {
            "type": "object",
            "properties": {
                "exit_signs_shown": _INT,
                "fire_extinguishers_shown": _INT,
                "class_k_extinguisher_shown": _BOOL,
                "sprinklers_noted": _BOOL,
                "emergency_lighting_noted": _BOOL,
            },
        },
        "outdoor_seating_shown": _BOOL,
        "uncertainties": {
            "type": "array", "items": {"type": "string"},
            "description": "Anything you could not read, had to estimate, or that looks inconsistent.",
        },
    },
    "required": ["spaces", "doors", "restrooms", "uncertainties"],
}

SYSTEM = (
    "You read architectural floor plans for a small-business permit pre-check. "
    "Report only what is drawn or written on the plan. Read dimensions from printed "
    "labels and dimension strings; do not estimate a dimension by eye unless a scale "
    "bar lets you measure it, and say so in `uncertainties` when you do. Use null for "
    "anything you cannot read. Do not judge whether anything meets code."
)

USER = (
    "Extract the facts from this floor plan with the record_floor_plan tool.\n"
    "- List every room with its use and area (compute width x length when both are printed).\n"
    "- List every door with its clear width in inches, whether it is an exit, and its swing.\n"
    "- List aisle and corridor widths that are dimensioned, including gaps between tables, shelves or stations.\n"
    "- For each restroom: fixtures, door width and turning-circle diameter.\n"
    "- Note any kitchen equipment, hood and sinks, plus exit signs, extinguishers and sprinkler notes.\n"
    "Business context from the owner: {context}"
)


def load_image_b64(path: str | Path) -> tuple[str, str]:
    """Return (media_type, base64) for a PNG/JPG/WebP image or the first page of a PDF."""
    from PIL import Image

    p = Path(path)
    if p.suffix.lower() == ".pdf":
        import pypdfium2 as pdfium

        page = pdfium.PdfDocument(str(p))[0]
        img = page.render(scale=2.5).to_pil()
    else:
        img = Image.open(p)
    img = img.convert("RGB")
    if max(img.size) > MAX_SIDE_PX:
        img.thumbnail((MAX_SIDE_PX, MAX_SIDE_PX))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "image/png", base64.b64encode(buf.getvalue()).decode()


def extract_floor_plan(path: str | Path, context: str = "", *, client=None, model: str = DEFAULT_MODEL) -> dict[str, Any]:
    """Send the plan to Claude and return the structured extraction."""
    if client is None:
        import anthropic

        client = anthropic.Anthropic()
    media_type, data = load_image_b64(path)
    resp = client.messages.create(
        model=model,
        max_tokens=4000,
        system=SYSTEM,
        tools=[{
            "name": "record_floor_plan",
            "description": "Record the facts read from the floor plan.",
            "input_schema": FLOOR_PLAN_SCHEMA,
        }],
        tool_choice={"type": "tool", "name": "record_floor_plan"},
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}},
                {"type": "text", "text": USER.format(context=context or "none given")},
            ],
        }],
    )
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use":
            return dict(block.input)
    raise RuntimeError("Model returned no structured extraction.")


if __name__ == "__main__":
    import sys

    print(json.dumps(extract_floor_plan(sys.argv[1], " ".join(sys.argv[2:])), indent=2))
