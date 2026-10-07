"""
Indicadores de entrega de Auditoría interna: lead time (de la solicitud a lo
entregado) y cumplimiento del entregable.

Todo se calcula sobre HITOS que el sistema ya guarda, uno por registro, sin
inventar ninguna fecha:

  emitida   solicitud_archivo.creado_en
  enviada   primer envío exitoso de la solicitud al laboratorio (envio_solicitud_log)
  informe   cuándo llegó el informe: la «fecha de envío» que anotó una persona al
            subir el PDF, y si no la hay, el momento en que se subió (informe_auditoria)
  report    cuándo se cargaron sus resultados (carga_datos, por solicitud.carga_id)
  cliente   primer envío exitoso en PRODUCCIÓN desde «Envío de informes» (envio_informe_log,
            amarrado a la solicitud desde la migración 0054; lo anterior no tiene amarre)

Las solicitudes de prueba nunca entran. Cada fuente se lee por separado: si a una
le falta su migración, el resto sigue y ese hito queda vacío.

Dos reglas editables, que guarda el admin general (`plazos_entrega.json`):
  - qué cuenta como «entregado»: `concretado` (PDF + resultados en Report) o `cliente`
    (el informe salió al cliente);
  - el plazo comprometido, en días, de cada laboratorio. Sin plazo cargado no se calcula
    cumplimiento: nunca se asume uno.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import config_store
from .auditoria_interna import puede_auditoria
from .auth import Usuario, solo_admin_general
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auditoria-interna", tags=["auditoria-interna"])

ARCHIVO_PLAZOS = "plazos_entrega.json"
DEFINICIONES = ("concretado", "cliente")
PLAZO_MAXIMO = 365


def _iso(t) -> str | None:
    return t.isoformat() if t is not None else None


def _clave_lab(laboratorio: str | None) -> str:
    return (laboratorio or "").strip().upper()


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
    for lab, dias in crudos.items():
        if isinstance(dias, int) and not isinstance(dias, bool) and 1 <= dias <= PLAZO_MAXIMO and _clave_lab(lab):
            plazos[_clave_lab(lab)] = dias
    return {
        "entregado": cfg.get("entregado") if cfg.get("entregado") in DEFINICIONES else "concretado",
        "plazos": plazos,
        "cambiado_por": cfg.get("cambiado_por"),
        "cambiado_en": cfg.get("cambiado_en"),
    }


class ReglasIn(BaseModel):
    entregado: str
    # laboratorio -> días; null o ausente = sin plazo
    plazos: dict[str, int | None] = Field(default_factory=dict)


def validar_reglas(body: ReglasIn) -> dict[str, Any]:
    if body.entregado not in DEFINICIONES:
        raise HTTPException(400, "«Entregado» debe ser «concretado» (PDF + Report) o «cliente» (enviado al cliente).")
    plazos: dict[str, int] = {}
    for lab, dias in body.plazos.items():
        if dias is None:
            continue
        if not _clave_lab(lab):
            raise HTTPException(400, "Falta el nombre del laboratorio.")
        if not 1 <= dias <= PLAZO_MAXIMO:
            raise HTTPException(400, f"El plazo de {lab} debe estar entre 1 y {PLAZO_MAXIMO} días.")
        plazos[_clave_lab(lab)] = dias
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
            "cliente": _iso(clientes.get(f["archivo"])),
        })
    return salida


@router.get("/hitos")
def hitos(_: Usuario = Depends(puede_auditoria)) -> dict[str, Any]:
    """Los hitos de cada solicitud real (sin pruebas), para medir lead time y cumplimiento."""
    base = _filas(
        """
        SELECT sa.archivo, sa.creado_en AS emitida, ia.subido_en, ia.fecha_envio, ia.nro_informe,
               (ia.id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM solicitud s WHERE s.nro_solicitud = ia.nro_informe
               )) AS en_report
        FROM solicitud_archivo sa
        LEFT JOIN LATERAL (
            SELECT * FROM informe_auditoria i
            WHERE i.archivo_solicitud = sa.archivo
            ORDER BY i.subido_en DESC LIMIT 1
        ) ia ON true
        WHERE coalesce(sa.datos->>'es_prueba', '') <> 'true'
        """
    )
    if base is None:
        raise HTTPException(503, "No se pudieron leer las solicitudes.")
    enviadas = {f["archivo"]: f["t"] for f in _filas(
        "SELECT archivo, min(creado_en) AS t FROM envio_solicitud_log WHERE exitoso GROUP BY archivo") or []}
    reports = {f["nro"]: f["t"] for f in _filas(
        """
        SELECT s.nro_solicitud AS nro, min(cd.creado_en) AS t
        FROM solicitud s JOIN carga_datos cd ON cd.id = s.carga_id
        WHERE s.nro_solicitud IS NOT NULL AND cd.deshecha_en IS NULL
        GROUP BY s.nro_solicitud
        """) or []}
    filas_cliente = _filas(
        """
        SELECT archivo_solicitud AS archivo, min(creado_en) AS t FROM envio_informe_log
        WHERE exitoso AND modo = 'produccion' AND archivo_solicitud IS NOT NULL
        GROUP BY archivo_solicitud
        """)
    # Calidad del dato: ¿cuántos envíos a clientes se pueden amarrar a una solicitud?
    totales = _filas("SELECT count(*) AS n FROM envio_informe_log WHERE exitoso AND modo = 'produccion'")
    amarrados = _filas(
        "SELECT count(*) AS n FROM envio_informe_log WHERE exitoso AND modo = 'produccion' AND archivo_solicitud IS NOT NULL")
    return {
        "hitos": armar_hitos(base, enviadas, reports, {f["archivo"]: f["t"] for f in filas_cliente or []}),
        "calidad": {
            "envios_a_clientes": totales[0]["n"] if totales else None,
            # None = falta la migración 0054: todavía no se puede amarrar ningún envío.
            "envios_amarrados": None if filas_cliente is None or amarrados is None else amarrados[0]["n"],
        },
    }
