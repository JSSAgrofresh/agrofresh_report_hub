import logging
import traceback

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from . import config
from .auth import router as auth_router, solo_interno, usuario_actual
from .auditoria import reparar_tablas_omitidas_post_promocion, router as auditoria_router
from .correo import router as correo_router
from .catalogo import router as catalogo_router
from .emitir import router as emitir_router
from .homogenizar_datos import router as homogenizar_router
from .ingest import router as ingest_router
from .laboratorios import router as laboratorios_router
from .listados import router as listados_router
from .postventa import router as postventa_router
from .reportes import router as reportes_router
from .storage import router as storage_router
from .toma_muestras import router as toma_muestras_router
from .usuarios import router as usuarios_router

app = FastAPI(title="AgroFresh Report Hub API")


@app.on_event("startup")
def reparar_promocion_anterior() -> None:
    reparar_tablas_omitidas_post_promocion()


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
    # Antes acá había un comodín `https://.*\.vercel\.app`, que dejaba
    # llamar a esta API desde CUALQUIER deploy de cualquier persona en Vercel.
    # Los dominios reales van en la variable CORS_ORIGINS.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Sin esto el navegador no deja leer Content-Disposition desde el
    # frontend (otro origen) -necesario para saber el nombre real del
    # archivo al descargar Excel/PDF generados-.
    expose_headers=["Content-Disposition"],
)

# El login es el único que no puede exigir sesión: es donde se consigue.
app.include_router(auth_router)

# Todo lo demás exige sesión, y se exige ACÁ, en un solo lugar. Ponerlo por
# router y no endpoint por endpoint es a propósito: son 131 endpoints, y basta
# olvidar la anotación en uno para dejar abierta la base entera. Así, un router
# nuevo que se agregue a esta lista nace protegido sin que nadie se acuerde.
CON_SESION = [Depends(usuario_actual)]

# Y casi todo exige, además, ser de AgroFresh. Una cuenta de cliente entra a
# ver SUS resultados: `reportes_router` es el único que necesita, y adentro
# cada consulta se acota a lo suyo. Todo lo demás -cargar datos, catálogos,
# solicitudes, correos, el padrón de cuentas- le queda cerrado desde acá.
SOLO_AGROFRESH = [Depends(solo_interno)]

app.include_router(reportes_router, dependencies=CON_SESION)

for _router in (
    ingest_router,
    auditoria_router,
    catalogo_router,
    listados_router,
    postventa_router,
    storage_router,
    emitir_router,
    toma_muestras_router,
    laboratorios_router,
    correo_router,
    usuarios_router,
    homogenizar_router,
):
    app.include_router(_router, dependencies=SOLO_AGROFRESH)


@app.get("/api/salud")
def salud() -> dict[str, str]:
    return {"estado": "ok"}
