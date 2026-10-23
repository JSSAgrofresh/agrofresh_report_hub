"""
Diagnóstico de los informes que ya están en Report: ¿están bien colocados y bien parseados?

SOLO REVISA, no cambia nada. Cada informe (una fila de `solicitud`) se compara contra:

  · su solicitud de Toma de muestras (por la OT que lleva en `referencia`): servicio (Tipo Aplicación), laboratorio, Sold To,
    Ship To, especie, fecha de muestreo y analitos pedidos;
  · sí mismo: datos que faltan, fechas que no cuadran, resultados vacíos, sin catálogo o con valores raros;
  · opcionalmente su PDF (`--pdf`): se vuelve a leer con los mismos lectores del Converter (Quiteca y AgroFresh) y se comparan la
    OT, la fecha de muestreo, la especie y cada resultado con lo que quedó guardado.

La parte que decide (`revisar`) es pura y se prueba sin base. `scripts/diagnostico_informes_report.py` la corre sobre toda la base.
Gravedad: «alto» = el dato está mal o falta algo que cambia lo que ve el cliente; «medio» = hay que mirarlo; «info» = dato de contexto.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any

from .clasificar_servicio import servicio_de_tipo
from .homogenizar_converter import compacto

ALTO, MEDIO, INFO = "alto", "medio", "info"

NOMBRE_SERVICIO = {"": "Línea de proceso", "linea": "Línea de proceso", "actimist": "Actimist", "ecofog": "Ecofog", "ryd": "RYD"}

# Un informe de estos laboratorios debería traer la OT de su solicitud.
LABS_CON_OT = {"agrofresh", "quiteca", "als", "diagnofruit"}
# Servicios que se guardan con el nombre como texto (sin planta del listado de Línea de proceso).
SERVICIOS_SIN_PLANTA = {"actimist", "ecofog"}
ANIO_MIN, ANIO_MAX = 2024, 2027
VALOR_MAXIMO_RESIDUAL = 1000.0     # ppm; sobre esto casi seguro hay un error de coma/unidad


def lab_base(laboratorio: Any) -> str:
    return str(laboratorio or "").split("(", 1)[0].strip().casefold()


def _f(valor: Any) -> date | None:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return None


def _servicio(valor: Any) -> str:
    """La clave del servicio guardado: '' / 'linea' → Línea de proceso."""
    s = str(valor or "").strip().lower()
    return "" if s in ("", "linea") else s


def _igual(a: Any, b: Any) -> bool:
    return compacto(a or "") == compacto(b or "")


def _num(texto: Any) -> float | None:
    if texto is None:
        return None
    try:
        return float(str(texto).replace(",", "."))
    except ValueError:
        return None


def _codigo(analito: Any) -> str:
    return re.sub(r"\s*ppm\s*$", "", str(analito or "").strip(), flags=re.I).upper()


def hallazgo(codigo: str, gravedad: str, detalle: str, sugerencia: str = "") -> dict[str, str]:
    return {"codigo": codigo, "gravedad": gravedad, "detalle": detalle, "sugerencia": sugerencia}


def _contra_solicitud(inf: dict, toma: dict | None) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    lab = lab_base(inf.get("laboratorio"))
    ot = str(inf.get("referencia") or "").strip()
    guardado = _servicio(inf.get("servicio"))
    if not ot:
        if lab in LABS_CON_OT:
            out.append(hallazgo("SIN_OT", MEDIO, "El informe no trae la OT de su solicitud, así que no se puede comprobar contra ella.",
                                "Quiteca: se enlaza por parecido; ALS, Diagnofruit y AgroFresh deberían traerla."))
        return out
    if toma is None:
        out.append(hallazgo("OT_SIN_SOLICITUD", MEDIO, f"La OT {ot} no existe en Toma de muestras.", "Revisar si la OT está bien escrita en el informe."))
        return out

    datos = toma.get("datos") or {}
    campos = datos.get("campos_laboratorio") or {}
    real = servicio_de_tipo(campos.get("Tipo Aplicación")) if isinstance(campos, dict) else ""
    if real != guardado:
        if not guardado:
            out.append(hallazgo("SERVICIO_SIN_CLASIFICAR", ALTO,
                                f"Report lo trata como Línea de proceso (sin servicio guardado) pero su solicitud dice {NOMBRE_SERVICIO.get(real, real)}.",
                                "Correr scripts/clasificar_servicio_solicitudes.py --aplicar."))
        else:
            out.append(hallazgo("SERVICIO_DISTINTO", ALTO,
                                f"Report dice {NOMBRE_SERVICIO.get(guardado, guardado)} y su solicitud dice {NOMBRE_SERVICIO.get(real, real)}.",
                                "Corregir el servicio del informe (o volver a cargarlo con el Tipo Aplicación correcto)."))
    if lab_base(toma.get("laboratorio")) and lab_base(toma.get("laboratorio")) != lab:
        out.append(hallazgo("LABORATORIO_DISTINTO", ALTO, f"El informe es de {inf.get('laboratorio')} y la solicitud {ot} es de {toma.get('laboratorio')}.",
                            "Probablemente la OT está mal escrita o amarrada a otra solicitud."))
    for clave, etiqueta, codigo in (("sold_to", "Sold To", "SOLD_TO_DISTINTO"), ("ship_to", "Ship To", "SHIP_TO_DISTINTO"), ("especie", "Especie", "ESPECIE_DISTINTA")):
        a, b = inf.get(clave), toma.get(clave)
        if a and b and not _igual(a, b):
            out.append(hallazgo(codigo, MEDIO, f"{etiqueta}: el informe dice «{a}» y la solicitud «{b}».", "Revisar cuál es el correcto."))
    fa, fb = _f(inf.get("fecha_muestreo")), _f(toma.get("fecha_muestreo"))
    if fa and fb and fa != fb:
        out.append(hallazgo("FECHA_MUESTREO_DISTINTA", MEDIO, f"Fecha de muestreo: el informe dice {fa:%d-%m-%Y} y la solicitud {fb:%d-%m-%Y}.", "Revisar cuál es la correcta."))
    return out


def _pedidos(toma: dict | None) -> set[str]:
    if not toma:
        return set()
    return {_codigo(c) for c in (toma.get("datos") or {}).get("analitos_solicitados") or []}


def _consistencia(inf: dict, resultados: list[dict], toma: dict | None) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    lab = lab_base(inf.get("laboratorio"))
    faltan = [e for k, e in (("laboratorio", "laboratorio"), ("especie", "especie"), ("fecha_muestreo", "fecha de muestreo"),
                             ("sold_to", "Sold To"), ("ship_to", "Ship To")) if not inf.get(k)]
    if faltan:
        out.append(hallazgo("FALTA_DATO", ALTO, "Falta: " + ", ".join(faltan) + ".", "Completar el dato o volver a cargar el informe."))

    guardado = _servicio(inf.get("servicio"))
    if inf.get("planta_id") is None and guardado not in SERVICIOS_SIN_PLANTA and (inf.get("sold_to") or inf.get("ship_to")):
        out.append(hallazgo("SIN_PLANTA", ALTO, "El Sold To / Ship To no está enlazado a una planta de Listados.", "Revisar Listados o volver a cargar el informe."))

    hoy = date.today()
    m = _f(inf.get("fecha_muestreo"))
    if m:
        if not ANIO_MIN <= m.year <= ANIO_MAX or m > hoy:
            out.append(hallazgo("FECHA_RARA", MEDIO, f"La fecha de muestreo {m:%d-%m-%Y} está fuera de lo esperable.", "Probable error de año o de mes/día."))
        for clave, etiqueta in (("fecha_recepcion", "recepción"), ("fecha_entrada", "entrada"), ("fecha_analisis", "análisis"), ("fecha_informe", "informe")):
            otra = _f(inf.get(clave))
            if otra and otra < m:
                out.append(hallazgo("FECHAS_NO_CUADRAN", MEDIO, f"La fecha de {etiqueta} ({otra:%d-%m-%Y}) es anterior al muestreo ({m:%d-%m-%Y}).", "Probable mes/día invertido."))
                break

    if not resultados:
        out.append(hallazgo("SIN_RESULTADOS", ALTO, "El informe no tiene ningún resultado.", "Volver a cargarlo."))
        return out

    sin_catalogo = [r.get("analito_raw") or r.get("codigo") for r in resultados if r.get("analito_id") is None]
    if sin_catalogo:
        out.append(hallazgo("RESULTADO_SIN_CATALOGO", MEDIO, "Analitos sin enlazar al catálogo: " + ", ".join(str(x) for x in sin_catalogo[:6]) + ".",
                            "Correr scripts/sembrar_catalogo_analitos.py --aplicar."))
    vistos: dict[str, int] = {}
    for r in resultados:
        cod = _codigo(r.get("codigo") or r.get("analito_raw"))
        vistos[cod] = vistos.get(cod, 0) + 1
        vn, vt = r.get("valor_num"), r.get("valor_texto")
        if vn is None and not str(vt or "").strip():
            out.append(hallazgo("VALOR_VACIO", MEDIO, f"{cod}: sin valor numérico ni texto."))
        elif vn is not None and float(vn) < 0:
            out.append(hallazgo("VALOR_RARO", ALTO, f"{cod}: valor negativo ({vn}).", "Revisar la lectura del PDF."))
        elif vn is not None and lab in ("agrofresh", "quiteca") and float(vn) > VALOR_MAXIMO_RESIDUAL:
            out.append(hallazgo("VALOR_RARO", ALTO, f"{cod}: {vn} ppm es desmedido (¿coma o unidad?).", "Revisar la lectura del PDF."))
    repetidos = [c for c, n in vistos.items() if n > 1]
    if repetidos:
        out.append(hallazgo("ANALITO_REPETIDO", MEDIO, "Analito repetido: " + ", ".join(repetidos) + "."))

    if lab in ("agrofresh", "quiteca") and toma:
        pedidos, hay = _pedidos(toma), {_codigo(r.get("codigo") or r.get("analito_raw")) for r in resultados}
        sin = sorted(pedidos - hay)
        de_mas = sorted(hay - pedidos) if pedidos else []
        if sin:
            out.append(hallazgo("PEDIDO_SIN_RESULTADO", INFO, "Se pidió y el informe no trae: " + ", ".join(sin) + "."))
        if de_mas:
            out.append(hallazgo("RESULTADO_NO_PEDIDO", INFO, "El informe trae y no se pidió: " + ", ".join(de_mas) + "."))
    return out


def _servicio_viejo(inf: dict) -> list[dict[str, str]]:
    viejo = compacto(inf.get("tipo_servicio") or "")
    if _servicio(inf.get("servicio")) in SERVICIOS_SIN_PLANTA and viejo in ("lineadeproceso", "cromatografia"):
        return [hallazgo("TIPO_SERVICIO_VIEJO", INFO, f"El campo viejo «Tipo de servicio» dice «{inf.get('tipo_servicio')}» pero el servicio real es "
                         f"{NOMBRE_SERVICIO.get(_servicio(inf.get('servicio')))}. Ya no se muestra en ninguna parte.")]
    return []


def comparar_con_pdf(inf: dict, resultados: list[dict], leido: dict | None) -> list[dict[str, str]]:
    """Lo guardado contra lo que se lee hoy del PDF con el lector del Converter (`leido` = {datos, resultados})."""
    if leido is None:
        return [hallazgo("PDF_NO_LEIDO", INFO, "No se pudo leer el PDF de este informe (no está guardado o es de un formato sin lector).")]
    out: list[dict[str, str]] = []
    d = leido.get("datos") or {}
    ot_pdf, ot_bd = str(d.get("OT") or "").strip().upper(), str(inf.get("referencia") or "").strip().upper()
    if ot_pdf and ot_bd and ot_pdf != ot_bd:
        out.append(hallazgo("PDF_OT_DISTINTA", ALTO, f"El PDF dice {ot_pdf} y el informe quedó con {ot_bd}.", "Corregir la OT (scripts/corregir_ot_informe.py)."))
    if ot_pdf and not ot_bd:
        out.append(hallazgo("PDF_TRAE_OT", MEDIO, f"El PDF trae la OT {ot_pdf} y el informe no la tiene guardada.", "Completar la OT."))
    texto = str(d.get("Fecha Muestreo") or "")
    m = re.match(r"^(\d{2})-(\d{2})-(\d{4})$", texto)
    fecha_pdf = date(int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else None
    if fecha_pdf and _f(inf.get("fecha_muestreo")) and fecha_pdf != _f(inf.get("fecha_muestreo")):
        out.append(hallazgo("PDF_FECHA_DISTINTA", ALTO, f"El PDF dice muestreo {fecha_pdf:%d-%m-%Y} y el informe quedó con {_f(inf.get('fecha_muestreo')):%d-%m-%Y}.", "Revisar mes/día."))
    if d.get("Especie") and inf.get("especie") and not _igual(d["Especie"], inf["especie"]) and compacto(inf["especie"]) not in compacto(d["Especie"]) and compacto(d["Especie"]) not in compacto(inf["especie"]):
        out.append(hallazgo("PDF_ESPECIE_DISTINTA", MEDIO, f"El PDF dice «{d['Especie']}» y el informe quedó con «{inf['especie']}»."))
    pdf = {_codigo(k): v for k, v in (leido.get("resultados") or {}).items()}
    bd = {_codigo(r.get("codigo") or r.get("analito_raw")): r for r in resultados}
    for cod, valor in sorted(pdf.items()):
        r = bd.get(cod)
        if r is None:
            out.append(hallazgo("PDF_RESULTADO_FALTA", ALTO, f"{cod}: el PDF trae {valor} y el informe no lo tiene guardado.", "Volver a cargar el informe."))
            continue
        a, b = _num(valor), (float(r["valor_num"]) if r.get("valor_num") is not None else None)
        if a is not None and b is not None:
            if abs(a - b) > max(0.0005, abs(a) * 0.001):
                out.append(hallazgo("PDF_RESULTADO_DISTINTO", ALTO, f"{cod}: el PDF dice {valor} y el informe tiene {r['valor_num']}.", "Volver a cargar el informe."))
        elif str(valor).strip() != str(r.get("valor_texto") or "").strip() and not (a is not None and b is None and r.get("valor_texto")):
            if a is None or b is None:
                out.append(hallazgo("PDF_RESULTADO_DISTINTO", ALTO, f"{cod}: el PDF dice «{valor}» y el informe tiene «{r.get('valor_texto') or r.get('valor_num')}».", "Volver a cargar el informe."))
    for cod in sorted(set(bd) - set(pdf)):
        out.append(hallazgo("PDF_RESULTADO_SOBRA", MEDIO, f"{cod}: el informe tiene un resultado que el PDF no trae."))
    return out


def revisar(inf: dict, resultados: list[dict], toma: dict | None, leido_pdf: dict | None | bool = False) -> list[dict[str, str]]:
    """Los hallazgos de un informe, de lo más grave a lo menos. `leido_pdf`: False = no se pidió revisar el PDF; None = no se pudo leer."""
    hallazgos = _contra_solicitud(inf, toma) + _consistencia(inf, resultados, toma) + _servicio_viejo(inf)
    if leido_pdf is not False:
        hallazgos += comparar_con_pdf(inf, resultados, leido_pdf)
    orden = {ALTO: 0, MEDIO: 1, INFO: 2}
    return sorted(hallazgos, key=lambda h: orden[h["gravedad"]])


def fecha_entrada_corregida(entrada: date | None, muestreo: date | None) -> date | None:
    """Repara el daño del Converter con la fecha de recepción de la solicitud («2026-10-02» leída como 26-10-2002).

    El patrón día-mes-año tomó «26-10-02» de «2026-10-02»: quedó día = 26 (los dos últimos dígitos del año), el mes bueno y año =
    2000 + el día real. Al revés: año real = 2000 + el día guardado, día real = el año guardado − 2000. Solo se acepta si es una
    fecha válida entre el muestreo y 60 días después; si no, devuelve None y no se toca."""
    if not entrada or not muestreo or entrada.year >= ANIO_MIN or entrada.year < 2000:
        return None
    try:
        real = date(2000 + entrada.day, entrada.month, entrada.year - 2000)
    except ValueError:
        return None
    return real if muestreo <= real <= muestreo + timedelta(days=60) else None
