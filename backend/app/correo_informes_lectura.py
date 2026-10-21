"""
Lectura y revisión de los informes que llegan por correo (Ingesta de Datos → Correo).

Todo lo de este módulo es PURO (texto y datos que entran, datos que salen: no toca el
buzón, la base ni R2), para poder probarlo con los correos reales de los laboratorios.
El buzón y la base viven en `correo_informes.py`.

Qué hace, en orden:
  1. Reconoce el laboratorio del PDF (mismas reglas que `detectar` del Converter).
  2. Lee del PDF los datos con que se cruza con su solicitud: N° de informe, OT, Sold To,
     Ship To, especie y fecha de muestreo. Con la misma semántica que el Converter
     (`leerQuiteca`): en Quiteca el Sold To es el «Empacador» y el Ship To el «Lugar de muestreo».
  3. Compara el informe con SU solicitud (la OT que trae impresa) y los destinatarios del
     correo con la lista que esa solicitud dice que debía recibirlo.

Niveles de cada hallazgo: `rojo` (hay que hacerle seguimiento: posible envío al cliente
equivocado, OT que no existe, planta distinta…), `amarillo` (falta algo o hay algo que mirar) e
`info` (solo se muestra). El estado de un informe es el peor de sus niveles.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime
from email.utils import getaddresses
from typing import Any, Iterable

# Laboratorios con lector de este módulo (etapa 1). ALS y Diagnofruit se registran, pero sin leer.
LABORATORIOS_CON_LECTOR = ("Quiteca", "AgroFresh")
DOMINIOS_INTERNOS = ("agrofresh.com",)

ROJO, AMARILLO, INFO = "rojo", "amarillo", "info"
_PESO = {INFO: 0, AMARILLO: 1, ROJO: 2}


# ---------------------------------------------------------------------------
# Texto
# ---------------------------------------------------------------------------

def plano(texto: str) -> str:
    """Minúsculas, sin tildes y con los espacios colapsados."""
    t = unicodedata.normalize("NFKD", texto or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip().lower()


def clave_nombre(texto: Any) -> str:
    """Un nombre de planta o cliente comparable: sin tildes, mayúsculas ni signos."""
    t = unicodedata.normalize("NFKD", str(texto or ""))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^A-Z0-9]+", " ", t.upper()).strip()


def detectar_laboratorio(texto: str) -> str | None:
    """Espejo, en Python, de `detectar` del Converter (public/modules/converter.html)."""
    t = plano(texto)
    if re.search(r"solicitud de an[aá]lisis\s+n°\s*ot-", texto or "", re.I) and "agrofresh.com" in t:
        return "AgroFresh"
    if re.search(r"informe de an[aá]lisis\s+n[°º]?\s*agf\d", texto or "", re.I) and re.search(
        r"n[°º] solicitud\s+ot-", texto or "", re.I
    ):
        return "AgroFresh"
    # `pypdf` suele separar el «N° AGF2026-47» del título «INFORME DE ANÁLISIS» (pdf.js no): el informe
    # propio también se reconoce por su N° y su N° de solicitud OT-AGF.
    if re.search(r"\bN°\s*AGF\d{4}-\d+", texto or "", re.I) and re.search(r"\bOT-AGF\d{3,5}\b", texto or "", re.I):
        return "AgroFresh"
    if "quiteca" in t:
        return "Quiteca"
    if "diagnofruit" in t:
        return "Diagnofruit"
    if "microbiologia" in t and (
        "als food" in t or "alsfoodchile" in t or "alsglobal" in t
        or ("laboratorio microbiologia" in t and "identificacion muestra (ni)" in t)
    ):
        return "ALS"
    if "corthorn" in t or "cromatografia" in t:
        return "ALS"
    return None


_OT = re.compile(r"\bOT\s*-?\s*([A-Z]{2,5})\s*-?\s*(\d{3,5})\b", re.I)


def extraer_ots(texto: str) -> list[str]:
    """Todas las OT del texto, normalizadas a «OT-AGF0075». Une las que ALS parte en
    «OT-» / «ALS0007»."""
    vistas: list[str] = []
    for m in _OT.finditer(texto or ""):
        ot = f"OT-{m.group(1).upper()}{m.group(2)}"
        if ot not in vistas:
            vistas.append(ot)
    return vistas


def fecha_iso(valor: Any) -> str:
    """«14-10-2026» o «2026-10-14» → «2026-10-14». Vacío si no es una fecha."""
    if isinstance(valor, (date, datetime)):
        return valor.strftime("%Y-%m-%d")
    t = str(valor or "").strip()[:10]
    m = re.fullmatch(r"(\d{2})[-/](\d{2})[-/](\d{4})", t)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return t if re.fullmatch(r"\d{4}-\d{2}-\d{2}", t) else ""


def _linea(patron: str, texto: str, flags: int = re.I | re.M) -> str:
    m = re.search(patron, texto, flags)
    return re.sub(r"\s+", " ", m.group(1)).strip(" :\t") if m else ""


# ---------------------------------------------------------------------------
# Lectores (solo lo que hace falta para cruzar con la solicitud)
# ---------------------------------------------------------------------------

def leer_quiteca(texto: str) -> dict[str, str]:
    """`texto` es el de `informe_lectura.texto_quiteca` (cada dato junto a su etiqueta)."""
    ots = extraer_ots(texto)
    return {
        "laboratorio": "Quiteca",
        "nro_informe": _linea(r"Informe N°\s*([\w-]+)", texto),
        "ot": ots[0] if ots else "",
        "sold_to": _linea(r"^\s*Empacador\s+(.+)$", texto),
        "ship_to": _linea(r"^\s*Lugar de muestreo\s+(.+)$", texto),
        "especie": _linea(r"^\s*Especie\s+(.+?)\s+Variedad", texto),
        "fecha_muestreo": fecha_iso(_linea(r"Fecha de Muestreo\s*:\s*(\d{2}-\d{2}-\d{4})", texto)),
        "fecha_recepcion": fecha_iso(_linea(r"Fecha de Recepci[oó]n\s*:\s*(\d{2}-\d{2}-\d{4})", texto)),
        "tipo_aplicacion": _linea(r"Tipo Aplicaci[oó]n\s+(.+?)\s+C[oó]d\. productor", texto),
    }


def leer_agrofresh(texto: str) -> dict[str, str]:
    """El informe propio de AgroFresh (`informe_pdf.py`), con el texto normal de `pypdf`."""
    from .informe_lectura import datos_de_informe

    base = datos_de_informe(texto)          # solo se aprovecha su N° de solicitud
    ots = extraer_ots(texto)
    return {
        "laboratorio": "AgroFresh",
        "nro_informe": _linea(r"^\s*N°\s*(AGF[\w-]+)", texto).upper(),
        "ot": (base.get("numero_solicitud") or (ots[0] if ots else "")).upper(),
        # En este PDF el Sold To y el Ship To se separan de sus etiquetas al extraer el texto: no se
        # leen. El cruce con la solicitud busca sus nombres escritos en el informe (`_mismo_nombre`).
        "sold_to": "",
        "ship_to": "",
        "especie": _linea(r"^\s*ESPECIE\s+(.+?)\s+VARIEDAD", texto),
        "fecha_muestreo": fecha_iso(_linea(r"FECHA MUESTREO\s+(\d{2}-\d{2}-\d{4})", texto)),
        "fecha_recepcion": fecha_iso(_linea(r"FECHA RECEPCI[OÓ]N\s+(\d{2}-\d{2}-\d{4})", texto)),
        "tipo_aplicacion": _linea(r"TIPO APLICACI[OÓ]N\s+(.+?)\s*$", texto),
    }


def leer_informe(laboratorio: str | None, texto_normal: str, texto_quiteca: str = "") -> dict[str, str]:
    """Los datos del informe según su laboratorio. Los de ALS y Diagnofruit solo traen la OT
    (su lector llega en la etapa 4)."""
    if laboratorio == "Quiteca":
        return leer_quiteca(texto_quiteca or texto_normal)
    if laboratorio == "AgroFresh":
        return leer_agrofresh(texto_normal)
    ots = extraer_ots(texto_normal)
    return {"laboratorio": laboratorio or "", "nro_informe": "", "ot": ots[0] if ots else "", "sold_to": "",
            "ship_to": "", "especie": "", "fecha_muestreo": "", "fecha_recepcion": "", "tipo_aplicacion": ""}


# ---------------------------------------------------------------------------
# Correos: destinatarios
# ---------------------------------------------------------------------------

def direcciones(*valores: Any) -> list[str]:
    """Las direcciones de uno o varios encabezados, en minúsculas y sin repetir."""
    salida: list[str] = []
    for _, correo in getaddresses([str(v) for v in valores if v]):
        c = correo.strip().lower()
        if c and "@" in c and c not in salida:
            salida.append(c)
    return salida


def _es_interno(correo: str) -> bool:
    return correo.rsplit("@", 1)[-1] in DOMINIOS_INTERNOS


def comparar_destinatarios(
    esperado: dict[str, list[str]], real: dict[str, list[str]], propios: Iterable[str] = (),
) -> list[dict[str, str]]:
    """Hallazgos de la lista de un correo contra la que debía recibirlo.

    Se mira solo Para y Copia (lo que el correo recibido muestra; la Copia oculta del resto no
    se ve). Una persona cuenta como presente si está en Para o en Copia. Faltan → amarillo. Sobran:
    gente fuera de AgroFresh → rojo (posible envío al cliente equivocado); un correo interno que
    la lista no trae → amarillo.
    """
    propios = {p.lower() for p in propios}
    esp_visibles = [c.lower() for c in [*esperado.get("to", []), *esperado.get("cc", [])]]
    esp_todos = {c.lower() for c in [*esp_visibles, *esperado.get("bcc", [])]}
    reales = [c for c in [*real.get("to", []), *real.get("cc", []), *real.get("bcc", [])]]
    reales = list(dict.fromkeys(c.lower() for c in reales))

    hallazgos: list[dict[str, str]] = []
    if not esp_visibles:
        hallazgos.append({
            "nivel": AMARILLO, "codigo": "sin_lista",
            "texto": "La solicitud no tiene lista de distribución del cliente: no se puede revisar a quién debió llegar.",
        })
        return hallazgos

    faltan = [c for c in dict.fromkeys(esp_visibles) if c not in reales]
    if faltan:
        hallazgos.append({
            "nivel": AMARILLO, "codigo": "faltan_destinatarios",
            "texto": "Falta en el correo: " + ", ".join(faltan),
        })
    sobran = [c for c in reales if c not in esp_todos and c not in propios]
    externos = [c for c in sobran if not _es_interno(c)]
    internos = [c for c in sobran if _es_interno(c)]
    if externos:
        hallazgos.append({
            "nivel": ROJO, "codigo": "destinatarios_de_mas",
            "texto": "Salió a personas que NO están en la lista de la solicitud: " + ", ".join(externos),
        })
    if internos:
        hallazgos.append({
            "nivel": AMARILLO, "codigo": "copia_interna_de_mas",
            "texto": "Copia interna que la lista no trae: " + ", ".join(internos),
        })
    return hallazgos


# ---------------------------------------------------------------------------
# Informe contra su solicitud
# ---------------------------------------------------------------------------

def _mismo_nombre(a: str, b: str, texto_completo: str = "") -> bool:
    ka, kb = clave_nombre(a), clave_nombre(b)
    if not kb:
        return True        # la solicitud no dice: no se puede contradecir
    if ka and (ka == kb or ka in kb or kb in ka):
        return True
    # Respaldo: el nombre de la solicitud aparece escrito en cualquier parte del informe.
    return bool(texto_completo) and f" {kb} " in f" {clave_nombre(texto_completo)} "


def comparar_con_solicitud(leido: dict[str, str], datos: dict, texto: str = "") -> list[dict[str, str]]:
    """Lo que el informe trae distinto de SU solicitud."""
    hallazgos: list[dict[str, str]] = []
    lab_sol = str(datos.get("laboratorio") or "")
    lab = leido.get("laboratorio") or ""
    if lab and lab_sol and clave_nombre(lab_sol).split(" ")[0] != clave_nombre(lab).split(" ")[0]:
        hallazgos.append({
            "nivel": ROJO, "codigo": "laboratorio_distinto",
            "texto": f"La OT {leido.get('ot')} es de {lab_sol} y el informe es de {lab}.",
        })
    if not _mismo_nombre(leido.get("ship_to", ""), datos.get("ship_to", ""), texto):
        hallazgos.append({
            "nivel": ROJO, "codigo": "ship_to_distinto",
            "texto": f"Planta distinta: el informe dice «{leido.get('ship_to') or '—'}» y la solicitud «{datos.get('ship_to')}».",
        })
    if not _mismo_nombre(leido.get("sold_to", ""), datos.get("sold_to", ""), texto):
        hallazgos.append({
            "nivel": AMARILLO, "codigo": "sold_to_distinto",
            "texto": f"Cliente distinto: el informe dice «{leido.get('sold_to') or '—'}» y la solicitud «{datos.get('sold_to')}».",
        })
    esp_i, esp_s = clave_nombre(leido.get("especie")), clave_nombre(datos.get("especie"))
    if esp_i and esp_s and esp_i != esp_s:
        hallazgos.append({
            "nivel": AMARILLO, "codigo": "especie_distinta",
            "texto": f"Especie distinta: el informe dice «{leido.get('especie')}» y la solicitud «{datos.get('especie')}».",
        })
    f_i, f_s = leido.get("fecha_muestreo", ""), fecha_iso(datos.get("fecha_muestreo"))
    if f_i and f_s and f_i != f_s:
        hallazgos.append({
            "nivel": AMARILLO, "codigo": "fecha_muestreo_distinta",
            "texto": f"Fecha de muestreo distinta: el informe dice {f_i} y la solicitud {f_s}.",
        })
    return hallazgos


def estado_de(hallazgos: list[dict[str, str]]) -> str:
    """`rojo`, `amarillo` u `ok` (el peor de los hallazgos; `info` no cuenta)."""
    peor = max((_PESO.get(h.get("nivel", INFO), 0) for h in hallazgos), default=0)
    return {2: ROJO, 1: AMARILLO}.get(peor, "ok")


def revisar_informe(
    leido: dict[str, str], texto: str, solicitud: tuple[str, dict] | None, esperado: dict[str, list[str]] | None,
    real: dict[str, list[str]], propios: Iterable[str] = (),
) -> list[dict[str, str]]:
    """Todos los hallazgos de un informe que llegó por correo."""
    hallazgos: list[dict[str, str]] = []
    if not leido.get("ot"):
        hallazgos.append({
            "nivel": AMARILLO, "codigo": "sin_ot",
            "texto": "El informe no trae el N° de solicitud (OT): no se puede revisar contra su solicitud ni su lista.",
        })
        return hallazgos
    if solicitud is None:
        hallazgos.append({
            "nivel": ROJO, "codigo": "ot_desconocida",
            "texto": f"La OT {leido['ot']} no existe en el sistema.",
        })
        return hallazgos
    _, datos = solicitud
    hallazgos += comparar_con_solicitud(leido, datos, texto)
    if esperado is not None:
        hallazgos += comparar_destinatarios(esperado, real, propios)
    return hallazgos
