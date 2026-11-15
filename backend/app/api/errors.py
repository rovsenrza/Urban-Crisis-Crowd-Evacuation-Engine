"""Consistent error format: {"error": {"code", "message", "details"}}."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..domain.errors import (
    Conflict,
    DomainError,
    Forbidden,
    NotFound,
    TooManyRequests,
    Unauthorized,
    ValidationFailed,
)

log = logging.getLogger(__name__)

STATUS_BY_ERROR: dict[type[DomainError], int] = {
    NotFound: 404,
    Conflict: 409,
    ValidationFailed: 422,
    Unauthorized: 401,
    Forbidden: 403,
    TooManyRequests: 429,
}

HTTP_CODES = {401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": jsonable_encoder(details)}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        status = next((s for cls, s in STATUS_BY_ERROR.items() if isinstance(exc, cls)), 400)
        headers = {"WWW-Authenticate": "Bearer"} if status == 401 else None
        if status == 429 and isinstance(exc.details, dict) and "retry_after_s" in exc.details:
            headers = {"Retry-After": str(int(exc.details["retry_after_s"]))}
        return JSONResponse(error_body(exc.code, exc.message, exc.details), status, headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]}
                   for e in exc.errors()]
        return JSONResponse(
            error_body("validation_error", "Sorğu məlumatları yanlışdır", details), 422
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = HTTP_CODES.get(exc.status_code, "http_error")
        return JSONResponse(error_body(code, str(exc.detail)), exc.status_code)

    @app.exception_handler(Exception)
    async def unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        log.exception("Unhandled error", exc_info=exc)
        return JSONResponse(error_body("internal_error", "Daxili server xətası"), 500)
