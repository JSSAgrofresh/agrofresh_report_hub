"""
AgroFresh Lab → Inventario (insumos, estándares certificados y estándares analíticos del laboratorio).

Se maneja con una pistola de códigos: se escanea el código de la etiqueta (INS-01…) y salen las tarjetas de
TODO lo que tenga ese código (el código no es único: dos frascos pueden compartirlo). Cada tarjeta tiene un
«+» (ingreso) y un «−» (salida); un código que no existe abre el alta de un producto nuevo. El stock solo
cambia por movimientos, que quedan anotados (quién, cuándo, cuánto).

Permiso: función suelta `lab_inventario` (Usuarios → AgroFresh Lab → Inventario); el administrador general
siempre. Sin la migración 0074 los endpoints responden 503 con el aviso.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Literal
from zoneinfo import ZoneInfo

import psycopg2.errors
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import permisos_funciones
from .auth import Usuario, solo_admin_general
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

LAB_INVENTARIO = "lab_inventario"
AVISO_MIGRACION = "Falta correr la migración 0074_inventario_lab.sql en el servidor."
CATEGORIAS = ("Estándar certificado", "Estándar analítico", "Insumo")
DIAS_POR_VENCER = 60  # «próximo a vencer»

usuario_inventario = permisos_funciones.exigir(LAB_INVENTARIO, "Tu cuenta no tiene permiso para usar el inventario del laboratorio.")
router = APIRouter(prefix="/api/inventario-lab", tags=["inventario-lab"], dependencies=[Depends(usuario_inventario)])


def hoy() -> date:
    from datetime import datetime
    return datetime.now(ZoneInfo("America/Santiago")).date()


def estado_vencimiento(vencimiento: date | None, referencia: date | None = None) -> str:
    """vencido / por_vencer (≤ 60 días) / vigente / sin_fecha."""
    if vencimiento is None:
        return "sin_fecha"
    ref = referencia or hoy()
    if vencimiento < ref:
        return "vencido"
    if vencimiento <= ref + timedelta(days=DIAS_POR_VENCER):
        return "por_vencer"
    return "vigente"


def calcular_stock(tipo: str, stock: Decimal, cantidad: Decimal) -> Decimal:
    """Stock resultante de un movimiento. La salida nunca deja stock negativo (409)."""
    if tipo == "ingreso":
        return stock + cantidad
    if tipo == "salida":
        if cantidad > stock:
            raise HTTPException(409, f"No alcanza: hay {stock:g} y quieres sacar {cantidad:g}.")
        return stock - cantidad
    if tipo == "ajuste":
        return cantidad
    raise HTTPException(400, "Tipo de movimiento desconocido.")


def _limpiar(t: str | None) -> str | None:
    t = " ".join((t or "").split())
    return t or None


class ItemIn(BaseModel):
    codigo: str
    categoria: Literal["Estándar certificado", "Estándar analítico", "Insumo"] = "Insumo"
    descripcion: str
    detalle: str | None = None
    ubicacion: str | None = None
    almacenamiento: str | None = None
    presentacion: str | None = None
    lote: str | None = None
    vencimiento: date | None = None
    referencia: str | None = None
    stock: float = Field(0, ge=0)  # solo al crear; después cambia por movimientos


class MovimientoIn(BaseModel):
    tipo: Literal["ingreso", "salida", "ajuste"]
    cantidad: float = Field(ge=0)
    nota: str | None = None


_SELECT = """
    SELECT id, codigo, categoria, ubicacion, descripcion, detalle, almacenamiento, presentacion, lote,
           vencimiento, referencia, stock::float8 AS stock, activo,
           to_char(actualizado_en AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD HH24:MI') AS actualizado
      FROM inventario_lab_item
"""


def _fila(r: dict[str, Any]) -> dict[str, Any]:
    d = dict(r)
    venc = d.get("vencimiento")
    d["estado_vencimiento"] = estado_vencimiento(venc)
    d["vencimiento"] = venc.isoformat() if venc else None
    d["dias_para_vencer"] = (venc - hoy()).days if venc else None
    return d


def _item(cur, item_id: int) -> dict[str, Any]:
    cur.execute(_SELECT + " WHERE id = %s", (item_id,))
    r = cur.fetchone()
    if r is None:
        raise HTTPException(404, "Ese producto no existe.")
    return _fila(r)


def _validar(body: ItemIn) -> dict[str, Any]:
    codigo = (_limpiar(body.codigo) or "").upper()
    if not codigo:
        raise HTTPException(400, "Escribe o escanea el código.")
    descripcion = _limpiar(body.descripcion)
    if not descripcion:
        raise HTTPException(400, "Escribe qué producto es.")
    return {
        "codigo": codigo, "categoria": body.categoria, "descripcion": descripcion,
        "detalle": _limpiar(body.detalle), "ubicacion": _limpiar(body.ubicacion),
        "almacenamiento": _limpiar(body.almacenamiento), "presentacion": _limpiar(body.presentacion),
        "lote": _limpiar(body.lote), "vencimiento": body.vencimiento, "referencia": _limpiar(body.referencia),
    }


def _anotar(cur, item_id: int, tipo: str, cantidad: Decimal, antes: Decimal, despues: Decimal, nota: str | None, u: Usuario) -> None:
    cur.execute(
        "INSERT INTO inventario_lab_movimiento (item_id, tipo, cantidad, stock_antes, stock_despues, nota, usuario, usuario_email)"
        " VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
        (item_id, tipo, cantidad, antes, despues, _limpiar(nota), u.nombre, u.email.lower()),
    )


@router.get("/items")
def listar(incluir_inactivos: bool = False) -> list[dict[str, Any]]:
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(_SELECT + ("" if incluir_inactivos else " WHERE activo") + " ORDER BY codigo, vencimiento NULLS LAST, id")
            return [_fila(r) for r in cur.fetchall()]
    except psycopg2.errors.UndefinedTable as e:
        raise HTTPException(503, AVISO_MIGRACION) from e


@router.get("/buscar")
def buscar(codigo: str) -> list[dict[str, Any]]:
    """Todo lo que tenga ese código (sin mayúsculas ni espacios de más): una tarjeta por cada uno."""
    clave = " ".join(codigo.split()).upper()
    if not clave:
        return []
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(_SELECT + " WHERE activo AND upper(btrim(codigo)) = %s ORDER BY vencimiento NULLS LAST, id", (clave,))
            return [_fila(r) for r in cur.fetchall()]
    except psycopg2.errors.UndefinedTable as e:
        raise HTTPException(503, AVISO_MIGRACION) from e


@router.get("/siguiente-codigo")
def siguiente_codigo() -> dict[str, str]:
    """El próximo INS-NN libre (para productos nuevos que aún no tienen etiqueta)."""
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT COALESCE(MAX(substring(codigo from '^INS-(\\d+)$')::int), 0) AS n FROM inventario_lab_item")
            n = int(cur.fetchone()["n"]) + 1
            return {"codigo": f"INS-{n:02d}"}
    except psycopg2.errors.UndefinedTable as e:
        raise HTTPException(503, AVISO_MIGRACION) from e


@router.post("/items", status_code=201)
def crear(body: ItemIn, usuario: Usuario = Depends(usuario_inventario)) -> dict[str, Any]:
    datos = _validar(body)
    stock = Decimal(str(body.stock))
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                """INSERT INTO inventario_lab_item (codigo, categoria, ubicacion, descripcion, detalle, almacenamiento,
                       presentacion, lote, vencimiento, referencia, stock, creado_por)
                   VALUES (%(codigo)s,%(categoria)s,%(ubicacion)s,%(descripcion)s,%(detalle)s,%(almacenamiento)s,
                       %(presentacion)s,%(lote)s,%(vencimiento)s,%(referencia)s,%(stock)s,%(por)s) RETURNING id""",
                {**datos, "stock": stock, "por": usuario.nombre},
            )
            nuevo = cur.fetchone()["id"]
            _anotar(cur, nuevo, "alta", stock, Decimal(0), stock, "Producto nuevo", usuario)
            return _item(cur, nuevo)
    except psycopg2.errors.UndefinedTable as e:
        raise HTTPException(503, AVISO_MIGRACION) from e


@router.put("/items/{item_id}")
def corregir(item_id: int, body: ItemIn) -> dict[str, Any]:
    """Corrige los datos del producto. El stock NO cambia por acá: se mueve con + / −."""
    datos = _validar(body)
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                """UPDATE inventario_lab_item SET codigo=%(codigo)s, categoria=%(categoria)s, ubicacion=%(ubicacion)s,
                       descripcion=%(descripcion)s, detalle=%(detalle)s, almacenamiento=%(almacenamiento)s,
                       presentacion=%(presentacion)s, lote=%(lote)s, vencimiento=%(vencimiento)s,
                       referencia=%(referencia)s, actualizado_en=now()
                   WHERE id=%(id)s RETURNING id""",
                {**datos, "id": item_id},
            )
            if cur.fetchone() is None:
                raise HTTPException(404, "Ese producto no existe.")
            return _item(cur, item_id)
    except psycopg2.errors.UndefinedTable as e:
        raise HTTPException(503, AVISO_MIGRACION) from e


@router.post("/items/{item_id}/movimiento")
def mover(item_id: int, body: MovimientoIn, usuario: Usuario = Depends(usuario_inventario)) -> dict[str, Any]:
    cantidad = Decimal(str(body.cantidad))
    if body.tipo != "ajuste" and cantidad <= 0:
        raise HTTPException(400, "La cantidad debe ser mayor a cero.")
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT stock FROM inventario_lab_item WHERE id = %s AND activo FOR UPDATE", (item_id,))
            r = cur.fetchone()
            if r is None:
                raise HTTPException(404, "Ese producto no existe.")
            antes = Decimal(r["stock"])
            despues = calcular_stock(body.tipo, antes, cantidad)
            cur.execute("UPDATE inventario_lab_item SET stock=%s, actualizado_en=now() WHERE id=%s", (despues, item_id))
            _anotar(cur, item_id, body.tipo, cantidad, antes, despues, body.nota, usuario)
            return _item(cur, item_id)
    except psycopg2.errors.UndefinedTable as e:
        raise HTTPException(503, AVISO_MIGRACION) from e


@router.delete("/items/{item_id}", status_code=204)
def retirar(item_id: int, _: Usuario = Depends(solo_admin_general)) -> None:
    """Lo saca del inventario (queda guardado, inactivo, con su historial). Solo el administrador general."""
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("UPDATE inventario_lab_item SET activo=FALSE, actualizado_en=now() WHERE id=%s AND activo", (item_id,))
            if cur.rowcount == 0:
                raise HTTPException(404, "Ese producto no existe.")
    except psycopg2.errors.UndefinedTable as e:
        raise HTTPException(503, AVISO_MIGRACION) from e


_MOV = """
    SELECT m.id, m.item_id, i.codigo, i.descripcion, i.lote, m.tipo, m.cantidad::float8 AS cantidad,
           m.stock_antes::float8 AS stock_antes, m.stock_despues::float8 AS stock_despues, m.nota, m.usuario,
           to_char(m.creado_en AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD HH24:MI') AS fecha
      FROM inventario_lab_movimiento m JOIN inventario_lab_item i ON i.id = m.item_id
"""


@router.get("/movimientos")
def movimientos(item_id: int | None = None, limite: int = 100) -> list[dict[str, Any]]:
    limite = max(1, min(limite, 500))
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            if item_id is None:
                cur.execute(_MOV + " ORDER BY m.creado_en DESC, m.id DESC LIMIT %s", (limite,))
            else:
                cur.execute(_MOV + " WHERE m.item_id = %s ORDER BY m.creado_en DESC, m.id DESC LIMIT %s", (item_id, limite))
            return [dict(r) for r in cur.fetchall()]
    except psycopg2.errors.UndefinedTable as e:
        raise HTTPException(503, AVISO_MIGRACION) from e


def armar_resumen(items: list[dict[str, Any]]) -> dict[str, Any]:
    """Los números de arriba de la pantalla. Puro: recibe los ítems ya con `estado_vencimiento`."""
    con_stock = [i for i in items if i["stock"] > 0]
    por_categoria: dict[str, int] = {}
    for i in items:
        por_categoria[i["categoria"]] = por_categoria.get(i["categoria"], 0) + 1
    proximos = sorted(
        (i for i in con_stock if i["estado_vencimiento"] in ("vencido", "por_vencer")),
        key=lambda i: i["vencimiento"],
    )
    return {
        "total": len(items),
        "vencidos": sum(1 for i in con_stock if i["estado_vencimiento"] == "vencido"),
        "por_vencer": sum(1 for i in con_stock if i["estado_vencimiento"] == "por_vencer"),
        "sin_stock": sum(1 for i in items if i["stock"] <= 0),
        "sin_fecha": sum(1 for i in items if i["estado_vencimiento"] == "sin_fecha" and i["categoria"] != "Insumo"),
        "dias_por_vencer": DIAS_POR_VENCER,
        "por_categoria": por_categoria,
        "proximos": [{k: i[k] for k in ("id", "codigo", "descripcion", "lote", "vencimiento", "dias_para_vencer", "estado_vencimiento", "stock")} for i in proximos[:15]],
    }


@router.get("/resumen")
def resumen() -> dict[str, Any]:
    return armar_resumen(listar())
