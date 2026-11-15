"""ASGI entry point: `uvicorn app.main:app`."""
import logging

from .factory import create_app

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = create_app()

# Build the serialized street network now, so no request ever pays for it (about 250 ms).
app.state.container.roads_cache.gzipped()
