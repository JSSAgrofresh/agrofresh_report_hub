"""
Lector de informes de Quiteca: el MISMO que usa el Converter (`leerQuiteca`, `guardar`, `filaCruda` en
public/modules/converter.html), escrito en Python para que Ingreso de Informes pueda cargar un informe que llegó
por correo sin que nadie abra el Converter.

Es un port literal, no una reinterpretación: mismas expresiones regulares, mismas reglas y las mismas columnas. Para
que no se separen, `tests/fixtures/correos/quiteca_*_converter.json` guarda lo que el lector del Converter
saca de los mismos textos (se generó corriendo el JavaScript real) y `tests/test_quiteca_lectura.py` exige que este
módulo dé exactamente lo mismo. **Si cambias el lector del Converter, cambia este y regenera esos archivos.**

El texto que se le da es el de `informe_lectura.texto_quiteca` (cada dato junto a su etiqueta).
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

NO_DETECTADO = ["bld", "nd", "n.d.", "no detectado", "ausencia", "ausente", "no detectable"]

# Cada laboratorio escribe el mismo activo distinto («Fludioxonil», «Fludioxinil»): es el mismo compuesto.
ANALITOS = {
    "fludioxonil": "FDL ppm", "fludioxinil": "FDL ppm", "fdl": "FDL ppm",
    "imazalil": "IMZ ppm", "imz": "IMZ ppm",
    "pirimetanil": "PYR ppm", "pyrimethanil": "PYR ppm", "pyr": "PYR ppm",
    "tebuconazol": "TEBU ppm", "tebuconazole": "TEBU ppm", "tebu": "TEBU ppm",
    "azoxistrobina": "AZOX ppm", "azoxistrobin": "AZOX ppm", "azoxystrobin": "AZOX ppm", "azox": "AZOX ppm",
    "tiabendazol": "TBZ ppm", "thiabendazole": "TBZ ppm", "tbz": "TBZ ppm",
    "difenilamina": "DPA ppm", "diphenylamine": "DPA ppm", "dpa": "DPA ppm",
    "levaduras": "Levaduras UFC/mL", "botrytis": "Botrytis conidia/mL",
    "alternaria": "Alternaria conidia/mL", "geotrichum": "Geotrichum esporas/mL",
    "penicillium": "Penicillium conidia/mL",
    "e. coli": "E. Coli UFC/100mL",
    "plomo": "Plomo mg/kg", "lead": "Plomo mg/kg",
    "mercurio": "Mercurio mg/kg", "mercury": "Mercurio mg/kg",
    "arsenico": "Arsénico mg/kg", "arsenic": "Arsénico mg/kg",
    "cadmio": "Cadmio mg/kg", "cadmium": "Cadmio mg/kg",
    "aluminio": "Aluminio mg/kg", "aluminium": "Aluminio mg/kg",
    "hongos": "Hongos UFC/g", "mohos": "Hongos UFC/g", "recuento de hongos": "Hongos UFC/g",
    "recuento de levaduras": "Levaduras UFC/g",
    "coliformes totales": "Coliformes Totales UFC/g",
    "escherichia coli": "Escherichia coli UFC/g",
    "recuento enterobacterias": "Recuento Enterobacterias UFC/g",
    "enterobacterias": "Recuento Enterobacterias UFC/g",
    "salmonella": "Salmonella 25g (P/A)",
    "cenizas insolubles en acido": "Cenizas Insolubles en Ácido (%)",
    "aflatoxinas totales": "Aflatoxinas Totales B1+B2+G1+G2 (µg/kg)",
}

# Lo que el servidor exige para que un informe entre bien a Report (igual que OBLIGATORIOS del Converter).
OBLIGATORIOS = ["Laboratorio", "Fecha Muestreo", "Especie", "Fecha entrada", "Tipo de servicio"]

MESES = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
         "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}


def plano(s: Any) -> str:
    t = unicodedata.normalize("NFKD", str(s))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip().lower()


def a_fecha(txt: Any, avisos: list[str] | None = None) -> str | None:
    """«15-10-2026» → «15-10-2026»; acepta «/» y años de dos cifras; si viene mes/día lo da vuelta y avisa."""
    if not txt:
        return None
    iso = re.match(r"^\s*(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)", str(txt))
    if iso:                         # «2026-10-02» ya viene año-mes-día (el patrón de abajo leería «26-10-02»); espejo del Converter
        a, mm, dd = int(iso.group(1)), int(iso.group(2)), int(iso.group(3))
        return None if not (1 <= mm <= 12 and 1 <= dd <= 31) else f"{dd:02d}-{mm:02d}-{a}"
    m = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", str(txt))
    if not m:
        return None
    d, mes, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000
    if mes > 12 and d <= 12:
        d, mes = mes, d
        if avisos is not None:
            avisos.append("fecha en formato mes/día: " + str(txt).strip())
    if mes < 1 or mes > 12 or d < 1 or d > 31:
        return None
    return f"{d:02d}-{mes:02d}-{y}"


def a_fecha_larga(txt: Any) -> str | None:
    """«25 de septiembre de 2026» → «25-09-2026» (Quiteca escribe así la fecha del informe)."""
    m = re.search(r"(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+)?(\d{4})", plano(txt or ""))
    if not m or m.group(2) not in MESES:
        return None
    return f"{int(m.group(1)):02d}-{MESES[m.group(2)]:02d}-{m.group(3)}"


def a_hora(txt: Any) -> str | None:
    m = re.search(r"(\d{1,2}):(\d{2})", str(txt or ""))
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    return f"{h:02d}:{mi:02d}" if h < 24 and mi < 60 else None


def _js_numero(n: float) -> str:
    """Como `String(n)` de JavaScript: 100.0 → «100», 1.5 → «1.5»."""
    return str(int(n)) if n == int(n) else repr(n)


def a_numero(txt: Any) -> str | None:
    """«1,01» → «1,01»; «ND»/«BLD» → None; quita signos «<», «>»; el decimal vuelve con coma."""
    if txt is None:
        return None
    s = re.sub(r"\s", "", str(txt).strip())
    if not s or plano(s) in NO_DETECTADO:
        return None
    s = re.sub(r"^[<>≤≥~=]+", "", s)
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".", 1)
        else:
            s = s.replace(",", "")
    elif s.count(",") == 1:
        s = s.replace(",", ".", 1)
    m = re.match(r"^[+-]?(\d+\.?\d*|\.\d+)", s)      # parseFloat: toma el prefijo numérico
    if not m:
        return None
    return _js_numero(float(m.group(0))).replace(".", ",", 1)


def campo(texto: str, etiqueta: str, hasta: str | None = None) -> str | None:
    """El valor que sigue a una etiqueta, sin cruzar el salto de línea (igual que `campo` del Converter)."""
    esp = r"[^\S\n]*"
    patron = etiqueta + esp + ":?" + esp + r"([^\n]+?)" + (esp + "(?=" + hasta + ")" if hasta else esp + "$")
    m = re.search(patron, texto, re.I | re.M)
    if not m:
        return None
    v = re.sub(r"^[:\s]+|[:\s]+$", "", re.sub(r"\s+", " ", m.group(1)))
    return v or None


def mapear_analito(nombre: str) -> str | None:
    p = plano(nombre)
    p = re.sub(r"\s*\(\d+\)\s*$", "", p)
    p = re.sub(r"\s*\d+\s*(g|gr|ml|mg)\b.*$", "", p)
    if p in ANALITOS:
        return ANALITOS[p]
    for k, col in ANALITOS.items():
        if p.startswith(k) or k in p:
            return col
    return None


def guardar(inf: dict[str, Any], nombre: str, valor: str) -> None:
    col = mapear_analito(nombre)
    crudo = str(valor).strip()
    # «<1», «>2400»: el laboratorio dio un límite, no un valor: se conserva como texto.
    num = None if re.match(r"^\s*[<>≤≥]", crudo) else a_numero(crudo)
    final = num if num is not None else crudo
    if col:
        previo = inf["resultados"].get(col)
        if previo is not None and previo != final:
            inf["avisos"].append(f"{nombre} aparece dos veces con valores distintos")
        inf["resultados"][col] = final
    else:
        inf["sueltos"].append([nombre.strip(), final])
        inf["avisos"].append(f"«{nombre.strip()}» no tiene columna propia: va al bloque de pesticida puntual")


def leer_quiteca(texto: str) -> dict[str, Any]:
    """Los datos de un informe de Quiteca: `datos` (el informe), `resultados` (columna → valor), `sueltos`
    (analitos sin columna propia) y `avisos`. Espejo de `leerQuiteca` + la limpieza de `analizar`."""
    inf: dict[str, Any] = {"datos": {}, "resultados": {}, "sueltos": [], "avisos": []}
    d = inf["datos"]
    avisos = inf["avisos"]
    d["Laboratorio"] = "Quiteca"
    informe_n = re.search(r"Informe N°\s*([\w-]+)", texto)
    d["N° Solicitud"] = informe_n.group(1) if informe_n else None
    d["Solicitante"] = campo(texto, "Solicitado por", "Fecha solicitud")
    # En Quiteca «Cliente» es la cuenta que paga (AgroFresh): el cliente real es el empacador y la sucursal el lugar de muestreo.
    d["Sold To"] = campo(texto, "Empacador")
    d["Ship To"] = campo(texto, "Lugar de muestreo")
    d["Especie"] = campo(texto, "Especie", "Variedad")
    d["Variedad"] = campo(texto, "Variedad")
    d["Lote"] = campo(texto, "Lote", "N° cámara")
    d["N° Cámara"] = campo(texto, "N° cámara")
    d["CSG"] = campo(texto, "Cód. productor")
    d["Línea Proceso"] = campo(texto, "Línea", "Kg procesados")
    d["Kilos Procesados (KG)"] = a_numero(campo(texto, "Kg procesados"))
    d["Posición Muestreo"] = campo(texto, "Posición muestreo", "Análisis")
    d["Fecha Solicitud"] = a_fecha(campo(texto, "Fecha solicitud"), avisos)
    d["Fecha Muestreo"] = a_fecha(campo(texto, "Fecha de Muestreo", "Hora"), avisos)
    d["Fecha entrada"] = a_fecha(campo(texto, "Fecha de Recepción"), avisos)
    d["Hora Muestreo"] = a_hora(campo(texto, "Hora"))
    d["Fecha Recepción"] = d["Fecha entrada"]
    d["Hora Recepción"] = a_hora(campo(texto, "Fecha de Recepción"))
    fa = re.search(r"Fecha de An[áa]lisis\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", texto, re.I)
    d["Fecha Análisis"] = a_fecha(fa.group(1), avisos) if fa else None
    fi = re.search(
        r"Fecha Informe\s*:?\s*(\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóú]+\s+(?:de\s+)?\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        texto, re.I)
    d["Fecha Informe"] = (a_fecha_larga(fi.group(1)) or a_fecha(fi.group(1), avisos)) if fi else None
    # El OT que generamos viaja en «N° Solicitud»; los informes antiguos traían ahí un correlativo largo de Quiteca (no es un OT).
    ot = re.search(r"N°\s*Solicitud\s*:?\s*(OT-[A-Za-z0-9]+)", texto, re.I)
    d["OT"] = ot.group(1).upper() if ot else None
    d["Tipo Muestra"] = "Fruta"
    d["Tipo Aplicación"] = campo(texto, "Tipo Aplicaci[óo]n", r"C[óo]d\. productor") or campo(texto, "Tratamiento", "Línea de Proceso")
    tratamiento = plano(d["Tipo Aplicación"] or "")
    es_actimist = "fogger" in tratamiento or "actimist" in tratamiento
    d["Tipo de servicio"] = "Actimist" if es_actimist else "Linea de Proceso"

    obs: list[str] = []
    m = re.search(r"Obs\.:\s*([\s\S]+?)(?=Resultados de la Muestra)", texto)
    if m:
        obs.append(re.sub(r"\s+", " ", m.group(1)).strip())
    cta = campo(texto, "Cliente", "RUT")
    if cta:
        obs.append("Cuenta: " + cta)
    if informe_n:
        obs.append("Informe Quiteca N° " + informe_n.group(1))
    m = re.search(r"Muestra N°\s*(\d+)", texto)
    if m:
        obs.append("Muestra N° " + m.group(1))
        d["N° Muestra"] = m.group(1)
    d["Observación"] = " · ".join(obs) or None

    m = re.search(r"N°\s*ORDEN\s*:?\s*(\d+)", texto, re.I)
    if m:
        d["N° Orden"] = m.group(1)
    m = re.search(r"DOSIS\s+([\d.,]+)\s*GRS?/TON", texto, re.I)
    if m:
        d["Dosis Aplicada"] = a_numero(m.group(1))

    for linea in texto.split("\n"):
        m = re.match(r"^\s*([A-Z]{2,}-\d+)\s+([A-Za-zÁÉÍÓÚñÑ\s\-]+?)\s+([\d.,]+|N\.?D\.?)\s", linea)
        if m:
            guardar(inf, m.group(2), m.group(3))

    # Lo que `analizar` hace después de leer: quita los datos vacíos y avisa lo obligatorio que falta.
    for k in [k for k, v in d.items() if v is None or v == "" or v == "-"]:
        del d[k]
    faltan = [c for c in OBLIGATORIOS if not d.get(c)]
    if faltan:
        avisos.append("Sin dato para: " + ", ".join(faltan))
    if not inf["resultados"] and not inf["sueltos"]:
        avisos.append("No se encontró ningún resultado en el informe")
    return inf


def a_iso(ddmmyyyy: str | None) -> str | None:
    m = re.match(r"^(\d{2})-(\d{2})-(\d{4})$", str(ddmmyyyy or ""))
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def fila_cruda(inf: dict[str, Any]) -> dict[str, Any]:
    """Lo que el Converter manda a `/ingest/confirmar` (`filaCruda`): una fila con las columnas del Excel."""
    d = inf["datos"]
    g = d.get
    fila = {
        "Informe": g("N° Solicitud"),
        "Laboratorio": g("Laboratorio"),
        "Fecha \nSolicitud": a_iso(g("Fecha Solicitud")),
        "Fecha de muestreo": a_iso(g("Fecha Muestreo")),
        "Fecha entrada": a_iso(g("Fecha entrada")),
        "Fecha Recepción": a_iso(g("Fecha Recepción")),
        "Hora Recepción": g("Hora Recepción") or None,
        "Fecha Informe": a_iso(g("Fecha Informe")),
        "Fecha Análisis": a_iso(g("Fecha Análisis")),
        "N° Solicitud": g("OT"),
        "N° Muestra": g("N° Muestra") or None,
        "SOLD TO": g("Sold To"),
        "SHIP TO": g("Ship To"),
        "CROP": g("Especie"),
        "Variedad": g("Variedad"),
        "Tipo de servicio": g("Tipo de servicio"),
        "Lote": g("Lote"),
        "Cámara": g("N° Cámara"),
        "Línea": g("Línea Proceso"),
        "Posición": g("Posición Muestreo"),
        "Kg \nprocesados": g("Kilos Procesados (KG)"),
        "Cód. Productor (CSG)": g("CSG"),
        "Nombre del responsable": g("Nombre Muestreador"),
        "orden": g("N° Orden"),
        "Observaciones": g("Observación"),
        "TIPO APP": g("Tipo Aplicación"),
    }
    fila.update(inf["resultados"])
    return fila
