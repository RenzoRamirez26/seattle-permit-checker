"""The outline of a zone, for drawing on a map.

In:  a point (longitude, latitude) and the rulebook, which holds the address of Seattle's zoning layer.
Out: a GeoJSON Feature with the zone's shape in longitude/latitude, simplified so it is small enough
     to send to a browser; or None if the city's service does not answer, answers slowly, or sends
     anything unexpected. A missing outline never fails a request.

This is geometry only. It decides nothing: the zoning answer comes from checker/zoning.py.

STATUS: the request is tested with the network mocked. It has NOT been run against the city's
real service yet; the option names (maxAllowableOffset, geometryPrecision, f=geojson) are from
the ArcGIS REST documentation. Remove this note after one real address has returned an outline.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import requests

log = logging.getLogger("api")
TIMEOUT_SECONDS = 10
SIMPLIFY_DEGREES = 0.00005      # about 5 metres in Seattle: plenty for a map, far fewer points
MAX_POINTS = 20000              # an outline larger than this is not sent


def _count_points(coordinates: Any) -> int:
    if isinstance(coordinates, (list, tuple)) and coordinates and isinstance(coordinates[0], (int, float)):
        return 1
    return sum(_count_points(c) for c in coordinates) if isinstance(coordinates, (list, tuple)) else 0


def zone_outline(lon: float, lat: float, rules: dict) -> Optional[dict[str, Any]]:
    """The zone at this point as a GeoJSON Feature, or None on any failure."""
    lookup = rules["zoning"]["lookup"]
    try:
        r = requests.get(lookup["layer"], params={
            "geometry": f"{lon},{lat}", "geometryType": "esriGeometryPoint", "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects", "returnGeometry": "true", "outSR": 4326,
            "maxAllowableOffset": SIMPLIFY_DEGREES, "geometryPrecision": 6,
            "outFields": lookup["district_field"], "f": "geojson",
        }, timeout=TIMEOUT_SECONDS)
        r.raise_for_status()
        features = r.json().get("features") or []
        geometry = features[0].get("geometry") if features else None
        if not geometry or geometry.get("type") not in ("Polygon", "MultiPolygon"):
            return None
        points = _count_points(geometry.get("coordinates"))
        if not 3 <= points <= MAX_POINTS:
            return None
        district = (features[0].get("properties") or {}).get(lookup["district_field"])
        return {"type": "Feature", "geometry": {"type": geometry["type"], "coordinates": geometry["coordinates"]},
                "properties": {"district": district, "source": lookup["source_name"]}}
    except Exception as e:      # no network, a timeout, an error page, a shape we do not expect: the map goes without an outline
        log.warning("zone outline not available: %s: %s", e.__class__.__name__, e)
        return None
