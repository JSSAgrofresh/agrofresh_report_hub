"""
Integridad de datos: cada SOLICITUD que salió a un laboratorio contra el INFORME que ese laboratorio devolvió.

Es la auditoría que el administrador usa para reclamar a los laboratorios. Lee cada solicitud (Toma de muestras) y su informe
(por la OT) y comprueba que lo que llegó está bien, por laboratorio. NO mide plazos ni «solicitudes sin informe»: eso ya vive en
Panel de control interno → Solicitudes e informes. Revisa:

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
from datetime import date, datetime
from typing import Any

from . import diagnostico_informes as di
from .homogenizar_converter import compacto
from .mapeo import ALIAS_CODIGO_CATALOGO

ALTO, MEDIO, INFO = di.ALTO, di.MEDIO, di.INFO

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
    "ANALITO_FALTA": "Analito pedido que el informe no trae",
    "ANALITO_DE_MAS": "Analito en el informe que no se pidió",
    "DOSIS_DISTINTA": "Dosis distinta a la de la solicitud",
    "DOSIS_FALTA": "Dosis de la solicitud ausente en el informe",
    "DOSIS_NO_CARGADA": "Dosis del informe no guardada en Report",
    "DOSIS_SIN_VERIFICAR": "Dosis que no se pudo comprobar (falta leer el PDF)",
    "ROTULACION_NO_CARGADA": "Dato del informe no guardado igual en Report",
    "PDF_DATO_DISTINTO": "Dato del PDF distinto al de la solicitud",
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

def _analitos(toma: dict, informes: list[dict], resultados: dict[int, list[dict]], lab: str, catalogo: list[dict] | None = None,
              campos_pdf: dict[int, dict] | None = None) -> list[dict]:
    """Analitos pedidos contra los que trajeron los informes de esta OT (todos juntos: una OT puede tener varios informes).

    Con el PDF leído manda el PDF (los analitos de su tabla de resultados); sin él, lo que Report guardó."""
    pedidos_crudos = (toma.get("datos") or {}).get("analitos_solicitados") or []
    if not pedidos_crudos:
        return []
    pedidos = {_norm_codigo(c): c for c in pedidos_crudos if str(c).strip()}
    hay: dict[str, str] = {}
    por_nombre = _codigos_por_nombre(catalogo or [])
    for inf in informes:
        campos = (campos_pdf or {}).get(inf["id"])
        if campos is not None and campos.get("resultados"):
            for nombre in campos["resultados"]:
                cod = por_nombre.get(_txt(nombre))
                hay[cod or _norm_codigo(nombre)] = nombre
            continue
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


def _misma(esperado: Any, valor: Any, clave: str = "") -> bool:
    """¿Es el mismo dato? Número con tolerancia, posiciones («R1, R2» contiene «R2») y, si no, texto sin tildes ni espacios."""
    ne, nv = _num(esperado), _num(valor)
    if ne is not None and nv is not None:
        return abs(ne - nv) < 0.01
    if _txt(esperado) == _txt(valor):
        return True
    if clave == "posicion_muestreo":
        partes = {_txt(x) for x in re.split(r"[,;\n]", str(esperado)) if x.strip()}
        return _txt(valor) in partes or any(_txt(x) in _txt(valor) for x in partes)
    return False


def _codigos_por_nombre(catalogo: list[dict]) -> dict[str, str]:
    return {_txt(a.get("nombre")): _norm_codigo(a.get("codigo")) for a in catalogo if a.get("nombre") and a.get("codigo")}


def _dosis_pedidas(toma: dict, catalogo: list[dict]) -> dict[str, str]:
    """{código normalizado: dosis tal como se anotó} de los analitos pedidos. Un «Solicitado» sin cifra no es una dosis."""
    from .solicitud_excel import _valor_guardado

    datos = toma.get("datos") or {}
    campos = datos.get("campos_laboratorio") or {}
    pedidos = {_norm_codigo(c) for c in datos.get("analitos_solicitados") or []}
    out: dict[str, str] = {}
    for a in catalogo:
        cod = _norm_codigo(a.get("codigo"))
        if cod in out or cod not in pedidos:
            continue
        v = _valor_guardado(campos, a)
        if not _vacio(v) and str(v).strip().lower() != "solicitado":
            out[cod] = str(v).strip()
    return out


def _dosis(toma: dict, informes: list[dict], productos: dict[int, list[dict]], lab: str, catalogo: list[dict], campos_pdf: dict[int, dict] | None = None) -> list[dict]:
    """La dosis anotada en la solicitud contra la del informe. **Manda el PDF** (tabla «Analito solicitado / Dosis»); sin PDF se usa lo que Report guardó."""
    if lab not in LABS_CON_DOSIS:
        return []
    pedidas = _dosis_pedidas(toma, catalogo)
    if not pedidas:
        return []
    por_nombre = _codigos_por_nombre(catalogo)
    del_pdf: dict[str, str] = {}
    leyo_pdf = False
    for inf in informes:
        campos = (campos_pdf or {}).get(inf["id"])
        if campos is not None:
            leyo_pdf = True
            for nombre, dosis in (campos.get("dosis") or {}).items():
                cod = por_nombre.get(_txt(nombre))
                if cod:
                    del_pdf[cod] = dosis
    en_report: dict[str, float] = {}
    for inf in informes:
        for p in productos.get(inf["id"], []):
            cod = _norm_codigo(p.get("codigo") or p.get("analito_raw"))
            if cod and p.get("dosis") is not None:
                en_report[cod] = float(p["dosis"])
    out: list[dict] = []
    for cod, dosis in sorted(pedidas.items()):
        if leyo_pdf:
            if cod not in del_pdf:
                out.append(_h("DOSIS_FALTA", MEDIO, f"{cod}: la solicitud anotó dosis «{dosis}» y el PDF del informe no trae dosis para ese analito.", "Pedir que el informe incluya la dosis aplicada."))
            elif not _misma(dosis, del_pdf[cod]):
                out.append(_h("DOSIS_DISTINTA", ALTO, f"{cod}: la solicitud dice dosis «{dosis}» y el PDF del informe «{del_pdf[cod]}».", "Reclamar la corrección del informe."))
            elif cod not in en_report or (_num(del_pdf[cod]) is not None and abs(en_report[cod] - _num(del_pdf[cod])) > 0.01):
                out.append(_h("DOSIS_NO_CARGADA", INFO, f"{cod}: el PDF trae la dosis «{del_pdf[cod]}» (coincide con la solicitud) pero Report no la guardó igual.", "Es de la carga a Report, no del laboratorio."))
        elif cod in en_report and _num(dosis) is not None:
            if abs(en_report[cod] - _num(dosis)) > max(0.0005, abs(_num(dosis)) * 0.001):
                out.append(_h("DOSIS_DISTINTA", ALTO, f"{cod}: la solicitud dice dosis {dosis} y el informe {en_report[cod]:g}.", "Reclamar la corrección del informe."))
        else:
            # Sin lectura completa del PDF no se puede saber si el informe trae la dosis: que Report no la tenga NO es un error del laboratorio.
            motivo = ("el PDF no se releyó en este análisis: vuelve a analizar con «Releer los PDF»" if lab == "agrofresh"
                      else "todavía no se lee la dosis del PDF de este laboratorio (solo la de AgroFresh)")
            out.append(_h("DOSIS_SIN_VERIFICAR", INFO, f"{cod}: la solicitud anotó dosis «{dosis}»; no se pudo comprobar contra el informe porque {motivo}.", "No es un reclamo: falta leer la dosis del PDF."))
    return out


# (dato de la solicitud, dato del PDF, nombre visible, gravedad, columna de Report o None si Report no la guarda)
CAMPOS_ROTULACION = (
    ("lote", "lote", "Lote", ALTO, "lote"),
    ("numero_orden", "numero_orden", "N° de orden", ALTO, "nro_orden"),
    ("numero_camara", "numero_camara", "N° de cámara", MEDIO, "nro_camara"),
    ("posicion_muestreo", "posicion_muestreo", "Posición de muestreo", MEDIO, "posicion_muestreo"),
    ("kilos_procesados", "kilos_procesados", "Kilos procesados", MEDIO, "kg_procesados"),
    ("csg_productor", "codigo_productor", "Código productor (CSG)", MEDIO, "csg"),
    ("csg_packing", "codigo_packing", "Código packing", MEDIO, None),
    ("linea_proceso", "linea_proceso", "Línea de proceso", MEDIO, None),
    ("variedad", "variedad", "Variedad", MEDIO, None),
    ("tipo_muestra", "tipo_muestra", "Tipo de muestra", MEDIO, None),
    ("hora_muestreo", "hora_muestreo", "Hora de muestreo", MEDIO, None),
    ("nombre_muestreador", "muestreador", "Muestreador", MEDIO, None),
)


def _producto(toma: dict, campos: dict) -> list[dict]:
    """El producto utilizado: la solicitud puede decir «MIXTO» y guardar la lista real; el PDF los nombra separados por coma."""
    datos = toma.get("datos") or {}
    lista = [x for x in (datos.get("productos_lista") or []) if str(x).strip()]
    esperado = datos.get("producto_utilizado")
    if _vacio(esperado) and not lista:
        return []
    visto = (campos.get("muestra") or {}).get("producto_utilizado")
    if _vacio(visto):
        return [_h("ROTULACION_FALTA", MEDIO, f"Producto utilizado: la solicitud dice «{', '.join(lista) or esperado}» y el PDF del informe no lo trae.", "Pedir que el informe repita el dato de la muestra.")]
    en_pdf = {_txt(x) for x in re.split(r"[,;/]", str(visto)) if x.strip()}
    if _txt(visto) == _txt(esperado) or (lista and {_txt(x) for x in lista} == en_pdf):
        return []
    return [_h("ROTULACION_DISTINTA", MEDIO, f"Producto utilizado: la solicitud dice «{', '.join(lista) or esperado}» y el PDF del informe «{visto}».", "Reclamar la corrección del informe.")]


def _rotulacion(toma: dict, informes: list[dict], lab: str, campos_pdf: dict[int, dict] | None = None) -> list[dict]:
    """Los datos de la muestra que el informe repite. **Con PDF leído manda el PDF**: «—» en el PDF es un dato que falta de verdad, y si el PDF
    lo trae bien y solo Report lo guardó distinto es de la carga (informativo). Sin PDF se compara con lo que Report guardó."""
    if lab in LABS_SIN_ROTULACION:
        return []
    datos = toma.get("datos") or {}
    out: list[dict] = []
    con_pdf = [(inf, (campos_pdf or {}).get(inf["id"])) for inf in informes]
    pdfs = [c for _, c in con_pdf if c is not None]
    for clave_sol, clave_pdf, nombre, gravedad, clave_report in CAMPOS_ROTULACION:
        esperado = datos.get(clave_sol)
        if _vacio(esperado):
            continue
        if pdfs:
            valores = [(c.get("muestra") or {}).get(clave_pdf) for c in pdfs]
            valores = [v for v in valores if not _vacio(v)]
            if not valores:
                out.append(_h("ROTULACION_FALTA", MEDIO, f"{nombre}: la solicitud dice «{esperado}» y el PDF del informe no lo trae.", "Pedir que el informe repita el dato de la muestra."))
            elif not any(_misma(esperado, v, clave_pdf) for v in valores):
                out.append(_h("ROTULACION_DISTINTA", gravedad, f"{nombre}: la solicitud dice «{esperado}» y el PDF del informe «{valores[0]}».", "Reclamar la corrección del informe."))
            elif clave_report:
                en_report = [inf.get(clave_report) for inf in informes if not _vacio(inf.get(clave_report))]
                if not any(_misma(esperado, v, clave_pdf) for v in en_report):
                    out.append(_h("ROTULACION_NO_CARGADA", INFO, f"{nombre}: el PDF trae «{valores[0]}» (coincide con la solicitud) pero Report guardó «{en_report[0] if en_report else 'nada'}».", "Es de la carga a Report, no del laboratorio."))
        elif clave_report:
            valores = [inf.get(clave_report) for inf in informes if not _vacio(inf.get(clave_report))]
            if not valores:
                out.append(_h("ROTULACION_FALTA", MEDIO, f"{nombre}: la solicitud dice «{esperado}» y Report no lo tiene para el informe (el PDF no se releyó).", "Releer los PDF para confirmar."))
            elif not any(_misma(esperado, v, clave_pdf) for v in valores):
                out.append(_h("ROTULACION_DISTINTA", gravedad, f"{nombre}: la solicitud dice «{esperado}» y el informe «{valores[0]}».", "Reclamar la corrección del informe."))
    for c in pdfs[:1]:
        out += _producto(toma, c)
    return out


def _identificacion_pdf(toma: dict, campos_pdf: dict[int, dict] | None, informes: list[dict]) -> list[dict]:
    """Sold To, Ship To, especie y fecha de muestreo que dice el PDF contra la solicitud."""
    out: list[dict] = []
    for inf in informes:
        campos = (campos_pdf or {}).get(inf["id"])
        if campos is None:
            continue
        ident, muestra = campos.get("identificacion") or {}, campos.get("muestra") or {}
        for nombre, esperado, visto in (("Sold To", toma.get("sold_to"), ident.get("sold_to")), ("Ship To", toma.get("ship_to"), ident.get("ship_to")),
                                        ("Especie", toma.get("especie"), muestra.get("especie"))):
            if not _vacio(esperado) and not _vacio(visto) and compacto(str(esperado)) != compacto(str(visto)):
                out.append(_h("PDF_DATO_DISTINTO", MEDIO, f"{nombre}: la solicitud dice «{esperado}» y el PDF del informe «{visto}».", "Reclamar la corrección del informe.", informe_id=inf["id"]))
        f_sol = _fecha(toma.get("fecha_muestreo"))
        m = re.match(r"^(\d{2})-(\d{2})-(\d{4})$", str(muestra.get("fecha_muestreo") or ""))
        if f_sol and m and date(int(m.group(3)), int(m.group(2)), int(m.group(1))) != f_sol:
            out.append(_h("PDF_DATO_DISTINTO", ALTO, f"Fecha de muestreo: la solicitud dice {f_sol:%d-%m-%Y} y el PDF del informe {muestra['fecha_muestreo']}.", "Reclamar la corrección del informe.", informe_id=inf["id"]))
    return out


# ── Análisis completo ────────────────────────────────────────────────────────

def analizar(
    tomas: list[dict],
    informes: list[dict],
    resultados: dict[int, list[dict]],
    productos: dict[int, list[dict]],
    catalogo: list[dict],
    hoy: date | None = None,
    ot_de_informe: dict[tuple[str, str], str] | None = None,
    leidos_pdf: dict[int, dict | None] | None = None,
    campos_pdf: dict[int, dict] | None = None,
) -> dict[str, Any]:
    """Cruza cada solicitud con sus informes y revisa lo que llegó. Devuelve {resumen, laboratorios, hallazgos}.

    · `tomas`: solicitudes de Toma de muestras (ot, laboratorio, sold_to, ship_to, especie, fecha_muestreo, datos, es_prueba).
    · `informes`: filas de Report (`solicitud`) con su `referencia` (OT), laboratorio, nro_solicitud y rotulación.
    · `ot_de_informe`: {(laboratorio base, N° informe): OT} cuando el informe no guardó la OT (Quiteca) pero su PDF quedó amarrado a una.
    · `leidos_pdf`: {id del informe: {datos, resultados} leído del PDF, o None si no se pudo}; ausente = no se revisó el PDF.
    · `campos_pdf`: {id del informe: lectura COMPLETA del PDF (`informe_campos.leer_completo`)}; con ella manda el PDF para dosis, rotulación e identificación.
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
    informes_formato_anterior = 0

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
        infs = por_ot.get(ot, [])
        if not infs:
            continue                      # sin informe: no es de este apartado (plazos y pendientes viven en Solicitudes e informes)
        por_lab[etiqueta]["con_informe"] += 1
        # Reglas de la solicitud contra el conjunto de sus informes.
        # Los informes del primer formato de AgroFresh no traen dosis ni recepción ni los datos de la muestra completos: no se les reclama eso.
        nuevos = [i for i in infs if ((campos_pdf or {}).get(i["id"]) or {}).get("formato", 2) != 1]
        fmt1 = len(infs) - len(nuevos)
        informes_formato_anterior += fmt1
        revisables = (_dosis(toma, nuevos, productos, lab, catalogo, campos_pdf) + _rotulacion(toma, nuevos, lab, campos_pdf)) if nuevos else []
        for h in _analitos(toma, infs, resultados, lab, catalogo, campos_pdf) + revisables + _identificacion_pdf(toma, campos_pdf, infs):
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
            "solicitudes_revisadas": c["con_informe"],
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
        "solicitudes_revisadas": sum(l["solicitudes_revisadas"] for l in laboratorios),
        "informes_revisados": total_rev,
        "informes_con_problema": total_mal,
        "informes_limpios": max(total_rev - total_mal, 0),
        "hallazgos_altos": sum(1 for h in hallazgos if h["gravedad"] == ALTO),
        "hallazgos_medios": sum(1 for h in hallazgos if h["gravedad"] == MEDIO),
        "pdf_revisado": leidos_pdf is not None,
        "informes_formato_anterior": informes_formato_anterior,
    }
    return {"resumen": resumen, "laboratorios": laboratorios, "hallazgos": hallazgos}


def hallazgos_de(resultado: dict[str, Any], laboratorio: str | None = None, gravedad: str | None = None, codigo: str | None = None) -> list[dict]:
    """Filtra los hallazgos de un análisis ya hecho."""
    lab = di.lab_base(laboratorio) if laboratorio else None
    return [h for h in resultado.get("hallazgos", [])
            if (lab is None or di.lab_base(h["laboratorio"]) == lab)
            and (gravedad is None or h["gravedad"] == gravedad)
            and (codigo is None or h["codigo"] == codigo)]
