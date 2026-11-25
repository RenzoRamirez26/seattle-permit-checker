"""The API application: routes under /api, the docs page at /docs.

In:  HTTP requests from the front end.  Out: JSON (or a PDF) built by calling checker/.

    uvicorn api.main:app --reload

- Every model call happens here, on the server. The Claude API key is read from the server's
  environment and is never sent to the browser.
- This file adds no rules: it validates input, calls checker.audit / checker.zoning /
  checker.agent / checker.pdf / checker.extract, stores the result, and returns what came back.
- An uploaded plan is read and deleted; it is never stored. A check (the facts, the answers, the
  address or zone if given, and the result) is stored until it expires or is deleted.
- There is no login. A check is reached only by its unguessable id. Every route that costs money or CPU has a
  per-address rate limit, model calls have two daily caps (plan reads, questions), and Turnstile can be switched
  on (api/limits.py).
- Production (PERMIT_ENV=production, set by the Dockerfile): no /docs or /openapi.json unless PERMIT_API_DOCS=1,
  only PERMIT_CORS_ORIGIN may call, HSTS is sent. Security headers and body-size caps are in api/security.py.

STATUS: tested with the model and the network mocked. Reading an uploaded plan with the real
model, a real address through /api/zoning, and /api/transcribe with faster-whisper installed have
NOT been run from this code yet. /api/transcribe's ffmpeg conversion of WebM, MP4 and Ogg has run
(in the tests, with clips made by ffmpeg); the speech model itself was mocked.
"""
from __future__ import annotations

import asyncio
import json
import re
import sqlite3
from contextlib import asynccontextmanager, suppress
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from email.parser import BytesParser
from email.policy import HTTP

from fastapi import APIRouter, Depends, FastAPI, File, Form, Path as PathParam, Request, Response, UploadFile
from fastapi.responses import PlainTextResponse
from starlette.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from checker import agent, audit, pdf, rules_engine, voice, zoning
from checker.extract import SPACE_USES

from . import audio, config, errors, geo, limits, schemas, security, store, uploads
from .errors import ApiError

SOURCE_LABELS = {"saved_reading": "the saved reading for this demo plan (no model call)", "vision_model": "the vision model"}
_ERRORS = {code: {"model": schemas.ErrorResponse} for code in (400, 403, 404, 413, 415, 422, 429, 502, 503)}
CHECK_ID = PathParam(description="The id the check was stored under.")
_CHECK_ID = re.compile(r"[A-Za-z0-9_-]{8,64}")       # store.save() makes 22-character url-safe ids


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
        db.connect_readonly(path).close()       # opened read-only: the API never writes to Seattle's records
    except db.OutdatedDatabase as e:
        return None, str(e)
    except sqlite3.Error:
        return None, "The Seattle database could not be opened, so the check runs without Seattle's records."
    return str(path), None


def stored(check_id: str) -> dict:
    check = store.get(check_id) if _CHECK_ID.fullmatch(check_id) else None
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
                     "speech_to_text": speech_to_text(), "kokoro_voice": voice.tts_backend() == "kokoro",
                     "reading_paused": config.has_api_key() and limits.model_paused(limits.PLAN_READ),
                     "turnstile": bool(config.turnstile_secret())},
        "limits": {"upload_types": sorted(config.UPLOAD_TYPES), "max_upload_mb": config.max_upload_bytes() / 1024 / 1024,
                   "max_question_chars": config.MAX_QUESTION_CHARS, "max_history_turns": config.MAX_HISTORY_TURNS,
                   "check_days": config.check_days(), "max_audio_mb": config.max_audio_bytes() / 1024 / 1024,
                   "max_audio_seconds": config.MAX_AUDIO_SECONDS, "max_pdf_pages": config.max_pdf_pages(),
                   "max_address_chars": schemas.MAX_ADDRESS_CHARS},
        "rulebook": {"edition_date": edition_date(rules()), "code_edition": rules()["_meta"]["code_edition"],
                     "code_basis": rules()["_meta"]["code_basis"],
                     **rule_counts(rules())},
        "facts_checked": list(rules_engine.FACTS_CHECKED),
        "room_uses_without_load": rules_engine.room_uses_without_load(rules(), SPACE_USES),
    }


rule_counts = rules_engine.rule_counts     # how many rules, and how many not yet checked against the code text


def edition_date(rulebook: dict) -> Optional[str]:
    """The rulebook's edition date, or None while _meta still holds the placeholder (so "TODO" never reaches a page)."""
    value = str(rulebook["_meta"].get("edition_date") or "").strip()
    return None if not value or value.upper().startswith("TODO") else value


@router.post("/plans/read", response_model=schemas.PlanReading, tags=["plan"],
             summary="Read a floor plan: a demo plan by id, or an uploaded PNG, JPG or PDF")
def read_plan(request: Request,
              case_id: Optional[str] = Form(None, max_length=60, description="A demo case id from /api/meta. Give this or a file."),
              file: Optional[UploadFile] = File(None, description="The owner's plan. It is read and deleted, never stored."),
              business_type_key: Optional[str] = Form(None, alias="business_type", max_length=60, description="Helps the model read an uploaded plan."),
              client: Any = Depends(model_client), _limit: None = Depends(limits.rate_limit("plan_read"))) -> dict:
    if bool(case_id) == (file is not None):
        raise ApiError(400, "plan_needed", "Give a demo case id or upload one plan file, not both and not neither.")
    context = f"business type: {business_type(business_type_key)['label']}" if business_type_key else ""
    can_use_model = client is not None or config.has_api_key()

    def with_model(path: Path) -> dict:
        from checker.extract import extract_floor_plan

        if limits.model_paused(limits.PLAN_READ):
            raise ApiError(503, "reading_paused", limits.READING_PAUSED)
        try:
            return extract_floor_plan(path, context, client=limits.counted(client, limits.PLAN_READ))
        except limits.BudgetExhausted:
            raise ApiError(503, "reading_paused", limits.READING_PAUSED) from None
        except Exception as e:      # network, key, quota, or a reply with no reading. Only the kind is logged, never the plan.
            errors.log.warning("plan reading failed: %s", e.__class__.__name__)
            raise ApiError(502, "plan_reading_failed",
                           "The plan could not be read by the model. Try again in a moment, or use a demo plan.") from None

    if case_id:
        case = demo_cases().get(case_id)
        if case is None:
            raise ApiError(404, "demo_case_not_found", f"There is no demo case {case_id!r}. Use one of: {', '.join(demo_cases())}.")
        # An example plan always uses its saved reading: it never calls the model or uses the day's plan reads, and
        # the Privacy page says nothing about it is sent to Anthropic.
        facts, source = json.loads((config.DEMO_DIR / case["extraction"]).read_text(encoding="utf-8")), "saved_reading"
    else:
        data = file.file.read(config.max_upload_bytes() + 1)      # never reads more than one byte past the limit
        suffix = uploads.check(file.filename or "", data)          # the type comes from the first bytes, not the name
        if not can_use_model:
            raise ApiError(503, "no_model_key", "This server has no Claude API key, so an uploaded plan cannot be read. Use a demo plan.")
        limits.verify_turnstile(request)
        facts, source = uploads.read_and_delete(data, suffix, with_model), "vision_model"
        del data
    try:
        facts = schemas.Facts.model_validate(facts)
    except ValidationError:
        raise ApiError(502, "plan_reading_failed", "The model's reading of the plan was not in the expected form. Try again.") from None
    return {"facts": facts, "source": source, "source_label": SOURCE_LABELS[source], "case_id": case_id}


@router.post("/zoning", response_model=schemas.ZoningResponse, tags=["zoning"],
             summary="Screen a location for a kind of business; for an address, also the point and the zone's outline")
def check_zoning(req: schemas.ZoningRequest, _limit: None = Depends(limits.rate_limit("zoning"))) -> dict:
    bt = business_type(req.business_type)
    z = zoning.check_address(req.address or "", rules(), req.zone, business_type=bt["key"], area_sqft=req.area_sqft)
    point = {"lon": z["lon"], "lat": z["lat"]} if z.get("lon") is not None and z.get("lat") is not None else None
    outline = geo.zone_outline(point["lon"], point["lat"], rules()) if point else None
    return {"zoning": z, "point": point, "outline": outline}


@router.post("/checks", response_model=schemas.Check, status_code=201, tags=["checks"],
             summary="Run the pre-check on the confirmed facts and store it")
def create_check(req: schemas.CheckRequest, _limit: None = Depends(limits.rate_limit("checks"))) -> dict:
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
def get_check(check_id: str = CHECK_ID) -> dict:
    return stored(check_id)


@router.delete("/checks/{check_id}", response_model=schemas.Deleted, tags=["checks"], summary="Delete a stored check now")
def delete_check(check_id: str = CHECK_ID) -> dict:
    if not _CHECK_ID.fullmatch(check_id) or not store.delete(check_id):
        raise ApiError(404, "check_not_found", "There is no check with this id. It may have been deleted or have expired.")
    return {"id": check_id, "deleted": True}


_PDF = {200: {"content": {"application/pdf": {}}, "description": "A PDF file"}}


def _pdf(data: bytes, filename: str) -> Response:
    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.get("/checks/{check_id}/report.pdf", response_class=Response, responses=_PDF, tags=["checks"], summary="The pre-check report as a PDF")
def get_report_pdf(check_id: str = CHECK_ID, _limit: None = Depends(limits.rate_limit("pdf"))) -> Response:
    return _pdf(pdf.report_pdf(stored(check_id)["result"]), "permit_precheck.pdf")


@router.get("/checks/{check_id}/preparation-sheet.pdf", response_class=Response, responses=_PDF, tags=["checks"],
            summary="The permit application preparation sheet as a PDF")
def get_sheet_pdf(check_id: str = CHECK_ID, _limit: None = Depends(limits.rate_limit("pdf"))) -> Response:
    return _pdf(pdf.permit_sheet_pdf(stored(check_id)["result"]), "permit_preparation_sheet.pdf")


@router.post("/checks/{check_id}/ask", response_model=schemas.Answer, tags=["checks"],
             summary="Ask a question about a stored check; the answer comes only from that result")
def ask(request: Request, q: schemas.Question, check_id: str = CHECK_ID, client: Any = Depends(model_client),
        _limit: None = Depends(limits.rate_limit("ask"))) -> dict:
    result = stored(check_id)["result"]
    history = [{"role": t.role, "content": t.content[:config.MAX_HISTORY_TURN_CHARS]} for t in q.history[-config.MAX_HISTORY_TURNS:]]
    model = limits.counted(client, limits.ASK)      # past the day's asks the agent answers from its template, still from the result
    if model is not None:
        limits.verify_turnstile(request)
    return agent.answer(q.question, result, client=model, history=history)      # includes the grounding check


# ---------------------------------------------------------------- spoken questions
_AUDIO_BODY = {"requestBody": {"required": True, "content": {"multipart/form-data": {"schema": {
    "type": "object", "required": ["audio"],
    "properties": {"audio": {"type": "string", "format": "binary", "description":
        "One recorded question as the browser recorded it: audio/webm (Opus), audio/mp4 or audio/ogg, or audio/wav. "
        "The part's Content-Type must name the format."}}}}}}}
_MULTIPART_OVERHEAD = 16 * 1024     # the form's boundaries and headers around the clip


def _audio_from_form(content_type: str, body: bytes) -> tuple[Optional[bytes], str]:
    """The bytes of the form field "audio" and that part's content type, parsed in memory, or (None, "")."""
    if not content_type.lower().startswith("multipart/form-data"):
        return None, ""
    message = BytesParser(policy=HTTP).parsebytes(b"Content-Type: " + content_type.encode("latin-1") + b"\r\n\r\n" + body)
    for part in message.iter_parts() if message.is_multipart() else []:
        if part.get_param("name", header="content-disposition") == "audio":
            return part.get_payload(decode=True) or b"", str(part.get("content-type") or "")
    return None, ""


def speech_to_text() -> bool:
    """The server can turn a browser recording into text: faster-whisper, and ffmpeg to read WebM, MP4 and Ogg."""
    return voice.stt_available() and audio.ffmpeg() is not None


@router.post("/transcribe", response_model=schemas.Transcript, tags=["voice"], openapi_extra=_AUDIO_BODY,
             summary="The words in one recorded question (WebM, MP4, Ogg or WAV), for the owner to check before sending it")
async def transcribe(request: Request, _limit: None = Depends(limits.rate_limit("transcribe"))) -> dict:
    """Never stored or logged. A WebM, MP4 or Ogg recording is written to a private temporary folder only while ffmpeg
    converts it to WAV, and that folder is deleted before transcription starts (api/audio.py). The WAV is held in
    memory and passed to checker.voice.transcribe() unchanged."""
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
    clip, clip_type = _audio_from_form(request.headers.get("content-type", ""), bytes(body))
    del body
    if not clip:
        raise ApiError(400, "audio_needed", "No recording was received. Record the question again, or type it.")
    if len(clip) > config.max_audio_bytes():
        raise ApiError(413, "audio_too_large", f"The recording is larger than the {config.max_audio_bytes() / 1024 / 1024:g} MB limit. Ask a shorter question.")
    kind = audio.kind(clip_type, clip)
    if not kind:
        raise ApiError(415, "audio_not_supported", "The recording must be WebM, MP4, Ogg or WAV audio, sent with its own "
                                                   "content type. Record the question again, or type it.")
    try:
        wav = await run_in_threadpool(audio.to_wav, clip, kind)
    except FileNotFoundError:
        raise ApiError(503, "no_speech_to_text", "This server can't read this kind of recording. Type the question instead.")
    except audio.Unreadable:
        raise ApiError(422, "speech_not_understood", "The recording could not be made out. Try again, or type the question.")
    finally:
        del clip
    text = await run_in_threadpool(voice.transcribe, wav)
    del wav
    if not text or not text.strip():
        raise ApiError(422, "speech_not_understood", "The recording could not be made out. Try again, or type the question.")
    return {"text": text.strip()}


@router.get("/health", tags=["setup"], summary="For the host's health check: the server is up. Says nothing else.")
def health() -> dict:
    return {"ok": True}


# ---------------------------------------------------------------- the app
PURGE_EVERY_SECONDS = 3600      # expired checks are deleted at start-up, then every hour, and whenever a check is read


async def _purge_regularly() -> None:
    while True:
        await asyncio.sleep(PURGE_EVERY_SECONDS)
        with suppress(Exception):
            await run_in_threadpool(store.purge_expired)


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store.purge_expired()       # checks past their expiry are deleted when the server starts
        task = asyncio.create_task(_purge_regularly())
        try:
            yield
        finally:
            task.cancel()

    docs = config.docs_enabled()
    app = FastAPI(title="PermitOS API", version="0.1.0", lifespan=lifespan, debug=False,
                  docs_url="/docs" if docs else None, redoc_url="/redoc" if docs else None,
                  openapi_url="/openapi.json" if docs else None,
                  description="Exposes the permit pre-check to a web front end. A pre-submission check, not a code "
                              "determination. Every error is JSON shaped {\"error\": {\"code\", \"message\"}}.")
    # Added innermost first: the size cap, then CORS, then the security headers on every response (preflights too).
    app.add_middleware(security.BodyLimit)
    app.add_middleware(CORSMiddleware, allow_origins=config.cors_origins(), allow_methods=["GET", "POST", "DELETE"],
                       allow_headers=["content-type", limits.TURNSTILE_HEADER], allow_credentials=False, max_age=600)
    app.add_middleware(security.SecurityHeaders)
    errors.install(app)
    app.include_router(router)

    @app.get("/robots.txt", include_in_schema=False, response_class=PlainTextResponse)
    def robots() -> str:
        return "User-agent: *\nDisallow: /\n"      # the API is for the site, not for search engines

    return app


app = create_app()
