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
    # Tiempo de retención, en minutos. No lo usa el cruce ni el informe: está
    # para la vista de detalle, que reproduce el reporte del GC tal como sale
    # del equipo. Antes se descartaba al parsear.
    rettime: float | None = None


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
        rettime, _tipo, area, _amt_area, amount, _grp, nombre = campos[:7]

        def numero(valor: str) -> float | None:
            valor = valor.strip()
            if valor in ("", "-"):
                return None
            try:
                return float(valor)
            except ValueError:
                return None

        resultados.append(
            ResultadoAnalito(
                analito=nombre.strip(),
                area=numero(area),
                amount=numero(amount),
                rettime=numero(rettime),
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


# ---------------------------------------------------------------------------
# Cabecera del archivo: la información auditable de la corrida
#
# Antes de las muestras, el equipo escribe con qué se midió: instrumento,
# módulos, columna cromatográfica y parámetros de la secuencia. Es lo que
# respalda un resultado si alguien lo cuestiona -qué columna, qué método, qué
# operador, qué día-, así que la vista de detalle la muestra como primera hoja.
#
# Nada de esto entra al cruce ni al informe.
# ---------------------------------------------------------------------------

SECCION_INSTRUMENTO = "Instrumento y columna"
SECCION_SECUENCIA = "Parámetros de la secuencia"

# Dónde termina la cabecera y empiezan las muestras.
_FIN_CABECERA = "SEQUENCE TABLE:"

# Un par "Etiqueta : valor". El valor termina donde empieza OTRA etiqueta, y
# para eso se exigen dos espacios antes: así `C:\Chem32\...` no se confunde
# con el comienzo de un campo nuevo -su ':' va pegado a la letra-.
_PAT_PAR = re.compile(
    # La barra va en la clase por "Shutdown Cmd/Macro"; la contrabarra NO, que
    # es lo que impide que una ruta de Windows parezca una etiqueta nueva.
    r"(?P<campo>[A-Za-z#][A-Za-z0-9#()\-./ ]*?)\s*:\s*"
    r"(?P<valor>.*?)"
    r"(?=\s{2,}[A-Za-z#][A-Za-z0-9#()\-./ ]*?\s*:\s|$)"
)

# Líneas de adorno: los banners "S E Q U E N C E", las reglas de guiones y la
# línea de la firma.
_PAT_ADORNO = re.compile(r"^[\s\-=|.]*$|^[\sA-Za-z]{0,4}(?:[A-Za-z]\s){3,}[A-Za-z]?\s*$")


def _unir_continuaciones(lineas: list[str]) -> list[str]:
    """Junta las líneas que continúan el valor anterior.

    Una ruta larga se parte en dos: la segunda línea viene muy indentada y sin
    etiqueta propia. Separadas, el valor quedaría cortado a la mitad.
    """
    unidas: list[str] = []
    for linea in lineas:
        continuacion = linea.startswith(" " * 20) and ":" not in linea[:24]
        if continuacion and unidas:
            unidas[-1] = unidas[-1].rstrip() + " " + linea.strip()
        else:
            unidas.append(linea)
    return unidas


def _pares_de(texto: str) -> list[tuple[str, str]]:
    pares: list[tuple[str, str]] = []
    for linea in _unir_continuaciones(texto.split("\n")):
        if not linea.strip() or _PAT_ADORNO.match(linea):
            continue
        for m in _PAT_PAR.finditer(linea):
            campo = m.group("campo").strip()
            valor = m.group("valor").strip()
            if campo and not campo.startswith("-"):
                pares.append((campo, valor))
    return pares


def _modulos(cabecera: str) -> list[tuple[str, str]]:
    """La tabla de módulos del equipo, como pares "modelo → detalle"."""
    m = re.search(r"^Module\s+Type.*?\n-[-|]+\n(.*?)(?=\n\s*\n)", cabecera, re.S | re.M)
    if not m:
        return []
    filas = []
    for linea in m.group(1).split("\n"):
        if not linea.strip():
            continue
        # Nombre (ancho fijo hasta la columna 39) y el resto por espacios.
        nombre, resto = linea[:39].strip(), linea[39:].split()
        if nombre:
            filas.append((f"Módulo · {nombre}", " · ".join(resto)))
    return filas


# La tabla de la secuencia: qué se puso en cada posición del carrusel.
#
# El equipo la escribe después de la cabecera, un bloque por inyección, y no
# la repite en el reporte de resultados: ahí solo queda el número de línea.
# La ubicación es lo que permite volver al vial físico si un resultado se
# cuestiona, así que se lee de acá y se pega a cada muestra por su línea.
_PAT_LINEA_SECUENCIA = re.compile(
    r"^Line\s*:\s*(\d+)\s*$.*?^Location\s*:\s*(.*?)\s*$",
    re.S | re.M,
)


def parsear_ubicaciones_gc(contenido: bytes) -> dict[int, str]:
    """{línea de la secuencia: ubicación en el carrusel}.

    Solo mira la tabla de la secuencia: buscar "Location" en todo el archivo
    traería también el "Injection Location" de cada inyección, que es otra
    cosa (el inyector, no el vial).
    """
    texto = _decodificar(contenido).replace("\r\n", "\n")
    corte = texto.find(_FIN_CABECERA)
    if corte == -1:
        return {}
    tabla = texto[corte:]
    return {
        int(linea): ubicacion
        for linea, ubicacion in _PAT_LINEA_SECUENCIA.findall(tabla)
        if ubicacion
    }


def parsear_cabecera_gc(contenido: bytes) -> list[tuple[str, str, str]]:
    """(sección, campo, valor) de la cabecera, en el orden del archivo.

    Devuelve una lista plana y no un diccionario porque el orden importa: es
    como el equipo lo escribe, y así se lee igual que el papel.
    """
    texto = _decodificar(contenido).replace("\r\n", "\n")
    corte = texto.find(_FIN_CABECERA)
    cabecera = texto[:corte] if corte != -1 else texto

    quiebre = cabecera.find("SEQUENCE PARAMETERS")
    if quiebre == -1:
        instrumento, secuencia = cabecera, ""
    else:
        instrumento, secuencia = cabecera[:quiebre], cabecera[quiebre:]

    filas: list[tuple[str, str, str]] = []
    for campo, valor in _pares_de(instrumento):
        filas.append((SECCION_INSTRUMENTO, campo, valor))
    for campo, valor in _modulos(cabecera):
        filas.append((SECCION_INSTRUMENTO, campo, valor))
    for campo, valor in _pares_de(secuencia):
        filas.append((SECCION_SECUENCIA, campo, valor))
    return filas
