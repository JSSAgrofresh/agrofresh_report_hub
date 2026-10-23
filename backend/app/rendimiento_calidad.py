"""
Rendimiento de calidad (Panel de control interno): de los informes que llegaron, cuántos CUMPLEN y cuántos NO cumplen,
por cliente, planta y semana, para cada análisis:

  Residuales (AgroFresh y Quiteca)  contra los límites por especie y analito, y se desglosan en Línea de proceso, Actimist y
                                    Ecofog (FSMA y FITO no se desglosan). Línea de proceso y Actimist tienen cada uno su tabla
                                    (`LIMITES_LINEA`, `LIMITES_ACTIMIST`); Ecofog, que es una copia de Actimist, usa la de
                                    Actimist (`LIMITES_ECOFOG`, por confirmar). Un informe NO cumple si algún analito queda sobre
                                    su máximo o bajo su mínimo.
  FSMA (ALS)                        «hay / no hay»: un informe NO cumple si detectó algo (un «<1» o ND es no detectado).
  FITO (Diagnofruit)                por nivel de Botrytis, Alternaria, Geotrichum y Penicillium (tabla única para todas las
                                    frutas): el informe cumple si todos están en Óptimo (`MODERADO_CUMPLE` decide Moderado).

La unidad es el INFORME (una solicitud de Report). Un informe que no se puede juzgar (especie sin tabla, sin analitos con
límite) no entra a la cuenta y se informa aparte (`sin_criterio`): nunca se asume que cumple. La semana es la de la fecha
de muestreo (lunes de esa semana). Solo lectura. `LIMITES_LINEA` espeja `features/reportes/lib/limitesResiduales.ts`
(`tests/test_rendimiento_calidad.py` los compara). Solo Residuales se desglosa por servicio en la pantalla; el servidor igual manda el servicio de cada celda.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends

from .auditoria_interna import puede_auditoria
from .clasificar_servicio import servicio_de_tipo
from .auth import Usuario
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auditoria-interna", tags=["auditoria-interna"])

# ¿Un nivel «Moderado» de FITO cumple? Hoy no: solo «Óptimo» cumple (decisión pendiente del usuario).
MODERADO_CUMPLE = False

Rango = tuple[float, float]

_CITRICOS: dict[str, Rango] = {"FDL": (0.7, 3), "PYR": (1, 4), "IMZ": (1, 5), "AZOX": (0.7, 4), "TBZ": (1, 4)}
_CAROZO_TEBU: dict[str, Rango] = {"FDL": (0.7, 3), "PYR": (1, 4), "TEBU": (0.5, 0.6)}

# Línea de proceso: la tabla del laboratorio (blanca y celeste). «NA» = sin límite = no se evalúa.
LIMITES_LINEA: dict[str, dict[str, Rango]] = {
    "Arándano": {"FDL": (0.7, 3)},
    "Cerezas": {"FDL": (0.7, 5), "PYR": (1, 4), "TEBU": (0.5, 4)},
    "Ciruela": {"FDL": (0.7, 3), "PYR": (1, 4), "TEBU": (0.6, 1)},
    "Clementina": _CITRICOS, "Limón": _CITRICOS, "Mandarina": _CITRICOS, "Naranja": _CITRICOS, "Pomelo": _CITRICOS,
    "Manzana": {"FDL": (0.7, 3), "PYR": (1, 4), "TBZ": (1, 4)},
    "Pera": {"FDL": (0.7, 3), "PYR": (1, 4), "TBZ": (1, 4)},
    "Nectarín": _CAROZO_TEBU, "Durazno": _CAROZO_TEBU,
    "Kiwi": {"FDL": (0.7, 3)},
}

# Actimist: su propia tabla, por fruta (la amarilla). La nota «Pyr: min 0,7-5 en chisa» no se aplica (sin aclarar).
LIMITES_ACTIMIST: dict[str, dict[str, Rango]] = {
    "Ciruela": {"FDL": (0.7, 3)},
    "Manzana": {"FDL": (0.7, 3.5), "PYR": (1, 4), "DPA": (3.5, 8)},
    "Pera": {"FDL": (0.7, 3.5), "PYR": (1, 3), "DPA": (3.5, 8)},
    "Kiwi": {"FDL": (0.7, 3)},
    "Zarzaparrilla": {"FDL": (0.7, 2)},
    "Uva": {"FDL": (0.7, 2)},
}

# Ecofog es una copia de Actimist en todo el sistema: mientras el laboratorio no entregue su propia tabla, usa la de Actimist.
LIMITES_ECOFOG = LIMITES_ACTIMIST

# Diagnofruit: (óptimo si < a, peligroso si > b; entre a y b, moderado).
NIVELES_FITO: dict[str, tuple[float, float]] = {
    "BOT": (20, 200), "ALT": (50, 300), "GEO": (10, 50), "PEN": (50, 300),
}

_EPS = 1e-9
BLOQUES = ("residuales", "fsma", "fito")


def _clave_especie(especie: str | None) -> str:
    t = unicodedata.normalize("NFD", especie or "")
    t = "".join(c for c in t if not unicodedata.combining(c)).lower().strip()
    return re.sub(r"s$", "", t)


def _indexar(tabla: dict[str, dict[str, Rango]]) -> dict[str, dict[str, Rango]]:
    return {_clave_especie(e): l for e, l in tabla.items()}


_POR_ESPECIE = {"linea": _indexar(LIMITES_LINEA), "actimist": _indexar(LIMITES_ACTIMIST), "ecofog": _indexar(LIMITES_ECOFOG)}


def _codigo(analito: str | None) -> str:
    return re.sub(r"\s*ppm\s*$", "", (analito or "").strip(), flags=re.I).upper()


def _numero(valor_num: Any, valor_texto: str | None) -> tuple[float | None, str]:
    """(valor, signo): signo «<» o «>» si el laboratorio dio un límite y no un valor; ND y vacíos → (None, '')."""
    if valor_num is not None:
        return float(valor_num), ""
    t = (valor_texto or "").strip()
    if not t or t.lower() in {"nd", "n.d.", "no detectado", "ausencia", "ausente", "no detectable", "bld"}:
        return None, ""
    m = re.match(r"^([<>≤≥]?)\s*(-?\d+(?:[.,]\d+)?)$", t)
    if not m:
        return None, ""
    return float(m.group(2).replace(",", ".")), {"≤": "<", "≥": ">"}.get(m.group(1), m.group(1))


# ── Los tres juicios (puros) ────────────────────────────────────────────

def analizar_residuales(especie: str | None, servicio: str, resultados: list[tuple[str, Any, str | None]]) -> list[dict[str, Any]] | None:
    """El detalle de cada analito contra su límite: estado «dentro», «sobre» o «bajo» y cuánto se pasa (`desvio`, positivo sobre
    el máximo y negativo bajo el mínimo). `None` si la especie no tiene tabla para ese servicio. Un analito sin límite, sin valor
    o con «<x» sale como «sin_limite» / «sin_medida» y no se juzga."""
    limites = _POR_ESPECIE.get(servicio, {}).get(_clave_especie(especie))
    if not limites:
        return None
    detalle: list[dict[str, Any]] = []
    for codigo, vnum, vtxt in resultados:
        cod = _codigo(codigo)
        rango = limites.get(cod)
        valor, signo = _numero(vnum, vtxt)
        fila: dict[str, Any] = {"codigo": cod, "valor": valor, "signo": signo, "min": None, "max": None, "estado": "sin_limite", "desvio": 0.0}
        if rango:
            fila["min"], fila["max"] = rango
            minimo, maximo = rango
            if valor is None or signo == "<":     # «<0,05» está bajo el límite de cuantificación: no es una medida
                fila["estado"] = "sin_medida"
            elif valor > maximo:
                fila["estado"], fila["desvio"] = "sobre", round(valor - maximo, 4)
            elif valor < minimo and signo != ">":
                fila["estado"], fila["desvio"] = "bajo", round(valor - minimo, 4)
            else:
                fila["estado"] = "dentro"
        detalle.append(fila)
    return detalle


def juzgar_residuales(especie: str | None, servicio: str, resultados: list[tuple[str, Any, str | None]]) -> bool | None:
    """True = cumple, False = no cumple, None = no se puede juzgar (sin límites para esa especie o sin analitos con límite)."""
    detalle = analizar_residuales(especie, servicio, resultados)
    if not detalle:
        return None
    evaluados = [d["estado"] for d in detalle if d["estado"] in ("dentro", "sobre", "bajo")]
    if not evaluados:
        return None
    return all(e == "dentro" for e in evaluados)


def detecto(vnum: Any, vtxt: str | None) -> bool | None:
    """¿Hay presencia? None si no se puede saber (texto raro). «<1» y ND son no detectado (igual que Report)."""
    if vnum is not None:
        return float(vnum) > 0
    t = (vtxt or "").strip().lower()
    if not t:
        return None
    if t in {"nd", "n.d.", "no detectado", "ausencia", "ausente", "no detectable"} or t.startswith("<"):
        return False
    if t in {"presencia", "presente", "detectado"} or t.startswith(">"):
        return True
    valor, _ = _numero(None, vtxt)
    return None if valor is None else valor > 0


def juzgar_fsma(resultados: list[tuple[str, Any, str | None]]) -> bool | None:
    vistos = [detecto(n, t) for _, n, t in resultados]
    vistos = [v for v in vistos if v is not None]
    if not vistos:
        return None
    return not any(vistos)


def nivel_fito(codigo: str, valor: float, signo: str = "") -> str | None:
    umbral = NIVELES_FITO.get(_codigo(codigo))
    if not umbral:
        return None
    a, b = umbral
    v = valor + _EPS if signo == ">" else valor - _EPS if signo == "<" else valor
    return "optimo" if v < a else "peligroso" if v > b else "moderado"


def juzgar_fito(resultados: list[tuple[str, Any, str | None]]) -> bool | None:
    niveles: list[str] = []
    for codigo, vnum, vtxt in resultados:
        if _codigo(codigo) not in NIVELES_FITO:
            continue
        valor, signo = _numero(vnum, vtxt)
        niveles.append(nivel_fito(codigo, 0.0 if valor is None else valor, signo) or "optimo")
    if not niveles:
        return None
    buenos = {"optimo", "moderado"} if MODERADO_CUMPLE else {"optimo"}
    return all(n in buenos for n in niveles)


def bloque_de(laboratorio: str | None) -> str | None:
    lab = (laboratorio or "").split("(", 1)[0].strip().casefold()
    return {"agrofresh": "residuales", "quiteca": "residuales", "als": "fsma", "diagnofruit": "fito"}.get(lab)


def servicio_de(servicio: str | None, tipo_toma: str | None = None) -> str:
    """Línea de proceso (y RYD) → «linea»; Actimist → «actimist»; Ecofog → «ecofog». Manda el servicio guardado al cargar el informe
    (0055); en los cargados antes (sin servicio) se usa el «Tipo Aplicación» de su solicitud de Toma de muestras (`tipo_toma`)."""
    s = (servicio or "").strip().lower()
    if not s and tipo_toma:
        s = servicio_de_tipo(tipo_toma)
    return s if s in ("actimist", "ecofog") else "linea"


def lunes(f: date) -> date:
    return f - timedelta(days=f.weekday())


def juzgar(bloque: str, especie: str | None, servicio: str, resultados: list[tuple[str, Any, str | None]]) -> bool | None:
    if bloque == "residuales":
        return juzgar_residuales(especie, servicio, resultados)
    if bloque == "fsma":
        return juzgar_fsma(resultados)
    return juzgar_fito(resultados)


_SQL = """
    SELECT s.id, s.laboratorio, s.especie, to_jsonb(s) ->> 'servicio' AS servicio,
           (SELECT sa.datos->'campos_laboratorio'->>'Tipo Aplicación' FROM solicitud_archivo sa
             WHERE upper(btrim(sa.numero_solicitud)) = upper(btrim(to_jsonb(s) ->> 'referencia'))
               AND btrim(COALESCE(to_jsonb(s) ->> 'referencia', '')) <> '' LIMIT 1) AS tipo_toma,
           COALESCE(s.fecha_muestreo, s.fecha_entrada, s.fecha_informe, s.fecha_analisis) AS fecha,
           COALESCE(c.nombre, s.sold_to_raw) AS sold_to, COALESCE(p.nombre, s.ship_to_raw) AS ship_to,
           COALESCE(a.codigo, r.analito_raw) AS analito, r.valor_num, r.valor_texto
    FROM solicitud s
    LEFT JOIN planta p ON p.id = s.planta_id
    LEFT JOIN cliente c ON c.id = p.cliente_id
    LEFT JOIN resultado r ON r.solicitud_id = s.id
    LEFT JOIN analito a ON a.id = r.analito_id
    WHERE s.vigente
    ORDER BY s.id
"""


def calcular(filas_bd: list[dict[str, Any]]) -> dict[str, Any]:
    """Agrupa las filas de la consulta por informe, juzga cada uno y suma por (cliente, planta, semana, análisis, servicio)."""
    informes: dict[int, dict[str, Any]] = {}
    for f in filas_bd:
        inf = informes.setdefault(f["id"], {**f, "resultados": []})
        if f["analito"] is not None:
            inf["resultados"].append((f["analito"], f["valor_num"], f["valor_texto"]))
    suma: dict[tuple, list[int]] = {}
    sin_criterio = {b: 0 for b in BLOQUES}
    fuera = {"sin_fecha": 0, "otro_laboratorio": 0}
    for inf in informes.values():
        bloque = bloque_de(inf["laboratorio"])
        if bloque is None:
            fuera["otro_laboratorio"] += 1
            continue
        servicio = servicio_de(inf["servicio"], inf.get("tipo_toma"))
        if inf["fecha"] is None:
            fuera["sin_fecha"] += 1
            continue
        veredicto = juzgar(bloque, inf["especie"], servicio, inf["resultados"])
        if veredicto is None:
            sin_criterio[bloque] += 1
            continue
        clave = (inf["sold_to"] or "", inf["ship_to"] or "", lunes(inf["fecha"]).isoformat(), bloque, servicio)
        suma.setdefault(clave, [0, 0])[0 if veredicto else 1] += 1
    filas = [
        {"sold_to": k[0], "ship_to": k[1], "semana": k[2], "bloque": k[3], "servicio": k[4], "cumple": v[0], "no_cumple": v[1]}
        for k, v in sorted(suma.items())
    ]
    return {"filas": filas, "sin_criterio": sin_criterio, "fuera": fuera, "moderado_cumple": MODERADO_CUMPLE}


@router.get("/rendimiento-calidad")
def rendimiento_calidad(_: Usuario = Depends(puede_auditoria)) -> dict[str, Any]:
    """Cuántos informes cumplen y cuántos no, por cliente, planta, semana y análisis (se agrupa y filtra en la pantalla)."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(_SQL)
        return calcular(cur.fetchall())


# ── Detalle de una planta: los informes y, por analito, el valor contra su límite ──────────────────────

NOMBRES_FITO = {"BOT": "Botrytis", "ALT": "Alternaria", "GEO": "Geotrichum", "PEN": "Penicillium"}

_SQL_DETALLE = """
    SELECT s.id, s.nro_solicitud, to_jsonb(s) ->> 'referencia' AS referencia, s.laboratorio, s.especie, s.variedad,
           to_jsonb(s) ->> 'servicio' AS servicio,
           (SELECT sa.datos->'campos_laboratorio'->>'Tipo Aplicación' FROM solicitud_archivo sa
             WHERE upper(btrim(sa.numero_solicitud)) = upper(btrim(to_jsonb(s) ->> 'referencia'))
               AND btrim(COALESCE(to_jsonb(s) ->> 'referencia', '')) <> '' LIMIT 1) AS tipo_toma,
           COALESCE(s.fecha_muestreo, s.fecha_entrada, s.fecha_informe, s.fecha_analisis) AS fecha,
           COALESCE(a.codigo, r.analito_raw) AS analito, COALESCE(a.nombre, r.analito_raw) AS nombre, a.unidad,
           r.valor_num, r.valor_texto
    FROM solicitud s
    LEFT JOIN planta p ON p.id = s.planta_id
    LEFT JOIN cliente c ON c.id = p.cliente_id
    LEFT JOIN resultado r ON r.solicitud_id = s.id
    LEFT JOIN analito a ON a.id = r.analito_id
    WHERE s.vigente
      AND COALESCE(c.nombre, s.sold_to_raw) = %(sold_to)s
      AND COALESCE(p.nombre, s.ship_to_raw) = %(ship_to)s
    ORDER BY s.id
"""


def _detalle_fsma(resultados: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"codigo": _codigo(r["analito"]), "nombre": r["nombre"], "unidad": r["unidad"], "valor": r["valor_texto"] if r["valor_num"] is None else float(r["valor_num"]),
         "detecto": detecto(r["valor_num"], r["valor_texto"])}
        for r in resultados
    ]


def _detalle_fito(resultados: list[dict[str, Any]]) -> list[dict[str, Any]]:
    salida = []
    for r in resultados:
        cod = _codigo(r["analito"])
        if cod not in NIVELES_FITO:
            continue
        valor, signo = _numero(r["valor_num"], r["valor_texto"])
        a, b = NIVELES_FITO[cod]
        salida.append({"codigo": cod, "nombre": NOMBRES_FITO.get(cod, r["nombre"]), "unidad": r["unidad"], "valor": valor, "signo": signo,
                       "optimo_hasta": a, "peligroso_desde": b, "nivel": nivel_fito(cod, 0.0 if valor is None else valor, signo)})
    return salida


def armar_detalle(filas_bd: list[dict[str, Any]], desde: date | None, hasta: date | None) -> dict[str, Any]:
    """Los informes de una planta en el período, con el detalle de cada análisis. Los que no cumplen primero."""
    informes: dict[int, dict[str, Any]] = {}
    for f in filas_bd:
        inf = informes.setdefault(f["id"], {**f, "filas": []})
        if f["analito"] is not None:
            inf["filas"].append(f)
    piso = lunes(desde) if desde else None
    salida: list[dict[str, Any]] = []
    for inf in informes.values():
        bloque = bloque_de(inf["laboratorio"])
        fecha = inf["fecha"]
        if bloque is None or fecha is None:
            continue
        if (piso and lunes(fecha) < piso) or (hasta and lunes(fecha) > hasta):
            continue
        servicio = servicio_de(inf["servicio"], inf.get("tipo_toma"))
        resultados = [(r["analito"], r["valor_num"], r["valor_texto"]) for r in inf["filas"]]
        veredicto = juzgar(bloque, inf["especie"], servicio, resultados)
        analitos: list[dict[str, Any]]
        if bloque == "residuales":
            analitos = []
            for d in analizar_residuales(inf["especie"], servicio, resultados) or []:
                orig = next((r for r in inf["filas"] if _codigo(r["analito"]) == d["codigo"]), None)
                analitos.append({**d, "nombre": orig["nombre"] if orig else d["codigo"], "unidad": (orig or {}).get("unidad") or "ppm"})
        elif bloque == "fsma":
            analitos = _detalle_fsma(inf["filas"])
        else:
            analitos = _detalle_fito(inf["filas"])
        salida.append({
            "id": inf["id"], "informe": inf["nro_solicitud"], "ot": inf["referencia"], "laboratorio": inf["laboratorio"], "bloque": bloque, "servicio": servicio,
            "especie": inf["especie"], "variedad": inf["variedad"], "fecha": fecha.isoformat(), "semana": lunes(fecha).isoformat(),
            "cumple": veredicto, "analitos": analitos,
        })
    orden = {False: 0, None: 1, True: 2}
    salida.sort(key=lambda i: i["fecha"], reverse=True)
    salida.sort(key=lambda i: orden[i["cumple"]])
    return {"informes": salida}


@router.get("/rendimiento-calidad/detalle")
def rendimiento_calidad_detalle(sold_to: str, ship_to: str, desde: date | None = None, hasta: date | None = None,
                                _: Usuario = Depends(puede_auditoria)) -> dict[str, Any]:
    """Los informes de una planta en el período (los de la fila que se abrió en la tabla), con cada analito contra su límite."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(_SQL_DETALLE, {"sold_to": sold_to, "ship_to": ship_to})
        return armar_detalle(cur.fetchall(), desde, hasta)
