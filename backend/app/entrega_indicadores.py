"""
Indicadores de entrega del Panel de control interno: lead time (de la solicitud a lo
entregado) y cumplimiento del entregable.

Todo se calcula sobre HITOS que el sistema ya guarda, uno por registro, sin
inventar ninguna fecha:

  emitida   solicitud_archivo.creado_en
  enviada   primer envío exitoso de la solicitud al laboratorio (envio_solicitud_log)
  informe   cuándo llegó el informe: la «fecha de envío» que anotó una persona al
            subir el PDF, y si no la hay, el momento en que se subió (informe_auditoria)
  report    cuándo se cargaron sus resultados (carga_datos, por solicitud.carga_id)
  cliente   SOLO el check manual «enviado al cliente» (envio_cliente_manual: Converter o
            Solicitudes e informes). El log de «Envío de informes» no cuenta.

Las solicitudes de prueba nunca entran. Cada fuente se lee por separado: si a una
le falta su migración, el resto sigue y ese hito queda vacío.

  observado  primera vez que una cuenta de cliente vio sus resultados en Report
             (informe_visto, migración 0057; lo anotan las cargas de Report de cada cliente)

Dos reglas editables, que guarda el admin general (`plazos_entrega.json`):
  - qué cuenta como «entregado»: `concretado` (PDF + resultados en Report) o `cliente`
    (el informe salió al cliente);
  - el plazo comprometido, en DÍAS HÁBILES (lunes a viernes, sin feriados), de cada
    laboratorio (`LAB`) y, si el análisis tiene su propio tiempo, de cada análisis de
    ese laboratorio (`LAB|ANÁLISIS`: el nombre del Análisis, no del analito). Sin plazo cargado no se calcula cumplimiento: nunca
    se asume uno.
El plazo corre desde la RECEPCIÓN ESTIMADA en el laboratorio: 24 horas después de emitida
la solicitud (no sabemos cuándo pasan a retirar las muestras). Esa cuenta vive en la
pantalla (`entrega.ts`), y todo cálculo está sujeto a ese supuesto.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import config_store
from .auditoria_interna import SQL_INFORME_EN_REPORT, puede_auditoria
from .auth import Usuario, planta_permitida, solo_admin_general
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auditoria-interna", tags=["auditoria-interna"])

ARCHIVO_PLAZOS = "plazos_entrega.json"
DEFINICIONES = ("concretado", "cliente")
PLAZO_MAXIMO = 365


def _iso(t) -> str | None:
    if t is None or t == "":
        return None
    # algunas columnas guardan la fecha como texto (p. ej. creado_en o fecha_envio)
    return t.isoformat() if hasattr(t, "isoformat") else str(t)


def _clave_lab(laboratorio: str | None) -> str:
    return (laboratorio or "").strip().upper()


def _clave_plazo(clave: str | None) -> str | None:
    """`LAB` o `LAB|ANÁLISIS` en mayúsculas y sin espacios sobrantes; None si no es válida."""
    lab, sep, analito = (clave or "").partition("|")
    lab, analito = _clave_lab(lab), analito.strip().upper()
    if not lab or (sep and not analito):
        return None
    return f"{lab}|{analito}" if sep else lab


# ── Reglas (plazos y definición de «entregado») ──────────────────────────

def leer_reglas() -> dict[str, Any]:
    try:
        cfg = config_store.leer(ARCHIVO_PLAZOS, {})  # type: ignore[arg-type]
    except (OSError, ValueError):
        cfg = {}
    if not isinstance(cfg, dict):
        cfg = {}
    plazos: dict[str, int] = {}
    crudos = cfg.get("plazos") if isinstance(cfg.get("plazos"), dict) else {}
    for clave, dias in crudos.items():
        k = _clave_plazo(clave)
        if k and isinstance(dias, int) and not isinstance(dias, bool) and 1 <= dias <= PLAZO_MAXIMO:
            plazos[k] = dias
    return {
        "entregado": cfg.get("entregado") if cfg.get("entregado") in DEFINICIONES else "concretado",
        "plazos": plazos,
        "cambiado_por": cfg.get("cambiado_por"),
        "cambiado_en": cfg.get("cambiado_en"),
    }


class ReglasIn(BaseModel):
    entregado: str
    # «LAB» o «LAB|ANÁLISIS» -> días hábiles; null o ausente = sin plazo
    plazos: dict[str, int | None] = Field(default_factory=dict)


def validar_reglas(body: ReglasIn) -> dict[str, Any]:
    if body.entregado not in DEFINICIONES:
        raise HTTPException(400, "«Entregado» debe ser «concretado» (PDF + Report) o «cliente» (enviado al cliente).")
    plazos: dict[str, int] = {}
    for clave, dias in body.plazos.items():
        if dias is None:
            continue
        k = _clave_plazo(clave)
        if k is None:
            raise HTTPException(400, "Falta el nombre del laboratorio o del análisis.")
        if not 1 <= dias <= PLAZO_MAXIMO:
            raise HTTPException(400, f"El plazo de {clave} debe estar entre 1 y {PLAZO_MAXIMO} días hábiles.")
        plazos[k] = dias
    return {"entregado": body.entregado, "plazos": plazos}


@router.get("/plazos")
def obtener_reglas(_: Usuario = Depends(puede_auditoria)) -> dict[str, Any]:
    return leer_reglas()


@router.put("/plazos")
def guardar_reglas(body: ReglasIn, usuario: Usuario = Depends(solo_admin_general)) -> dict[str, Any]:
    from datetime import datetime, timezone

    nuevas = validar_reglas(body)
    config_store.escribir(ARCHIVO_PLAZOS, {  # type: ignore[arg-type]
        **nuevas, "cambiado_por": usuario.email, "cambiado_en": datetime.now(timezone.utc).isoformat(),
    })
    return leer_reglas()


# ── Hitos ────────────────────────────────────────────────────────────────

def _filas(sql: str, params: tuple = ()) -> list[dict] | None:
    """Una consulta de solo lectura; `None` si falla (falta una tabla o columna)."""
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(sql, params)
            return list(cur.fetchall())
    except Exception:
        logger.warning("Indicadores de entrega: no se pudo leer una fuente.", exc_info=True)
        return None


def armar_hitos(
    base: list[dict],
    enviadas: dict[str, Any],
    reports: dict[str, Any],
    clientes: dict[str, Any],
    observados: dict[str, dict] | None = None,
    origen_cliente: dict[str, str] | None = None,
) -> list[dict]:
    """Une las fuentes por solicitud. Función pura: se prueba sin base."""
    salida = []
    for f in base:
        tiene_informe = f.get("subido_en") is not None
        informe = (f.get("fecha_envio") or f.get("subido_en")) if tiene_informe else None
        nro = f.get("nro_informe")
        salida.append({
            "archivo": f["archivo"],
            "emitida": _iso(f["emitida"]),
            "enviada": _iso(enviadas.get(f["archivo"])),
            "informe": _iso(informe),
            # De dónde sale la fecha del informe: la que anotó una persona, o cuándo se subió el PDF.
            "informe_fuente": None if not tiene_informe else ("fecha_envio" if f.get("fecha_envio") else "carga"),
            "report": _iso(reports.get(nro)) if nro else None,
            "en_report": bool(f.get("en_report")),
            # Con el check puesto, la fecha de envío es la que se anotó junto al informe («Fecha y hora
            # de envío»); solo si no hay, la del momento en que se marcó.
            "cliente": _iso((f.get("fecha_envio") or clientes[f["archivo"]]) if f["archivo"] in clientes else None),
            # De dónde sale: «envio» (Envío de informes, producción) o «manual: <quién lo marcó>».
            "cliente_origen": (origen_cliente or {}).get(f["archivo"]),
            # Reporte observado: la primera vez que un cliente vio sus resultados, y quiénes.
            "observado": _iso((observados or {}).get(nro, {}).get("t")) if nro else None,
            "observado_por": list((observados or {}).get(nro, {}).get("por") or []) if nro else [],
        })
    return salida


@router.get("/hitos")
def hitos(usuario: Usuario = Depends(puede_auditoria)) -> dict[str, Any]:
    """Los hitos de cada solicitud real (sin pruebas), para medir lead time y cumplimiento."""
    base = _filas(
        """
        SELECT sa.archivo, sa.sold_to, sa.ship_to, sa.creado_en AS emitida,
               COALESCE(ia.subido_en, rp.cargado_en) AS subido_en, ia.fecha_envio,
               COALESCE(ia.nro_informe, rp.nro_solicitud) AS nro_informe,
               ((ia.id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM solicitud s WHERE s.nro_solicitud = ia.nro_informe
               )) OR rp.nro_solicitud IS NOT NULL) AS en_report
        FROM solicitud_archivo sa
        LEFT JOIN LATERAL (
            SELECT * FROM informe_auditoria i
            WHERE i.archivo_solicitud = sa.archivo
            ORDER BY i.subido_en DESC LIMIT 1
        ) ia ON true
        """ + SQL_INFORME_EN_REPORT + """
        WHERE coalesce(sa.datos->>'es_prueba', '') <> 'true'
        """
    )
    if base is None:
        raise HTTPException(503, "No se pudieron leer las solicitudes.")
    # Un comercial ve los hitos solo de las solicitudes de sus plantas.
    base = [f for f in base if planta_permitida(usuario, f.get("sold_to"), f.get("ship_to"))]
    # Fecha de envío anotada a mano de informes que no pasan por Converter (migración 0061): sin la
    # tabla, o sin fila, no cambia nada. Solo vale si el informe no trae una fecha propia.
    manuales = {f["archivo"]: f["fecha_envio"] for f in _filas("SELECT archivo, fecha_envio FROM informe_fecha_manual") or []}
    for f in base:
        if f["archivo"] in manuales and f.get("fecha_envio") is None:
            f["fecha_envio"] = manuales[f["archivo"]]
            if f.get("subido_en") is None:
                f["subido_en"] = manuales[f["archivo"]]
    enviadas = {f["archivo"]: f["t"] for f in _filas(
        "SELECT archivo, min(creado_en) AS t FROM envio_solicitud_log WHERE exitoso GROUP BY archivo") or []}
    reports = {f["nro"]: f["t"] for f in _filas(
        """
        SELECT s.nro_solicitud AS nro, min(cd.creado_en) AS t
        FROM solicitud s JOIN carga_datos cd ON cd.id = s.carga_id
        WHERE s.nro_solicitud IS NOT NULL AND cd.deshecha_en IS NULL
        GROUP BY s.nro_solicitud
        """) or []}
    # «Enviado al cliente» tiene UNA sola fuente de verdad: el check que una persona marca a mano
    # (Converter al subir, o Solicitudes e informes después). Un envío hecho desde «Envío de
    # informes» NO cuenta por sí solo: no se asume nada.
    clientes: dict[str, Any] = {}
    origen: dict[str, str] = {}
    for f in _filas("SELECT archivo, enviado_en AS t, marcado_por FROM envio_cliente_manual") or []:
        previo = clientes.get(f["archivo"])
        if previo is None or f["t"] < previo:
            clientes[f["archivo"]] = f["t"]
            origen[f["archivo"]] = f"manual: {f.get('marcado_por') or '—'}"
    observados = {
        f["nro"]: {"t": f["t"], "por": f["por"]}
        for f in _filas(
            """
            SELECT s.nro_solicitud AS nro, min(v.primera_vez) AS t,
                   array_agg(DISTINCT coalesce(nullif(v.cliente, ''), v.usuario_email)
                             || CASE WHEN v.planta IS NOT NULL AND v.planta <> '' THEN ' · ' || v.planta ELSE '' END) AS por
            FROM informe_visto v JOIN solicitud s ON s.id = v.solicitud_id
            WHERE s.nro_solicitud IS NOT NULL
            GROUP BY s.nro_solicitud
            """) or []
    }
    return {
        "hitos": armar_hitos(base, enviadas, reports, clientes, observados, origen),
        "calidad": {"envios_a_clientes": None, "envios_amarrados": None},
    }
