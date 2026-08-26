import logging
import traceback

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from . import config
from .auditoria import router as auditoria_router
from .correo import router as correo_router
from .catalogo import router as catalogo_router
from .emitir import router as emitir_router
from .ingest import router as ingest_router
from .listados import router as listados_router
from .postventa import router as postventa_router
from .reportes import router as reportes_router
from .storage import router as storage_router
from .toma_muestras import router as toma_muestras_router

app = FastAPI(title="AgroFresh Report Hub API")


class CapturaErrores(BaseHTTPMiddleware):
    """Convierte una excepción no capturada en un 500 con el error adentro.

    Sin esto, la respuesta la arma ServerErrorMiddleware, que está por FUERA
    del middleware de CORS: el 500 sale sin encabezados de CORS y el navegador
    tapa el error real con "blocked by CORS policy", mandando a buscar el
    problema donde no está. Pasó exactamente eso con una columna que faltaba
    en la base y costó un buen rato de diagnóstico.

    El orden del registro es lo que hace que funcione: este middleware tiene
    que quedar por DENTRO del de CORS, y para eso se agrega ANTES -el último
    que se agrega es el más externo-.
    """

    async def dispatch(self, request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            logging.error("Error no capturado en %s\n%s", request.url.path, traceback.format_exc())
            return JSONResponse(status_code=500, content={"detail": f"{type(exc).__name__}: {exc}"})


app.add_middleware(CapturaErrores)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
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
app.include_router(correo_router)


@app.get("/api/salud")
def salud() -> dict[str, str]:
    return {"estado": "ok"}
