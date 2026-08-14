from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .ingest import router as ingest_router

app = FastAPI(title="AgroFresh Report Hub API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest_router)


@app.get("/api/salud")
def salud() -> dict[str, str]:
    return {"estado": "ok"}
