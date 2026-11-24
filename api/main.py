"""The API application: routes under /api, the docs page at /docs.

In:  HTTP requests from the front end.  Out: JSON (or a PDF) built by calling checker/.

    uvicorn api.main:app --reload

- Every model call happens here, on the server. The Claude API key is read from the server's
  environment and is never sent to the browser.
- This file adds no rules: it validates input, calls checker.audit / checker.zoning /
  checker.agent / checker.pdf / checker.extract, stores the result, and returns what came back.
- An uploaded plan is read and deleted; it is never stored. A check (the facts, the answers, the
  address or zone if given, and the result) is stored until it expires or is deleted.
- There is no login. That is acceptable on your own computer. Before the API is reachable from
  the internet it needs authentication and a rate limit.

STATUS: tested with the model and the network mocked. Reading an uploaded plan with the real
model, a real address through /api/zoning, and /api/transcribe with faster-whisper installed have
NOT been run from this code yet.
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from email.parser import BytesParser
from email.policy import HTTP

from fastapi import APIRouter, Depends, FastAPI, File, Form, Request, Response, UploadFile
from starlette.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from checker import agent, audit, pdf, rules_engine, voice, zoning

from . import config, errors, geo, schemas, store, uploads
from .errors import ApiError

SOURCE_LABELS = {"saved_reading": "the saved reading for this demo plan (no model call)", "vision_model": "the vision model"}
_ERRORS = {code: {"model": schemas.ErrorResponse} for code in (400, 404, 413, 415, 422, 502, 503)}


# ---------------------------------------------------------------- shared pieces
@lru_cache(maxsize=1)
def rules() -> dict:
    return rules_engine.load_rules()


@lru_cache(maxsize=1)
def demo_cases() -> dict[str, dict]:
    return {c["id"]: c for c in json.loads((config.DEMO_DIR / "cases.json").read_text(encoding="utf-8"))}


def model_client() -> Any:
    """The client for model calls. None means "make the real one from the server's key". Tests replace this."""
    return None


def business_type(key: Optional[str]) -> dict:
    """The rulebook's entry for a business type, or a clear error. (The checker itself falls back to a default.)"""
    types = rules()["business_types"]
    if key not in types:
        raise ApiError(422, "unknown_business_type", f"Unknown business type {key!r}. Use one of: {', '.join(types)}.")
    return types[key] | {"key": key}


def seattle_database() -> tuple[Optional[str], Optional[str]]:
    """(path to use, or None; a notice if the database is there but cannot be used)."""
    path = config.seattle_db()
    if not path.exists():
        return None, None
    from pipeline import db

    try:
        db.connect(path).close()
    except db.OutdatedDatabase as e:
        return None, str(e)
    return str(path), None


def stored(check_id: str) -> dict:
    check = store.get(check_id)
    if check is None:
        raise ApiError(404, "check_not_found", "There is no check with this id. It may have been deleted or have expired.")
    return check


# ---------------------------------------------------------------- routes
router = APIRouter(prefix="/api", responses=_ERRORS)


@router.get("/meta", response_model=schemas.Meta, tags=["setup"], summary="What the form needs: business types, demo plans, what is switched on")
def get_meta() -> dict:
    types = rules()["business_types"]
    return {
        "business_types": [{"key": k, "label": t["label"], "serves_food": bool(t.get("food")),
                            "has_seating": bool(t.get("seating")), "serves_alcohol": bool(t.get("alcohol"))} for k, t in types.items()],
        "demo_cases": [{"id": c["id"], "title": c["title"], "business_type": c["intake"]["business_type"],
                        "cooking_on_site": bool(c["intake"].get("cooking_on_site")), "zone": c.get("zoning")}
                       for c in demo_cases().values()],
        "features": {"model_api_key": config.has_api_key(), "seattle_database": seattle_database()[0] is not None,
                     "speech_to_text": voice.stt_available(), "kokoro_voice": voice.tts_backend() == "kokoro"},
        "limits": {"upload_types": sorted(config.UPLOAD_TYPES), "max_upload_mb": config.max_upload_bytes() / 1024 / 1024,
                   "max_question_chars": config.MAX_QUESTION_CHARS, "max_history_turns": config.MAX_HISTORY_TURNS,
                   "check_days": config.check_days(), "max_audio_mb": config.max_audio_bytes() / 1024 / 1024,
                   "max_audio_seconds": config.MAX_AUDIO_SECONDS},
        "rulebook": {"edition_date": edition_date(rules()), "code_basis": rules()["_meta"]["code_basis"],
                     **rule_counts(rules())},
    }


def rule_counts(rulebook: dict) -> dict[str, int]:
    """How many rules the rulebook lists, and how many are not yet checked against the code text, counting a rule as
    unchecked when a rule it depends on is (rules_engine.rule_checked)."""
    entries = [k for k in (rulebook.get("rules") or {}) if not k.startswith("_")]
    return {"rules": len(entries), "rules_unverified": sum(not rules_engine.rule_checked(rulebook, k) for k in entries)}


def edition_date(rulebook: dict) -> Optional[str]:
    """The rulebook's edition date, or None while _meta still holds the placeholder (so "TODO" never reaches a page)."""
    value = str(rulebook["_meta"].get("edition_date") or "").strip()
    return None if not value or value.upper().startswith("TODO") else value


@router.post("/plans/read", response_model=schemas.PlanReading, tags=["plan"],
             summary="Read a floor plan: a demo plan by id, or an uploaded PNG, JPG or PDF")
def read_plan(case_id: Optional[str] = Form(None, description="A demo case id from /api/meta. Give this or a file."),
              file: Optional[UploadFile] = File(None, description="The owner's plan. It is read and deleted, never stored."),
              business_type_key: Optional[str] = Form(None, alias="business_type", description="Helps the model read an uploaded plan."),
              use_vision: bool = Form(False, description="For a demo plan: read it with the model instead of using the saved reading."),
              client: Any = Depends(model_client)) -> dict:
    if bool(case_id) == (file is not None):
        raise ApiError(400, "plan_needed", "Give a demo case id or upload one plan file, not both and not neither.")
    context = f"business type: {business_type(business_type_key)['label']}" if business_type_key else ""
    can_use_model = client is not None or config.has_api_key()

    def with_model(path: Path) -> dict:
        from checker.extract import extract_floor_plan

        try:
            return extract_floor_plan(path, context, client=client)
        except Exception as e:      # network, key, quota, or a reply with no reading
            errors.log.warning("plan reading failed: %s: %s", e.__class__.__name__, e)
            raise ApiError(502, "plan_reading_failed",
                           "The plan could not be read by the model. Try again in a moment, or use a demo plan.") from None

    if case_id:
        case = demo_cases().get(case_id)
        if case is None:
            raise ApiError(404, "demo_case_not_found", f"There is no demo case {case_id!r}. Use one of: {', '.join(demo_cases())}.")
        if use_vision and can_use_model:
            facts, source = with_model(config.DEMO_DIR / case["plan"]), "vision_model"
        else:
            facts, source = json.loads((config.DEMO_DIR / case["extraction"]).read_text(encoding="utf-8")), "saved_reading"
    else:
        data = file.file.read(config.max_upload_bytes() + 1)      # never reads more than one byte past the limit
        suffix = uploads.check(file.filename or "", data)
        if not can_use_model:
            raise ApiError(503, "no_model_key", "This server has no Claude API key, so an uploaded plan cannot be read. Use a demo plan.")
        facts, source = uploads.read_and_delete(data, suffix, with_model), "vision_model"
    try:
        facts = schemas.Facts.model_validate(facts)
    except ValidationError:
        raise ApiError(502, "plan_reading_failed", "The model's reading of the plan was not in the expected form. Try again.") from None
    return {"facts": facts, "source": source, "source_label": SOURCE_LABELS[source], "case_id": case_id}


@router.post("/zoning", response_model=schemas.ZoningResponse, tags=["zoning"],
             summary="Screen a location for a kind of business; for an address, also the point and the zone's outline")
def check_zoning(req: schemas.ZoningRequest) -> dict:
    bt = business_type(req.business_type)
    z = zoning.check_address(req.address or "", rules(), req.zone, business_type=bt["key"], area_sqft=req.area_sqft)
    point = {"lon": z["lon"], "lat": z["lat"]} if z.get("lon") is not None and z.get("lat") is not None else None
    outline = geo.zone_outline(point["lon"], point["lat"], rules()) if point else None
    return {"zoning": z, "point": point, "outline": outline}


@router.post("/checks", response_model=schemas.Check, status_code=201, tags=["checks"],
             summary="Run the pre-check on the confirmed facts and store it")
def create_check(req: schemas.CheckRequest) -> dict:
    bt = business_type(req.intake.business_type)
    facts = req.facts.model_dump()
    intake = req.intake.model_dump() | {"business_type": bt["key"]}      # null ("Not sure") is kept: the rules engine treats it as unknown
    if "new_signage" not in req.intake.model_fields_set:
        intake.pop("new_signage", None)                                      # left out: the checker's default; null is Not sure
    db_path, notice = seattle_database()
    result = audit.audit(None, intake, extraction=facts, address=req.zoning.address, zoning_override=req.zoning.zone,
                         db_path=db_path)
    notices = [notice] if notice else []
    return store.save(facts, intake, req.zoning.model_dump(), result, notices) | {"notices": notices}


@router.get("/checks/{check_id}", response_model=schemas.Check, tags=["checks"], summary="A stored check")
def get_check(check_id: str) -> dict:
    return stored(check_id)


@router.delete("/checks/{check_id}", response_model=schemas.Deleted, tags=["checks"], summary="Delete a stored check now")
def delete_check(check_id: str) -> dict:
    if not store.delete(check_id):
        raise ApiError(404, "check_not_found", "There is no check with this id. It may have been deleted or have expired.")
    return {"id": check_id, "deleted": True}


_PDF = {200: {"content": {"application/pdf": {}}, "description": "A PDF file"}}


def _pdf(data: bytes, filename: str) -> Response:
    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.get("/checks/{check_id}/report.pdf", response_class=Response, responses=_PDF, tags=["checks"], summary="The pre-check report as a PDF")
def get_report_pdf(check_id: str) -> Response:
    return _pdf(pdf.report_pdf(stored(check_id)["result"]), "permit_precheck.pdf")


@router.get("/checks/{check_id}/preparation-sheet.pdf", response_class=Response, responses=_PDF, tags=["checks"],
            summary="The permit application preparation sheet as a PDF")
def get_sheet_pdf(check_id: str) -> Response:
    return _pdf(pdf.permit_sheet_pdf(stored(check_id)["result"]), "permit_preparation_sheet.pdf")


@router.post("/checks/{check_id}/ask", response_model=schemas.Answer, tags=["checks"],
             summary="Ask a question about a stored check; the answer comes only from that result")
def ask(check_id: str, q: schemas.Question, client: Any = Depends(model_client)) -> dict:
    result = stored(check_id)["result"]
    history = [{"role": t.role, "content": t.content[:config.MAX_HISTORY_TURN_CHARS]} for t in q.history[-config.MAX_HISTORY_TURNS:]]
    return agent.answer(q.question, result, client=client, history=history)      # includes the grounding check


# ---------------------------------------------------------------- spoken questions
_AUDIO_BODY = {"requestBody": {"required": True, "content": {"multipart/form-data": {"schema": {
    "type": "object", "required": ["audio"],
    "properties": {"audio": {"type": "string", "format": "binary", "description": "One recorded question as 16 kHz mono WAV."}}}}}}}
_MULTIPART_OVERHEAD = 16 * 1024     # the form's boundaries and headers around the clip


def _audio_from_form(content_type: str, body: bytes) -> Optional[bytes]:
    """The bytes of the form field "audio", parsed in memory (nothing is written to disk), or None."""
    if not content_type.lower().startswith("multipart/form-data"):
        return None
    message = BytesParser(policy=HTTP).parsebytes(b"Content-Type: " + content_type.encode("latin-1") + b"\r\n\r\n" + body)
    for part in message.iter_parts() if message.is_multipart() else []:
        if part.get_param("name", header="content-disposition") == "audio":
            return part.get_payload(decode=True) or b""
    return None


@router.post("/transcribe", response_model=schemas.Transcript, tags=["voice"], openapi_extra=_AUDIO_BODY,
             summary="The words in one recorded question (WAV), for the owner to check before sending it")
async def transcribe(request: Request) -> dict:
    """Held in memory only: never written to disk, logged or stored. Calls checker.voice.transcribe() unchanged."""
    if not voice.stt_available():
        raise ApiError(503, "no_speech_to_text", "Speech to text is not installed on this server. Type the question instead.")
    cap = config.max_audio_bytes() + _MULTIPART_OVERHEAD
    if int(request.headers.get("content-length") or 0) > cap:
        raise ApiError(413, "audio_too_large", f"The recording is larger than the {config.max_audio_bytes() / 1024 / 1024:g} MB limit. Ask a shorter question.")
    body = bytearray()
    async for chunk in request.stream():         # read with a cap, so a body without a length cannot grow without limit
        body += chunk
        if len(body) > cap:
            raise ApiError(413, "audio_too_large", f"The recording is larger than the {config.max_audio_bytes() / 1024 / 1024:g} MB limit. Ask a shorter question.")
    audio = _audio_from_form(request.headers.get("content-type", ""), bytes(body))
    del body
    if not audio:
        raise ApiError(400, "audio_needed", "No recording was received. Record the question again, or type it.")
    if len(audio) > config.max_audio_bytes():
        raise ApiError(413, "audio_too_large", f"The recording is larger than the {config.max_audio_bytes() / 1024 / 1024:g} MB limit. Ask a shorter question.")
    if not (audio[:4] == b"RIFF" and audio[8:12] == b"WAVE"):
        raise ApiError(415, "audio_not_wav", "The recording must be a WAV file. Record the question again, or type it.")
    text = await run_in_threadpool(voice.transcribe, audio)
    if not text or not text.strip():
        raise ApiError(422, "speech_not_understood", "The recording could not be made out. Try again, or type the question.")
    return {"text": text.strip()}


# ---------------------------------------------------------------- the app
def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store.purge_expired()       # checks past their expiry are deleted when the server starts
        yield

    app = FastAPI(title="PermitOS API", version="0.1.0", lifespan=lifespan,
                  description="Exposes the permit pre-check to a web front end. A pre-submission check, not a code "
                              "determination. Every error is JSON shaped {\"error\": {\"code\", \"message\"}}.")
    app.add_middleware(CORSMiddleware, allow_origins=[config.cors_origin()], allow_methods=["GET", "POST", "DELETE"],
                       allow_headers=["*"])
    errors.install(app)
    app.include_router(router)
    return app


app = create_app()
