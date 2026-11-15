"""Domain-level errors. The API layer maps `code` to an HTTP status."""
from __future__ import annotations

from typing import Any


class DomainError(Exception):
    code = "domain_error"

    def __init__(self, message: str, code: str | None = None, details: Any = None) -> None:
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        self.details = details


class NotFound(DomainError):
    code = "not_found"


class Conflict(DomainError):
    code = "conflict"


class ValidationFailed(DomainError):
    code = "validation_error"


class Unauthorized(DomainError):
    code = "unauthorized"


class Forbidden(DomainError):
    """Signed in, but the role does not allow this operation."""

    code = "forbidden"


class TooManyRequests(DomainError):
    """Rate limit hit. `details["retry_after_s"]` says when to try again."""

    code = "rate_limited"
