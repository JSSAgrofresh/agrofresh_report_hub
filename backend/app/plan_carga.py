"""Carga del plan de entregables al sistema (cuántos análisis se prometieron por cliente).

Dos formatos de Excel:
- **El final (3-11-2026, «Entregables_cerezas_26-27», hoja `Base`)**: una fila por Sold To × planta × servicio × línea × semana,
  con el código SAP del Sold To y DOS cantidades: `Original` (lo que había entregado el comercial) y `Propuesta`. Las dos se
  guardan y se muestran como dato de cuantificación. El Sold To se busca por su código SAP (exacto) y, si no, por nombre.
- **El anterior** (SOLD TO, COMERCIAL, SERVICIO, TOTAL, NOMBRE EN EL PLAN): su TOTAL se guarda como Propuesta.
Se carga en dos pasos, como Listados: `/analizar` solo lee y cuenta; `/confirmar` reemplaza el plan de la temporada.
Un Sold To que no existe en Listados no se carga (se avisa). Las filas repetidas se fusionan (no se cuentan doble) y las
filas sin ninguna de las dos cantidades se saltan.

El plan NO reparte por Ship To en la pantalla: los análisis hechos se cuentan por Sold To y repartirlos por planta sería
adivinar; la planta del plan queda guardada tal como la escribió el comercial.
Todo tolera que falte la migración 0062; el detalle y las dos cantidades necesitan la 0073.
"""
from __future__ import annotations

import io
import logging
from collections import defaultdict
from typing import Any

import openpyxl
import psycopg2.errors
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from . import actividad
from .auth import Usuario, solo_admin_general, solo_interno
from .db import conexion, cursor_dict
from .plan_cruce import normalizar
from .plan_entregables import categoria_servicio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/plan-entregables", tags=["plan-entregables"])

TEMPORADA = "2026-27"
TOPE_BYTES = 5 * 1024 * 1024

# Servicio del plan → fila del gráfico. «Entrega de registros» no tiene fila: se guarda aparte.
_FILA_GRAFICO = {"Residuales": "residuales", "Patologías": "fito", "Microbiología": "fsma", "FSMA": "fsma"}


def servicio_clave(servicio: str) -> str:
    return _FILA_GRAFICO.get(categoria_servicio(servicio), "otro")


def _entero(valor: Any) -> int | None:
    """Una cantidad: vacío = None; un número no negativo = su entero; otra cosa lanza ValueError."""
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        return None
    n = int(round(float(valor)))
    if n < 0:
        raise ValueError
    return n


def _codigo_sap(valor: Any) -> str | None:
    """«10018610», 10018610 o 10018610.0 → «10018610»."""
    t = str(valor if valor is not None else "").strip()
    if not t:
        return None
    try:
        return str(int(float(t)))
    except ValueError:
        return t


def _hoja_con_cabecera(wb) -> tuple[list[tuple], int, dict[str, int], str]:
    """(filas, fila de la cabecera, columnas por nombre, formato) de la primera hoja que tenga las columnas del plan."""
    for ws in wb.worksheets:
        filas = list(ws.iter_rows(values_only=True))
        for i, f in enumerate(filas[:15]):
            nombres = {normalizar(str(c)): j for j, c in enumerate(f) if c is not None}
            if "SOLD TO" in nombres and ("PROPUESTA" in nombres or "ORIGINAL" in nombres) and ("SERVICIO REAL" in nombres or "SERVICIO" in nombres):
                return filas, i, nombres, "base"
            if "SOLD TO" in nombres and "TOTAL" in nombres and "SERVICIO" in nombres:
                return filas, i, nombres, "anterior"
    raise HTTPException(400, "No encuentro las columnas del plan (SOLD TO, SERVICIO, ORIGINAL y PROPUESTA; o SOLD TO, SERVICIO y TOTAL).")


def leer_excel(contenido: bytes) -> list[dict[str, Any]]:
    """Filas del Excel: {fila, sold_to, sold_to_sap, comercial, servicio, planta_plan, linea, semana, tipo_cliente,
    tipo_servicio, peak, original, propuesta} (o `error`; o `sin_cantidad` si no trae ninguna de las dos cantidades)."""
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contenido), read_only=True, data_only=True)
        filas, cab, idx, formato = _hoja_con_cabecera(wb)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, "El archivo no es un Excel válido.") from exc

    def celda(f, *nombres):
        for nombre in nombres:
            j = idx.get(nombre)
            if j is not None and j < len(f):
                return f[j]
        return None

    def texto(f, *nombres) -> str | None:
        return str(celda(f, *nombres) or "").strip() or None

    out = []
    for n, f in enumerate(filas[cab + 1:], start=cab + 2):
        sold = str(celda(f, "SOLD TO NAME") or celda(f, "SOLD TO") or "").strip()
        if formato == "anterior":
            sold = str(celda(f, "SOLD TO") or "").strip()
        if not sold or normalizar(sold) == "TOTAL":
            continue
        item: dict[str, Any] = {
            "fila": n,
            "sold_to": sold,
            "sold_to_sap": _codigo_sap(celda(f, "SOLD TO")) if formato == "base" else None,
            "comercial": texto(f, "FUENTE", "COMERCIAL"),
            "servicio": texto(f, "SERVICIO REAL", "SERVICIO") or "",
            "planta_plan": texto(f, "CLIENTE", "NOMBRE EN EL PLAN"),
            "linea": None, "semana": None, "tipo_cliente": None, "tipo_servicio": None, "peak": None,
            "original": None, "propuesta": None,
        }
        try:
            if formato == "base":
                item["linea"] = _entero(celda(f, "LINEA"))
                item["semana"] = texto(f, "SEMANA")
                item["tipo_cliente"] = texto(f, "TIPO CLIENTE")
                item["tipo_servicio"] = texto(f, "TIPO SERVICIO")
                item["peak"] = texto(f, "PEAK")
                item["original"] = _entero(celda(f, "ORIGINAL"))
                item["propuesta"] = _entero(celda(f, "PROPUESTA"))
                if item["original"] is None and item["propuesta"] is None:
                    item["sin_cantidad"] = True
            else:
                total = _entero(celda(f, "TOTAL"))
                if total is None:
                    raise ValueError
                item["propuesta"] = total
        except (TypeError, ValueError):
            item["error"] = "La cantidad no es un número"
        out.append(item)
    return out


def _oficiales(cur) -> tuple[dict[str, str], dict[str, str]]:
    """(nombre normalizado → nombre oficial, código SAP → nombre oficial) de los Sold To activos de Listados."""
    cur.execute("SELECT nombre, codigo_sap FROM cliente WHERE COALESCE(activo, true)")
    por_nombre: dict[str, str] = {}
    por_sap: dict[str, str] = {}
    for f in cur.fetchall():
        por_nombre[normalizar(f["nombre"])] = f["nombre"]
        sap = _codigo_sap(f.get("codigo_sap"))
        if sap:
            por_sap[sap] = f["nombre"]
    return por_nombre, por_sap


def clasificar(
    filas: list[dict[str, Any]], oficiales: dict[str, str], oficiales_sap: dict[str, str] | None = None
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """(filas que se cargan con su Sold To oficial, filas descartadas con el motivo).
    El código SAP manda sobre el nombre: es exacto; el nombre sirve cuando la fila no trae código o Listados no lo tiene."""
    validas, descartadas = [], []
    for f in filas:
        if f.get("error"):
            descartadas.append({"fila": f["fila"], "sold_to": f["sold_to"], "motivo": f["error"]})
            continue
        oficial = (oficiales_sap or {}).get(f.get("sold_to_sap") or "") or oficiales.get(normalizar(f["sold_to"]))
        if not oficial:
            descartadas.append({"fila": f["fila"], "sold_to": f["sold_to"], "motivo": "No existe como Sold To en Listados"})
            continue
        validas.append({**f, "sold_to": oficial, "clave": servicio_clave(f["servicio"])})
    return validas, descartadas


def fusionar_repetidas(validas: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Una sola fila por Sold To × planta × servicio × línea × semana: si vienen repetidas se queda con la mayor cantidad no vacía
    de cada columna (así «2 y 2» cuenta 2, no 4, y «4 y vacío» cuenta 4). Devuelve (filas, cuántas se fusionaron)."""
    por: dict[tuple, dict[str, Any]] = {}
    fusionadas = 0
    for v in validas:
        clave = (v["sold_to"], normalizar(v.get("planta_plan") or ""), v["clave"], v.get("linea"), v.get("semana"))
        previa = por.get(clave)
        if previa is None:
            por[clave] = dict(v)
            continue
        fusionadas += 1
        for col in ("original", "propuesta"):
            vals = [x for x in (previa.get(col), v.get(col)) if x is not None]
            previa[col] = max(vals) if vals else None
    return list(por.values()), fusionadas


def _resumen(
    validas: list[dict[str, Any]], descartadas: list[dict[str, Any]], leidas: int, fusionadas: int = 0, sin_cantidad: int = 0
) -> dict[str, Any]:
    por_servicio: dict[str, dict[str, int]] = defaultdict(lambda: {"original": 0, "propuesta": 0})
    for v in validas:
        por_servicio[v["clave"]]["original"] += v.get("original") or 0
        por_servicio[v["clave"]]["propuesta"] += v.get("propuesta") or 0
    sin: dict[str, dict[str, Any]] = {}
    for d in descartadas:
        x = sin.setdefault(d["sold_to"], {"sold_to": d["sold_to"], "motivo": d["motivo"], "filas": 0})
        x["filas"] += 1
    return {
        "filas_leidas": leidas,
        "filas_validas": len(validas),
        "filas_fusionadas": fusionadas,
        "filas_sin_cantidad": sin_cantidad,
        "clientes": len({v["sold_to"] for v in validas}),
        "plantas": len({(v["sold_to"], normalizar(v.get("planta_plan") or "")) for v in validas}),
        "por_servicio": {k: dict(x) for k, x in por_servicio.items()},
        "descartados": sorted(sin.values(), key=lambda x: x["sold_to"]),
    }


async def _preparar(archivo: UploadFile):
    contenido = await archivo.read()
    if len(contenido) > TOPE_BYTES:
        raise HTTPException(400, "El archivo es demasiado grande.")
    filas = leer_excel(contenido)
    if not filas:
        raise HTTPException(400, "El archivo no trae filas con Sold To.")
    sin_cantidad = sum(1 for f in filas if f.get("sin_cantidad"))
    con_cantidad = [f for f in filas if not f.get("sin_cantidad")]
    if not con_cantidad:
        raise HTTPException(400, "Ninguna fila trae cantidad (Original o Propuesta).")
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        por_nombre, por_sap = _oficiales(cur)
    validas, descartadas = clasificar(con_cantidad, por_nombre, por_sap)
    validas, fusionadas = fusionar_repetidas(validas)
    return filas, validas, descartadas, fusionadas, sin_cantidad


@router.post("/analizar", dependencies=[Depends(solo_admin_general)])
async def analizar(archivo: UploadFile = File(...)) -> dict[str, Any]:
    """Solo lee y cuenta: no escribe nada."""
    filas, validas, descartadas, fusionadas, sin_cantidad = await _preparar(archivo)
    return {**_resumen(validas, descartadas, len(filas), fusionadas, sin_cantidad), "temporada": TEMPORADA}


@router.post("/confirmar")
async def confirmar(archivo: UploadFile = File(...), usuario: Usuario = Depends(solo_admin_general)) -> dict[str, Any]:
    """Reemplaza el plan de la temporada por lo que trae el Excel (solo las filas válidas)."""
    filas, validas, descartadas, fusionadas, sin_cantidad = await _preparar(archivo)
    if not validas:
        raise HTTPException(400, "Ninguna fila tiene un Sold To que exista en Listados: no se cargó nada.")
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("DELETE FROM plan_entregable WHERE temporada = %s", (TEMPORADA,))
            cur.executemany(
                "INSERT INTO plan_entregable (temporada, sold_to, sold_to_sap, planta_plan, comercial, servicio, linea, semana,"
                " tipo_cliente, tipo_servicio, peak, original, propuesta, cantidad, cargado_por)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                [
                    (
                        TEMPORADA, v["sold_to"], v.get("sold_to_sap"), v["planta_plan"], v["comercial"], v["clave"], v.get("linea"),
                        v.get("semana"), v.get("tipo_cliente"), v.get("tipo_servicio"), v.get("peak"), v.get("original"),
                        v.get("propuesta"), v.get("propuesta") or 0, usuario.email,
                    )
                    for v in validas
                ],
            )
    except psycopg2.errors.UndefinedTable:
        raise HTTPException(503, "Falta correr la migración 0062 en el servidor.")
    except psycopg2.errors.UndefinedColumn:
        raise HTTPException(503, "Falta correr la migración 0073_plan_entregable_detalle.sql en el servidor.")
    resumen = _resumen(validas, descartadas, len(filas), fusionadas, sin_cantidad)
    actividad.registrar(
        usuario.email, usuario.nombre, "sensible", "plan_entregables",
        f"cargó el plan de entregables {TEMPORADA}: {resumen['filas_validas']} filas, {resumen['clientes']} clientes",
        sensible=True,
    )
    return {**resumen, "temporada": TEMPORADA}


def resumen_por_cliente(filas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filas de la tabla → un dict por Sold To con sus cantidades Original y Propuesta por fila del gráfico y sus plantas del plan."""
    por: dict[str, dict[str, Any]] = {}
    for f in filas:
        c = por.setdefault(
            f["sold_to"],
            {
                "sold_to": f["sold_to"], "comercial": f.get("comercial"),
                "original": {"residuales": 0, "fsma": 0, "fito": 0}, "propuesta": {"residuales": 0, "fsma": 0, "fito": 0},
                "plantas": [],
            },
        )
        original, propuesta = f.get("original") or 0, f.get("propuesta") or 0
        if f["servicio"] in ("residuales", "fsma", "fito"):
            c["original"][f["servicio"]] += original
            c["propuesta"][f["servicio"]] += propuesta
        c["plantas"].append({"planta": f["planta_plan"] or f["sold_to"], "servicio": f["servicio"], "original": original, "propuesta": propuesta})
    return sorted(por.values(), key=lambda c: c["sold_to"])


@router.get("/resumen", dependencies=[Depends(solo_interno)])
def resumen() -> dict[str, Any]:
    """Lo prometido por Sold To (Original y Propuesta). Sin la tabla (falta la 0062) devuelve vacío y lo avisa."""
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            try:
                cur.execute(
                    "SELECT sold_to, planta_plan, servicio, MIN(comercial) AS comercial, MAX(cargado_en) AS cargado_en,"
                    " COALESCE(SUM(original), 0) AS original, COALESCE(SUM(propuesta), SUM(cantidad), 0) AS propuesta"
                    " FROM plan_entregable WHERE temporada = %s GROUP BY sold_to, planta_plan, servicio"
                    " ORDER BY sold_to, planta_plan, servicio",
                    (TEMPORADA,),
                )
            except psycopg2.errors.UndefinedColumn:
                # Sin la 0073 solo existe `cantidad`: es lo único que hay (se muestra como Propuesta).
                conn.rollback()
                cur.execute(
                    "SELECT sold_to, planta_plan, servicio, MIN(comercial) AS comercial, MAX(cargado_en) AS cargado_en,"
                    " 0 AS original, COALESCE(SUM(cantidad), 0) AS propuesta"
                    " FROM plan_entregable WHERE temporada = %s GROUP BY sold_to, planta_plan, servicio"
                    " ORDER BY sold_to, planta_plan, servicio",
                    (TEMPORADA,),
                )
            filas = cur.fetchall()
    except psycopg2.errors.UndefinedTable:
        return {"temporada": TEMPORADA, "clientes": [], "cargado_en": None, "migracion_pendiente": True}
    cargado = max((f["cargado_en"] for f in filas), default=None)
    return {
        "temporada": TEMPORADA,
        "clientes": resumen_por_cliente([dict(f) for f in filas]),
        "cargado_en": cargado.isoformat() if cargado else None,
        "migracion_pendiente": False,
    }


# Semanas de la temporada en orden: W41…W52 y después W01, W02 (las de un código raro quedan al final).
_ORDEN_SEMANA = (
    "CASE WHEN semana ~ '^W[0-9]+$' THEN (CASE WHEN substring(semana from 2)::int >= 40 THEN 0 ELSE 1 END) END NULLS LAST,"
    " CASE WHEN semana ~ '^W[0-9]+$' THEN substring(semana from 2)::int END NULLS LAST"
)


@router.get("/detalle", dependencies=[Depends(solo_admin_general)])
def detalle() -> dict[str, Any]:
    """TODAS las filas del plan tal como quedaron guardadas (una por Sold To × planta × servicio × línea × semana), para
    revisar que la carga leyó bien el Excel. Sin la 0073 trae solo lo que existía antes (Sold To, planta, servicio y cantidad)."""
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            try:
                cur.execute(
                    "SELECT sold_to, sold_to_sap, planta_plan, comercial, tipo_cliente, tipo_servicio, servicio, linea, semana, peak,"
                    " original, propuesta, cargado_en FROM plan_entregable WHERE temporada = %s"
                    f" ORDER BY comercial NULLS LAST, sold_to, planta_plan NULLS LAST, servicio, linea NULLS LAST,"
                    f" {_ORDEN_SEMANA}, id",
                    (TEMPORADA,),
                )
                detalle_completo = True
            except psycopg2.errors.UndefinedColumn:
                conn.rollback()
                cur.execute(
                    "SELECT sold_to, NULL AS sold_to_sap, planta_plan, comercial, NULL AS tipo_cliente, NULL AS tipo_servicio, servicio,"
                    " NULL AS linea, NULL AS semana, NULL AS peak, NULL AS original, cantidad AS propuesta, cargado_en"
                    " FROM plan_entregable WHERE temporada = %s ORDER BY comercial NULLS LAST, sold_to, planta_plan NULLS LAST, servicio, id",
                    (TEMPORADA,),
                )
                detalle_completo = False
            filas = [dict(f) for f in cur.fetchall()]
    except psycopg2.errors.UndefinedTable:
        return {"temporada": TEMPORADA, "filas": [], "cargado_en": None, "migracion_pendiente": True, "detalle_completo": False}
    cargado = max((f["cargado_en"] for f in filas), default=None)
    for f in filas:
        f.pop("cargado_en", None)
    return {
        "temporada": TEMPORADA,
        "filas": filas,
        "cargado_en": cargado.isoformat() if cargado else None,
        "migracion_pendiente": False,
        "detalle_completo": detalle_completo,
    }
