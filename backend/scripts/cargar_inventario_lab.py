"""
Carga el Excel de inventario del laboratorio (hoja «Borrador códigos», el de Romina) a AgroFresh Lab → Inventario.

Cada fila del Excel pasa a ser UN producto (una tarjeta): los códigos repetidos (INS-49…INS-56 aparecen dos veces)
NO se fusionan, porque dos cosas pueden compartir código. Las filas vacías se saltan. Solo escribe con --aplicar
y solo si el inventario está vacío (para no duplicarlo si se corre dos veces; --forzar lo salta).

    cd backend
    .venv\\Scripts\\python.exe scripts\\cargar_inventario_lab.py "C:\\ruta\\Inventario_de_Laboratorio.xlsx"
    .venv\\Scripts\\python.exe scripts\\cargar_inventario_lab.py "C:\\ruta\\Inventario_de_Laboratorio.xlsx" --aplicar
"""
from __future__ import annotations

import os
import sys
from datetime import date, datetime
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SIN_DATO = {"", "n/a", "na", "no indica", "-", "s/i"}


def _texto(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    t = " ".join(str(v).split())
    return None if t.lower() in SIN_DATO else t


def _fecha(v: Any) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return None


def categoria_de(descripcion: str | None, ubicacion: str | None) -> str:
    d = (descripcion or "").lower()
    if "certified reference" in d:
        return "Estándar certificado"
    if "estándar" in d or "estandar" in d:
        return "Estándar analítico"
    return "Insumo"


def leer_filas(ruta: str) -> list[dict[str, Any]]:
    import openpyxl

    ws = openpyxl.load_workbook(ruta, data_only=True).worksheets[0]
    filas: list[dict[str, Any]] = []
    for r in list(ws.iter_rows(values_only=True))[1:]:
        r = tuple(r) + (None,) * (10 - len(r))
        codigo = _texto(r[0])
        desc, desc2 = _texto(r[2]), _texto(r[3])
        if not codigo or not (desc or desc2):
            continue
        categoria = categoria_de(desc, r[1])
        # Insumos: la columna «Descripción» solo dice «Insumos»; el nombre real está en Descripción2.
        filas.append({
            "codigo": codigo.upper(),
            "categoria": categoria,
            "ubicacion": _texto(r[1]),
            "descripcion": desc2 or desc,
            "detalle": desc if categoria == "Estándar certificado" else None,
            "almacenamiento": _texto(r[4]),
            "presentacion": _texto(r[5]),
            "lote": _texto(r[6]),
            "vencimiento": _fecha(r[7]),
            "referencia": _texto(r[8]),
            "stock": max(float(r[9]), 0) if isinstance(r[9], (int, float)) else 0.0,
        })
    return filas


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        sys.exit(__doc__)
    aplicar, forzar = "--aplicar" in sys.argv, "--forzar" in sys.argv
    filas = leer_filas(args[0])
    por_cat: dict[str, int] = {}
    codigos: dict[str, int] = {}
    for f in filas:
        por_cat[f["categoria"]] = por_cat.get(f["categoria"], 0) + 1
        codigos[f["codigo"]] = codigos.get(f["codigo"], 0) + 1
    print(f"Filas con datos: {len(filas)}  ·  códigos distintos: {len(codigos)}")
    for c, n in sorted(por_cat.items()):
        print(f"   {c}: {n}")
    comparten = {c: n for c, n in codigos.items() if n > 1}
    print(f"Códigos que se repiten (cada uno queda como tarjeta aparte): {', '.join(f'{c} x{n}' for c, n in sorted(comparten.items())) or 'ninguno'}")
    print(f"Sin stock anotado (quedan en 0): {sum(1 for f in filas if f['stock'] <= 0)}")
    if not aplicar:
        print("\nSolo se miró. Para escribir: agrega --aplicar")
        return

    from app.db import conexion, cursor_dict

    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT count(*) AS n FROM inventario_lab_item")
        if cur.fetchone()["n"] and not forzar:
            sys.exit("El inventario ya tiene productos; no se carga encima (usa --forzar si de verdad quieres).")
        for f in filas:
            cur.execute(
                """INSERT INTO inventario_lab_item (codigo, categoria, ubicacion, descripcion, detalle, almacenamiento,
                       presentacion, lote, vencimiento, referencia, stock, creado_por)
                   VALUES (%(codigo)s,%(categoria)s,%(ubicacion)s,%(descripcion)s,%(detalle)s,%(almacenamiento)s,
                       %(presentacion)s,%(lote)s,%(vencimiento)s,%(referencia)s,%(stock)s,'Carga del Excel de Romina') RETURNING id""",
                f,
            )
            nuevo = cur.fetchone()["id"]
            cur.execute(
                "INSERT INTO inventario_lab_movimiento (item_id, tipo, cantidad, stock_antes, stock_despues, nota, usuario)"
                " VALUES (%s,'alta',%s,0,%s,'Carga inicial del Excel de Romina','Sistema')",
                (nuevo, f["stock"], f["stock"]),
            )
    print(f"\nListo: {len(filas)} productos cargados.")


if __name__ == "__main__":
    main()
