"""
Actualiza codigo_sap y rut en cliente/planta usando el Excel maestro SAP.

Lee la hoja "SOLD TO (clientes)" del archivo y para cada registro:
  - Busca el cliente en la BD por nombre normalizado
  - Actualiza codigo_sap si está vacío o difiere del Excel
  - Actualiza rut si está vacío
  - Busca cada planta (Ship To) bajo ese cliente y actualiza su codigo_sap

Estrategia de match: normalización NFKD + solo alfanumérico. Si no encuentra
match exacto, reporta el nombre para revisión manual.

Uso:
    cd backend
    python scripts/actualizar_codigos_sap.py ARCHIVO.xlsx              # solo analizar
    python scripts/actualizar_codigos_sap.py ARCHIVO.xlsx --aplicar    # actualizar
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import conexion, cursor_dict  # noqa: E402


def _clave(valor: str | None) -> str:
    if not valor:
        return ""
    v = unicodedata.normalize("NFKD", valor)
    v = "".join(c for c in v if not unicodedata.combining(c))
    v = re.sub(r"[^a-z0-9]+", " ", v.lower()).strip()
    return re.sub(r"\s+", " ", v)


def _importar_openpyxl():
    try:
        import openpyxl
        return openpyxl
    except ImportError:
        print("ERROR: falta openpyxl.  Instálalo con:  pip install openpyxl")
        sys.exit(1)


def _leer_excel(ruta: Path) -> tuple[dict[str, dict], list[dict]]:
    """Devuelve (sold_to_por_clave, lista_ship_to)."""
    ox = _importar_openpyxl()
    wb = ox.load_workbook(ruta, read_only=True, data_only=True)

    hoja = "SOLD TO (clientes)"
    if hoja not in wb.sheetnames:
        print(f"ERROR: no existe la hoja '{hoja}'. Hojas: {wb.sheetnames}")
        sys.exit(1)

    ws = wb[hoja]
    filas = list(ws.iter_rows(values_only=True))
    enc = [str(c).strip().lower() if c else "" for c in filas[0]]

    def _col(nombre):
        return next((i for i, h in enumerate(enc) if nombre in h), None)

    idx_stn = _col("sold to number")
    idx_sname = _col("sold to name")
    idx_shipn = _col("ship to number")
    idx_shipname = _col("ship to name")
    idx_rut = _col("tax number")

    sold_to: dict[str, dict] = {}      # clave → {numero_sap, nombre, rut}
    ship_to_lista: list[dict] = []     # [{sold_to_clave, ship_to_numero, ship_to_nombre}]

    for f in filas[1:]:
        stn = str(f[idx_stn]).strip() if f[idx_stn] else None
        sname = str(f[idx_sname]).strip() if f[idx_sname] else None
        shipn = str(f[idx_shipn]).strip() if idx_shipn is not None and f[idx_shipn] else None
        shipname = str(f[idx_shipname]).strip() if idx_shipname is not None and f[idx_shipname] else None
        rut = str(f[idx_rut]).strip() if idx_rut is not None and f[idx_rut] else None

        if sname and stn:
            clave = _clave(sname)
            if clave and clave not in sold_to:
                sold_to[clave] = {"numero_sap": stn, "nombre": sname, "rut": rut}

        if sname and shipn and shipname:
            ship_to_lista.append({
                "sold_to_clave": _clave(sname),
                "sold_to_nombre": sname,
                "ship_to_numero": shipn,
                "ship_to_nombre": shipname,
            })

    wb.close()
    return sold_to, ship_to_lista


def analizar(ruta: Path) -> dict:
    sold_to_excel, ship_to_excel = _leer_excel(ruta)

    with conexion() as conn:
        with cursor_dict(conn) as cur:
            cur.execute("SELECT id, nombre, codigo_sap, rut FROM lab.cliente")
            clientes_bd = cur.fetchall()

            cur.execute("SELECT p.id, p.nombre, p.codigo_sap, p.cliente_id FROM lab.planta p")
            plantas_bd = cur.fetchall()

    clientes_por_clave = {_clave(c["nombre"]): c for c in clientes_bd}
    plantas_por_cliente_clave = {}
    for p in plantas_bd:
        plantas_por_cliente_clave.setdefault(p["cliente_id"], {})[_clave(p["nombre"])] = p

    # Analizar sold to
    clientes_a_actualizar = []
    sin_match_sold = []
    for clave, datos in sold_to_excel.items():
        bd = clientes_por_clave.get(clave)
        if not bd:
            sin_match_sold.append(datos["nombre"])
            continue
        cambios = {}
        if not bd["codigo_sap"] and datos["numero_sap"]:
            cambios["codigo_sap"] = datos["numero_sap"]
        elif bd["codigo_sap"] and bd["codigo_sap"] != datos["numero_sap"]:
            cambios["codigo_sap_viejo"] = bd["codigo_sap"]
            cambios["codigo_sap_nuevo"] = datos["numero_sap"]
        if not bd["rut"] and datos.get("rut"):
            cambios["rut"] = datos["rut"]
        if cambios:
            clientes_a_actualizar.append({"id": bd["id"], "nombre": bd["nombre"], **cambios})

    # Analizar ship to
    plantas_a_actualizar = []
    sin_match_ship = []
    for row in ship_to_excel:
        clave_sold = row["sold_to_clave"]
        bd_cliente = clientes_por_clave.get(clave_sold)
        if not bd_cliente:
            continue  # ya reportado arriba

        plantas_cliente = plantas_por_cliente_clave.get(bd_cliente["id"], {})
        clave_ship = _clave(row["ship_to_nombre"])
        bd_planta = plantas_cliente.get(clave_ship)
        if not bd_planta:
            sin_match_ship.append(f"{row['sold_to_nombre']} / {row['ship_to_nombre']}")
            continue
        if not bd_planta["codigo_sap"] or bd_planta["codigo_sap"] != row["ship_to_numero"]:
            plantas_a_actualizar.append({
                "id": bd_planta["id"],
                "nombre": bd_planta["nombre"],
                "codigo_sap": row["ship_to_numero"],
            })

    return {
        "clientes_a_actualizar": clientes_a_actualizar,
        "plantas_a_actualizar": plantas_a_actualizar,
        "sin_match_sold": sin_match_sold,
        "sin_match_ship": list(set(sin_match_ship)),
        "total_excel_sold": len(sold_to_excel),
        "total_excel_ship": len(ship_to_excel),
    }


def imprimir_resumen(info: dict) -> None:
    print(f"\n{'='*60}")
    print(f"  SAP Excel → BD  |  Sold To: {info['total_excel_sold']} en Excel")
    print(f"{'='*60}")

    print(f"\n[1] Clientes a actualizar: {len(info['clientes_a_actualizar'])}")
    for c in info["clientes_a_actualizar"][:10]:
        if "codigo_sap_viejo" in c:
            print(f"      '{c['nombre']}': {c['codigo_sap_viejo']} → {c['codigo_sap_nuevo']}")
        else:
            partes = []
            if "codigo_sap" in c: partes.append(f"SAP={c['codigo_sap']}")
            if "rut" in c: partes.append(f"RUT={c['rut']}")
            print(f"      '{c['nombre']}': {', '.join(partes)}")
    if len(info["clientes_a_actualizar"]) > 10:
        print(f"      ... y {len(info['clientes_a_actualizar'])-10} más")

    print(f"\n[2] Plantas (Ship To) a actualizar: {len(info['plantas_a_actualizar'])}")
    for p in info["plantas_a_actualizar"][:10]:
        print(f"      '{p['nombre']}' → SAP={p['codigo_sap']}")
    if len(info["plantas_a_actualizar"]) > 10:
        print(f"      ... y {len(info['plantas_a_actualizar'])-10} más")

    print(f"\n[3] Sold To del Excel sin match en BD: {len(info['sin_match_sold'])}")
    for n in info["sin_match_sold"][:15]:
        print(f"      '{n}'")
    if len(info["sin_match_sold"]) > 15:
        print(f"      ... y {len(info['sin_match_sold'])-15} más")

    print(f"\n[4] Ship To del Excel sin match en BD: {len(info['sin_match_ship'])}")
    for n in info["sin_match_ship"][:10]:
        print(f"      '{n}'")
    if len(info["sin_match_ship"]) > 10:
        print(f"      ... y {len(info['sin_match_ship'])-10} más")
    print()


def aplicar(info: dict) -> None:
    with conexion() as conn:
        with cursor_dict(conn) as cur:
            upd_c = 0
            for c in info["clientes_a_actualizar"]:
                sap = c.get("codigo_sap") or c.get("codigo_sap_nuevo")
                rut = c.get("rut")
                if sap and rut:
                    cur.execute(
                        "UPDATE lab.cliente SET codigo_sap = COALESCE(NULLIF(codigo_sap,''), %s), rut = COALESCE(NULLIF(rut,''), %s) WHERE id = %s",
                        (sap, rut, c["id"]),
                    )
                elif sap:
                    cur.execute(
                        "UPDATE lab.cliente SET codigo_sap = COALESCE(NULLIF(codigo_sap,''), %s) WHERE id = %s",
                        (sap, c["id"]),
                    )
                elif rut:
                    cur.execute(
                        "UPDATE lab.cliente SET rut = COALESCE(NULLIF(rut,''), %s) WHERE id = %s",
                        (rut, c["id"]),
                    )
                upd_c += cur.rowcount

            upd_p = 0
            for p in info["plantas_a_actualizar"]:
                cur.execute(
                    "UPDATE lab.planta SET codigo_sap = COALESCE(NULLIF(codigo_sap,''), %s) WHERE id = %s",
                    (p["codigo_sap"], p["id"]),
                )
                upd_p += cur.rowcount

        conn.commit()

    print(f"\nActualizado:")
    print(f"  Clientes (Sold To):  {upd_c} filas")
    print(f"  Plantas  (Ship To):  {upd_p} filas\n")


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("archivo", help="Excel maestro SAP")
    p.add_argument("--aplicar", action="store_true", help="Escribir en la BD. Sin esto solo analiza.")
    args = p.parse_args()

    ruta = Path(args.archivo)
    if not ruta.exists():
        print(f"ERROR: no existe '{ruta}'")
        sys.exit(1)

    info = analizar(ruta)
    imprimir_resumen(info)

    if not args.aplicar:
        print("Modo análisis (sin --aplicar). Para actualizar la BD agrega --aplicar.\n")
        return

    aplicar(info)


if __name__ == "__main__":
    main()
