"""The contract between the API and a front end: the shape of every request and every response.

The facts models mirror checker.extract.FLOOR_PLAN_SCHEMA (a test fails if the two drift apart).
The result models describe what checker.audit returns; they add nothing to it. Unknown extra
fields in a result are passed through, so a new field in the checker reaches the front end
without a change here.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from checker.extract import SPACE_USES

from . import config


class _Facts(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Space(_Facts):
    name: str
    use: str = Field(json_schema_extra={"enum": SPACE_USES})
    area_sqft: Optional[float] = None
    width_ft: Optional[float] = None
    length_ft: Optional[float] = None

    @field_validator("use")
    @classmethod
    def _known_use(cls, v: str) -> str:
        if v not in SPACE_USES:
            raise ValueError(f"must be one of: {', '.join(SPACE_USES)}")
        return v


class Door(_Facts):
    label: str
    location: Optional[str] = None
    clear_width_in: Optional[float] = None
    is_exit: bool
    swing: Literal["outward", "inward", "sliding", "unknown"]
    serves: Optional[str] = None


class Aisle(_Facts):
    label: str
    min_width_in: Optional[float] = None


class Restroom(_Facts):
    label: str
    designation: Literal["men", "women", "all_gender", "unknown"]
    water_closets: Optional[int] = None
    urinals: Optional[int] = None
    lavatories: Optional[int] = None
    turning_circle_diameter_in: Optional[float] = None
    door_clear_width_in: Optional[float] = None


class Kitchen(_Facts):
    cooking_appliances: list[str] = []
    grease_producing_cooking: Optional[bool] = None
    type1_hood_shown: Optional[bool] = None
    hand_sinks: Optional[int] = None
    three_compartment_sink: Optional[bool] = None
    mop_or_service_sink: Optional[bool] = None
    grease_interceptor_shown: Optional[bool] = None


class FireSafety(_Facts):
    exit_signs_shown: Optional[int] = None
    fire_extinguishers_shown: Optional[int] = None
    class_k_extinguisher_shown: Optional[bool] = None
    sprinklers_noted: Optional[bool] = None
    emergency_lighting_noted: Optional[bool] = None


class Facts(_Facts):
    """What was read from the floor plan. The owner can correct any of it before a check is run."""
    plan_title: Optional[str] = None
    scale_note: Optional[str] = None
    overall_width_ft: Optional[float] = None
    overall_length_ft: Optional[float] = None
    gross_area_sqft: Optional[float] = None
    spaces: list[Space] = []
    seat_count: Optional[int] = None
    accessible_seat_count: Optional[int] = None
    doors: list[Door] = []
    aisles: list[Aisle] = []
    restrooms: list[Restroom] = []
    kitchen: Optional[Kitchen] = None
    fire_safety: Optional[FireSafety] = None
    outdoor_seating_shown: Optional[bool] = None
    uncertainties: list[str] = []


# ---------------------------------------------------------------- /meta
class BusinessType(BaseModel):
    key: str
    label: str
    serves_food: bool = Field(description="Ask whether there is cooking on site.")
    has_seating: bool
    serves_alcohol: bool


class DemoCase(BaseModel):
    id: str
    title: str
    business_type: str
    cooking_on_site: bool
    zone: Optional[str] = None


class Features(BaseModel):
    model_api_key: bool = Field(description="The server has a Claude API key: uploaded plans can be read and the agent can use the model.")
    seattle_database: bool = Field(description="Seattle's review records have been downloaded on the server.")
    speech_to_text: bool
    kokoro_voice: bool


class Limits(BaseModel):
    upload_types: list[str]
    max_upload_mb: float
    max_question_chars: int
    max_history_turns: int
    check_days: float = Field(description="A stored check is deleted after this many days.")


class Rulebook(BaseModel):
    edition_date: Optional[str] = Field(description="The rulebook's edition date (_meta.edition_date), for the site's footer. "
                                                    "null while the rulebook still holds the placeholder.")
    code_basis: str


class Meta(BaseModel):
    business_types: list[BusinessType]
    demo_cases: list[DemoCase]
    features: Features
    limits: Limits
    rulebook: Rulebook


# ---------------------------------------------------------------- /plans/read
class PlanReading(BaseModel):
    facts: Facts
    source: Literal["saved_reading", "vision_model"]
    source_label: str
    case_id: Optional[str] = None


# ---------------------------------------------------------------- /zoning
class ZoningInput(BaseModel):
    """Where the business is: a street address in Seattle to look up, or the zone as printed on the zoning map. Not both."""
    address: Optional[str] = Field(default=None, max_length=200)
    zone: Optional[str] = Field(default=None, max_length=60)

    @model_validator(mode="after")
    def _one_or_none(self) -> "ZoningInput":
        self.address = (self.address or "").strip() or None
        self.zone = (self.zone or "").strip() or None
        if self.address and self.zone:
            raise ValueError("give an address or a zone, not both")
        return self


class ZoningRequest(ZoningInput):
    business_type: str
    area_sqft: Optional[float] = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _one(self) -> "ZoningRequest":
        if not (self.address or self.zone):
            raise ValueError("give an address or a zone")
        return self


class ZoningScreen(BaseModel):
    """The zoning answer exactly as checker.zoning returns it. Only the fields that are always there are listed;
    the others pass through unchanged when the checker sends them: `fix` (what to do, when the use is not simply
    allowed), `cite`, and for a looked-up address `address`, `lon`, `lat`, `description`, `overlays`, `code_link`, `source`."""
    model_config = ConfigDict(extra="allow")
    district: Optional[str]
    status: Literal["likely_permitted", "needs_review", "not_permitted", "unknown"]
    detail: str


class Point(BaseModel):
    lon: float
    lat: float


class ZoningResponse(BaseModel):
    zoning: ZoningScreen
    point: Optional[Point] = Field(default=None, description="Where the address is. Only for an address that was found.")
    outline: Optional[dict[str, Any]] = Field(
        default=None, description="The zone's outline as a GeoJSON Feature (longitude, latitude), simplified for a map. "
                                  "null for a zone entered by hand, or if the city's map service did not answer.")


# ---------------------------------------------------------------- /checks
class Intake(BaseModel):
    business_type: str
    cooking_on_site: bool = False
    food_prep: bool = False
    serves_alcohol: bool = False
    outdoor_seating: bool = False
    upper_floor: bool = False
    historic_district: bool = False
    new_signage: Optional[bool] = Field(default=None, description="Leave out to use the checker's default.")


class CheckRequest(BaseModel):
    facts: Facts
    intake: Intake
    zoning: ZoningInput = ZoningInput()


class Summary(BaseModel):
    model_config = ConfigDict(extra="allow")
    business_type: str
    business_label: str
    occupant_load: int
    occupancy_group: str
    exits_required: int
    exits_shown: int
    fails: int
    reviews: int
    passes: int


class Finding(BaseModel):
    model_config = ConfigDict(extra="allow")
    rule_id: str
    title: str
    status: Literal["pass", "fail", "review"]
    severity: Literal["critical", "high", "medium", "info"]
    detail: str
    citation: str
    fix: str = ""
    reviewed_by: str = ""


class Permit(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    name: str
    agency: str


class OccupantLoadRow(BaseModel):
    model_config = ConfigDict(extra="allow")
    space: Optional[str] = None
    use: str
    area_sqft: float
    factor: float
    load: int


class OccupantLoad(BaseModel):
    model_config = ConfigDict(extra="allow")
    total: int
    by_space: list[OccupantLoadRow]
    missing_area: list[str] = []


class Result(BaseModel):
    """The audit result, as checker.audit returns it."""
    model_config = ConfigDict(extra="allow")
    summary: Summary
    findings: list[Finding]
    permits_likely_required: list[Permit]
    occupant_load: OccupantLoad
    fixtures_required: Optional[dict[str, Any]] = None
    zoning: Optional[ZoningScreen] = None
    local_review_data: Optional[dict[str, Any]] = Field(default=None, description="Seattle's review records for similar projects, when downloaded.")
    code_basis: str
    disclaimer: str


class Check(BaseModel):
    id: str
    created_at: str
    expires_at: str = Field(description="The check is deleted at this time, or earlier with DELETE.")
    result: Result
    notices: list[str] = Field(default=[], description="Things the owner should know that are not findings, "
                                                       "for example that Seattle's records could not be loaded.")


class Deleted(BaseModel):
    id: str
    deleted: bool


# ---------------------------------------------------------------- /checks/{id}/ask
class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=config.MAX_QUESTION_CHARS)
    history: list[Turn] = Field(default=[], description=f"Earlier turns, oldest first. Only the last {config.MAX_HISTORY_TURNS} "
                                                        f"are used, each cut to {config.MAX_HISTORY_TURN_CHARS} characters.")

    @field_validator("question")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("the question is empty")
        return v.strip()


class Answer(BaseModel):
    text: str
    cited_rules: list[str]
    generated_by: str = Field(description='The model\'s name, or "template" when no model was used or its answer was not grounded in the result.')
    problems: list[str] = []


# ---------------------------------------------------------------- errors
class ErrorDetail(BaseModel):
    model_config = ConfigDict(extra="allow")
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
