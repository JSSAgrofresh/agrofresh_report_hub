"""Parser de los archivos de "Solicitud de Muestreo" que se guardan en
Storage: son una tabla HTML guardada con extensión .xls (típico export de
sistemas web hacia Excel), no un binario real. Estructura fija: la primera
fila son encabezados de agrupación (colspan, se ignoran), la segunda fila
son los nombres de columna reales, y de ahí en adelante una fila por
solicitud -normalmente una sola-.

Las columnas de analito vienen dos veces: "Pirimetanil (PYR)" (si se pidió,
dice "Sí") y "Resultado: Pirimetanil (PYR)" (vacía, para llenar después).
El código entre paréntesis coincide exactamente con analito.codigo en la
base de datos (AZOX, DPA, FDL, IMZ, PYR, TBZ, TEBU)."""

import re
from html.parser import HTMLParser

_PAT_CODIGO_ANALITO = re.compile(r"\(([A-Za-z]+)\)\s*$")
_PREFIJO_RESULTADO = "Resultado:"


class _ParserTablaHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.filas: list[list[str]] = []
        self._fila_actual: list[str] | None = None
        self._celda_actual: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._fila_actual = []
        elif tag in ("td", "th"):
            self._celda_actual = []

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._celda_actual is not None and self._fila_actual is not None:
            self._fila_actual.append("".join(self._celda_actual).strip())
            self._celda_actual = None
        elif tag == "tr" and self._fila_actual is not None:
            self.filas.append(self._fila_actual)
            self._fila_actual = None

    def handle_data(self, data):
        if self._celda_actual is not None:
            self._celda_actual.append(data)


class SolicitudMuestreo:
    def __init__(self, campos: dict[str, str], analitos_solicitados: list[str]):
        self.campos = campos
        self.analitos_solicitados = analitos_solicitados

    @property
    def n_solicitud(self) -> str | None:
        return self.campos.get("N° Solicitud") or None

    def campo(self, nombre: str) -> str | None:
        return self.campos.get(nombre) or None


def parsear_solicitudes_html(contenido: str) -> list[SolicitudMuestreo]:
    parser = _ParserTablaHTML()
    parser.feed(contenido)
    filas = [f for f in parser.filas if any(c for c in f)]
    if len(filas) < 2:
        return []

    # la fila de encabezados reales es la que tiene más celdas (la de
    # agrupación con colspan trae muchas menos <th> que columnas de verdad)
    encabezados = max(filas[:2], key=len)
    filas_datos = filas[filas.index(encabezados) + 1 :]

    solicitudes = []
    for fila in filas_datos:
        if not any(c for c in fila):
            continue
        campos = {encabezados[i]: fila[i] for i in range(min(len(encabezados), len(fila)))}
        analitos_solicitados = []
        for encabezado, valor in campos.items():
            if encabezado.startswith(_PREFIJO_RESULTADO):
                continue
            m = _PAT_CODIGO_ANALITO.search(encabezado)
            if m and valor.strip().lower() in ("sí", "si", "yes", "x", "true"):
                analitos_solicitados.append(m.group(1).upper())
        solicitudes.append(SolicitudMuestreo(campos=campos, analitos_solicitados=analitos_solicitados))
    return solicitudes
