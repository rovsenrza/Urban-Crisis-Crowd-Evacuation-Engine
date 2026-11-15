"""FastAPI application factory."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from typing import AsyncIterator

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .api.shield import SosShield

from .api.errors import install_error_handlers
from .api.schemas import ErrorResponse
from .api.v1 import operator, public, sim
from .config import Settings, get_settings
from .container import Container, build_container
from .realtime.router import router as realtime_router

log = logging.getLogger(__name__)

API_PREFIX = "/api/v1"


async def _brigade_loop(container: Container) -> None:
    """Background ticker that moves en-route brigades on the map."""
    tick = container.settings.brigade_tick_s
    while True:
        await asyncio.sleep(tick)
        try:
            await container.brigades.tick(tick)
        except Exception:  # noqa: BLE001 - keep the ticker alive
            log.exception("Brigade tick failed")


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    settings = settings or get_settings()
    problems = settings.production_problems()
    if problems:
        # Fail fast and loudly: a production server with demo secrets is worse than no server.
        raise RuntimeError("Refusing to start with APP_ENV=production:\n  - " + "\n  - ".join(problems))
    container = container or build_container(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        task = (asyncio.create_task(_brigade_loop(container))
                if settings.brigade_sim_enabled else None)
        yield
        await container.scenarios.stop()
        if task:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description="Şəhər fövqəladə halları üçün vətəndaş təhlükəsizliyi və dispetçer API-si.",
        docs_url="/docs",
        openapi_url=f"{API_PREFIX}/openapi.json",
        lifespan=lifespan,
    )
    app.state.container = container
    # Innermost middleware: turns away a flooding address before routing (CORS headers still apply).
    app.add_middleware(SosShield)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origin_list, allow_methods=["*"],
        allow_headers=["*"],
    )
    # The road network payload is a few MB of coordinates; it compresses ~5×.
    app.add_middleware(GZipMiddleware, minimum_size=2000, compresslevel=4)
    install_error_handlers(app)

    error_responses = {code: {"model": ErrorResponse} for code in (401, 404, 409, 422)}
    v1 = APIRouter(prefix=API_PREFIX, responses=error_responses)
    v1.include_router(public.router)
    v1.include_router(operator.router)
    v1.include_router(sim.router)
    app.include_router(v1)
    app.include_router(realtime_router)
    return app
