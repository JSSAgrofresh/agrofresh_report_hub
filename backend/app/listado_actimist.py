"""
Carga del listado de Actimist (Sold To / Ship To) desde un Excel.

El Excel es la dinámica del Planner: cuatro columnas, «Sold to Number»,
«Sold to Name», «Ship to Number» y «Ship to Name», en cualquier hoja y con el
encabezado en cualquier fila (la dinámica deja filas vacías arriba y un
«Total general» abajo). Como toda dinámica, escribe el Sold To solo en su
primera fila: una fila con Ship To y sin Sold To es del Sold To de más arriba.
También sirve el Excel con el Sold To repetido en cada fila.

Se hace en dos pasos, como los scripts que escriben en la base:
  1. `planear` dice qué se crearía, qué ya existe y qué no se puede cargar.
     NO escribe nada.
  2. `aplicar` crea solo lo que el plan marcó como nuevo, en UNA transacción.

Reglas:
  - Solo toca `cliente_actimist` / `planta_actimist`. El listado de Línea de
    proceso (`cliente` / `planta`) no se lee ni se escribe.
  - Un Sold To se reconoce primero por su código SAP y, si no lo tiene, por el
    nombre (sin mayúsculas, tildes ni espacios repetidos). Nunca se duplica.
  - Un Ship To se reconoce dentro de su Sold To, igual: código y luego nombre.
  - Ship To «0» o vacío = sin código: la sucursal se carga con su nombre.
  - Los nombres se guardan tal como vienen (SAP los corta en ~35 letras).
  - Nada se borra ni se modifica: lo que ya existe queda como está.
"""
from __future__ import annotations

import io
import re
import unicodedata
from typing import Any

from .servicios import TABLAS, ACTIMIST

TABLA_CLIENTES, TABLA_PLANTAS = TABLAS[ACTIMIST]

_ENCABEZADOS = {
    "sold_num": "sold to number",
    "sold_nombre": "sold to name",
    "ship_num": "ship to number",
    "ship_nombre": "ship to name",
}
_SIN_DATO = {"", "0", "-", "--", "none", "nan", "#n/a", "n/a"}


def norm(texto: Any) -> str:
    t = unicodedata.normalize("NFKD", str(texto or ""))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip().casefold()


def _texto(valor: Any) -> str:
    return re.sub(r"\s+", " ", str(valor if valor is not None else "")).strip()


def _codigo(valor: Any) -> str | None:
    """1608658 / 1608658.0 / «1608658» → «1608658». 0, vacío o «-» → None."""
    if valor is None:
        return None
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    texto = _texto(valor)
    if re.fullmatch(r"\d+\.0+", texto):
        texto = texto.split(".")[0]
    return None if texto.casefold() in _SIN_DATO else texto


# ---------------------------------------------------------------------------
# Excel → filas
# ---------------------------------------------------------------------------

def leer_excel(contenido: bytes) -> list[dict]:
    """Las filas del Excel, con su número de fila. Lanza ValueError si no
    encuentra las cuatro columnas en ninguna hoja."""
    import openpyxl

    try:
        wb = openpyxl.load_workbook(io.BytesIO(contenido), read_only=True, data_only=True)
    except Exception as exc:
        raise ValueError("No se pudo abrir el archivo. ¿Es un Excel (.xlsx)?") from exc
    try:
        for ws in wb.worksheets:
            columnas: dict[str, int] | None = None
            filas: list[dict] = []
            # En la dinámica el Sold To se escribe solo en su primera fila: las
            # de abajo vienen en blanco y son del Sold To más cercano hacia arriba.
            sold_actual: tuple[str, str | None] | None = None
            for n, fila in enumerate(ws.iter_rows(values_only=True), start=1):
                if columnas is None:
                    if n > 40:
                        break  # la dinámica tiene el encabezado arriba; no se recorre la hoja entera
                    vistos = {norm(v): i for i, v in enumerate(fila) if v is not None}
                    if all(e in vistos for e in _ENCABEZADOS.values()):
                        columnas = {k: vistos[e] for k, e in _ENCABEZADOS.items()}
                    continue
                valor = {k: (fila[i] if i < len(fila) else None) for k, i in columnas.items()}
                sold_nombre = _texto(valor["sold_nombre"])
                sold_num = _codigo(valor["sold_num"])
                ship_nombre = _texto(valor["ship_nombre"])
                if norm(valor["sold_num"]).startswith("total") or norm(sold_nombre).startswith("total general"):
                    continue
                if sold_nombre or sold_num:
                    sold_actual = (sold_nombre, sold_num)
                elif ship_nombre and sold_actual is not None:
                    sold_nombre, sold_num = sold_actual   # hereda el de arriba
                else:
                    continue
                filas.append({
                    "fila": n,
                    "sold_to": sold_nombre,
                    "codigo_sold": sold_num,
                    "ship_to": ship_nombre,
                    "codigo_ship": _codigo(valor["ship_num"]),
                })
            if columnas is not None:
                return filas
    finally:
        wb.close()
    raise ValueError(
        "No se encontraron las columnas «Sold to Number», «Sold to Name», «Ship to Number» y «Ship to Name»."
    )


# ---------------------------------------------------------------------------
# Plan (no escribe)
# ---------------------------------------------------------------------------

def planear(filas: list[dict], clientes: list[dict], plantas: list[dict]) -> dict:
    """Qué haría la carga. `clientes`/`plantas`: lo que hay hoy en el listado de
    Actimist (id, nombre, codigo_sap[, cliente_id]). Función pura."""
    # Índices de lo existente + lo que el plan va agregando (id None = nuevo).
    por_codigo: dict[str, dict] = {}
    por_nombre: dict[str, dict] = {}
    for c in clientes:
        reg = {"id": c["id"], "nombre": c["nombre"], "codigo_sap": c.get("codigo_sap"), "nuevo": False}
        if reg["codigo_sap"]:
            por_codigo.setdefault(str(reg["codigo_sap"]).strip(), reg)
        por_nombre.setdefault(norm(reg["nombre"]), reg)
    plantas_de: dict[int | str, list[dict]] = {}
    for p in plantas:
        plantas_de.setdefault(p["cliente_id"], []).append(
            {"nombre": p["nombre"], "codigo_sap": p.get("codigo_sap"), "nuevo": False}
        )

    clientes_nuevos: list[dict] = []
    plantas_nuevas: list[dict] = []
    avisos: list[dict] = []
    existentes = {"clientes": set(), "plantas": 0}
    sin_codigo_avisado: set[str] = set()

    def avisar(f: dict, motivo: str, grave: bool) -> None:
        avisos.append({"fila": f["fila"], "sold_to": f["sold_to"], "ship_to": f["ship_to"],
                       "motivo": motivo, "omitida": grave})

    for f in filas:
        if not f["sold_to"]:
            avisar(f, "Sin nombre de Sold To: no se carga.", True)
            continue
        cliente = por_codigo.get(f["codigo_sold"] or "") or None
        if cliente is None:
            mismo_nombre = por_nombre.get(norm(f["sold_to"]))
            if mismo_nombre is not None:
                codigo_previo = mismo_nombre.get("codigo_sap")
                if f["codigo_sold"] and codigo_previo and str(codigo_previo) != f["codigo_sold"]:
                    avisar(f, f"Ya hay un Sold To «{mismo_nombre['nombre']}» con otro código "
                              f"({codigo_previo}); el nombre no puede repetirse. No se carga.", True)
                    continue
                cliente = mismo_nombre
        if cliente is None:
            cliente = {"id": None, "clave": f"nuevo-{len(clientes_nuevos)}", "nombre": f["sold_to"],
                       "codigo_sap": f["codigo_sold"], "nuevo": True}
            clientes_nuevos.append({"nombre": cliente["nombre"], "codigo_sap": cliente["codigo_sap"],
                                    "clave": cliente["clave"]})
            if cliente["codigo_sap"]:
                por_codigo[cliente["codigo_sap"]] = cliente
            por_nombre[norm(cliente["nombre"])] = cliente
        elif not cliente["nuevo"]:
            existentes["clientes"].add(cliente["id"])
        if f["codigo_sold"] is None and norm(f["sold_to"]) not in sin_codigo_avisado:
            sin_codigo_avisado.add(norm(f["sold_to"]))
            avisar(f, "Sold To sin código SAP (viene vacío): se reconoce solo por el nombre.", False)

        if not f["ship_to"]:
            avisar(f, "Sin nombre de Ship To: se carga solo el Sold To.", False)
            continue
        llave = cliente["id"] if cliente["id"] is not None else cliente["clave"]
        hermanas = plantas_de.setdefault(llave, [])
        planta = None
        if f["codigo_ship"]:
            planta = next((p for p in hermanas if p.get("codigo_sap") and str(p["codigo_sap"]) == f["codigo_ship"]), None)
        if planta is None:
            mismo = next((p for p in hermanas if norm(p["nombre"]) == norm(f["ship_to"])), None)
            if mismo is not None:
                previo = mismo.get("codigo_sap")
                if f["codigo_ship"] and previo and str(previo) != f["codigo_ship"]:
                    avisar(f, f"«{f['ship_to']}» ya está en este Sold To con otro código ({previo}). "
                              "No se carga dos veces.", True)
                    continue
                planta = mismo
        if f["codigo_ship"] is None:
            avisar(f, "Ship To sin código SAP (viene 0 o vacío): se carga solo con el nombre.", False)
        if planta is None:
            planta = {"nombre": f["ship_to"], "codigo_sap": f["codigo_ship"], "nuevo": True}
            hermanas.append(planta)
            plantas_nuevas.append({"sold_to": cliente["nombre"], "cliente_clave": llave,
                                   "nombre": f["ship_to"], "codigo_sap": f["codigo_ship"]})
        elif not planta["nuevo"]:
            existentes["plantas"] += 1

    return {
        "filas": len(filas),
        "clientes_nuevos": clientes_nuevos,
        "plantas_nuevas": plantas_nuevas,
        "clientes_existentes": len(existentes["clientes"]),
        "plantas_existentes": existentes["plantas"],
        "avisos": avisos,
    }


# ---------------------------------------------------------------------------
# Con la base
# ---------------------------------------------------------------------------

def leer_actual(cur) -> tuple[list[dict], list[dict]]:
    cur.execute(f"SELECT id, nombre, codigo_sap FROM {TABLA_CLIENTES}")
    clientes = [dict(r) for r in cur.fetchall()]
    cur.execute(f"SELECT id, cliente_id, nombre, codigo_sap FROM {TABLA_PLANTAS}")
    plantas = [dict(r) for r in cur.fetchall()]
    return clientes, plantas


def aplicar(cur, plan: dict) -> dict[str, int]:
    """Crea lo nuevo del plan. Va dentro de la transacción de quien llama."""
    ids: dict[Any, int] = {}
    for c in plan["clientes_nuevos"]:
        cur.execute(
            f"INSERT INTO {TABLA_CLIENTES} (nombre, codigo_sap, activo) VALUES (%s, %s, TRUE) RETURNING id",
            (c["nombre"], c["codigo_sap"]),
        )
        ids[c["clave"]] = cur.fetchone()["id"]
    for p in plan["plantas_nuevas"]:
        cliente_id = ids.get(p["cliente_clave"], p["cliente_clave"])
        cur.execute(
            f"INSERT INTO {TABLA_PLANTAS} (cliente_id, nombre, codigo_sap, activo) VALUES (%s, %s, %s, TRUE)",
            (cliente_id, p["nombre"], p["codigo_sap"]),
        )
    return {"clientes": len(plan["clientes_nuevos"]), "plantas": len(plan["plantas_nuevas"])}
