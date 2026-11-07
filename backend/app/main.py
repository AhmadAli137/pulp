"""PULP API. Run:  uvicorn app.main:app --reload --port 8000  (from the backend/ folder)."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from .api.decision import router as decision_router
from .api.voice import router as voice_router

from .api.routes import router
from .services.data_store import get_store
from .services.financial_profiles import get_population

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pulp")


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = get_store()
    log.info("Loaded %d accounts from %s", len(store.account_ids), store.data_dir)
    get_population()
    log.info("Population table ready")
    yield


app = FastAPI(
    title="PULP API — Planning Under Life’s Pressures",
    version="1.0.0",
    description=(
        "Financial resilience engine for the Tangerine track (Sheridan Datathon 2026). "
        "Official sponsor calculations, shock simulation, matched-cohort research, Monte Carlo futures, "
        "strategy comparison, structured life context and adaptive replanning."
    ),
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000", "http://127.0.0.1:8000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(decision_router)
app.include_router(voice_router)
WEB = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
if (WEB / 'assets').exists():
    app.mount('/assets', StaticFiles(directory=WEB / 'assets'), name='assets')


@app.get('/pcm-worklet.js', include_in_schema=False)
def worklet():
    return FileResponse(WEB / 'pcm-worklet.js', media_type='application/javascript')


@app.get("/")
def root():
    if (WEB / 'index.html').exists():
        return FileResponse(WEB / 'index.html')
    return {"name": "PULP API", "docs": "/docs", "health": "/api/health", "frontend": "Run npm run build in frontend"}


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("app.main:app", host=os.environ.get("EVERPATH_HOST", "127.0.0.1"), port=int(os.environ.get("EVERPATH_PORT", "8000")), reload=False)
