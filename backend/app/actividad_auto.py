"""Registro automático de TODO lo que se hace en el sistema (Administración General → Actividad).

El panel ya armaba la actividad uniendo tablas que existían (solicitudes creadas y enviadas, cargas, cruces,
verificaciones, informes). Eso no cubre todo: borrar un listado, editar un analito, descargar la BD, mover una
carpeta de Storage, cambiar un criterio… no dejaban rastro. Este módulo cierra el hueco por un solo lugar: un
middleware (`main.RegistroActividad`) mira cada llamada a la API y, si fue una acción que cambia algo (POST, PUT,
PATCH, DELETE) o una descarga, y terminó bien, la anota en `actividad_usuario` con un texto legible.

Reglas:
· Lo que YA anota otra fuente (o `actividad.registrar` a mano) se omite acá para no verlo dos veces.
· Las consultas que usan POST solo para leer (vista previa, validar, analizar) no cuentan.
· Una acción sin regla propia igual se anota con un texto genérico (módulo + verbo + ruta): nada queda sin rastro.
· Lo que se elimina va como «cambio sensible».
· Solo guarda desde que se instala: lo que pasó antes y no estaba en otra tabla no se puede reconstruir.
"""
from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from typing import Any

from . import seguridad
from .actividad import registrar
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

MUTAN = {"POST", "PUT", "PATCH", "DELETE"}


@dataclass(frozen=True)
class Regla:
    metodo: str
    patron: re.Pattern
    categoria: str
    accion: str
    texto: str
    modulo: str


def _r(metodo: str, patron: str, categoria: str, accion: str, texto: str, modulo: str) -> Regla:
    return Regla(metodo, re.compile(f"^{patron}/?$"), categoria, accion, texto, modulo)


# ── Lo que NO se anota acá ───────────────────────────────────────────────

OMITIR: list[re.Pattern] = [re.compile(f"^{p}/?$") for p in (
    # ya lo anota otra fuente o `actividad.registrar`
    r"/auth/(login|logout|verificar-clave)",
    r"/actividad/visita", r"/monitoreo/latido",
    r"/toma-muestras/solicitudes",                                   # creada: solicitud_archivo
    r"/toma-muestras/solicitudes-prueba",
    r"/toma-muestras/solicitudes/[^/]+/(enviar|cruce|cruzar-completo|muestra|peso-extraido|peso-hueso|quitar-informe)",
    r"/toma-muestras/solicitudes/[^/]+",                              # DELETE: solicitud_eliminada (el PUT sí va)
    r"/ingest/confirmar", r"/homogenizador-ingesta/confirmar", r"/ingest/cargas/[^/]+/deshacer",
    r"/auditoria-interna/informes",                                   # informe subido: informe_auditoria
    r"/correcciones",                                                  # correccion_converter
    r"/verificaciones/registros/[^/]+/seccion/[^/]+",                 # verif_seccion_lock
    r"/envio-informes/(enviar|modo|desbloquear|prueba|aviso/enviar-prueba)", r"/envio-informes/historial/[^/]+",
    r"/listas-distribucion/aplicar", r"/listas-distribucion/fijos", r"/funciones/report",
    r"/panel-inicio/config", r"/plan-entregables/confirmar",
    r"/usuarios", r"/usuarios/[^/]+", r"/usuarios/[^/]+/password-temporal",
    # POST que solo leen o prueban
    r"/ingest/(preview|validar-estructura)", r"/homogenizador-ingesta/analizar", r"/envio-informes/analizar",
    r"/envio-informes/(vista-previa|aviso/vista-previa)", r"/plan-entregables/analizar", r"/listas-distribucion/comparar",
    r"/datacore/validar", r"/correcciones/usos", r"/correo/prueba",
    # ruido: marcar notificaciones como leídas
    r"/notificaciones/leer-todas", r"/notificaciones/[^/]+/leer",
)]

# GET que son descargas o aperturas de un archivo.
DESCARGAS = re.compile(
    r"^/(auditoria-interna/carpetas/archivo|auditoria-interna/informes/[^/]+/pdf|auditoria/exportar|informes-cliente/descargar|"
    r"listados/exportar|listas-distribucion/excel|postventa/cliente/informes/[^/]+/pdf|postventa/registros/[^/]+/(pdf|originales/[^/]+)|"
    r"reportes/datos/excel|reportes/informe/[^/]+/pdf|storage/descargar|storage/r2/descargar|"
    r"toma-muestras/solicitudes/exportar-todo|toma-muestras/solicitudes/[^/]+/(excel|json|pdf|informe/pdf)|"
    r"verificaciones/excel|verificaciones/registros/[^/]+/(excel|pdf))/?$"
)

# ── Reglas con texto propio ──────────────────────────────────────────────
# (método, ruta sin /api, categoría, acción, texto, módulo). `{n}` = lo que dice el grupo «n» del patrón.

REGLAS: list[Regla] = [
    _r("POST", r"/auth/cambiar-password", "sensible", "cambio_clave", "cambió su contraseña", "Cuenta"),
    # Toma de muestras
    _r("PUT", r"/toma-muestras/solicitudes/(?P<n>[^/]+)", "solicitudes", "solicitud_editada", "editó la solicitud {n}", "Toma de muestras"),
    _r("POST", r"/toma-muestras/solicitudes/(?P<n>[^/]+)/reanalisis", "solicitudes", "reanalisis", "pidió un reanálisis de {n}", "Toma de muestras"),
    _r("POST", r"/toma-muestras/solicitudes/(?P<n>[^/]+)/fotos", "solicitudes", "foto_subida", "subió una foto a la solicitud {n}", "Toma de muestras"),
    _r("DELETE", r"/toma-muestras/solicitudes/(?P<n>[^/]+)/fotos/[^/]+", "sensible", "foto_eliminada", "eliminó una foto de la solicitud {n}", "Toma de muestras"),
    _r("POST", r"/toma-muestras/solicitudes/pdf-zip", "solicitudes", "descarga_zip", "descargó solicitudes en PDF (.zip)", "Toma de muestras"),
    _r("POST", r"/toma-muestras/solicitudes/json-zip", "solicitudes", "descarga_zip", "descargó solicitudes en JSON (.zip)", "Toma de muestras"),
    _r("POST", r"/toma-muestras/solicitudes/excel-zip", "solicitudes", "descarga_zip", "descargó solicitudes en Excel (.zip)", "Toma de muestras"),
    _r("POST", r"/toma-muestras/solicitudes/organizar-r2", "solicitudes", "organizar_r2", "reordenó las solicitudes en R2", "Toma de muestras"),
    # Ingesta / Converter / Data Core
    _r("POST", r"/ingest/pendientes/aprobar-lote", "cargas", "pendientes_aprobar", "aprobó filas pendientes en lote", "Ingesta de datos"),
    _r("POST", r"/ingest/pendientes/descartar-lote", "sensible", "pendientes_descartar", "descartó filas pendientes en lote", "Ingesta de datos"),
    _r("POST", r"/ingest/pendientes/reintentar", "cargas", "pendientes_reintentar", "reintentó las filas pendientes", "Ingesta de datos"),
    _r("POST", r"/ingest/pendientes/[^/]+/aprobar", "cargas", "pendiente_aprobada", "aprobó una fila pendiente", "Ingesta de datos"),
    _r("POST", r"/ingest/pendientes/[^/]+/descartar", "sensible", "pendiente_descartada", "descartó una fila pendiente", "Ingesta de datos"),
    _r("POST", r"/homogenizar/(?P<n>[^/]+)", "cargas", "homogenizar", "homogenizó valores de {n}", "Ingesta de datos"),
    _r("DELETE", r"/homogenizador-ingesta/cancelar/[^/]+", "cargas", "carga_cancelada", "canceló una carga en espera", "Ingesta de datos"),
    _r("POST", r"/ingest/auditoria-staging/promover", "cargas", "staging_promovida", "promovió la copia de trabajo a la base", "Ingesta de datos"),
    _r("POST", r"/ingest/auditoria-staging/descartar", "sensible", "staging_descartada", "descartó la copia de trabajo", "Ingesta de datos"),
    _r("DELETE", r"/correcciones/(?P<n>[^/]+)", "sensible", "correccion_olvidada", "hizo olvidar una corrección del Converter", "Converter"),
    # Laboratorio
    _r("POST", r"/emitir/cromatografia/parsear-gc/completo", "laboratorio", "gc_subido", "subió el resultado del GC", "AgroFresh Lab"),
    _r("POST", r"/emitir/cromatografia/subir-bd", "laboratorio", "informe_a_report", "subió resultados propios a Report", "AgroFresh Lab"),
    _r("POST", r"/emitir/cromatografia/(excel|excel-con-muestra|detalle-gc/excel|informes-pdf)", "laboratorio", "descarga_lab", "descargó un archivo de Ingreso al laboratorio", "AgroFresh Lab"),
    _r("PUT", r"/emitir/cromatografia/config-informe", "laboratorio", "config_informe", "cambió la configuración del informe propio", "AgroFresh Lab"),
    _r("POST", r"/fortificados", "laboratorio", "fortificado_creado", "anotó un fortificado", "AgroFresh Lab"),
    _r("PUT", r"/fortificados/[^/]+", "laboratorio", "fortificado_corregido", "corrigió un fortificado", "AgroFresh Lab"),
    _r("DELETE", r"/fortificados/[^/]+", "sensible", "fortificado_eliminado", "eliminó un fortificado", "AgroFresh Lab"),
    # Verificaciones
    _r("PUT", r"/verificaciones/registros/(?P<n>[^/]+)", "verificaciones", "dia_guardado", "guardó el registro del {n}", "Verificaciones"),
    _r("POST", r"/verificaciones/registros/(?P<n>[^/]+)/firmar", "verificaciones", "dia_firmado", "firmó el registro del {n}", "Verificaciones"),
    _r("DELETE", r"/verificaciones/registros/(?P<n>[^/]+)", "sensible", "dia_eliminado", "eliminó el registro del {n}", "Verificaciones"),
    _r("DELETE", r"/verificaciones/registros/(?P<n>[^/]+)/secciones/(?P<s>[^/]+)", "sensible", "seccion_limpiada", "limpió la sección {s} del {n}", "Verificaciones"),
    # Informes / auditoría / envío
    _r("DELETE", r"/auditoria-interna/carpetas/(archivo|carpeta)", "sensible", "auditoria_borrado", "eliminó un archivo o carpeta de Auditoría", "Panel de control interno"),
    _r("POST", r"/auditoria-interna/carpetas/renombrar", "informes", "auditoria_renombrado", "renombró un archivo o carpeta de Auditoría", "Panel de control interno"),
    _r("POST", r"/auditoria-interna/carpetas/zip", "informes", "descarga_zip", "descargó informes de Auditoría en .zip", "Panel de control interno"),
    _r("PATCH", r"/auditoria-interna/informes/(?P<n>[^/]+)/fecha-envio", "informes", "fecha_envio", "cambió la fecha de envío de un informe", "Panel de control interno"),
    _r("PUT", r"/auditoria-interna/plazos", "informes", "plazos", "cambió los plazos de entrega", "Panel de control interno"),
    _r("POST", r"/envio-cliente/marcar", "informes", "marcado_enviado", "marcó informes como enviados al cliente", "Panel de control interno"),
    _r("POST", r"/envio-cliente/desmarcar", "informes", "desmarcado_enviado", "quitó la marca de enviado al cliente", "Panel de control interno"),
    _r("PUT", r"/envio-informes/(aviso|encabezado|internos)", "informes", "envio_config", "cambió la configuración de Envío de informes", "Envío de informes"),
    _r("DELETE", r"/envio-informes/aviso", "sensible", "aviso_restaurado", "restauró el aviso a clientes original", "Envío de informes"),
    _r("PUT", r"/envio-informes/template/[^/]+", "informes", "plantilla_informe", "cambió la plantilla del correo de informes", "Envío de informes"),
    # Report
    _r("POST", r"/reportes/bd/excel", "report", "descarga_bd", "descargó la BD en Excel", "Report"),
    _r("POST", r"/reportes/analitos", "report", "analito_creado", "creó un analito", "Report"),
    _r("PUT", r"/reportes/analitos/[^/]+", "report", "analito_editado", "editó un analito", "Report"),
    _r("DELETE", r"/reportes/analitos/[^/]+", "sensible", "analito_eliminado", "eliminó un analito", "Report"),
    _r("POST", r"/reportes/limites", "report", "limite_creado", "cargó un límite residual", "Report"),
    _r("PUT", r"/reportes/limites/[^/]+", "report", "limite_editado", "editó un límite residual", "Report"),
    _r("DELETE", r"/reportes/limites/[^/]+", "sensible", "limite_eliminado", "eliminó un límite residual", "Report"),
    # Post Venta
    _r("POST", r"/postventa/registros", "postventa", "lectura_cargada", "cargó una lectura de Trace", "Post Venta"),
    _r("POST", r"/postventa/registros/(?P<n>[^/]+)/informe", "postventa", "informe_generado", "generó el informe de una carga de Trace", "Post Venta"),
    _r("DELETE", r"/postventa/registros/[^/]+", "sensible", "lectura_eliminada", "eliminó una carga de Trace", "Post Venta"),
    _r("POST", r"/postventa/registros/eliminar", "sensible", "lecturas_eliminadas", "eliminó varias cargas de Trace", "Post Venta"),
    # Storage
    _r("POST", r"/storage/(r2/)?carpetas", "storage", "carpeta_creada", "creó una carpeta en Storage", "Storage"),
    _r("POST", r"/storage/(r2/)?subir", "storage", "archivo_subido", "subió un archivo a Storage", "Storage"),
    _r("PUT", r"/storage/(r2/)?renombrar", "storage", "renombrado", "renombró algo en Storage", "Storage"),
    _r("PUT", r"/storage/(r2/)?mover", "storage", "movido", "movió algo en Storage", "Storage"),
    _r("DELETE", r"/storage/(r2/)?eliminar", "sensible", "storage_eliminado", "eliminó algo de Storage", "Storage"),
    _r("PUT", r"/storage/permisos", "sensible", "storage_permisos", "cambió los permisos de una carpeta de Storage", "Storage"),
    # Administración
    _r("POST", r"/notificaciones", "administracion", "aviso_creado", "escribió un aviso", "Notificaciones"),
    _r("PUT", r"/notificaciones/[^/]+", "administracion", "aviso_editado", "editó un aviso", "Notificaciones"),
    _r("DELETE", r"/notificaciones/[^/]+", "sensible", "aviso_eliminado", "eliminó un aviso", "Notificaciones"),
    _r("PUT", r"/notificaciones/admin/suscripciones/[^/]+", "sensible", "suscripcion", "cambió quién recibe qué notificación", "Notificaciones"),
    _r("DELETE", r"/notificaciones/admin/suscripciones/[^/]+", "sensible", "suscripcion_restablecida", "restableció la suscripción de una cuenta", "Notificaciones"),
    _r("POST", r"/listados/importar(-maestro|/[^/]+)", "administracion", "listado_importado", "importó un Excel a Listados", "Listados"),
    _r("POST", r"/catalogo/[^/]+/importar", "administracion", "listado_importado", "importó un Excel a Listados", "Listados"),
    _r("POST", r"/(listados/eliminar-lote|catalogo/[^/]+/eliminar-lote)", "sensible", "listado_eliminado_lote", "eliminó valores de Listados en masa", "Listados"),
]

# Módulo y categoría según el primer tramo de la ruta, para lo que no tiene regla propia.
_POR_PREFIJO: list[tuple[str, str, str]] = [
    ("toma-muestras/config", "administracion", "Configuración de muestreo"),
    ("toma-muestras", "solicitudes", "Toma de muestras"),
    ("ingest", "cargas", "Ingesta de datos"), ("homogeniz", "cargas", "Ingesta de datos"), ("datacore", "cargas", "Data Core"),
    ("auditoria", "cargas", "Data Core"), ("emitir", "laboratorio", "AgroFresh Lab"), ("fortificados", "laboratorio", "AgroFresh Lab"),
    ("verificaciones", "verificaciones", "Verificaciones"), ("envio-informes", "informes", "Envío de informes"),
    ("envio-cliente", "informes", "Panel de control interno"), ("reportes", "report", "Report"), ("postventa", "postventa", "Post Venta"),
    ("storage", "storage", "Storage"), ("informes-cliente", "storage", "Storage"),
    ("listados", "administracion", "Listados"), ("catalogo", "administracion", "Listados"),
    ("laboratorios", "administracion", "Laboratorios"), ("notificaciones", "administracion", "Notificaciones"),
    ("listas-distribucion", "administracion", "Administración General"), ("plan-entregables", "administracion", "Administración General"),
]
_VERBO = {"POST": "ejecutó", "PUT": "modificó", "PATCH": "modificó", "DELETE": "eliminó"}


def _limpia(ruta: str) -> str:
    return (ruta or "").split("?")[0].rstrip("/") or "/"


def _generica(metodo: str, ruta: str) -> dict[str, Any]:
    """Una acción sin regla propia: módulo y verbo, y la ruta tal cual (con los ids como «#»)."""
    tramos = [t for t in ruta.strip("/").split("/") if t]
    sin_ids = ["#" if re.fullmatch(r"[0-9a-fA-F-]{6,}|\d+", t) else t for t in tramos]
    categoria, modulo = "otros", "Otros"
    for prefijo, cat, mod in _POR_PREFIJO:
        if ruta.strip("/").startswith(prefijo):
            categoria, modulo = cat, mod
            break
    sensible = metodo == "DELETE"
    return {
        "categoria": "sensible" if sensible else categoria,
        "accion": f"api_{metodo.lower()}",
        "texto": f"{_VERBO.get(metodo, 'ejecutó')} en {modulo}: {'/'.join(sin_ids)}",
        "modulo": modulo,
        "sensible": sensible,
    }


def describir(metodo: str, ruta: str) -> dict[str, Any] | None:
    """Qué anotar de una llamada a la API (`ruta` SIN el prefijo /api). `None` = no se anota."""
    metodo = (metodo or "").upper()
    ruta = _limpia(ruta)
    if metodo == "GET":
        if not DESCARGAS.match(ruta):
            return None
        categoria, modulo = "otros", "Otros"
        for prefijo, cat, mod in _POR_PREFIJO:
            if ruta.strip("/").startswith(prefijo):
                categoria, modulo = cat, mod
                break
        return {"categoria": categoria, "accion": "descarga", "texto": f"descargó o abrió un archivo ({ruta.strip('/')})",
                "modulo": modulo, "sensible": False}
    if metodo not in MUTAN:
        return None
    if any(p.match(ruta) for p in OMITIR if _aplica_a_metodo(p, metodo, ruta)):
        return None
    for r in REGLAS:
        if r.metodo != metodo:
            continue
        m = r.patron.match(ruta)
        if m:
            return {"categoria": r.categoria, "accion": r.accion, "texto": r.texto.format(**m.groupdict()),
                    "modulo": r.modulo, "sensible": r.categoria == "sensible"}
    return _generica(metodo, ruta)


def _aplica_a_metodo(patron: re.Pattern, metodo: str, ruta: str) -> bool:
    """`/toma-muestras/solicitudes/<archivo>` se omite solo para DELETE (ya queda como «solicitud eliminada»);
    el PUT (editar) sí se anota."""
    if patron.pattern == r"^/toma-muestras/solicitudes/[^/]+/?$":
        return metodo == "DELETE"
    return True


# ── Quién hizo la llamada ────────────────────────────────────────────────

_VISTAS: dict[tuple, float] = {}
_SEGUNDOS_DEDUP = 20.0


def usuario_de_token(token: str) -> tuple[str, str] | None:
    """(correo, nombre) de la sesión, o None. Solo lee; nunca lanza."""
    try:
        huella = seguridad.huella_token(token)
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(
                "SELECT u.email, u.nombre FROM sesion s JOIN usuario u ON u.id = s.usuario_id "
                "WHERE s.token_hash = %s AND s.expira_en > now()", (huella,))
            f = cur.fetchone()
        return (f["email"], f["nombre"]) if f else None
    except Exception:
        logger.warning("No se pudo identificar la sesión para la bitácora.", exc_info=True)
        return None


def anotar(token: str, metodo: str, ruta: str) -> None:
    """Anota la llamada (ya descrita por `describir`). Corre fuera del camino de la respuesta; nunca lanza."""
    try:
        info = describir(metodo, ruta)
        if not info:
            return
        quien = usuario_de_token(token)
        if not quien:
            return
        if metodo.upper() == "GET":  # abrir un PDF puede pedirlo varias veces seguidas
            clave = (quien[0], metodo, _limpia(ruta))
            ahora = time.monotonic()
            if ahora - _VISTAS.get(clave, -1e9) < _SEGUNDOS_DEDUP:
                return
            _VISTAS[clave] = ahora
            if len(_VISTAS) > 5000:
                _VISTAS.clear()
        registrar(quien[0], quien[1], info["categoria"], info["accion"], info["texto"], modulo=info["modulo"], sensible=info["sensible"])
    except Exception:
        logger.warning("No se pudo anotar la actividad automática.", exc_info=True)
