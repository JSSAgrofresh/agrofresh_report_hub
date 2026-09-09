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
    # Cómo integró el pico el equipo ("BBA", "MM"…). "MM" es integración
    # manual: el resultado lo ajustó una persona, y eso hay que poder verlo.
    tipo: str = ""
    # El factor con el que ese pico pasó de área a concentración. Es lo que
    # permite rehacer el cálculo sin el equipo al lado.
    amt_area: float | None = None
    grp: str = ""


@dataclass
class MuestraGC:
    codigo: str
    seq_line: int | None
    fecha_inyeccion: str | None
    resultados: list[ResultadoAnalito] = field(default_factory=list)
    # La ficha que el equipo escribe arriba de cada inyección: operador,
    # instrumento, volumen inyectado, qué método corrió, qué es la muestra.
    # Se guarda tal cual, con las etiquetas del equipo, porque es lo que el
    # laboratorio lee en el papel.
    datos: dict[str, str] = field(default_factory=dict)
    # La suma de concentraciones del vial, como la reporta el equipo.
    totales: float | None = None
    # "Warning : Negative results set to zero…" y compañía. Sin esto, un cero
    # forzado y un "no se detectó nada" se ven exactamente igual.
    advertencias: list[str] = field(default_factory=list)
    # Si el equipo recalibró con este vial antes de calcular.
    recalibrado: bool = False


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
                tipo=_tipo.strip(),
                amt_area=numero(_amt_area),
                grp=_grp.strip(),
            )
        )
    return resultados


# La ficha de cada inyección. El equipo la escribe con dos pares por línea
# ("Acq. Operator : SYSTEM      Seq. Line : 1"), así que cada campo se busca
# por su etiqueta y no por su posición.
_CAMPOS_DEL_BLOQUE: tuple[tuple[str, str], ...] = (
    ("Acq. Operator", r"Acq\. Operator\s*:\s*(.*?)\s{2,}"),
    ("Acq. Instrument", r"Acq\. Instrument\s*:\s*(.*?)\s{2,}"),
    ("Inj", r"\bInj\s*:\s*(\d+)"),
    ("Inj Volume", r"Inj Volume\s*:\s*(.+?)\s*$"),
    ("Method Info", r"Method Info\s*:\s*(.*?)\s*$"),
    ("Sample Info", r"Sample Info\s*:\s*(.*?)\s*$"),
    ("Additional Info", r"Additional Info\s*:\s*(.*?)\s*$"),
    ("Multiplier", r"^Multiplier\s*:\s*(.+?)\s*$"),
    ("Dilution", r"^Dilution\s*:\s*(.+?)\s*$"),
    ("Calib. Data Modified", r"Calib\. Data Modified\s*:\s*(.+?)\s*$"),
)
# Las rutas se parten en dos líneas: la segunda viene indentada y sin etiqueta.
_CAMPOS_LARGOS = ("Sequence File", "Acq. Method", "Analysis Method")

_PAT_TOTALES = re.compile(r"^Totals\s*:\s*(.*)$", re.M)
_PAT_ADVERTENCIA = re.compile(r"^(?:Warning|Error)\s*:\s*(.+)$", re.M)


def _ficha_del_bloque(bloque: str) -> dict[str, str]:
    datos: dict[str, str] = {}
    for campo, patron in _CAMPOS_DEL_BLOQUE:
        m = re.search(patron, bloque, re.M)
        if m and m.group(1).strip():
            datos[campo] = m.group(1).strip()
    for campo in _CAMPOS_LARGOS:
        m = re.search(rf"^{re.escape(campo)}\s*:\s*(.*(?:\n {{10,}}.*)*)", bloque, re.M)
        if m:
            valor = re.sub(r"\s*\n\s+", "", m.group(1)).strip()
            if valor:
                datos[campo] = valor
    return datos


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
    m_totales = _PAT_TOTALES.search(bloque)

    return MuestraGC(
        codigo=codigo,
        seq_line=int(m_seq.group(1)) if m_seq else None,
        fecha_inyeccion=m_fecha.group(1).strip() if m_fecha else None,
        resultados=_parsear_tabla(m_tabla.group(1)) if m_tabla else [],
        datos=_ficha_del_bloque(bloque),
        totales=float(m_totales.group(1)) if m_totales and _es_numero(m_totales.group(1)) else None,
        advertencias=[a.strip() for a in _PAT_ADVERTENCIA.findall(bloque)],
        recalibrado="External Standard Report (after recalibration)" in bloque,
    )


def _es_numero(valor: str) -> bool:
    try:
        float(valor.strip())
    except ValueError:
        return False
    return True


def parsear_gc_txt(contenido: bytes) -> list[MuestraGC]:
    """Devuelve una muestra por cada inyección encontrada en el reporte,
    en el mismo orden en que aparecen (orden de secuencia del GC)."""
    return _muestras_de(_decodificar(contenido))


def _muestras_de(texto: str) -> list[MuestraGC]:
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


def _inicios_de_bloque(lineas: list[str]) -> list[int]:
    """En qué líneas empieza cada inyección. La ficha del método también
    arranca con "Data File", pero no la sigue un "Sample Name"."""
    return [
        i
        for i in range(len(lineas) - 1)
        if lineas[i].startswith("Data File ") and lineas[i + 1].startswith("Sample Name:")
    ]


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
    return _ubicaciones_de(_decodificar(contenido).replace("\r\n", "\n").split("\n"))


def _ubicaciones_de(lineas: list[str]) -> dict[int, str]:
    texto = "\n".join(lineas)
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
    return _cabecera_de(_decodificar(contenido).replace("\r\n", "\n").split("\n"))


def _cabecera_de(lineas: list[str]) -> list[tuple[str, str, str]]:
    texto = "\n".join(lineas)
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


# ---------------------------------------------------------------------------
# El resto del reporte
#
# El archivo del GC no son solo los resultados: trae también con qué método se
# midió, la curva con la que se calculó cada ppm, la estadística de los picos y
# la bitácora de la corrida. De ~9.500 líneas se leían unas 600; el resto -el
# respaldo de esos números- se quedaba en el .txt.
#
# Todas las secciones se leen igual: ubicar dónde empieza y dónde termina, y
# cortar las tablas por las posiciones de los "|" de su línea separadora.
# Ninguna es obligatoria: si el equipo no la escribió, la función devuelve una
# lista vacía y el resto del reporte se lee igual.
# ---------------------------------------------------------------------------

_INICIO_METODO = "M e t h o d   L i s t i n g"
_INICIO_BITACORA = "L o g b o o k"
_INICIO_ESTADISTICA = "S t a t i s t i c    R e p o r t"
_INICIO_RESUMEN = "S a m p l e    S u m m a r y"
_INICIO_EQUIPO = "I n s t r u m e n t   C o n f i g u r a t i o n"
_INICIO_AUDITORIA = "Method Audit Trail"
_INICIO_CURVA = "Calibration Table"
_TABLA_CURVA = "Overview Table"
_FIN_SECUENCIA = "Print Sequence Summary"


def _lineas(contenido: bytes) -> list[str]:
    return _decodificar(contenido).replace("\r\n", "\n").split("\n")


def _buscar(lineas: list[str], aguja: str, desde: int = 0, si_falta: int | None = None) -> int:
    """Primera línea que contiene `aguja`, o `si_falta` (por omisión, el final).

    Devolver el final y no None deja que los cortes de sección se escriban
    como rangos sin preguntar por None en cada paso: una sección que no está
    queda como un rango vacío.
    """
    for i in range(desde, len(lineas)):
        if aguja in lineas[i]:
            return i
    return len(lineas) if si_falta is None else si_falta


def _numero(valor: str) -> float | None:
    valor = valor.strip()
    if valor in ("", "-", "---"):
        return None
    try:
        return float(valor)
    except ValueError:
        return None


def _es_separador(linea: str) -> bool:
    cuerpo = linea.strip()
    return bool(cuerpo) and set(cuerpo) <= set("-|") and "|" in cuerpo


def _filas_de_tabla(lineas: list[str], desde: int, hasta: int) -> list[list[str]]:
    """Las filas de una tabla de ancho fijo, cortadas por los "|" de su línea
    separadora. Se detiene en la primera línea en blanco después de los datos:
    es como el equipo cierra cada tabla."""
    separador = next((i for i in range(desde, min(hasta, len(lineas))) if _es_separador(lineas[i])), None)
    if separador is None:
        return []
    cortes_base = [i for i, c in enumerate(lineas[separador]) if c == "|"]
    filas = []
    for i in range(separador + 1, min(hasta, len(lineas))):
        linea = lineas[i]
        if not linea.strip():
            break
        cortes = [0, *cortes_base, max(len(linea), cortes_base[-1] + 1)]
        filas.append([linea[cortes[k] : cortes[k + 1]].strip() for k in range(len(cortes) - 1)])
    return filas


# ── La tabla de la secuencia, completa ─────────────────────────────────────
#
# `parsear_ubicaciones_gc` lee de acá solo la ubicación del carrusel. Pero cada
# línea declara además qué es el vial (`Sample Type`), con qué método se midió,
# en qué archivo quedó el dato crudo y, en los puntos de curva, qué nivel es.
# Sin eso, el sistema tiene que adivinar por el nombre si un vial es muestra o
# blanco -que es justo lo que falla cuando el laboratorio cambia de
# nomenclatura-.

_PAT_CAMPO_SECUENCIA = re.compile(r"^([A-Za-z][A-Za-z0-9 .#]*?)\s*:\s?(.*)$")

# Los dos títulos de las tablas de campos personalizados terminan en ":" y
# parecen un campo más; no lo son.
_NO_SON_CAMPOS = ("Sample related custom fields", "Compound related custom fields")


def parsear_secuencia_gc(contenido: bytes) -> list[dict[str, str]]:
    """Un diccionario por línea de la secuencia, con todos sus campos."""
    return _secuencia_de(_lineas(contenido))


def _secuencia_de(lineas: list[str]) -> list[dict[str, str]]:
    inicio = _buscar(lineas, _FIN_CABECERA)
    fin = _buscar(lineas, _FIN_SECUENCIA, inicio)
    filas: list[dict[str, str]] = []
    actual: dict[str, str] | None = None
    for i in range(inicio, fin):
        m = _PAT_CAMPO_SECUENCIA.match(lineas[i])
        if not m:
            continue
        campo, valor = m.group(1).strip(), m.group(2).strip()
        if campo in _NO_SON_CAMPOS:
            continue
        if campo == "Line":
            actual = {"Line": valor}
            filas.append(actual)
        elif actual is not None:
            actual[campo] = valor
    return filas


# ── El método instrumental y su auditoría ──────────────────────────────────
#
# Con qué condiciones se midió: rampa del horno, inyector, columna, detector.
# Es lo que hay que mostrar si alguien pregunta por qué un resultado dio lo que
# dio. Viene como texto de ancho fijo, con títulos centrados que separan los
# bloques ("Oven", "Back Detector FID", …).

_PAT_AUDITORIA = re.compile(r"^(Operator|Date|Change Info)\s*:\s*(.*)$")


def parsear_auditoria_gc(contenido: bytes) -> list[dict[str, str]]:
    """Quién tocó el método, cuándo y qué cambió."""
    return _auditoria_de(_lineas(contenido))


def _auditoria_de(lineas: list[str]) -> list[dict[str, str]]:
    inicio = _buscar(lineas, _INICIO_AUDITORIA, _buscar(lineas, _INICIO_METODO))
    cambios: list[dict[str, str]] = []
    actual: dict[str, str] | None = None
    for i in range(inicio, _fin_auditoria(lineas, inicio)):
        linea = lineas[i].rstrip()
        m = _PAT_AUDITORIA.match(linea)
        if m:
            campo, valor = m.group(1), m.group(2).strip()
            if campo == "Operator":
                actual = {"operador": valor, "fecha": "", "cambio": ""}
                cambios.append(actual)
            elif actual is not None:
                actual["fecha" if campo == "Date" else "cambio"] = valor
        elif actual is not None and linea.startswith(" " * 13) and linea.strip():
            actual["cambio"] = (actual["cambio"] + " " + linea.strip()).strip()
    return cambios


def _fin_auditoria(lineas: list[str], inicio: int) -> int:
    """La auditoría termina en la primera regla de "=", donde arranca la ficha
    de parámetros del equipo."""
    for i in range(inicio, len(lineas)):
        if lineas[i].strip().startswith("========"):
            return i
    return len(lineas)


def parsear_metodo_gc(contenido: bytes) -> list[tuple[str, str, str]]:
    """(bloque, parámetro, valor) del método, en el orden del archivo."""
    return _metodo_de(_lineas(contenido))


def _metodo_de(lineas: list[str]) -> list[tuple[str, str, str]]:
    inicio = _buscar(lineas, _INICIO_METODO)
    if inicio == len(lineas):
        return []
    inicio = _fin_auditoria(lineas, _buscar(lineas, _INICIO_AUDITORIA, inicio))
    fin = _buscar(lineas, _INICIO_CURVA, inicio)
    filas: list[tuple[str, str, str]] = []
    bloque = "Método"
    for i in range(inicio, fin):
        linea = lineas[i].rstrip()
        cuerpo = linea.strip()
        if not cuerpo or set(cuerpo) <= set("=-") or cuerpo.startswith("Data File"):
            continue
        partes = re.split(r"\s{2,}", cuerpo)
        if len(partes) == 1:
            # Un título centrado abre un bloque nuevo; un texto pegado a la
            # izquierda es un valor suelto (la descripción de la columna, por
            # ejemplo), que se guarda sin parámetro.
            if len(linea) - len(linea.lstrip()) >= 8 and not cuerpo.endswith(":"):
                bloque = cuerpo
            else:
                filas.append((bloque, cuerpo, ""))
        else:
            filas.append((bloque, partes[0], " ".join(partes[1:])))
    return filas


# ── La curva de calibración del método ─────────────────────────────────────
#
# Los 5 niveles de cada compuesto con su área y su factor de respuesta. Es con
# esto que el equipo convierte un área en ppm: sin la curva, ningún resultado
# se puede recalcular ni verificar. El nombre del compuesto solo aparece en la
# fila del primer nivel, así que se arrastra hacia abajo.


def parsear_curva_gc(contenido: bytes) -> list[dict[str, object]]:
    return _curva_de(_lineas(contenido))


def _curva_de(lineas: list[str]) -> list[dict[str, object]]:
    inicio = _buscar(lineas, _TABLA_CURVA, _buscar(lineas, _INICIO_CURVA))
    if inicio == len(lineas):
        return []
    fin = next(
        (i for i in range(inicio + 4, len(lineas)) if lineas[i].strip().startswith("====")),
        len(lineas),
    )
    curva: list[dict[str, object]] = []
    compuesto = ""
    for f in _filas_de_tabla(lineas, inicio, fin):
        if len(f) < 8:
            continue
        if f[-1].strip():
            compuesto = f[-1].strip()
        curva.append(
            {
                "compuesto": compuesto,
                "rettime": _numero(f[0]),
                "senal": f[1].strip(),
                "nivel": _numero(f[2]),
                "amount": _numero(f[3]),
                "area": _numero(f[4]),
                "factor_respuesta": _numero(f[5]),
                "ref": f[6].strip(),
                "istd": f[7].strip(),
            }
        )
    return curva


# ── La estadística de los picos ────────────────────────────────────────────
#
# Alto, ancho y simetría de cada pico -que no están en ninguna otra parte del
# archivo- y, al pie de cada compuesto, Media, S.D., RSD y 95% CI. El RSD es el
# criterio con el que el laboratorio acepta o rechaza una curva.

_PAT_COMPUESTO_ESTADISTICA = re.compile(r"^Compound:\s*(.+?)(?:\s*\(Signal:\s*(.+?)\))?\s*$")
_ESTADISTICOS = {"Mea": "Mean", "S.D": "S.D.", "RSD": "RSD", "95%": "95% CI"}


def parsear_estadistica_gc(contenido: bytes) -> list[dict[str, object]]:
    return _estadistica_de(_lineas(contenido))


def _estadistica_de(lineas: list[str]) -> list[dict[str, object]]:
    inicio = _buscar(lineas, _INICIO_ESTADISTICA)
    if inicio == len(lineas):
        return []
    filas: list[dict[str, object]] = []
    for i in range(inicio, len(lineas)):
        m = _PAT_COMPUESTO_ESTADISTICA.match(lineas[i].strip())
        if not m:
            continue
        compuesto, senal = m.group(1), (m.group(2) or "")
        fin = next(
            (k for k in range(i + 4, len(lineas)) if lineas[k].strip().startswith("95% CI")),
            len(lineas),
        )
        for f in _filas_de_tabla(lineas, i, fin + 1):
            if len(f) < 7:
                continue
            etiqueta = _ESTADISTICOS.get(f[0].strip(), "")
            corrida = None if etiqueta else _numero(f[0])
            tipo = f[1].strip()
            if set(tipo) <= set("-|") and tipo:
                continue  # la regla que cierra la tabla antes de los promedios
            if corrida is None and not etiqueta:
                continue
            filas.append(
                {
                    "compuesto": compuesto,
                    "senal": senal,
                    "corrida": corrida,
                    "estadistico": etiqueta,
                    "tipo": "" if etiqueta else tipo,
                    "rettime": _numero(f[2]),
                    "amount": _numero(f[3]),
                    "area": _numero(f[4]),
                    "alto": _numero(f[5]),
                    "ancho": _numero(f[6]),
                    "simetria": _numero(f[7]) if len(f) > 7 else None,
                }
            )
    return filas


# ── El resumen de viales ───────────────────────────────────────────────────
#
# La tabla con que el equipo cierra el reporte. Trae una columna que no está en
# ninguna otra parte: cuántos compuestos se detectaron en cada vial. Es un
# control de calidad de un vistazo.


def parsear_resumen_gc(contenido: bytes) -> list[dict[str, object]]:
    return _resumen_de(_lineas(contenido))


def _resumen_de(lineas: list[str]) -> list[dict[str, object]]:
    inicio = _buscar(lineas, _INICIO_RESUMEN)
    if inicio == len(lineas):
        return []
    filas: list[dict[str, object]] = []
    for f in _filas_de_tabla(lineas, inicio, len(lineas)):
        if len(f) < 10 or not f[0].strip():
            continue
        filas.append(
            {
                "corrida": _numero(f[0]),
                "ubicacion": f[1].strip(),
                "inyeccion": _numero(f[2]),
                "vial": f[3].strip(),
                "cantidad": _numero(f[4]),
                "multiplicador": _numero(f[5]),
                "archivo": f[6].strip(),
                "es_punto_de_curva": f[7].strip() == "*",
                "compuestos_detectados": _numero(f[8]),
            }
        )
    return filas


# ── La bitácora de la corrida ──────────────────────────────────────────────
#
# El registro cronológico: cada inyección, cada recalibración y cada error del
# equipo, con su hora. Los mensajes largos el equipo los corta con un ">" y los
# sigue en la línea siguiente.

_PAT_BITACORA = re.compile(r"^(\S.{0,11}?)\s{2,}(.*?)\s{2,}(\d{1,2}/\d{1,2}/\d{4}\s+.*)$")


def parsear_bitacora_gc(contenido: bytes) -> list[dict[str, str]]:
    return _bitacora_de(_lineas(contenido))


def _bitacora_de(lineas: list[str]) -> list[dict[str, str]]:
    inicio = _buscar(lineas, _INICIO_BITACORA)
    if inicio == len(lineas):
        return []
    fin = _buscar(lineas, _INICIO_METODO, inicio)
    eventos: list[dict[str, str]] = []
    for i in range(inicio, fin):
        linea = lineas[i].rstrip()
        if not linea.strip() or linea.strip().startswith("---") or "Module" in linea[:10]:
            continue
        m = _PAT_BITACORA.match(linea)
        if m:
            eventos.append(
                {
                    "modulo": m.group(1).strip(),
                    "mensaje": m.group(2).strip().rstrip(">").strip(),
                    "fecha": m.group(3).strip(),
                }
            )
        elif eventos and linea.startswith(" " * 10):
            eventos[-1]["mensaje"] += linea.strip()
    return eventos


# ---------------------------------------------------------------------------
# El archivo visto por partes
#
# Después de subir el reporte, la pantalla lo muestra tal como sale del equipo
# y le pone color a cada parte, diciendo a qué hoja del Excel va a parar. Sirve
# para dos cosas: que quien revisa entienda de dónde sale cada número, y que se
# note al tiro si el equipo escribió algo que el sistema no esperaba.
#
# Cada categoría es un tramo de líneas; las líneas en blanco heredan la
# categoría de la anterior para que los tramos se lean como bloques.
# ---------------------------------------------------------------------------

# (id, nombre, hoja del Excel a la que va a parar)
CATEGORIAS_GC: list[tuple[str, str, str | None]] = [
    ("portada", "Portada del reporte", None),
    ("equipo", "Configuración del equipo", "Información del GC"),
    ("secuencia", "Tabla de la secuencia", "Secuencia"),
    ("opciones", "Opciones de impresión", None),
    ("bitacora", "Bitácora de la corrida", "Bitácora"),
    ("auditoria", "Auditoría del método", "Auditoría del método"),
    ("metodo", "Método instrumental", "Método"),
    ("curva", "Curva de calibración", "Curva de calibración"),
    ("ident", "Identificación del vial", "Área y PPM por vial"),
    ("resultado", "Resultados del vial", "Datos completos"),
    ("advertencia", "Advertencias del equipo", "Área y PPM por vial"),
    ("sinuso", "Repetido o sin uso", None),
    ("estadistica", "Estadística de los picos", "Estadística de la curva"),
    ("resumen", "Resumen de viales", "Resumen de viales"),
]

_PAT_CUANTAS_ADVERTENCIAS = re.compile(r"^\d+ (Warnings|Errors)")


def clasificar_lineas_gc(contenido: bytes) -> list[str]:
    """La categoría de cada línea del archivo, en orden."""
    return _clasificar(_lineas(contenido))


def _clasificar(lineas: list[str]) -> list[str]:
    n = len(lineas)
    cat = ["portada"] * n

    def pintar(desde: int, hasta: int, categoria: str) -> None:
        for i in range(max(desde, 0), min(hasta, n)):
            cat[i] = categoria

    i_equipo = _buscar(lineas, _INICIO_EQUIPO)
    i_secuencia = _buscar(lineas, _FIN_CABECERA)
    i_opciones = _buscar(lineas, _FIN_SECUENCIA, i_secuencia)
    i_bitacora = _buscar(lineas, _INICIO_BITACORA)
    i_metodo = _buscar(lineas, _INICIO_METODO)
    i_auditoria = _buscar(lineas, _INICIO_AUDITORIA, i_metodo)
    i_fin_auditoria = _fin_auditoria(lineas, i_auditoria)
    i_curva = _buscar(lineas, _INICIO_CURVA, i_metodo)
    i_estadistica = _buscar(lineas, _INICIO_ESTADISTICA)
    i_resumen = _buscar(lineas, _INICIO_RESUMEN)
    viales = _inicios_de_bloque(lineas)

    pintar(i_equipo, i_secuencia, "equipo")
    pintar(i_secuencia, i_opciones, "secuencia")
    pintar(i_opciones, i_bitacora, "opciones")
    pintar(i_bitacora, i_metodo, "bitacora")
    pintar(i_metodo, i_auditoria, "metodo")
    pintar(i_auditoria, i_fin_auditoria, "auditoria")
    pintar(i_fin_auditoria, i_curva, "metodo")
    pintar(i_curva, viales[0] if viales else i_estadistica, "curva")
    pintar(i_estadistica, i_resumen, "estadistica")
    pintar(i_resumen, n, "resumen")

    # Las fichas de campos personalizados cierran el método y no se ocupan.
    if viales:
        sueltas = [i for i in range(i_curva, viales[0]) if "Sample related custom fields" in lineas[i]]
        if sueltas:
            pintar(sueltas[-1] - 1, viales[0], "sinuso")

    for inicio, fin in zip(viales, viales[1:] + [min(i_estadistica, n)]):
        pintar(inicio, fin, "sinuso")
        i_tabla = _buscar(lineas, "External Standard Report", inicio, fin)
        i_recalibracion = _buscar(lineas, "Calibration Table (after recalibration)", inicio, fin)
        pintar(inicio, min(i_tabla, i_recalibracion), "ident")
        if i_recalibracion < fin:
            pintar(i_recalibracion, min(i_tabla, fin), "curva")
        if i_tabla >= fin:
            continue
        i_totales = next(
            (i for i in range(i_tabla, fin) if lineas[i].lstrip().startswith("Totals")), fin - 1
        )
        pintar(i_tabla, min(i_totales + 1, fin), "resultado")
        i_aviso = next(
            (i for i in range(i_totales, fin) if _PAT_CUANTAS_ADVERTENCIAS.match(lineas[i].strip())),
            None,
        )
        if i_aviso is not None:
            i_ultima = i_aviso + 1
            while i_ultima < fin and (
                lineas[i_ultima].strip().startswith(("Warning", "Error")) or not lineas[i_ultima].strip()
            ):
                i_ultima += 1
            pintar(i_aviso, i_ultima, "advertencia")

    for i in range(1, n):
        if not lineas[i].strip():
            cat[i] = cat[i - 1]
    return cat


def agrupar_regiones_gc(categorias: list[str]) -> list[tuple[int, int, str]]:
    """Las categorías consecutivas juntas: (primera línea, última línea,
    categoría), con las líneas numeradas desde 1 como en un editor.

    La pantalla dibuja un bloque por región y no una fila por línea: son ~190
    bloques en vez de ~9.500 nodos, que es la diferencia entre que la vista
    abra al tiro o se arrastre.
    """
    regiones: list[tuple[int, int, str]] = []
    for i, categoria in enumerate(categorias):
        if regiones and regiones[-1][2] == categoria:
            regiones[-1] = (regiones[-1][0], i + 1, categoria)
        else:
            regiones.append((i + 1, i + 1, categoria))
    return regiones


# ---------------------------------------------------------------------------
# Todo el reporte, de una sola pasada
# ---------------------------------------------------------------------------


@dataclass
class ReporteGC:
    """El archivo del GC completo. Cada campo es una sección del reporte."""

    texto: str
    cabecera: list[tuple[str, str, str]]
    secuencia: list[dict[str, str]]
    ubicaciones: dict[int, str]
    muestras: list[MuestraGC]
    metodo: list[tuple[str, str, str]]
    auditoria: list[dict[str, str]]
    curva: list[dict[str, object]]
    estadistica: list[dict[str, object]]
    resumen: list[dict[str, object]]
    bitacora: list[dict[str, str]]
    regiones: list[tuple[int, int, str]]


def parsear_reporte_gc(contenido: bytes) -> ReporteGC:
    """Lee el archivo una vez y devuelve todas sus secciones.

    Existe para no decodificar y recorrer nueve veces el mismo megabyte: cada
    `parsear_*` sirve para leer una sección suelta (y para los tests), pero la
    pantalla las necesita todas juntas.
    """
    texto = _decodificar(contenido).replace("\r\n", "\n")
    lineas = texto.split("\n")
    return ReporteGC(
        texto=texto,
        cabecera=_cabecera_de(lineas),
        secuencia=_secuencia_de(lineas),
        ubicaciones=_ubicaciones_de(lineas),
        muestras=_muestras_de(texto),
        metodo=_metodo_de(lineas),
        auditoria=_auditoria_de(lineas),
        curva=_curva_de(lineas),
        estadistica=_estadistica_de(lineas),
        resumen=_resumen_de(lineas),
        bitacora=_bitacora_de(lineas),
        regiones=agrupar_regiones_gc(_clasificar(lineas)),
    )
