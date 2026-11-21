"""Zoning: screening a zone for each kind of business, and the address lookup with the network mocked."""
from checker import zoning


def test_classify_common_zones(rules):
    c = lambda d, **kw: zoning.classify(d, rules, business_type="cafe_restaurant", **kw)
    assert c("NC3P-75 (M)")["status"] == "likely_permitted" and c("NC3P-75 (M)")["zone"] == "NC3"   # real layer value
    assert c("NC3P-75 (M)", code="NC3")["zone"] == "NC3"
    assert c("C1-55 (M)")["status"] == "likely_permitted" and c("SM-SLU 175/85-280")["zone"] == "SM"
    assert c("DMC 340/290-440")["status"] == "likely_permitted" and c("DRC 85-170")["zone"] == "DRC"
    assert c("LR3 (M)")["status"] == "not_permitted"
    assert c("LR3 RC (M)")["status"] == "needs_review"
    assert c("LR2 (M)", code="LR2", description="Lowrise 2 Residential-Commercial")["status"] == "needs_review"
    assert c("PSM 100/100-120")["status"] == "needs_review" and c("MML U/85")["status"] == "needs_review"
    assert c("XYZ-9")["status"] == "needs_review" and c(None)["status"] == "unknown" and c("  ")["status"] == "unknown"


def test_size_limits(rules):
    c = lambda d, area: zoning.classify(d, rules, business_type="retail", area_sqft=area)
    assert c("NC1-40 (M)", 2400)["status"] == "likely_permitted" and "within the 10,000 sq ft limit" in c("NC1-40 (M)", 2400)["detail"]
    assert c("NC1-40 (M)", 12000)["status"] == "needs_review" and "over that limit" in c("NC1-40 (M)", 12000)["detail"]
    assert c("NC2-55 (M)", 24000)["status"] == "likely_permitted" and c("NC2-55 (M)", 26000)["status"] == "needs_review"


def test_the_answer_depends_on_the_business(rules):
    c = lambda d, business, area=None: zoning.classify(d, rules, business_type=business, area_sqft=area)
    # Neighborhood Residential allows small restaurants and shops (SMC 23.44.020.E), nothing else
    for business in ("cafe_restaurant", "retail", "salon"):
        assert c("NR3", business, 2400)["status"] == "needs_review", business
        assert "over that limit" in c("NR3", business, 3000)["detail"]
    for business in ("bar_taproom", "office_studio", "fitness"):
        assert c("NR3", business, 2400)["status"] == "not_permitted", business
    # bars need a conditional use in NC1 and NC2, but not in NC3
    assert c("NC2-55 (M)", "bar_taproom")["status"] == "needs_review" and "conditional use" in c("NC2-55 (M)", "bar_taproom")["detail"]
    assert c("NC2-55 (M)", "cafe_restaurant")["status"] == "likely_permitted"
    assert c("NC3-75 (M)", "bar_taproom")["status"] == "likely_permitted"
    assert "salon" in c("NC3-75 (M)", "salon")["detail"] and "fitness studio" in c("NC3-75 (M)", "fitness")["detail"]


def test_lookup_reads_the_seattle_layer(rules, monkeypatch):
    calls = []

    class Resp:
        def __init__(self, payload): self.payload = payload
        def raise_for_status(self): pass
        def json(self): return self.payload

    def fake_get(url, params=None, timeout=None):
        calls.append((url, params))
        if "geocoding.geo.census.gov" in url:
            return Resp({"result": {"addressMatches": [{"coordinates": {"x": -122.3165, "y": 47.616}}]}})
        # attributes copied from the live layer at this point (November 2026)
        return Resp({"features": [{"attributes": {
            "ZONING": "NC3P-75 (M)", "ZONELUT": "NC3", "ZONELUT_DESC": "Neighborhood Commercial 3",
            "CLASS_DESC": "Commercial/Mixed Use", "CATEGORY_DESC": "Neighborhood Commercial", "HISTORIC": " ",
            "PEDESTRIAN": "P", "SHORELINE": " ", "OVERLAY": "PN", "CHAPTER": "Chapter 23.47A",
            "CHAPTER_LINK": "https://library.municode.com/wa/seattle/codes/municipal_code?nodeId=TIT23LAUSCO_SUBTITLE_IIILAUSRE_CH23.47ACO"}}]})

    monkeypatch.setattr(zoning.requests, "get", fake_get)
    z = zoning.check_address("1620 12th Ave, Seattle, WA", rules, business_type="salon", area_sqft=2400)
    assert z["status"] == "likely_permitted" and z["district"] == "NC3P-75 (M)" and z["zone"] == "NC3"
    assert z["overlays"] == {"pedestrian": "P", "other": "PN"} and "municode" in z["code_link"]
    assert "Current_Land_Use_Zoning_Detail" in calls[1][0] and "ZONELUT" in calls[1][1]["outFields"]


def test_lookup_failures_do_not_crash(rules, monkeypatch):
    def offline(*a, **k):
        raise zoning.requests.ConnectionError("no network")

    monkeypatch.setattr(zoning.requests, "get", offline)
    z = zoning.check_address("1 Example St, Seattle, WA", rules)
    assert z["status"] == "unknown" and "Enter the zone by hand" in z["detail"]
    assert zoning.check_address("", rules, "NC2-55 (M)")["source"] == "entered by hand"
