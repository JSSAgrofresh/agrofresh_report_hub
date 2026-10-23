"""
Administración General → Funciones.

Interruptores del sistema que solo el administrador principal mueve, y siempre
con su contraseña. Hoy hay dos: **qué tipos de servicio muestra Report** y
**si Report muestra los gráficos de ALS y Diagnofruit** (línea de tiempo y serie de
tiempo; de fábrica apagados: solo se ve la tabla).

Cada solicitud cargada por Ingesta o Converter lleva su tipo de servicio
(`solicitud.servicio`, migración 0055). NULL o '' es Línea de proceso (todo lo
cargado hasta hoy). Report y todo lo que se alimenta de él muestran SOLO los
servicios que estén encendidos acá. De fábrica, solo Línea de proceso: lo cargado
de Actimist, Ecofog y RYD queda guardado pero no aparece en Report hasta que se
encienda.

Esto NO afecta al Panel de control interno, Solicitudes e informes, Envío de informes ni a
ninguna otra pantalla: solo a Report.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import actividad, config_store, confirmar_clave
from .auth import Usuario, solo_admin_general
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/funciones", tags=["funciones"])

ARCHIVO = "funciones.json"

# Clave de cada servicio -la que ve la pantalla- y su valor en `solicitud.servicio`
# (Línea de proceso es el vacío: NULL o '').
SERVICIOS_REPORT: dict[str, str] = {
    "linea_proceso": "",
    "actimist": "actimist",
    "ecofog": "ecofog",
    "ryd": "ryd",
}
ETIQUETAS: dict[str, str] = {
    "linea_proceso": "Línea de proceso",
    "actimist": "Actimist",
    "ecofog": "Ecofog",
    "ryd": "RYD",
}
# De fábrica: solo Línea de proceso.
POR_DEFECTO: dict[str, bool] = {"linea_proceso": True, "actimist": False, "ecofog": False, "ryd": False}


# La configuración viene de R2 y Report la consulta en cada pantalla: se recuerda unos
# segundos por proceso (el guardado la invalida; otro de los workers tarda a lo más esto en verlo).
_SEGUNDOS_CACHE = 15.0
_CACHE_CONFIG: dict[str, Any] = {"datos": None, "hasta": 0.0}


def invalidar() -> None:
    _CACHE_CONFIG["datos"] = None
    _CACHE_CONFIG["hasta"] = 0.0
    invalidar_columna()


def _leer_archivo() -> dict[str, Any]:
    ahora = time.monotonic()
    if _CACHE_CONFIG["datos"] is not None and ahora < _CACHE_CONFIG["hasta"]:
        return _CACHE_CONFIG["datos"]
    try:
        cfg = config_store.leer(ARCHIVO, {})  # type: ignore[arg-type]
    except (OSError, ValueError):
        cfg = {}
    cfg = cfg if isinstance(cfg, dict) else {}
    _CACHE_CONFIG["datos"] = cfg
    _CACHE_CONFIG["hasta"] = ahora + _SEGUNDOS_CACHE
    return cfg


def servicios_en_report() -> dict[str, bool]:
    """{clave: encendido}. Un archivo ausente, dañado o con una clave rara deja
    el valor de fábrica: nunca se muestra de más por un error de lectura."""
    cfg = _leer_archivo()
    report = cfg.get("report") if isinstance(cfg.get("report"), dict) else {}
    guardado = report.get("servicios") if isinstance(report.get("servicios"), dict) else {}
    return {k: (guardado[k] if isinstance(guardado.get(k), bool) else d) for k, d in POR_DEFECTO.items()}


def _report_guardado() -> dict[str, Any]:
    cfg = _leer_archivo()
    return cfg.get("report") if isinstance(cfg.get("report"), dict) else {}


def graficos_informes_activos() -> bool:
    """¿Report muestra la línea de tiempo y la serie de tiempo de ALS y Diagnofruit? De fábrica no:
    solo se ve la tabla. Un archivo ausente, dañado o con un valor raro deja apagado."""
    g = _report_guardado().get("graficos_informes")
    return bool(isinstance(g, dict) and g.get("activo") is True)


TEMAS_CLIENTE = ("basico", "sobrio")


def tema_cliente_activo() -> str:
    """Estilo del dashboard que ven los clientes y comerciales. De fábrica «basico» (el de siempre); un archivo
    ausente, dañado o con un valor raro deja «basico»."""
    t = _report_guardado().get("tema_cliente")
    valor = t.get("valor") if isinstance(t, dict) else None
    return valor if valor in TEMAS_CLIENTE else "basico"


# Estilo por cuenta (23-10-2026): además del predeterminado de arriba, el administrador principal puede dejar un
# estilo por TIPO de cuenta (cliente, comercial) y excepciones por cuenta. «clasico» = el marco interno de siempre
# (barra lateral); solo vale para comerciales.
TEMAS_CUENTA = ("basico", "sobrio", "clasico")
TIPOS_CON_PORTAL = ("cliente", "comercial")


def _temas_cuenta_guardado() -> dict[str, dict[str, str]]:
    t = _report_guardado().get("temas_cuenta")
    t = t if isinstance(t, dict) else {}
    tipos = t.get("tipos") if isinstance(t.get("tipos"), dict) else {}
    usuarios = t.get("usuarios") if isinstance(t.get("usuarios"), dict) else {}
    return {
        "tipos": {k: v for k, v in tipos.items() if k in TIPOS_CON_PORTAL and v in TEMAS_CUENTA},
        "usuarios": {str(k): v for k, v in usuarios.items() if v in TEMAS_CUENTA},
    }


def tema_de_cuenta(usuario_id: str | int | None, tipo_acceso: str | None) -> str:
    """El estilo que ve ESTA cuenta: su excepción, si no el de su tipo, si no el predeterminado. «clasico» (marco
    interno) solo lo puede tener un comercial; para cualquier otro cae al predeterminado."""
    cfg = _temas_cuenta_guardado()
    tema = cfg["usuarios"].get(str(usuario_id)) or cfg["tipos"].get(tipo_acceso or "") or tema_cliente_activo()
    if tema == "clasico" and tipo_acceso != "comercial":
        return tema_cliente_activo()
    return tema


def valores_visibles_en_report() -> list[str]:
    """Los valores de `solicitud.servicio` que Report puede mostrar ('' = Línea de proceso)."""
    encendidos = servicios_en_report()
    return [SERVICIOS_REPORT[k] for k in SERVICIOS_REPORT if encendidos.get(k)]


# ---------------------------------------------------------------------------
# Condición SQL para Report

_CACHE_COLUMNA: dict[str, Any] = {"existe": None, "hasta": 0.0}
_SEGUNDOS_SIN_COLUMNA = 60.0


def invalidar_columna() -> None:
    _CACHE_COLUMNA["existe"] = None
    _CACHE_COLUMNA["hasta"] = 0.0


def columna_servicio_existe() -> bool:
    """¿Ya se corrió la migración 0055? Si existe se recuerda para siempre; si no,
    se vuelve a mirar cada minuto (el servidor se migra con el backend prendido)."""
    ahora = time.monotonic()
    if _CACHE_COLUMNA["existe"] is True:
        return True
    if _CACHE_COLUMNA["existe"] is False and ahora < _CACHE_COLUMNA["hasta"]:
        return False
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(
                "SELECT 1 AS ok FROM information_schema.columns WHERE table_name = 'solicitud' "
                "AND column_name = 'servicio' AND table_schema = ANY(current_schemas(false))"
            )
            existe = cur.fetchone() is not None
    except Exception:  # noqa: BLE001 - sin base no hay nada que filtrar
        logger.exception("No se pudo comprobar la columna solicitud.servicio")
        return False
    _CACHE_COLUMNA["existe"] = existe
    _CACHE_COLUMNA["hasta"] = ahora + _SEGUNDOS_SIN_COLUMNA
    return existe


def condicion_report(alias: str = "s") -> tuple[str, dict[str, Any]]:
    """El `AND ...` que deja en Report solo los servicios encendidos, y sus
    parámetros. Sin la migración 0055 no hay nada que filtrar (todo es Línea de
    proceso) y devuelve vacío."""
    if not columna_servicio_existe():
        return "", {}
    return f"AND COALESCE({alias}.servicio, '') = ANY(%(servicios_report)s)", {
        "servicios_report": valores_visibles_en_report()
    }


# ---------------------------------------------------------------------------
# API

def _cuentas_con_portal() -> list[dict[str, Any]]:
    """Las cuentas de cliente y comercial con el estilo que ve cada una hoy. Si la base no responde, lista vacía."""
    try:
        from .db import conexion, cursor_dict

        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(
                "SELECT id, nombre, email, tipo_acceso, cliente_nombre, planta_nombre FROM usuario "
                "WHERE tipo_acceso = ANY(%s) ORDER BY tipo_acceso, nombre",
                (list(TIPOS_CON_PORTAL),),
            )
            filas = cur.fetchall()
    except Exception:
        return []
    cfg = _temas_cuenta_guardado()
    return [
        {
            "id": str(f["id"]),
            "nombre": f["nombre"],
            "email": f["email"],
            "tipo": f["tipo_acceso"],
            "cliente": f.get("cliente_nombre"),
            "planta": f.get("planta_nombre"),
            "tema": tema_de_cuenta(f["id"], f["tipo_acceso"]),
            "propio": str(f["id"]) in cfg["usuarios"],
        }
        for f in filas
    ]


def _estado_temas_cuenta() -> dict[str, Any]:
    guardado = _report_guardado().get("temas_cuenta")
    guardado = guardado if isinstance(guardado, dict) else {}
    cfg = _temas_cuenta_guardado()
    return {
        "tipos": {t: cfg["tipos"].get(t) for t in TIPOS_CON_PORTAL},
        "cuentas": _cuentas_con_portal(),
        "cambiado_por": guardado.get("cambiado_por"),
        "cambiado_en": guardado.get("cambiado_en"),
    }


def _estado() -> dict[str, Any]:
    report = _report_guardado()
    graficos = report.get("graficos_informes") if isinstance(report.get("graficos_informes"), dict) else {}
    tema = report.get("tema_cliente") if isinstance(report.get("tema_cliente"), dict) else {}
    return {
        "tema_cliente": {
            "valor": tema_cliente_activo(),
            "cambiado_por": tema.get("cambiado_por"),
            "cambiado_en": tema.get("cambiado_en"),
        },
        "temas_cuenta": _estado_temas_cuenta(),
        "graficos_informes": {
            "activo": graficos_informes_activos(),
            "cambiado_por": graficos.get("cambiado_por"),
            "cambiado_en": graficos.get("cambiado_en"),
        },
        "report": {
            "servicios": [
                {"clave": k, "etiqueta": ETIQUETAS[k], "activo": v}
                for k, v in servicios_en_report().items()
            ],
            "cambiado_por": report.get("cambiado_por"),
            "cambiado_en": report.get("cambiado_en"),
        },
        "migracion_pendiente": not columna_servicio_existe(),
    }


@router.get("")
def obtener(_: Usuario = Depends(solo_admin_general)) -> dict[str, Any]:
    return _estado()


class ServicioReportIn(BaseModel):
    servicio: str
    activo: bool
    password: str | None = None


def _es_principal(usuario: Usuario) -> bool:
    return confirmar_clave.es_principal(usuario)


def _clave_correcta(usuario: Usuario, password: str | None) -> bool:
    return confirmar_clave.clave_correcta(usuario, password)


@router.put("/report")
def cambiar_servicio_report(body: ServicioReportIn, usuario: Usuario = Depends(solo_admin_general)) -> dict[str, Any]:
    """Enciende o apaga un servicio en Report. Solo el administrador principal y
    siempre con su contraseña, tanto para encender como para apagar."""
    if body.servicio not in SERVICIOS_REPORT:
        raise HTTPException(400, f"Servicio desconocido: {body.servicio or '(vacío)'}")
    if not _es_principal(usuario):
        raise HTTPException(403, "Solo el administrador principal puede cambiar estas funciones.")
    if not _clave_correcta(usuario, body.password):
        # 403 y no 401: un 401 cierra la sesión de quien solo se equivocó al escribir la clave.
        raise HTTPException(403, "Contraseña incorrecta.")
    actual = servicios_en_report()
    if actual[body.servicio] != body.activo:
        actual[body.servicio] = body.activo
        cfg = _leer_archivo()
        # Se conserva lo demás de `report` (el interruptor de los gráficos): solo cambian los servicios.
        cfg["report"] = {
            **_report_guardado(),
            "servicios": actual,
            "cambiado_por": usuario.nombre,
            "cambiado_en": datetime.now(timezone.utc).isoformat(),
        }
        config_store.escribir(ARCHIVO, cfg)  # type: ignore[arg-type]
        invalidar()
        actividad.registrar(
            usuario.email, usuario.nombre, "sensible", "funciones_report",
            f"{'encendió' if body.activo else 'apagó'} {ETIQUETAS[body.servicio]} en Report",
            sensible=True,
        )
    return _estado()


class GraficosInformesIn(BaseModel):
    activo: bool
    password: str | None = None


@router.put("/graficos-informes")
def cambiar_graficos_informes(body: GraficosInformesIn, usuario: Usuario = Depends(solo_admin_general)) -> dict[str, Any]:
    """Enciende o apaga los gráficos de ALS y Diagnofruit en Report (apagados, queda solo la tabla).
    Solo el administrador principal y siempre con su contraseña, para encender y para apagar."""
    if not _es_principal(usuario):
        raise HTTPException(403, "Solo el administrador principal puede cambiar estas funciones.")
    if not _clave_correcta(usuario, body.password):
        # 403 y no 401: un 401 cierra la sesión de quien solo se equivocó al escribir la clave.
        raise HTTPException(403, "Contraseña incorrecta.")
    if graficos_informes_activos() != body.activo:
        cfg = _leer_archivo()
        cfg["report"] = {
            **_report_guardado(),
            "graficos_informes": {
                "activo": body.activo,
                "cambiado_por": usuario.nombre,
                "cambiado_en": datetime.now(timezone.utc).isoformat(),
            },
        }
        config_store.escribir(ARCHIVO, cfg)  # type: ignore[arg-type]
        invalidar()
        actividad.registrar(
            usuario.email, usuario.nombre, "sensible", "funciones_report",
            f"{'encendió' if body.activo else 'apagó'} los gráficos de ALS y Diagnofruit en Report",
            sensible=True,
        )
    return _estado()


class TemaClienteIn(BaseModel):
    tema: str
    password: str | None = None


@router.put("/tema-cliente")
def cambiar_tema_cliente(body: TemaClienteIn, usuario: Usuario = Depends(solo_admin_general)) -> dict[str, Any]:
    """Deja como predeterminado el estilo del dashboard de clientes (basico o sobrio). Solo el administrador
    principal y siempre con su contraseña. El administrador general puede ver ambos desde la Vista de cliente."""
    if body.tema not in TEMAS_CLIENTE:
        raise HTTPException(400, f"Estilo desconocido: {body.tema or '(vacío)'}")
    if not _es_principal(usuario):
        raise HTTPException(403, "Solo el administrador principal puede cambiar estas funciones.")
    if not _clave_correcta(usuario, body.password):
        # 403 y no 401: un 401 cierra la sesión de quien solo se equivocó al escribir la clave.
        raise HTTPException(403, "Contraseña incorrecta.")
    if tema_cliente_activo() != body.tema:
        cfg = _leer_archivo()
        cfg["report"] = {
            **_report_guardado(),
            "tema_cliente": {
                "valor": body.tema,
                "cambiado_por": usuario.nombre,
                "cambiado_en": datetime.now(timezone.utc).isoformat(),
            },
        }
        config_store.escribir(ARCHIVO, cfg)  # type: ignore[arg-type]
        invalidar()
        actividad.registrar(
            usuario.email, usuario.nombre, "sensible", "funciones_report",
            f"dejó el estilo «{body.tema}» como el dashboard de los clientes",
            sensible=True,
        )
    return _estado()


class TemaCuentaIn(BaseModel):
    """Un estilo para un TIPO de cuenta (`tipo`) o para UNA cuenta (`usuario_id`). `tema` = null quita la regla."""

    tipo: str | None = None
    usuario_id: str | None = None
    tema: str | None = None
    password: str | None = None


@router.put("/tema-cuenta")
def cambiar_tema_cuenta(body: TemaCuentaIn, usuario: Usuario = Depends(solo_admin_general)) -> dict[str, Any]:
    """Deja el estilo de un tipo de cuenta (cliente o comercial) o de una cuenta en particular. Solo el administrador
    principal y con su contraseña (403, nunca 401)."""
    if (body.tipo is None) == (body.usuario_id is None):
        raise HTTPException(400, "Indica un tipo de cuenta o una cuenta, no los dos.")
    if body.tema is not None and body.tema not in TEMAS_CUENTA:
        raise HTTPException(400, f"Estilo desconocido: {body.tema or '(vacío)'}")
    if body.tipo is not None and body.tipo not in TIPOS_CON_PORTAL:
        raise HTTPException(400, f"Tipo de cuenta desconocido: {body.tipo}")
    if body.tipo == "cliente" and body.tema == "clasico":
        raise HTTPException(400, "El marco interno solo vale para comerciales.")
    if not _es_principal(usuario):
        raise HTTPException(403, "Solo el administrador principal puede cambiar estas funciones.")
    if not _clave_correcta(usuario, body.password):
        raise HTTPException(403, "Contraseña incorrecta.")
    destino = f"el tipo «{body.tipo}»" if body.tipo else "una cuenta"
    cfg = _temas_cuenta_guardado()
    if body.usuario_id is not None:
        try:
            from .db import conexion, cursor_dict

            with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
                cur.execute("SELECT nombre, tipo_acceso FROM usuario WHERE id = %s", (int(body.usuario_id),))
                fila = cur.fetchone()
        except (ValueError, TypeError):
            fila = None
        if not fila or fila["tipo_acceso"] not in TIPOS_CON_PORTAL:
            raise HTTPException(404, "Esa cuenta no es de cliente ni de comercial.")
        if body.tema == "clasico" and fila["tipo_acceso"] != "comercial":
            raise HTTPException(400, "El marco interno solo vale para comerciales.")
        destino = f"la cuenta {fila['nombre']}"
        grupo, clave = "usuarios", str(body.usuario_id)
    else:
        grupo, clave = "tipos", str(body.tipo)
    if body.tema is None:
        cfg[grupo].pop(clave, None)
    else:
        cfg[grupo][clave] = body.tema
    archivo = _leer_archivo()
    archivo["report"] = {
        **_report_guardado(),
        "temas_cuenta": {
            **cfg,
            "cambiado_por": usuario.nombre,
            "cambiado_en": datetime.now(timezone.utc).isoformat(),
        },
    }
    config_store.escribir(ARCHIVO, archivo)  # type: ignore[arg-type]
    invalidar()
    actividad.registrar(
        usuario.email, usuario.nombre, "sensible", "funciones_report",
        f"dejó el estilo «{body.tema or 'predeterminado'}» para {destino}",
        sensible=True,
    )
    return _estado()
