"""
DataCore: validación de filas de Excel contra los catálogos antes de ingestar.

Complementa ingest.py sin reemplazarlo: devuelve el estado célda a célda de
los cuatro campos maestros (sold_to, ship_to, especie, variedad) para que el
frontend pueda pintar la tabla en verde/rojo ANTES de mandar el Excel a staging.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .db import conexion, cursor_dict
from .ingest import (
    _cargar_mapas_listados,
    _resolver_listados,
    clave_normalizada_empresa,
)
from .mapeo import mapear_solicitud

router = APIRouter(prefix="/api/datacore", tags=["datacore"])


# ---------------------------------------------------------------------------
# Validación
# ---------------------------------------------------------------------------


class ValidarRequest(BaseModel):
    filas: list[dict[str, Any]]
    origen: str = "excel"


def _celda(campo: str, crudo: str | None, canonico: str | None, motivos_idx: dict) -> dict:
    if not crudo:
        return {"crudo": None, "canonico": None, "estado": "vacio", "sugerencias": []}
    if campo in motivos_idx:
        m = motivos_idx[campo]
        return {
            "crudo": crudo,
            "canonico": None,
            "estado": "sin_match",
            "sugerencias": m.get("sugerencias", []),
        }
    estado = "exacto" if canonico == crudo else "homogenizado"
    return {"crudo": crudo, "canonico": canonico, "estado": estado, "sugerencias": []}


@router.post("/validar")
def validar(payload: ValidarRequest) -> dict[str, Any]:
    """Valida las filas del Excel contra los catálogos. Devuelve el estado por
    célda (exacto / homogenizado / sin_match / vacio) sin escribir en la BD."""
    with conexion(escribir=False) as conn:
        with cursor_dict(conn) as cur:
            mapas = _cargar_mapas_listados(cur)

    filas_out: list[dict] = []
    for i, fila_cruda in enumerate(payload.filas):
        fila = {str(k).strip(): v for k, v in fila_cruda.items()}
        sol = mapear_solicitud(fila)

        # Guardar crudos ANTES de que _resolver_listados los sobreescriba
        crudo_sold = sol.get("sold_to_raw")
        crudo_ship = sol.get("ship_to_raw")
        crudo_esp = sol.get("especie")
        crudo_var = sol.get("variedad")

        motivos = _resolver_listados(sol, mapas)
        motivos_idx = {m["campo"]: m for m in motivos}

        celda_sold = _celda("sold_to_raw", crudo_sold, sol.get("sold_to_raw"), motivos_idx)
        celda_ship = _celda("ship_to_raw", crudo_ship, sol.get("ship_to_raw"), motivos_idx)
        celda_esp = _celda("especie", crudo_esp, sol.get("especie"), motivos_idx)
        celda_var = _celda("variedad", crudo_var, sol.get("variedad"), motivos_idx)

        valida = all(
            c["estado"] in ("exacto", "homogenizado", "vacio")
            for c in (celda_sold, celda_ship, celda_esp, celda_var)
        )

        filas_out.append({
            "n": i + 1,
            "nro_informe": sol.get("nro_solicitud"),
            "sold_to": celda_sold,
            "ship_to": celda_ship,
            "especie": celda_esp,
            "variedad": celda_var,
            "valida": valida,
        })

    total = len(filas_out)
    validas = sum(1 for f in filas_out if f["valida"])
    return {
        "filas": filas_out,
        "resumen": {"total": total, "validas": validas, "con_errores": total - validas},
    }


# ---------------------------------------------------------------------------
# Confirmar mapeo (alias)
# ---------------------------------------------------------------------------


class ConfirmarMapeoIn(BaseModel):
    entidad: str          # "sold_to" | "ship_to"
    valor_crudo: str
    destino_id: int
    cliente_id: int | None = None


@router.post("/confirmar-mapeo")
def confirmar_mapeo(payload: ConfirmarMapeoIn) -> dict[str, bool]:
    """Guarda el alias confirmado por el usuario en mapeo_confirmado para que
    la próxima validación lo resuelva automáticamente sin intervención."""
    if payload.entidad not in ("sold_to", "ship_to"):
        raise HTTPException(status_code=422, detail="entidad debe ser 'sold_to' o 'ship_to'")

    clave_crudo = clave_normalizada_empresa(payload.valor_crudo)
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            cur.execute(
                """INSERT INTO mapeo_confirmado
                       (entidad, cliente_id, valor_crudo, valor_crudo_normalizado, destino_id)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (entidad, cliente_id, valor_crudo_normalizado)
                   DO UPDATE SET destino_id = EXCLUDED.destino_id""",
                (payload.entidad, payload.cliente_id, payload.valor_crudo, clave_crudo, payload.destino_id),
            )
        conn.commit()
    return {"ok": True}
