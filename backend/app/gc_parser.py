"""Parser del reporte de texto que exporta el software del GC (Agilent
ChemStation, "External Standard Report"/"GLPrprtB"). El archivo viene en
UTF-16 (con BOM) y trae un bloque por cada inyección de la secuencia -tanto
las muestras reales (código tipo GCNPD9826) como blancos y curvas de
calibración-.

Dentro de cada bloque, el número que reportamos por analito es el de la
tabla "External Standard Report" (o "External Standard Report (after
recalibration)" en los puntos de calibración) -no la de "Final Summed Peaks
Report", que redondea a 4 decimales-. Esa tabla es de ancho fijo: se ubica
la línea separadora "-------|------|----------|...|" y se usan las
posiciones de sus "|" para cortar cada línea de datos en sus columnas
(RetTime, Type, Area, Amt/Area, Amount, Grp, Name), evitando la ambigüedad
de partir por espacios cuando Type/Grp vienen vacíos.

Validado con datos reales: reproduce exactamente los valores del Excel de
referencia del laboratorio (Área y Amount por analito, para muestras con un
solo analito detectado y para curvas con varios).
"""

import re
from dataclasses import dataclass, field

# Nombre del compuesto tal como lo escribe el GC (inglés/nombre científico) ->
# código canónico del sistema (analito.codigo en la base de datos). Cubre el
# panel de 7 analitos del método NPD actual; si se agrega un método con otros
# analitos, hay que sumar sus nombres acá.
NOMBRE_GC_A_CODIGO = {
    "AZOXYSTROBIN": "AZOX",
    "DIFENILAMINA": "DPA",
    "FLUDIOXONIL": "FDL",
    "IMAZALIL": "IMZ",
    "PYRYMETHANIL": "PYR",
    "TEBUCONAZOLE": "TEBU",
    "THIABENDAZOLE": "TBZ",
}

# Un "vial" es una muestra real cruzable solo si su nombre es un código puro
# (letras seguidas de números, sin nada más pegado) -así se excluyen curvas
# de calibración ("Curva 0.05"), blancos ("Blanco acetona"), inyecciones de
# conteo ("1", "2") y controles de limpieza ("GCNPD9775 LIMPIEZA NORMAL MET 2").
_PAT_CODIGO_PURO = re.compile(r"^[A-Za-z]+\d+$")


def es_codigo_puro(nombre: str) -> bool:
    return bool(_PAT_CODIGO_PURO.match(nombre.strip()))


_PAT_SAMPLE_NAME = re.compile(r"^.*\nSample Name:\s*(.*)\n")
_PAT_SEQ_LINE = re.compile(r"Seq\. Line\s*:\s*(\d+)")
_PAT_FECHA = re.compile(r"Injection Date\s*:\s*(.+?)\s{2,}")
_PAT_TABLA = re.compile(r"External Standard Report[^\n]*\n(.*?)\nTotals", re.S)


@dataclass
class ResultadoAnalito:
    analito: str
    area: float | None
    amount: float | None


@dataclass
class MuestraGC:
    codigo: str
    seq_line: int | None
    fecha_inyeccion: str | None
    resultados: list[ResultadoAnalito] = field(default_factory=list)


def _decodificar(contenido: bytes) -> str:
    for codec in ("utf-16", "utf-8-sig", "utf-8", "latin-1"):
        try:
            return contenido.decode(codec)
        except UnicodeDecodeError:
            continue
    raise ValueError("No se pudo leer el archivo: codificación desconocida.")


def _parsear_tabla(tabla: str) -> list[ResultadoAnalito]:
    lineas = tabla.split("\n")
    sep_idx = None
    for i, l in enumerate(lineas):
        cuerpo = l.strip()
        if cuerpo and set(cuerpo) <= set("-|") and "|" in cuerpo:
            sep_idx = i
            break
    if sep_idx is None:
        return []

    posiciones = [i for i, c in enumerate(lineas[sep_idx]) if c == "|"]
    resultados = []
    for linea in lineas[sep_idx + 1 :]:
        if not linea.strip():
            continue
        cortes = [0, *posiciones, len(linea)]
        campos = [linea[cortes[i] : cortes[i + 1]].strip() for i in range(len(cortes) - 1)]
        if len(campos) < 7:
            continue
        _rettime, _tipo, area, _amt_area, amount, _grp, nombre = campos[:7]
        resultados.append(
            ResultadoAnalito(
                analito=nombre.strip(),
                area=None if area in ("", "-") else float(area),
                amount=None if amount in ("", "-") else float(amount),
            )
        )
    return resultados


def _parsear_bloque(bloque: str) -> MuestraGC | None:
    m = _PAT_SAMPLE_NAME.search(bloque)
    if not m:
        return None
    codigo = m.group(1).strip()
    if not codigo:
        return None

    m_seq = _PAT_SEQ_LINE.search(bloque)
    m_fecha = _PAT_FECHA.search(bloque)
    m_tabla = _PAT_TABLA.search(bloque)

    return MuestraGC(
        codigo=codigo,
        seq_line=int(m_seq.group(1)) if m_seq else None,
        fecha_inyeccion=m_fecha.group(1).strip() if m_fecha else None,
        resultados=_parsear_tabla(m_tabla.group(1)) if m_tabla else [],
    )


def parsear_gc_txt(contenido: bytes) -> list[MuestraGC]:
    """Devuelve una muestra por cada inyección encontrada en el reporte,
    en el mismo orden en que aparecen (orden de secuencia del GC)."""
    texto = _decodificar(contenido)
    # el separador es "\nData File "; el primer bloque no tiene el "\n" previo
    # porque el archivo empieza directo con "Data File ..."
    texto_normalizado = "\n" + texto if not texto.startswith("\n") else texto
    bloques = texto_normalizado.split("\nData File ")[1:]

    muestras = []
    for bloque in bloques:
        muestra = _parsear_bloque(bloque)
        if muestra is not None:
            muestras.append(muestra)
    return muestras
