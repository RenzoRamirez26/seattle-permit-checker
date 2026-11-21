"""Site photo notes: what is visibly present in up to four photos of the storefront and interior.

In:  one to four photos as bytes (JPG, PNG or WebP), and for compare_with_plan() the plan reading.
Out: read_photos() returns one note per item in PHOTO_ITEMS:
         {"item", "label", "status", "seen_in"}
     where status is "visible", "not visible in these photos" or "unclear", and seen_in lists
     the photo numbers (1 = the first photo). compare_with_plan() returns sentences asking the
     owner to confirm where a note and the plan reading differ.

These are notes to confirm, not findings. A photo carries no dimensions, so nothing measured
(door widths, aisle widths, turning space) can come from one, and nothing here decides
compliance. The model can answer only with the three fixed statuses and photo numbers: the
schema has no free-text field, so it has nowhere to write a dimension or an opinion, and
every sentence the owner reads is written in this file. This module does not import the rules
engine and never touches an audit result.

Photos are resized in memory and sent to the Claude API. Nothing is written to disk.

Needs ANTHROPIC_API_KEY. Model is set by PERMIT_VISION_MODEL (default claude-sonnet-5-5).

STATUS: the request and the handling of the reply are tested with the API mocked. The model
has NOT been run on real photos from this code yet.
"""
from __future__ import annotations

import base64
import io
import os
from typing import Any, Optional

DEFAULT_MODEL = os.environ.get("PERMIT_VISION_MODEL", "claude-sonnet-5-5")
MAX_PHOTOS = 4
MAX_SIDE_PX = 1568

VISIBLE, NOT_VISIBLE, UNCLEAR = "visible", "not visible in these photos", "unclear"
STATUSES = [VISIBLE, NOT_VISIBLE, UNCLEAR]

# What to look for. The label is what the owner reads.
PHOTO_ITEMS: dict[str, str] = {
    "exit_sign": "Illuminated exit sign",
    "fire_extinguisher": "Fire extinguisher",
    "entrance_step": "Step or threshold at the entrance",
    "sprinkler_heads": "Sprinkler heads on the ceiling",
    "kitchen_hood": "Kitchen exhaust hood",
    "grab_bars": "Restroom grab bars",
}

PHOTO_NOTES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "description": "Exactly one entry for each item you were asked about.",
            "items": {
                "type": "object",
                "properties": {
                    "item": {"type": "string", "enum": list(PHOTO_ITEMS)},
                    "status": {"type": "string", "enum": STATUSES,
                               "description": "visible = you can clearly see it in at least one photo. "
                                              "not visible in these photos = you looked and none of the photos shows it. "
                                              "unclear = something might be it, or the photo is too dark, blurred or far away to tell."},
                    "seen_in": {"type": "array", "items": {"type": "integer"},
                                "description": "Numbers of the photos it is visible in (1 = first photo). Empty unless status is visible."},
                },
                "required": ["item", "status", "seen_in"],
            },
        },
    },
    "required": ["items"],
}

SYSTEM = (
    "You look at photos of a small-business space (storefront and interior) and note whether a "
    "short list of things is visibly present. Report only what can be seen. Do not estimate any "
    "dimension, distance, width, height or count from a photo: photos carry no measurements. "
    "Do not judge compliance: never say or imply that anything meets, fails or violates a code "
    "or a requirement. Do not identify or describe people. If you are not sure, answer unclear. "
    "\"Not visible in these photos\" means only that these photos do not show it, not that the "
    "space lacks it."
)

USER = (
    "There are {n} photo(s), numbered in the order given. For each item below, record with the "
    "record_photo_notes tool whether it is visible, not visible in these photos, or unclear, and "
    "which photo numbers show it.\n{items}"
)


def _photo_block(photo: bytes) -> dict[str, Any]:
    """One photo as an API image block: shrunk if large, re-encoded as JPEG, all in memory."""
    from PIL import Image

    img = Image.open(io.BytesIO(photo)).convert("RGB")
    if max(img.size) > MAX_SIDE_PX:
        img.thumbnail((MAX_SIDE_PX, MAX_SIDE_PX))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)     # re-encoding also drops the location and camera data in the file
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                        "data": base64.b64encode(buf.getvalue()).decode()}}


def clean_notes(raw: Optional[dict], photo_count: int) -> list[dict[str, Any]]:
    """The model's reply as one note per item, in PHOTO_ITEMS order, with anything unexpected turned into 'unclear'.

    An unknown status, a missing item, or 'visible' with no real photo number all become 'unclear':
    a note the owner cannot check against a photo is not reported as seen.
    """
    by_item: dict[str, dict] = {}
    for entry in (raw or {}).get("items") or []:
        if isinstance(entry, dict) and entry.get("item") in PHOTO_ITEMS:
            by_item.setdefault(entry["item"], entry)
    notes = []
    for key, label in PHOTO_ITEMS.items():
        entry = by_item.get(key, {})
        status = entry.get("status") if entry.get("status") in STATUSES else UNCLEAR
        seen = sorted({n for n in entry.get("seen_in") or [] if isinstance(n, int) and not isinstance(n, bool)
                       and 1 <= n <= photo_count})
        if status == VISIBLE and not seen:
            status = UNCLEAR
        notes.append({"item": key, "label": label, "status": status, "seen_in": seen if status == VISIBLE else []})
    return notes


def read_photos(photos: list[bytes], *, client=None, model: str = DEFAULT_MODEL) -> list[dict[str, Any]]:
    """Send one to four photos to the model and return the notes. Raises ValueError for none or more than four."""
    if not photos:
        raise ValueError("Add at least one photo.")
    if len(photos) > MAX_PHOTOS:
        raise ValueError(f"At most {MAX_PHOTOS} photos can be read at once; {len(photos)} were given.")
    if client is None:
        import anthropic

        client = anthropic.Anthropic()
    content: list[dict[str, Any]] = []
    for i, photo in enumerate(photos, 1):
        content += [{"type": "text", "text": f"Photo {i}:"}, _photo_block(photo)]
    content.append({"type": "text", "text": USER.format(
        n=len(photos), items="\n".join(f"- {key}: {label}" for key, label in PHOTO_ITEMS.items()))})
    resp = client.messages.create(
        model=model,
        max_tokens=1000,
        system=SYSTEM,
        tools=[{"name": "record_photo_notes",
                "description": "Record what is visibly present in the photos.",
                "input_schema": PHOTO_NOTES_SCHEMA}],
        tool_choice={"type": "tool", "name": "record_photo_notes"},
        messages=[{"role": "user", "content": content}],
    )
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use":
            return clean_notes(dict(block.input), len(photos))
    raise RuntimeError("Model returned no photo notes.")


# ---------------------------------------------------------------- compare with the plan reading
def _count(n: Any, one: str, many: str) -> Optional[str]:
    """'1 exit sign' / '2 exit signs' when the plan reading shows some, else None."""
    return f"{n} {one if n == 1 else many}" if isinstance(n, (int, float)) and not isinstance(n, bool) and n > 0 else None


def _plan_shows(extraction: dict) -> dict[str, tuple[str, Optional[str]]]:
    """For the items the plan reading also covers: (what a photo would show, what the plan reading shows or None).

    A step at the entrance and grab bars are not in the plan reading, so they are never compared.
    """
    fs = extraction.get("fire_safety") or {}
    kitchen = extraction.get("kitchen") or {}
    return {
        "exit_sign": ("an exit sign", _count(fs.get("exit_signs_shown"), "exit sign", "exit signs")),
        "fire_extinguisher": ("a fire extinguisher",
                              _count(fs.get("fire_extinguishers_shown"), "fire extinguisher", "fire extinguishers")),
        "sprinkler_heads": ("sprinkler heads", "a note that the space has sprinklers" if fs.get("sprinklers_noted") is True else None),
        # a photo cannot tell which type of hood it is, so this says only "an exhaust hood"
        "kitchen_hood": ("an exhaust hood", "a kitchen hood" if kitchen.get("type1_hood_shown") is True else None),
    }


def compare_with_plan(notes: list[dict], extraction: dict) -> list[dict[str, str]]:
    """Where a photo note and the plan reading differ: [{"item", "text"}], each asking the owner to confirm.

    Presence against presence only: no rulebook value, no threshold, no finding. 'unclear' is never a difference.
    """
    plan = _plan_shows(extraction or {})
    out = []
    for note in notes:
        if note["item"] not in plan:
            continue
        seen_as, on_plan = plan[note["item"]]
        if note["status"] == VISIBLE and on_plan is None:
            seen = note["seen_in"]
            where = f"Photo {seen[0]} shows" if len(seen) == 1 else f"Photos {', '.join(map(str, seen[:-1]))} and {seen[-1]} show"
            out.append({"item": note["item"], "text": (
                f"{where} {seen_as}, but the plan reading shows none. The photos show the space as it "
                "is today and the plan shows what is proposed, so both can be true. Please confirm which is right "
                "for the finished space, and correct the plan reading in step 3 if it is wrong.")})
        elif note["status"] == NOT_VISIBLE and on_plan is not None:
            out.append({"item": note["item"], "text": (
                f"The plan reading shows {on_plan}, but none appears in these photos. The photos may simply not "
                "cover it, or it may not be installed yet. Please confirm.")})
    return out
