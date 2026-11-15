"""First line of defence for the SOS endpoint: a raw ASGI middleware.

During a flood almost every request comes from an address that is already
over its limit. Rejecting those here, before routing, body parsing and
validation, costs a dictionary lookup instead of the whole framework stack,
which is what keeps the average response time low for everyone else
(dispatchers included) while the flood lasts.

The full set of checks (per citizen, duplicates, geofence) still runs in
`SosGuard` for requests that get past this point.
"""
from __future__ import annotations

import json
from typing import Any, Awaitable, Callable

Scope = dict[str, Any]
Receive = Callable[[], Awaitable[dict[str, Any]]]
Send = Callable[[dict[str, Any]], Awaitable[None]]

SOS_PATH = "/api/v1/sos"
_MESSAGE = "Bu ünvandan çox tez-tez SOS göndərilir. Bir qədər sonra yenidən cəhd edin."


def _client_address(scope: Scope, trust_forwarded: bool) -> str:
    if trust_forwarded:
        for name, value in scope.get("headers", ()):
            if name == b"x-forwarded-for":
                return value.decode("latin-1").split(",")[0].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


class SosShield:
    def __init__(self, app: Callable[[Scope, Receive, Send], Awaitable[None]]) -> None:
        self._app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] == "POST" and scope["path"] == SOS_PATH:
            container = scope["app"].state.container
            settings = container.settings
            address = _client_address(scope, settings.trust_forwarded_for)
            retry_after = container.limiter.peek(
                f"sos:ip:{address}", settings.sos_rate_per_ip, settings.sos_rate_window_s)
            if retry_after is not None:
                container.sos_guard.rejected += 1
                seconds = round(retry_after)
                body = json.dumps({"error": {"code": "rate_limited", "message": _MESSAGE,
                                             "details": {"retry_after_s": seconds}}},
                                  ensure_ascii=False).encode()
                await send({"type": "http.response.start", "status": 429, "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"retry-after", str(seconds).encode()),
                ]})
                await send({"type": "http.response.body", "body": body})
                return
        await self._app(scope, receive, send)
