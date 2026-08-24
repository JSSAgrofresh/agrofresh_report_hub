from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .auditoria import router as auditoria_router
from .catalogo import router as catalogo_router
from .emitir import router as emitir_router
from .ingest import router as ingest_router
from .listados import router as listados_router
from .postventa import router as postventa_router
from .reportes import router as reportes_router
from .storage import router as storage_router
from .toma_muestras import router as toma_muestras_router

app = FastAPI(title="AgroFresh Report Hub API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    # Sin esto el navegador no deja leer Content-Disposition desde el
    # frontend (otro origen) -necesario para saber el nombre real del
    # archivo al descargar Excel/PDF generados-.
    expose_headers=["Content-Disposition"],
)

app.include_router(ingest_router)
app.include_router(reportes_router)
app.include_router(auditoria_router)
app.include_router(catalogo_router)
app.include_router(listados_router)
app.include_router(postventa_router)
app.include_router(storage_router)
app.include_router(emitir_router)
app.include_router(toma_muestras_router)


@app.get("/api/salud")
def salud() -> dict[str, str]:
    return {"estado": "ok"}
