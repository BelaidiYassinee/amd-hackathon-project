from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from backend.app import state  # noqa: E402
from backend.app.api import alerts, decide, plant  # noqa: E402  (importing alerts registers its reset hook)


@asynccontextmanager
async def lifespan(app: FastAPI):
    state.reset()
    task = asyncio.create_task(state.run_loop())
    yield
    task.cancel()


app = FastAPI(title="Operion", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"]
)
app.include_router(plant.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(decide.router, prefix="/api")

dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="web")