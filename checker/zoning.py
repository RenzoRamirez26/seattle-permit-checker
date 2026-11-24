"""Zoning check for a Seattle address.

1. Geocode the address with the free US Census geocoder (no key needed).
2. Query the city's zoning layer at that point. The layer URL and its field names are in
   the rulebook (zoning.lookup).
3. Screen the zone against the rulebook for the kind of business: each zone has a status,
   a note, an optional size limit, and optional per-use exceptions.

The result is a first screen, not a zoning determination.

STATUS: the screening is tested, and the lookup is tested with the network mocked using a
real response from the layer. No live lookup has been run from this code yet.
"""
from __future__ import annotations

import re
from typing import Any, Optional

import requests

from .rules_engine import business

CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"


def geocode(address: str) -> Optional[tuple[float, float]]:
    r = requests.get(CENSUS, params={"address": address, "benchmark": "Public_AR_Current", "format": "json"}, timeout=30)
    r.raise_for_status()
    matches = r.json().get("result", {}).get("addressMatches", [])
    if not matches:
        return None
    c = matches[0]["coordinates"]
    return c["x"], c["y"]  # lon, lat


def lookup_district(lon: float, lat: float, rules: dict) -> Optional[dict[str, Any]]:
    """Attributes of the zoning polygon at a point, or None if nothing is there."""
    lk = rules["zoning"]["lookup"]
    r = requests.get(lk["layer"], params={
        "geometry": f"{lon},{lat}", "geometryType": "esriGeometryPoint", "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects", "returnGeometry": "false", "f": "json",
        "outFields": lk["out_fields"],
    }, timeout=30)
    r.raise_for_status()
    feats = r.json().get("features", [])
    return feats[0]["attributes"] if feats else None


def _unknown(z: dict) -> dict[str, Any]:
    return {"district": None, "status": "unknown",
            "detail": "Could not find a zoning district for this address.",
            "fix": f"Look the parcel up on {z['map_name']}."}


def _zone_key(code: str, zones: dict) -> Optional[str]:
    """Longest zone key the code starts with: 'NC2P-55 (M)' -> 'NC2', 'NR3' -> 'NR'."""
    for key in sorted(zones, key=len, reverse=True):
        if code.startswith(key):
            return key
    return None


def classify(district: Optional[str], rules: dict, *, business_type: Optional[str] = None,
             code: Optional[str] = None, area_sqft: Optional[float] = None,
             description: Optional[str] = None) -> dict[str, Any]:
    """Screen a zone string (as printed on the zoning map) for one kind of business.

    `code` is the short zone code when the layer provides one (ZONELUT). `area_sqft` lets
    zones with a size limit be checked against the plan.
    """
    z = rules["zoning"]
    if not (district or "").strip():
        return _unknown(z)
    bt = business(rules, business_type)
    use_key, use = bt["zoning_use"], bt["zoning_use_label"]
    full = district.upper().strip()
    key = _zone_key((code or full).upper().strip(), z["zones"]) or _zone_key(full, z["zones"])
    contact = z["contact"]
    if not key:
        return {"district": full, "status": "needs_review",
                "detail": f"{full} is not in this rulebook, so it could not be screened for a {use}.",
                "fix": f"Ask {contact} whether a {use} is allowed here before signing a lease."}

    entry = z["zones"][key]
    status, note, cite = entry["status"], entry.get("note", ""), entry.get("cite")
    out: dict[str, Any] = {"district": full, "zone": key, "use": use, "cite": cite}

    # a zone that lists the only uses it allows (Neighborhood Residential)
    if entry.get("only_uses") and use_key not in entry["only_uses"]:
        return out | {"status": "not_permitted",
                      "detail": f"{note} A {use} is not one of the uses allowed here.",
                      "fix": f"Choose a different site, or talk to {contact} about your options."}
    # a per-use exception inside an otherwise permissive zone (bars in NC1 and NC2)
    override = (entry.get("uses") or {}).get(use_key)
    if override:
        status, note = override["status"], f"{note} {override['note']}".strip()

    marker = z.get("residential_commercial_marker")
    is_rc = bool(marker) and (bool(re.search(rf"\b{re.escape(marker)}\b", full))
                              or "residential-commercial" in (description or "").lower())
    if is_rc and status != "likely_permitted":
        status, note = z["residential_commercial_status"], z["residential_commercial_note"]

    limit = entry.get("max_sqft")
    if limit and area_sqft and area_sqft > limit and status != "not_permitted":
        return out | {"status": "needs_review",
                      "detail": f"{note} This plan is {area_sqft:,.0f} sq ft, over that limit.",
                      "fix": f"Reduce the floor area to {limit:,} sq ft or less, or ask {contact} about a conditional use."}
    size = f" This plan is {area_sqft:,.0f} sq ft, within the {limit:,} sq ft limit." if limit and area_sqft else ""
    if status == "likely_permitted":
        return out | {"status": status,
                      "detail": f"{note} A {use} is generally allowed.{size} Confirm overlays, "
                                f"pedestrian-street rules and any change-of-use requirement."}
    if status == "not_permitted":
        return out | {"status": status,
                      "detail": f"{note} A {use} is generally not a permitted use.",
                      "fix": f"Choose a different site, or talk to {contact} about your options (a land use approval can take 5 to 7 months)."}
    return out | {"status": "needs_review",
                  "detail": f"{note}{size}",
                  "fix": f"Confirm the use with {contact} before signing a lease."}


def check_address(address: str, rules: dict, district_override: Optional[str] = None, *,
                  business_type: Optional[str] = None, area_sqft: Optional[float] = None) -> dict[str, Any]:
    z = rules["zoning"]
    lk = z["lookup"]
    if district_override:
        return classify(district_override, rules, business_type=business_type, area_sqft=area_sqft) | \
            {"address": address, "source": "entered by hand"}
    try:
        pt = geocode(address)
        if not pt:
            return _unknown(z) | {"address": address, "detail": "We couldn't find this address on the map. Enter the zone by hand."}
        attrs = lookup_district(*pt, rules) or {}
        result = classify(attrs.get(lk["district_field"]), rules, business_type=business_type,
                          code=attrs.get(lk["code_field"]), area_sqft=area_sqft,
                          description=attrs.get(lk["description_field"]))
        overlays = {name: (attrs.get(field) or "").strip() for name, field in lk["overlay_fields"].items()}
        return result | {"address": address, "lon": pt[0], "lat": pt[1],
                         "description": attrs.get(lk["description_field"]),
                         "overlays": {k: v for k, v in overlays.items() if v},
                         "code_link": attrs.get(lk["chapter_link_field"]),
                         "source": lk["source_name"]}
    except requests.RequestException as e:
        return _unknown(z) | {"address": address,
                              "detail": f"We couldn't look up the zoning ({e.__class__.__name__}). Enter the zone by hand."}
