"""Sort permit descriptions into small-business categories by keyword.

Keyword based on purpose: it is transparent, needs no labels, and is good enough to pull
the group of past permits a new project should be compared with.

Each category needs a word that names the business outright. "kitchen", "lounge" and
"bar" alone do not count: offices have kitchens and lounges, and restrooms have grab bars.
"""
from __future__ import annotations

import re

CATEGORY_PATTERNS: dict[str, str] = {
    "food_drink": (
        r"\brestaurant|\bcaf[eé]\b|\bcoffee|\bespresso|\bbakery|\btavern|\bbrewery|\bbrewpub|\btaproom|"
        r"\bpizz|\beatery|\bdiner\b|\bdeli\b|\bfood service|\bfood hall|\bburger|\btaco|\bsushi|\bramen|"
        r"\bdonut|\bice cream|\bboba|\bsmoothie|\bcommercial kitchen|\btype (i|1) hood|\bgrease (trap|interceptor)"
    ),
    "salon": r"\bsalon\b|\bbarber|\bnail (salon|bar|studio)|\bday spa\b|\bhair (salon|studio)|\besthetic|\bmed(ical)? spa\b",
    "fitness": r"\bfitness\b|\bgym\b|\bgymnasium|\byoga\b|\bpilates|\bcrossfit|\bclimbing gym|\bmartial arts|\bdance studio",
    "retail": r"\bretail\b|\bboutique|\bbookstore|\bgrocery|\bpharmacy|\bmercantile\b|\bshowroom",
}
_RX = {name: re.compile(rx, re.IGNORECASE) for name, rx in CATEGORY_PATTERNS.items()}
CATEGORIES = list(CATEGORY_PATTERNS)

# Which permit category each business type in the rulebook is compared with.
CATEGORY_FOR_BUSINESS = {
    "cafe_restaurant": "food_drink", "bar_taproom": "food_drink", "retail": "retail",
    "salon": "salon", "fitness": "fitness", "office_studio": None,   # None = all categories together
}


def business_category(*texts: str | None) -> str | None:
    """First matching category, checked in the order above (so a café inside a shop is food_drink)."""
    blob = " ".join(t for t in texts if t)
    if not blob:
        return None
    for name, rx in _RX.items():
        if rx.search(blob):
            return name
    return None


def is_food_drink(*texts: str | None) -> bool:
    return business_category(*texts) == "food_drink"
