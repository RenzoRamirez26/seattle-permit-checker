"""The contract between the API and a front end: the shape of every request and every response.

The facts models mirror checker.extract.FLOOR_PLAN_SCHEMA (a test fails if the two drift apart).
The result models describe what checker.audit returns; they add nothing to it. Unknown extra
fields in a result are passed through, so a new field in the checker reaches the front end
without a change here.
"""
from __future__ import annotations

import re
from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from checker.extract import SPACE_USES

from . import config


# Server limits on what a request may hold (not code values): long enough for any real plan, short enough that a
# request cannot make the server store or send the model an essay.
MAX_ADDRESS_CHARS = 200
MAX_ZONE_CHARS = 60
Name = Annotated[str, StringConstraints(max_length=200)]
Note = Annotated[str, StringConstraints(max_length=500)]
Num = Optional[Annotated[float, Field(ge=0, le=1_000_000)]]
Count = Optional[Annotated[int, Field(ge=0, le=100_000)]]
_ZONE = re.compile(r"^[A-Za-z0-9 ()\-/.,']+$")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


class _Facts(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Space(_Facts):
    name: Name
    use: Optional[str] = Field(default=None, json_schema_extra={"enum": SPACE_USES},
                               description="null when no use is chosen: like \"other\", the room's people are unknown.")
    area_sqft: Num = None
    width_ft: Num = None
    length_ft: Num = None

    @field_validator("use")
    @classmethod
    def _known_use(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in SPACE_USES:
            raise ValueError(f"must be one of: {', '.join(SPACE_USES)}")
        return v


class Door(_Facts):
    label: Name
    location: Optional[Name] = None
    clear_width_in: Num = None
    is_exit: bool
    swing: Literal["outward", "inward", "sliding", "unknown"]
    serves: Optional[Name] = None


class Aisle(_Facts):
    label: Name
    min_width_in: Num = None


class Restroom(_Facts):
    label: Name
    designation: Literal["men", "women", "all_gender", "unknown"]
    water_closets: Count = None
    urinals: Count = None
    lavatories: Count = None
    turning_circle_diameter_in: Num = None
    door_clear_width_in: Num = None


class Kitchen(_Facts):
    cooking_appliances: list[Name] = Field(default=[], max_length=100)
    grease_producing_cooking: Optional[bool] = None
    type1_hood_shown: Optional[bool] = None
    hand_sinks: Count = None
    three_compartment_sink: Optional[bool] = None
    mop_or_service_sink: Optional[bool] = None
    grease_interceptor_shown: Optional[bool] = None


class FireSafety(_Facts):
    exit_signs_shown: Count = None
    fire_extinguishers_shown: Count = None
    class_k_extinguisher_shown: Optional[bool] = None
    sprinklers_noted: Optional[bool] = None
    emergency_lighting_noted: Optional[bool] = None


class Facts(_Facts):
    """What was read from the floor plan. The owner can correct any of it before a check is run."""
    plan_title: Optional[Note] = None
    scale_note: Optional[Note] = None
    overall_width_ft: Num = None
    overall_length_ft: Num = None
    gross_area_sqft: Num = None
    spaces: list[Space] = Field(default=[], max_length=200)
    seat_count: Count = None
    accessible_seat_count: Count = None
    doors: list[Door] = Field(default=[], max_length=200)
    aisles: list[Aisle] = Field(default=[], max_length=200)
    restrooms: list[Restroom] = Field(default=[], max_length=100)
    kitchen: Optional[Kitchen] = None
    fire_safety: Optional[FireSafety] = None
    outdoor_seating_shown: Optional[bool] = None
    uncertainties: list[Note] = Field(default=[], max_length=100)


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
    speech_to_text: bool = Field(description="The server can turn a recorded question into text: faster-whisper, and ffmpeg to read WebM, MP4 and Ogg.")
    kokoro_voice: bool
    reading_paused: bool = Field(description="Today's model calls are used up: uploaded plans cannot be read until tomorrow "
                                             "(UTC). The examples and entering the measurements by hand still work.")
    turnstile: bool = Field(description="Uploads and the assistant need a Cloudflare Turnstile token (header "
                                        "cf-turnstile-response).")


class Limits(BaseModel):
    upload_types: list[str]
    max_upload_mb: float
    max_question_chars: int
    max_history_turns: int
    check_days: float = Field(description="A stored check is deleted after this many days.")
    max_audio_mb: float = Field(description="The largest recording /api/transcribe accepts.")
    max_audio_seconds: int = Field(description="The browser stops recording a spoken question at this length.")
    max_pdf_pages: int = Field(description="A PDF plan with more pages is refused; only the first page is read.")
    max_address_chars: int = Field(description="The longest street address accepted.")


class Rulebook(BaseModel):
    edition_date: Optional[str] = Field(description="The date the code edition the rulebook follows took effect in Seattle "
                                                    "(_meta.edition_date, YYYY-MM-DD), for the site's footer. "
                                                    "null while the rulebook still holds the placeholder.")
    code_edition: str = Field(description="The code edition the rules follow, in a few words, for the site's footer "
                                          "(_meta.code_edition), e.g. \"2021 Seattle Building Code\".")
    code_basis: str
    rules: int = Field(description="How many rules the rulebook lists (rulebook: rules).")
    unchecked: int = Field(description="How many rules are unchecked: a value, or a rule they depend on, is not yet "
                                       "checked against the code text.")
    transcribed: int = Field(description="How many rules our team checked against the code text (and every rule they depend on), "
                                         "not yet reviewed by an expert.")
    reviewed: int = Field(description="How many rules an expert reviewed (and every rule they depend on).")


class Meta(BaseModel):
    business_types: list[BusinessType]
    demo_cases: list[DemoCase]
    features: Features
    limits: Limits
    rulebook: Rulebook
    facts_checked: list[str] = Field(description="The plan values the rules read, as \"field\" or \"group.field\". The others "
                                                 "are recorded with the check but no rule reads them.")
    room_uses_without_load: list[str] = Field(description="Room uses whose size no rule reads (restrooms, corridors).")


# ---------------------------------------------------------------- /plans/read
class PlanReading(BaseModel):
    facts: Facts
    source: Literal["saved_reading", "vision_model"]
    source_label: str
    case_id: Optional[str] = None


# ---------------------------------------------------------------- /zoning
class ZoningInput(BaseModel):
    """Where the business is: a street address in Seattle to look up, or the zone as printed on the zoning map. Not both."""
    address: Optional[str] = Field(default=None, max_length=MAX_ADDRESS_CHARS)
    zone: Optional[str] = Field(default=None, max_length=MAX_ZONE_CHARS)

    @model_validator(mode="after")
    def _one_or_none(self) -> "ZoningInput":
        self.address = " ".join((self.address or "").split()) or None
        self.zone = " ".join((self.zone or "").split()) or None
        if self.address and self.zone:
            raise ValueError("give an address or a zone, not both")
        if self.address and (_CONTROL.search(self.address) or not re.search(r"\d", self.address)
                             or not re.search(r"[A-Za-z]", self.address)):
            raise ValueError("enter the street number and the street, for example 1420 5th Ave")
        if self.zone and not _ZONE.match(self.zone):
            raise ValueError("enter the zone as printed on the zoning map, for example NC2-55 (M)")
        return self


class ZoningRequest(ZoningInput):
    business_type: str = Field(max_length=60)
    area_sqft: Optional[float] = Field(default=None, ge=0, le=1_000_000)

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
_UNSURE = "true, false, or null for \"Not sure\": null is treated as unknown, never as false. Left out, it means false."


class Intake(BaseModel):
    business_type: str = Field(max_length=60)
    cooking_on_site: Optional[bool] = Field(default=False, description=_UNSURE)
    food_prep: Optional[bool] = Field(default=False, description=_UNSURE)
    serves_alcohol: Optional[bool] = Field(default=False, description=_UNSURE)
    outdoor_seating: Optional[bool] = Field(default=False, description=_UNSURE)
    upper_floor: Optional[bool] = Field(default=False, description=_UNSURE)
    historic_district: Optional[bool] = Field(default=False, description=_UNSURE)
    new_signage: Optional[bool] = Field(default=None, description="Leave out to use the checker's default (yes). "
                                                                  "null is Not sure: the sign permit is listed as May be needed.")


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


CheckLevel = Literal["unchecked", "transcribed", "reviewed"]


class RuleLevels(BaseModel):
    """How many rules were at each level when the check ran (rules_engine.rule_counts)."""
    rules: int
    unchecked: int
    transcribed: int
    reviewed: int


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
    check_level: CheckLevel = Field(default="unchecked", description="How far the rule is checked: the lowest level of "
                                    "the rule and every rule it depends on (rulebook: rules). unchecked, the default, means "
                                    "still being checked against the code. It never changes the status.")
    rule_source: str = Field(default="", description="The code edition and section the rule comes from, e.g. "
                                                    "\"SBC 2021 1010.1.1\".")
    rule_reviewed_by: Optional[str] = Field(default=None, exclude_if=lambda v: v is None,
                                            description="Only when check_level is reviewed: the expert, name and role.")
    rule_reviewed_on: Optional[str] = Field(default=None, exclude_if=lambda v: v is None,
                                            description="Only when check_level is reviewed: the date of the review.")


class Permit(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    name: str
    agency: str
    check_level: Optional[CheckLevel] = Field(default=None, exclude_if=lambda v: v is None,
                                              description="Set when the permit is listed because of a rule's values (the "
                                                          "occupant load, the sprinkler rule): that rule's level.")
    entry_verified: bool = Field(default=True, description="False when the permit entry itself was written from memory and is "
                                                           "still being checked (rulebook permits \"verified\": false).")
    may_be_needed: Optional[str] = Field(default=None, exclude_if=lambda v: v is None, description="Set when the permit depends on an answer left as Not sure: "
                                                                   "a sentence naming the question. The permit is listed, never dropped.")


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
    check_level: CheckLevel = Field(default="unchecked", description="The level of the square-feet-per-person "
                                                                     "factors (rule OL-0).")
    rule_source: str = Field(default="", description="The code edition and section of the factors.")


class Result(BaseModel):
    """The audit result, as checker.audit returns it."""
    model_config = ConfigDict(extra="allow")
    summary: Summary
    findings: list[Finding]
    permits_likely_required: list[Permit]
    occupant_load: OccupantLoad
    fixtures_required: Optional[dict[str, Any]] = None
    zoning: Optional[ZoningScreen] = None
    rule_levels: Optional[RuleLevels] = Field(default=None, description="How many rules were at each level when the check ran.")
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
    content: str = Field(max_length=20_000)        # cut to MAX_HISTORY_TURN_CHARS before use; this only bounds the request


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=config.MAX_QUESTION_CHARS)
    history: list[Turn] = Field(default=[], max_length=40, description=f"Earlier turns, oldest first. Only the last {config.MAX_HISTORY_TURNS} "
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


# ---------------------------------------------------------------- /transcribe
class Transcript(BaseModel):
    text: str = Field(description="The words heard. The owner checks and can correct them before sending the question.")


# ---------------------------------------------------------------- errors
class ErrorDetail(BaseModel):
    model_config = ConfigDict(extra="allow")
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
