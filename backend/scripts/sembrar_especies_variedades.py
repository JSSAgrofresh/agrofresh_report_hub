"""
Siembra el catálogo de Especie y Variedad en valor_lista desde el Excel
maestro.

Formatos aceptados:
  - Hoja "BD"              con columnas "Especie" y "Variedad"
  - Hoja "ESPECIE-VARIEDAD" con columnas "CROP"    y "Variedad"

Los valores "#N/A" y vacíos se ignoran.
Solo inserta. Nunca borra ni modifica valores ya existentes.

Uso:
    cd backend
    python scripts/sembrar_especies_variedades.py ARCHIVO.xlsx         # solo analizar
    python scripts/sembrar_especies_variedades.py ARCHIVO.xlsx --aplicar  # sembrar
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


_IGNORAR = {"#n/a", "none", "-", "", "n a", "n/a"}


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


def _leer_excel(ruta: Path) -> dict[str, set[str]]:
    """Devuelve {especie: {variedad1, variedad2, ...}}.

    Acepta dos formatos:
      - Hoja "BD"               → columnas "Especie" y "Variedad"
      - Hoja "ESPECIE-VARIEDAD" → columnas "CROP"    y "Variedad"
    """
    ox = _importar_openpyxl()
    wb = ox.load_workbook(ruta, read_only=True, data_only=True)

    if "BD" in wb.sheetnames:
        ws = wb["BD"]
    elif "ESPECIE-VARIEDAD" in wb.sheetnames:
        ws = wb["ESPECIE-VARIEDAD"]
    else:
        print(f"ERROR: se esperaba hoja 'BD' o 'ESPECIE-VARIEDAD'. Hojas: {wb.sheetnames}")
        sys.exit(1)

    filas = list(ws.iter_rows(values_only=True))
    enc = [str(c).strip().lower() if c else "" for c in filas[0]]

    # "especie" o "crop" como alias
    idx_esp = next((i for i, h in enumerate(enc) if h in ("especie", "crop")), None)
    idx_var = next((i for i, h in enumerate(enc) if h == "variedad"), None)

    if idx_esp is None or idx_var is None:
        print(f"ERROR: no se encontraron columnas 'Especie'/'CROP' o 'Variedad'. Encabezados: {enc}")
        sys.exit(1)

    catalogo: dict[str, set[str]] = {}
    for f in filas[1:]:
        esp_raw = str(f[idx_esp]).strip() if f[idx_esp] is not None else ""
        var_raw = str(f[idx_var]).strip() if f[idx_var] is not None else ""

        if _clave(esp_raw) in _IGNORAR:
            continue
        catalogo.setdefault(esp_raw, set())
        if _clave(var_raw) not in _IGNORAR:
            catalogo[esp_raw].add(var_raw)

    wb.close()
    return catalogo


def analizar(ruta: Path) -> dict:
    catalogo_excel = _leer_excel(ruta)

    with conexion() as conn:
        with cursor_dict(conn) as cur:
            cur.execute(
                "SELECT id, valor, valor_normalizado FROM lab.valor_lista WHERE tipo = 'especie' AND es_estandar = true"
            )
            especies_bd = {r["valor_normalizado"]: r for r in cur.fetchall()}

            cur.execute(
                "SELECT id, valor, valor_normalizado, especie_id FROM lab.valor_lista WHERE tipo = 'variedad' AND es_estandar = true"
            )
            variedades_bd_por_esp: dict[int, dict[str, dict]] = {}
            for r in cur.fetchall():
                variedades_bd_por_esp.setdefault(r["especie_id"], {})[r["valor_normalizado"]] = r

    nuevas_especies: list[str] = []
    nuevas_variedades: list[tuple[str, str]] = []  # (especie, variedad)

    for especie, variedades in sorted(catalogo_excel.items()):
        clave_esp = _clave(especie)
        bd_esp = especies_bd.get(clave_esp)

        if bd_esp is None:
            nuevas_especies.append(especie)
            # Todas las variedades de esta especie también son nuevas
            for v in sorted(variedades):
                nuevas_variedades.append((especie, v))
        else:
            variedades_existentes = variedades_bd_por_esp.get(bd_esp["id"], {})
            for v in sorted(variedades):
                if _clave(v) not in variedades_existentes:
                    nuevas_variedades.append((especie, v))

    return {
        "catalogo_excel": catalogo_excel,
        "nuevas_especies": nuevas_especies,
        "nuevas_variedades": nuevas_variedades,
        "especies_bd": especies_bd,
    }


def imprimir_resumen(info: dict) -> None:
    total_esp = len(info["catalogo_excel"])
    total_var = sum(len(v) for v in info["catalogo_excel"].values())
    print(f"\n{'='*60}")
    print(f"  Especie / Variedad  |  {total_esp} especies, {total_var} variedades en Excel")
    print(f"{'='*60}")

    print(f"\n[1] Especies nuevas a crear: {len(info['nuevas_especies'])}")
    for e in info["nuevas_especies"]:
        print(f"      '{e}'")

    print(f"\n[2] Variedades nuevas a crear: {len(info['nuevas_variedades'])}")
    for e, v in info["nuevas_variedades"][:20]:
        print(f"      [{e}] → '{v}'")
    if len(info["nuevas_variedades"]) > 20:
        print(f"      ... y {len(info['nuevas_variedades'])-20} más")

    ya_en_bd = len(info["especies_bd"])
    print(f"\n[3] Especies ya en BD: {ya_en_bd}")
    print()


def limpiar() -> None:
    """Borra todas las filas de valor_lista (variedades primero, luego especies)."""
    with conexion() as conn:
        with cursor_dict(conn) as cur:
            cur.execute("DELETE FROM lab.valor_lista WHERE tipo = 'variedad'")
            n_var = cur.rowcount
            cur.execute("DELETE FROM lab.valor_lista WHERE tipo = 'especie'")
            n_esp = cur.rowcount
        conn.commit()
    print(f"\nLimpieza:")
    print(f"  Variedades eliminadas: {n_var}")
    print(f"  Especies eliminadas:   {n_esp}")


def aplicar(info: dict) -> None:
    catalogo = info["catalogo_excel"]

    with conexion() as conn:
        with cursor_dict(conn) as cur:
            # Re-leer la BD en esta transacción para tener IDs frescos
            cur.execute(
                "SELECT id, valor, valor_normalizado FROM lab.valor_lista WHERE tipo = 'especie' AND es_estandar = true"
            )
            especies_bd = {r["valor_normalizado"]: r for r in cur.fetchall()}

            ins_esp = 0
            for especie in sorted(catalogo.keys()):
                clave_esp = _clave(especie)
                if clave_esp in _IGNORAR:
                    continue
                if clave_esp not in especies_bd:
                    cur.execute(
                        "INSERT INTO lab.valor_lista (tipo, valor, valor_normalizado, activo, es_estandar) "
                        "VALUES ('especie', %s, %s, true, true) RETURNING id, valor_normalizado",
                        (especie, clave_esp),
                    )
                    row = cur.fetchone()
                    especies_bd[row["valor_normalizado"]] = {"id": row["id"], "valor": especie, "valor_normalizado": clave_esp}
                    ins_esp += 1

            # Re-leer variedades para no duplicar
            cur.execute(
                "SELECT id, valor_normalizado, especie_id FROM lab.valor_lista WHERE tipo = 'variedad' AND es_estandar = true"
            )
            variedades_bd_por_esp: dict[int, set[str]] = {}
            for r in cur.fetchall():
                variedades_bd_por_esp.setdefault(r["especie_id"], set()).add(r["valor_normalizado"])

            ins_var = 0
            for especie, variedades in sorted(catalogo.items()):
                clave_esp = _clave(especie)
                if clave_esp in _IGNORAR:
                    continue
                bd_esp = especies_bd.get(clave_esp)
                if not bd_esp:
                    continue
                esp_id = bd_esp["id"]
                existentes = variedades_bd_por_esp.get(esp_id, set())

                for variedad in sorted(variedades):
                    clave_var = _clave(variedad)
                    if clave_var in _IGNORAR or clave_var in existentes:
                        continue
                    cur.execute(
                        "INSERT INTO lab.valor_lista (tipo, valor, valor_normalizado, activo, es_estandar, especie_id) "
                        "VALUES ('variedad', %s, %s, true, true, %s)",
                        (variedad, clave_var, esp_id),
                    )
                    existentes.add(clave_var)
                    ins_var += 1

        conn.commit()

    print(f"\nSembrado:")
    print(f"  Especies nuevas:    {ins_esp}")
    print(f"  Variedades nuevas:  {ins_var}\n")


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("archivo", help="Excel maestro (hoja 'BD' o 'ESPECIE-VARIEDAD')")
    p.add_argument("--aplicar", action="store_true", help="Escribir en la BD. Sin esto solo analiza.")
    p.add_argument("--desde-cero", action="store_true",
                   help="Borra TODAS las especies y variedades existentes antes de sembrar (implica --aplicar).")
    args = p.parse_args()

    if args.desde_cero:
        args.aplicar = True

    ruta = Path(args.archivo)
    if not ruta.exists():
        print(f"ERROR: no existe '{ruta}'")
        sys.exit(1)

    info = analizar(ruta)
    imprimir_resumen(info)

    if not args.aplicar:
        print("Modo análisis (sin --aplicar). Para sembrar agrega --aplicar.\n")
        return

    if args.desde_cero:
        limpiar()

    aplicar(info)


if __name__ == "__main__":
    main()
