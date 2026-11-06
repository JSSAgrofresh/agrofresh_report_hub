"""
Integridad de datos: cada SOLICITUD que salió a un laboratorio contra el INFORME que ese laboratorio devolvió.

Es la auditoría que el administrador usa para reclamar a los laboratorios. Para cada solicitud enviada (Toma de muestras)
busca su informe (por la OT) y revisa, por laboratorio:

  · que EXISTA el informe y que haya llegado dentro del plazo del laboratorio (`SIN_INFORME` / `INFORME_ATRASADO`);
  · la IDENTIFICACIÓN: OT, Sold To, Ship To, especie, fecha de muestreo, servicio y laboratorio (`diagnostico_informes`);
  · los ANALITOS: los que se pidieron y no vinieron (`ANALITO_FALTA`) y los que vinieron sin pedirse (`ANALITO_DE_MAS`);
  · las DOSIS: la dosis que se anotó en la solicitud contra la que trae el informe (`DOSIS_DISTINTA`, `DOSIS_FALTA`);
  · la ROTULACIÓN: lote, N° cámara, N° orden, posición de muestreo, kilos, CSG y producto (`ROTULACION_DISTINTA`, `ROTULACION_FALTA`);
  · la coherencia interna del informe (resultados vacíos, fechas que no cuadran, valores raros…).

`analizar` es PURA: recibe filas ya leídas y devuelve el resultado, así se prueba sin base. La lectura de la base, el guardado de
cada análisis y la API viven en `integridad_api.py`. Solo LEE: nada de esto cambia solicitudes ni informes.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Any

from . import diagnostico_informes as di
from .homogenizar_converter import compacto
from .mapeo import ALIAS_CODIGO_CATALOGO

ALTO, MEDIO, INFO = di.ALTO, di.MEDIO, di.INFO

# Días hábiles sin informe a partir de los cuales se avisa aunque el laboratorio no tenga plazo cargado.
DIAS_SIN_PLAZO = 7

# Datos de rotulación que el informe repite de la solicitud: (clave del informe en Report, clave de la solicitud, nombre visible).
ROTULACION = (
    ("lote", "lote", "Lote"),
    ("nro_camara", "numero_camara", "N° de cámara"),
    ("nro_orden", "numero_orden", "N° de orden"),
    ("posicion_muestreo", "posicion_muestreo", "Posición de muestreo"),
    ("kg_procesados", "kilos_procesados", "Kilos procesados"),
    ("csg", "csg_productor", "CSG productor"),
)
# Estos laboratorios no repiten la rotulación en su informe: no se les reclama (solo ALS la trae dentro de «Identificación»).
LABS_SIN_ROTULACION = {"diagnofruit"}
LABS_CON_DOSIS = {"agrofresh", "quiteca"}


# ── Utilidades ───────────────────────────────────────────────────────────────

def _fecha(v: Any) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str) and re.match(r"^\d{4}-\d{2}-\d{2}", v):
        try:
            return date.fromisoformat(v[:10])
        except ValueError:
            return None
    return None


def dias_habiles(desde: date, hasta: date) -> int:
    """Lunes a viernes entre dos fechas (sin feriados), como en el resto del sistema."""
    if hasta <= desde:
        return 0
    n, d = 0, desde
    while d < hasta:
        d += timedelta(days=1)
        if d.weekday() < 5:
            n += 1
    return n


def _norm_codigo(codigo: Any) -> str:
    """El código del analito sin «ppm» y con su equivalente de catálogo (ECOLI = ECOLI100…)."""
    c = di._codigo(codigo)
    return ALIAS_CODIGO_CATALOGO.get(c, c)


def _vacio(v: Any) -> bool:
    return v is None or str(v).strip() in ("", "—", "-", "0")


def _txt(v: Any) -> str:
    return compacto(str(v if v is not None else ""))


def _num(v: Any) -> float | None:
    try:
        return float(str(v).replace(",", ".").strip())
    except (TypeError, ValueError):
        return None


def _h(codigo: str, gravedad: str, detalle: str, sugerencia: str = "", **extra: Any) -> dict[str, Any]:
    return {"codigo": codigo, "gravedad": gravedad, "detalle": detalle, "sugerencia": sugerencia, **extra}


# Texto de cada hallazgo para el reclamo (el PDF y la pantalla los agrupan por esto).
TITULOS = {
    "SIN_INFORME": "Solicitud enviada sin informe",
    "INFORME_ATRASADO": "Informe fuera de plazo",
    "ANALITO_FALTA": "Analito pedido que el informe no trae",
    "ANALITO_DE_MAS": "Analito en el informe que no se pidió",
    "DOSIS_DISTINTA": "Dosis distinta a la de la solicitud",
    "DOSIS_FALTA": "Dosis de la solicitud ausente en el informe",
    "ROTULACION_DISTINTA": "Dato de rotulación distinto al de la solicitud",
    "ROTULACION_FALTA": "Dato de rotulación que el informe no trae",
    "SIN_OT": "Informe sin OT",
    "OT_SIN_SOLICITUD": "OT del informe sin solicitud",
    "SERVICIO_DISTINTO": "Tipo de servicio distinto",
    "SERVICIO_SIN_CLASIFICAR": "Servicio sin clasificar",
    "LABORATORIO_DISTINTO": "Laboratorio distinto al de la solicitud",
    "SOLD_TO_DISTINTO": "Sold To distinto",
    "SHIP_TO_DISTINTO": "Ship To distinto",
    "ESPECIE_DISTINTA": "Especie distinta",
    "FECHA_MUESTREO_DISTINTA": "Fecha de muestreo distinta",
    "FALTA_DATO": "Datos obligatorios que faltan",
    "SIN_PLANTA": "Sold To / Ship To sin enlazar a Listados",
    "FECHA_RARA": "Fecha fuera de lo esperable",
    "FECHAS_NO_CUADRAN": "Fechas que no cuadran",
    "SIN_RESULTADOS": "Informe sin resultados",
    "RESULTADO_SIN_CATALOGO": "Resultado sin analito del catálogo",
    "VALOR_VACIO": "Resultado sin valor",
    "VALOR_RARO": "Valor sospechoso",
    "ANALITO_REPETIDO": "Analito repetido",
    "PEDIDO_SIN_RESULTADO": "Analito pedido sin resultado",
    "RESULTADO_NO_PEDIDO": "Resultado no pedido",
}
# Los códigos de `diagnostico_informes` que ahora cubre una regla propia (más estricta) se reemplazan.
_REEMPLAZADOS = {"PEDIDO_SIN_RESULTADO", "RESULTADO_NO_PEDIDO"}


def titulo_de(codigo: str) -> str:
    return TITULOS.get(codigo, codigo.replace("_", " ").capitalize())


# ── Reglas nuevas ────────────────────────────────────────────────────────────

def _analitos(toma: dict, informes: list[dict], resultados: dict[int, list[dict]], lab: str) -> list[dict]:
    """Analitos pedidos contra los que trajeron los informes de esta OT (todos juntos: una OT puede tener varios informes)."""
    pedidos_crudos = (toma.get("datos") or {}).get("analitos_solicitados") or []
    if not pedidos_crudos:
        return []
    pedidos = {_norm_codigo(c): c for c in pedidos_crudos if str(c).strip()}
    hay: dict[str, str] = {}
    for inf in informes:
        for r in resultados.get(inf["id"], []):
            cod = _norm_codigo(r.get("codigo") or r.get("analito_raw"))
            if cod:
                hay[cod] = r.get("codigo") or r.get("analito_raw") or cod
    out: list[dict] = []
    faltan = sorted(set(pedidos) - set(hay))
    de_mas = sorted(set(hay) - set(pedidos))
    if faltan:
        out.append(_h("ANALITO_FALTA", ALTO, "Se pidió y el informe no trae: " + ", ".join(pedidos[c] for c in faltan) + ".",
                      "Reclamar al laboratorio el análisis que falta o el motivo.", analitos=[pedidos[c] for c in faltan]))
    if de_mas:
        out.append(_h("ANALITO_DE_MAS", MEDIO, "El informe trae y no se pidió: " + ", ".join(hay[c] for c in de_mas) + ".",
                      "Confirmar si se cobró o si fue un error de lectura.", analitos=[hay[c] for c in de_mas]))
    return out


def _dosis_pedidas(toma: dict, catalogo: list[dict]) -> dict[str, float]:
    """{código normalizado: dosis} que se anotó en la solicitud (solo los analitos pedidos con una dosis numérica)."""
    from .solicitud_excel import _valor_guardado

    datos = toma.get("datos") or {}
    campos = datos.get("campos_laboratorio") or {}
    pedidos = {_norm_codigo(c) for c in datos.get("analitos_solicitados") or []}
    out: dict[str, float] = {}
    vistos: set[str] = set()
    for a in catalogo:
        cod = _norm_codigo(a.get("codigo"))
        if cod in vistos or cod not in pedidos:
            continue
        v = _valor_guardado(campos, a)
        n = _num(v)
        if n is not None:
            out[cod] = n
            vistos.add(cod)
    return out


def _dosis(toma: dict, informes: list[dict], productos: dict[int, list[dict]], lab: str, catalogo: list[dict]) -> list[dict]:
    if lab not in LABS_CON_DOSIS:
        return []
    pedidas = _dosis_pedidas(toma, catalogo)
    if not pedidas:
        return []
    en_informe: dict[str, float] = {}
    for inf in informes:
        for p in productos.get(inf["id"], []):
            cod = _norm_codigo(p.get("codigo") or p.get("analito_raw"))
            if cod and p.get("dosis") is not None:
                en_informe[cod] = float(p["dosis"])
    out: list[dict] = []
    for cod, dosis in sorted(pedidas.items()):
        if cod not in en_informe:
            out.append(_h("DOSIS_FALTA", MEDIO, f"{cod}: la solicitud anotó dosis {dosis:g} y el informe no la trae.", "Pedir que el informe incluya la dosis aplicada."))
        elif abs(en_informe[cod] - dosis) > max(0.0005, abs(dosis) * 0.001):
            out.append(_h("DOSIS_DISTINTA", ALTO, f"{cod}: la solicitud dice dosis {dosis:g} y el informe {en_informe[cod]:g}.", "Reclamar la corrección del informe."))
    return out


def _rotulacion(toma: dict, informes: list[dict], lab: str) -> list[dict]:
    if lab in LABS_SIN_ROTULACION:
        return []
    datos = toma.get("datos") or {}
    out: list[dict] = []
    for clave_inf, clave_sol, nombre in ROTULACION:
        esperado = datos.get(clave_sol)
        if _vacio(esperado):
            continue
        valores = [inf.get(clave_inf) for inf in informes if not _vacio(inf.get(clave_inf))]
        if not valores:
            out.append(_h("ROTULACION_FALTA", MEDIO, f"{nombre}: la solicitud dice «{esperado}» y el informe no lo trae.", "Pedir que el informe repita el dato de la muestra."))
            continue
        n_esp = _num(esperado)
        iguales = any((_num(v) is not None and n_esp is not None and abs(_num(v) - n_esp) < 0.01) or _txt(v) == _txt(esperado) for v in valores)
        # «R1, R2» de la solicitud contra «R1» del informe de una de sus posiciones: basta que cada valor esté contenido.
        if not iguales and clave_inf == "posicion_muestreo":
            partes = {_txt(p) for p in re.split(r"[,;\n]", str(esperado)) if p.strip()}
            iguales = all(_txt(v) in partes or any(_txt(p) in _txt(v) for p in partes) for v in valores)
        if not iguales:
            out.append(_h("ROTULACION_DISTINTA", ALTO if clave_inf in ("lote", "nro_orden") else MEDIO,
                          f"{nombre}: la solicitud dice «{esperado}» y el informe «{valores[0]}».", "Reclamar la corrección del informe."))
    return out


def _plazo_de(laboratorio: str, plazos: dict[str, int]) -> int | None:
    """El plazo general del laboratorio; si solo hay por análisis, el más largo (no se reclama antes de tiempo)."""
    lab = (laboratorio or "").split("(", 1)[0].strip().upper()
    if lab in plazos:
        return plazos[lab]
    por_analisis = [d for k, d in plazos.items() if k.split("|", 1)[0].split("(", 1)[0].strip() == lab]
    return max(por_analisis) if por_analisis else None


def _sin_informe(toma: dict, hoy: date, plazos: dict[str, int]) -> list[dict]:
    enviada = _fecha(toma.get("enviado_en"))
    if enviada is None:
        return []
    dias = dias_habiles(enviada, hoy)
    plazo = _plazo_de(toma.get("laboratorio") or "", plazos)
    if plazo is not None:
        if dias > plazo:
            return [_h("INFORME_ATRASADO", ALTO, f"Salió al laboratorio el {enviada:%d-%m-%Y}; lleva {dias} días hábiles sin informe (plazo {plazo}).",
                       "Reclamar el informe al laboratorio.", dias_habiles=dias, plazo=plazo)]
        return []
    if dias > DIAS_SIN_PLAZO:
        return [_h("SIN_INFORME", MEDIO, f"Salió al laboratorio el {enviada:%d-%m-%Y}; lleva {dias} días hábiles sin informe y el laboratorio no tiene plazo cargado.",
                   "Cargar el plazo del laboratorio o reclamar el informe.", dias_habiles=dias, plazo=None)]
    return []


# ── Análisis completo ────────────────────────────────────────────────────────

def analizar(
    tomas: list[dict],
    informes: list[dict],
    resultados: dict[int, list[dict]],
    productos: dict[int, list[dict]],
    catalogo: list[dict],
    plazos: dict[str, int],
    hoy: date | None = None,
    ot_de_informe: dict[tuple[str, str], str] | None = None,
    leidos_pdf: dict[int, dict | None] | None = None,
) -> dict[str, Any]:
    """Cruza cada solicitud enviada con sus informes. Devuelve {resumen, laboratorios, hallazgos, filas}.

    · `tomas`: solicitudes de Toma de muestras (ot, laboratorio, sold_to, ship_to, especie, fecha_muestreo, enviado_en, datos, es_prueba).
    · `informes`: filas de Report (`solicitud`) con su `referencia` (OT), laboratorio, nro_solicitud y rotulación.
    · `ot_de_informe`: {(laboratorio base, N° informe): OT} cuando el informe no guardó la OT (Quiteca) pero su PDF quedó amarrado a una.
    · `leidos_pdf`: {id del informe: {datos, resultados} leído del PDF, o None si no se pudo}; ausente = no se revisó el PDF.
    """
    hoy = hoy or date.today()
    ot_de_informe = ot_de_informe or {}
    por_ot: dict[str, list[dict]] = defaultdict(list)
    for inf in informes:
        ot = str(inf.get("referencia") or "").strip().upper() or ot_de_informe.get((di.lab_base(inf.get("laboratorio")), str(inf.get("nro_solicitud") or "").strip()), "")
        if ot:
            por_ot[ot.upper()].append(inf)
    ots_conocidas = {str(t.get("ot") or "").strip().upper() for t in tomas}

    hallazgos: list[dict[str, Any]] = []
    por_lab: dict[str, Counter] = defaultdict(Counter)
    codigos_lab: dict[str, Counter] = defaultdict(Counter)
    informes_con_problema: dict[str, set] = defaultdict(set)
    informes_revisados: dict[str, set] = defaultdict(set)
    solicitudes_con_problema: dict[str, set] = defaultdict(set)

    def _agregar(h: dict, toma: dict, inf: dict | None, lab: str) -> None:
        fila = {
            **h,
            "titulo": titulo_de(h["codigo"]),
            "laboratorio": lab,
            "ot": toma.get("ot"),
            "informe": (inf or {}).get("nro_solicitud"),
            "informe_id": (inf or {}).get("id"),
            "sold_to": toma.get("sold_to"),
            "ship_to": toma.get("ship_to"),
            "especie": toma.get("especie"),
            "fecha_muestreo": _fecha(toma.get("fecha_muestreo")).isoformat() if _fecha(toma.get("fecha_muestreo")) else None,
            "enviada_en": _fecha(toma.get("enviado_en")).isoformat() if _fecha(toma.get("enviado_en")) else None,
        }
        hallazgos.append(fila)
        codigos_lab[lab][h["codigo"]] += 1
        if h["gravedad"] != INFO:
            solicitudes_con_problema[lab].add(toma.get("ot"))
            if inf:
                informes_con_problema[lab].add(inf.get("id"))

    for toma in tomas:
        datos = toma.get("datos") or {}
        if datos.get("es_prueba") or toma.get("es_prueba"):
            continue
        lab_nombre = str(toma.get("laboratorio") or "").strip() or "(sin laboratorio)"
        lab = di.lab_base(lab_nombre)
        etiqueta = lab_nombre
        ot = str(toma.get("ot") or "").strip().upper()
        enviada = _fecha(toma.get("enviado_en")) is not None
        if not enviada:
            por_lab[etiqueta]["sin_enviar"] += 1
            continue
        por_lab[etiqueta]["enviadas"] += 1
        infs = por_ot.get(ot, [])
        if not infs:
            por_lab[etiqueta]["sin_informe"] += 1
            for h in _sin_informe(toma, hoy, plazos):
                if h["codigo"] == "INFORME_ATRASADO":
                    por_lab[etiqueta]["atrasadas"] += 1
                _agregar(h, toma, None, etiqueta)
            continue
        por_lab[etiqueta]["con_informe"] += 1
        # Reglas de la solicitud contra el conjunto de sus informes.
        for h in _analitos(toma, infs, resultados, lab) + _dosis(toma, infs, productos, lab, catalogo) + _rotulacion(toma, infs, lab):
            _agregar(h, toma, infs[0], etiqueta)
            informes_con_problema[etiqueta].update(i["id"] for i in infs)
        # Reglas de cada informe (identificación, coherencia interna y, si se pidió, su PDF).
        for inf in infs:
            informes_revisados[etiqueta].add(inf["id"])
            leido: Any = False
            if leidos_pdf is not None:
                leido = leidos_pdf.get(inf["id"], False)
            for h in di.revisar(inf, resultados.get(inf["id"], []), {**toma, "datos": datos}, leido):
                if h["codigo"] in _REEMPLAZADOS:
                    continue
                _agregar(h, toma, inf, etiqueta)

    # Informes que traen una OT que no existe como solicitud (no cuelgan de ninguna toma).
    for ot, infs in por_ot.items():
        if ot in ots_conocidas:
            continue
        for inf in infs:
            etiqueta = str(inf.get("laboratorio") or "(sin laboratorio)")
            informes_revisados[etiqueta].add(inf["id"])
            _agregar(_h("OT_SIN_SOLICITUD", MEDIO, f"La OT {ot} del informe no existe en Toma de muestras.", "Revisar si la OT está bien escrita en el informe."),
                     {"ot": ot, "laboratorio": etiqueta}, inf, etiqueta)

    orden = {ALTO: 0, MEDIO: 1, INFO: 2}
    hallazgos.sort(key=lambda h: (orden[h["gravedad"]], h["laboratorio"], str(h.get("ot")), h["codigo"]))

    laboratorios: list[dict[str, Any]] = []
    for etiqueta in sorted(set(por_lab) | set(codigos_lab) | set(informes_revisados)):
        c = por_lab[etiqueta]
        graves = [h for h in hallazgos if h["laboratorio"] == etiqueta and h["gravedad"] == ALTO]
        laboratorios.append({
            "laboratorio": etiqueta,
            "enviadas": c["enviadas"], "sin_enviar": c["sin_enviar"],
            "con_informe": c["con_informe"], "sin_informe": c["sin_informe"], "atrasadas": c["atrasadas"],
            "informes_revisados": len(informes_revisados[etiqueta]),
            "informes_con_problema": len(informes_con_problema[etiqueta]),
            "solicitudes_con_problema": len(solicitudes_con_problema[etiqueta]),
            "altos": len(graves),
            "medios": sum(1 for h in hallazgos if h["laboratorio"] == etiqueta and h["gravedad"] == MEDIO),
            "por_codigo": dict(codigos_lab[etiqueta]),
        })
    total_rev = sum(l["informes_revisados"] for l in laboratorios)
    total_mal = sum(l["informes_con_problema"] for l in laboratorios)
    resumen = {
        "hoy": hoy.isoformat(),
        "solicitudes_enviadas": sum(l["enviadas"] for l in laboratorios),
        "con_informe": sum(l["con_informe"] for l in laboratorios),
        "sin_informe": sum(l["sin_informe"] for l in laboratorios),
        "atrasadas": sum(l["atrasadas"] for l in laboratorios),
        "informes_revisados": total_rev,
        "informes_con_problema": total_mal,
        "informes_limpios": max(total_rev - total_mal, 0),
        "hallazgos_altos": sum(1 for h in hallazgos if h["gravedad"] == ALTO),
        "hallazgos_medios": sum(1 for h in hallazgos if h["gravedad"] == MEDIO),
        "pdf_revisado": leidos_pdf is not None,
    }
    return {"resumen": resumen, "laboratorios": laboratorios, "hallazgos": hallazgos}


def hallazgos_de(resultado: dict[str, Any], laboratorio: str | None = None, gravedad: str | None = None, codigo: str | None = None) -> list[dict]:
    """Filtra los hallazgos de un análisis ya hecho."""
    lab = di.lab_base(laboratorio) if laboratorio else None
    return [h for h in resultado.get("hallazgos", [])
            if (lab is None or di.lab_base(h["laboratorio"]) == lab)
            and (gravedad is None or h["gravedad"] == gravedad)
            and (codigo is None or h["codigo"] == codigo)]
