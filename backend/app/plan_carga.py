"""Carga del plan de entregables al sistema (cuántos análisis se prometieron por cliente).

El Excel (ya homogenizado: Sold To oficial, no el nombre del plan) trae una fila por Sold To × servicio ×
planta del plan, con las columnas SOLD TO, COMERCIAL, SERVICIO, TOTAL y NOMBRE EN EL PLAN. Se carga
en dos pasos, como Listados: `/analizar` solo lee y cuenta; `/confirmar` reemplaza el plan de la temporada.
Un Sold To que no existe en Listados no se carga (se avisa): así el nombre oficial es la única llave.

El plan NO reparte por Ship To: los análisis hechos se cuentan por Sold To y repartirlos por planta sería
adivinar. «Análisis por cliente» muestra esta cantidad solo en la vista por Sold To.
Todo tolera que falte la migración 0062.
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


def leer_excel(contenido: bytes) -> list[dict[str, Any]]:
    """Filas del Excel: {fila, sold_to, comercial, servicio, cantidad, planta_plan} (o `error`)."""
    try:
        ws = openpyxl.load_workbook(io.BytesIO(contenido), read_only=True, data_only=True).worksheets[0]
        filas = list(ws.iter_rows(values_only=True))
    except Exception as exc:
        raise HTTPException(400, "El archivo no es un Excel válido.") from exc
    cab, idx = None, {}
    for i, f in enumerate(filas[:15]):
        nombres = {normalizar(str(c)): j for j, c in enumerate(f) if c is not None}
        if "SOLD TO" in nombres and "TOTAL" in nombres and "SERVICIO" in nombres:
            cab, idx = i, nombres
            break
    if cab is None:
        raise HTTPException(400, "No encuentro las columnas SOLD TO, SERVICIO y TOTAL en la primera hoja.")

    def celda(f, nombre):
        j = idx.get(nombre)
        return f[j] if j is not None and j < len(f) else None

    out = []
    for n, f in enumerate(filas[cab + 1:], start=cab + 2):
        sold = str(celda(f, "SOLD TO") or "").strip()
        if not sold or normalizar(sold) == "TOTAL":
            continue
        total = celda(f, "TOTAL")
        item = {
            "fila": n,
            "sold_to": sold,
            "comercial": str(celda(f, "COMERCIAL") or "").strip() or None,
            "servicio": str(celda(f, "SERVICIO") or "").strip(),
            "planta_plan": str(celda(f, "NOMBRE EN EL PLAN") or "").strip() or None,
        }
        try:
            cantidad = int(round(float(total)))
            if cantidad < 0:
                raise ValueError
            item["cantidad"] = cantidad
        except (TypeError, ValueError):
            item["error"] = "El TOTAL no es un número"
        out.append(item)
    return out


def _oficiales(cur) -> dict[str, str]:
    cur.execute("SELECT nombre FROM cliente WHERE COALESCE(activo, true)")
    return {normalizar(f["nombre"]): f["nombre"] for f in cur.fetchall()}


def clasificar(filas: list[dict[str, Any]], oficiales: dict[str, str]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """(filas que se cargan con su Sold To oficial, filas descartadas con el motivo)."""
    validas, descartadas = [], []
    for f in filas:
        if f.get("error"):
            descartadas.append({"fila": f["fila"], "sold_to": f["sold_to"], "motivo": f["error"]})
            continue
        oficial = oficiales.get(normalizar(f["sold_to"]))
        if not oficial:
            descartadas.append({"fila": f["fila"], "sold_to": f["sold_to"], "motivo": "No existe como Sold To en Listados"})
            continue
        validas.append({**f, "sold_to": oficial, "clave": servicio_clave(f["servicio"])})
    return validas, descartadas


def _resumen(validas: list[dict[str, Any]], descartadas: list[dict[str, Any]], leidas: int) -> dict[str, Any]:
    por_servicio: dict[str, int] = defaultdict(int)
    for v in validas:
        por_servicio[v["clave"]] += v["cantidad"]
    sin: dict[str, dict[str, Any]] = {}
    for d in descartadas:
        x = sin.setdefault(d["sold_to"], {"sold_to": d["sold_to"], "motivo": d["motivo"], "filas": 0})
        x["filas"] += 1
    return {
        "filas_leidas": leidas,
        "filas_validas": len(validas),
        "clientes": len({v["sold_to"] for v in validas}),
        "por_servicio": dict(por_servicio),
        "descartados": sorted(sin.values(), key=lambda x: x["sold_to"]),
    }


async def _preparar(archivo: UploadFile):
    contenido = await archivo.read()
    if len(contenido) > TOPE_BYTES:
        raise HTTPException(400, "El archivo es demasiado grande.")
    filas = leer_excel(contenido)
    if not filas:
        raise HTTPException(400, "El archivo no trae filas con Sold To.")
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        validas, descartadas = clasificar(filas, _oficiales(cur))
    return filas, validas, descartadas


@router.post("/analizar", dependencies=[Depends(solo_admin_general)])
async def analizar(archivo: UploadFile = File(...)) -> dict[str, Any]:
    """Solo lee y cuenta: no escribe nada."""
    filas, validas, descartadas = await _preparar(archivo)
    return {**_resumen(validas, descartadas, len(filas)), "temporada": TEMPORADA}


@router.post("/confirmar")
async def confirmar(archivo: UploadFile = File(...), usuario: Usuario = Depends(solo_admin_general)) -> dict[str, Any]:
    """Reemplaza el plan de la temporada por lo que trae el Excel (solo las filas válidas)."""
    filas, validas, descartadas = await _preparar(archivo)
    if not validas:
        raise HTTPException(400, "Ninguna fila tiene un Sold To que exista en Listados: no se cargó nada.")
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("DELETE FROM plan_entregable WHERE temporada = %s", (TEMPORADA,))
            cur.executemany(
                "INSERT INTO plan_entregable (temporada, sold_to, planta_plan, comercial, servicio, cantidad, cargado_por)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s)",
                [(TEMPORADA, v["sold_to"], v["planta_plan"], v["comercial"], v["clave"], v["cantidad"], usuario.email) for v in validas],
            )
    except psycopg2.errors.UndefinedTable:
        raise HTTPException(503, "Falta correr la migración 0062 en el servidor.")
    resumen = _resumen(validas, descartadas, len(filas))
    actividad.registrar(
        usuario.email, usuario.nombre, "sensible", "plan_entregables",
        f"cargó el plan de entregables {TEMPORADA}: {resumen['filas_validas']} filas, {resumen['clientes']} clientes",
        sensible=True,
    )
    return {**resumen, "temporada": TEMPORADA}


def resumen_por_cliente(filas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filas de la tabla → un dict por Sold To con su cantidad por fila del gráfico y sus plantas del plan."""
    por: dict[str, dict[str, Any]] = {}
    for f in filas:
        c = por.setdefault(f["sold_to"], {"sold_to": f["sold_to"], "residuales": 0, "fsma": 0, "fito": 0, "plantas": []})
        if f["servicio"] in ("residuales", "fsma", "fito"):
            c[f["servicio"]] += f["cantidad"]
        c["plantas"].append({"planta": f["planta_plan"] or f["sold_to"], "servicio": f["servicio"], "cantidad": f["cantidad"]})
    return sorted(por.values(), key=lambda c: c["sold_to"])


@router.get("/resumen", dependencies=[Depends(solo_interno)])
def resumen() -> dict[str, Any]:
    """Lo prometido por Sold To. Sin la tabla (falta la 0062) devuelve vacío y lo avisa."""
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(
                "SELECT sold_to, planta_plan, servicio, cantidad, cargado_en FROM plan_entregable"
                " WHERE temporada = %s ORDER BY sold_to, planta_plan, servicio",
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
