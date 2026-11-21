"""One shape for every error the API returns: {"error": {"code": ..., "message": ...}}. Never a stack trace."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("api")


class ApiError(Exception):
    """An error with a status, a short code the front end can switch on, and a sentence a person can read."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def body(code: str, message: str, **extra) -> dict:
    return {"error": {"code": code, "message": message, **extra}}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    def _api_error(request: Request, e: ApiError) -> JSONResponse:
        return JSONResponse(body(e.code, e.message), status_code=e.status)

    @app.exception_handler(RequestValidationError)
    def _invalid(request: Request, e: RequestValidationError) -> JSONResponse:
        fields = [{"field": ".".join(str(p) for p in err["loc"] if p != "body"), "problem": err["msg"]} for err in e.errors()]
        first = f"{fields[0]['field']}: {fields[0]['problem']}" if fields else "the request could not be read"
        more = f" (and {len(fields) - 1} more)" if len(fields) > 1 else ""
        return JSONResponse(body("invalid_request", f"The request is not valid. {first}{more}", fields=fields), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    def _http(request: Request, e: StarletteHTTPException) -> JSONResponse:
        known = {404: ("not_found", "There is nothing at this address. The API's routes are listed at /docs."),
                 405: ("method_not_allowed", "This address does not accept that kind of request. See /docs.")}
        code, message = known.get(e.status_code, ("http_error", str(e.detail)))
        return JSONResponse(body(code, message), status_code=e.status_code)

    @app.exception_handler(Exception)
    def _unexpected(request: Request, e: Exception) -> JSONResponse:
        log.exception("unexpected error on %s %s", request.method, request.url.path)     # the cause goes to the server log only
        return JSONResponse(body("server_error", "Something went wrong on the server. Nothing was saved. Please try again."),
                            status_code=500)
