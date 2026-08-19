from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .auditoria import router as auditoria_router
from .catalogo import router as catalogo_router
from .emitir import router as emitir_router
from .ingest import router as ingest_router
from .reportes import router as reportes_router
from .storage import router as storage_router

app = FastAPI(title="AgroFresh Report Hub API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest_router)
app.include_router(reportes_router)
app.include_router(auditoria_router)
app.include_router(catalogo_router)
app.include_router(storage_router)
app.include_router(emitir_router)


@app.get("/api/salud")
def salud() -> dict[str, str]:
    return {"estado": "ok"}
