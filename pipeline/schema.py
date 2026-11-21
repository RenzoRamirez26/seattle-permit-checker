"""One permit, as stored in the database.

Column names are kept from the project's first version. The last block holds the
plan-review timing Seattle publishes for each permit.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

# codes for Comm_Res
COMMERCIAL, RESIDENTIAL, OTHER_USE = 0, 1, 2
# codes for New_Alter_Demo
NEW, ALTER, DEMO, OTHER_WORK = 0, 1, 2, 3


@dataclass
class Permit:
    Permit_id: str
    County: str
    Address: Optional[str] = None
    Comm_Res: int = OTHER_USE
    Description: Optional[str] = None
    Estimated_Cost: Optional[float] = None
    Issue_Date: Optional[str] = None     # ISO YYYY-MM-DD
    New_Alter_Demo: int = OTHER_WORK
    Owner_Address: Optional[str] = None
    Owner_Name: Optional[str] = None
    Permit_Type: Optional[str] = None
    Sqr_Ft: Optional[float] = None
    Status: Optional[str] = None
    Jurisdiction: Optional[str] = None   # city or unincorporated county
    Zoning: Optional[str] = None
    Land_Use: Optional[str] = None
    Structure_Type: Optional[str] = None
    Work_Type: Optional[str] = None
    Contractor: Optional[str] = None
    Lat: Optional[float] = None
    Lon: Optional[float] = None
    Category: Optional[str] = None       # food_drink, retail, salon or fitness (pipeline/classify.py)
    Food_Drink: int = 0                  # 1 if this looks like a restaurant/café/bar permit
    # --- plan-review timing ---
    Applied_Date: Optional[str] = None
    Review_Cycles: Optional[int] = None          # number of plan-review rounds
    Days_Plan_Review: Optional[float] = None     # total days in plan review
    Days_Initial_Review: Optional[float] = None  # days to finish the first round
    Days_City_Review: Optional[float] = None     # days the city held the plans
    Days_Out_Corrections: Optional[float] = None # days the applicant held the plans making corrections
    Source_URL: Optional[str] = None
    Raw: dict[str, Any] = field(default_factory=dict)

    def to_row(self) -> dict[str, Any]:
        d = asdict(self)
        d["Raw"] = json.dumps(self.Raw, default=str)
        return d


COLUMNS = list(Permit.__dataclass_fields__.keys())


def comm_res_from_text(text: Optional[str]) -> int:
    t = (text or "").lower()
    if any(k in t for k in ("non-residential", "nonresidential", "commercial", "comm")):
        return COMMERCIAL
    if any(k in t for k in ("residential", "single family", "res)", "dwelling")):
        return RESIDENTIAL
    return OTHER_USE


def work_from_text(text: Optional[str]) -> int:
    t = (text or "").lower()
    if "demo" in t:
        return DEMO
    if any(k in t for k in ("new construction", "new build", "/new", " new")) or t.startswith("new"):
        return NEW
    if any(k in t for k in ("alter", "addition", "remodel", "renovat", "repair", "tenant", "interior finish", "build-out", "buildout")):
        return ALTER
    return OTHER_WORK
