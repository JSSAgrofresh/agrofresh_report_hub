"""Columnas GENERALES comunes de las dos bases en Excel.

Hay dos descargas que son «la base» y se van a cruzar entre sí:

  · Report → «Descargar BD» (`bd_excel.py`): lo que está en la base de datos,
    con los **resultados** de cada analito.
  · AgroFresh Lab → Ingreso al laboratorio → «Descargar con muestra»
    (`emitir.py`): las solicitudes de AgroFresh ya cruzadas con su muestra, con
    la **dosis** y si el analito fue solicitado (✓), todavía sin resultados.

Para que se puedan cruzar, las dos llevan EXACTAMENTE las mismas columnas
generales, con el mismo nombre y en el mismo orden: esta lista es la única
definición. Si falta una columna, se agrega aquí y aparece en las dos. Cada
descarga llena lo que tiene y deja vacío lo demás.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Callable

from .solicitud_excel import CAMPOS_GENERALES_ETIQUETAS

# (clave de la fila, encabezado)
GENERALES_BASE: list[tuple[str, str]] = [
    ("nro_informe", "N° Informe"),
    ("nro_solicitud", "N° Solicitud"),
    ("codigo_muestra", "N° Muestra"),
    ("fecha_solicitud", "Fecha Solicitud"),
    ("fecha_muestreo", "Fecha Muestreo"),
    ("fecha_entrada", "Fecha Entrada"),
    ("fecha_recepcion", "Fecha Recepción"),
    ("hora_recepcion", "Hora Recepción"),
    ("peso_extraido", "Peso Muestra Extraída (g)"),
    ("fecha_informe", "Fecha Informe"),
    ("fecha_analisis", "Fecha Análisis"),
    ("hora_muestreo", "Hora Muestreo"),
    ("semana", "Semana"),
    ("mes", "Mes"),
    ("temporada", "Temporada"),
    ("laboratorio", "Laboratorio"),
    ("tipo_servicio", "Tipo de Servicio"),
    ("solicitante", "Solicitante"),
    ("sold_to", "Sold To"),
    ("ship_to", "Ship To"),
    ("especie", "Especie"),
    ("variedad", "Variedad"),
    ("linea_proceso", "Línea Proceso"),
    ("csg", "CSG"),
    ("csg_packing", "Código del Packing"),
    ("lote", "Lote"),
    ("posicion_muestreo", "Posición Muestreo"),
    ("numero_camara", "N° Cámara"),
    ("kilos_procesados", "Kilos Procesados (KG)"),
    ("producto_utilizado", "Producto Utilizado"),
    ("tipo_muestra", "Tipo Muestra"),
    ("nombre_muestreador", "Nombre Muestreador"),
    ("generado_por", "Generado Por"),
    ("email_solicitante", "Email Solicitante"),
    ("email_laboratorio", "Email Laboratorio"),
    ("lista_para", "Lista de Distribución (Para)"),
    ("lista_cc", "Lista de Distribución (CC)"),
    ("lista_cco", "Lista de Distribución (CCO)"),
    ("observacion", "Observación"),
]

# Columnas del grupo de fungicidas que no son un analito: (clave de la fila, encabezado).
# Van tras los analitos en las dos descargas.
CAMPOS_FUNGICIDAS: list[tuple[str, str]] = [
    ("gasto", "Gasto"),
    ("codigo_ensayo", "Código de Ensayo"),
    ("nro_ensayo", "N° Ensayo"),
]

# Clave del formato de Solicitudes -> clave común.
_RENOMBRE = {"numero_solicitud": "nro_solicitud", "csg_productor": "csg"}


def a_fecha(v: Any) -> Any:
    """'28-09-2026' o '2026-09-28' -> date; lo demás queda como vino."""
    if not isinstance(v, str):
        return v
    t = v.strip()
    for formato in ("%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(t[:10], formato).date()
        except ValueError:
            continue
    return v


def partir_recepcion(recepcion_en: str | None) -> tuple[str | None, str | None]:
    """El instante del cruce como (día 'YYYY-MM-DD', hora 'HH:MM') del laboratorio."""
    from .emitir import _partir_recepcion

    return _partir_recepcion(recepcion_en)


def calculador_listas(contactos: list[dict] | None = None) -> Callable[[Any, Any, Any], dict[str, str]]:
    """Lista de distribución de RESULTADOS de un (Sold To, Ship To, especie), como
    {lista_para, lista_cc, lista_cco}: los correos separados por «; ». Es la
    misma regla que el correo de resultados, el PDF y el JSON.

    Lee la configuración UNA vez (viene de R2) y recuerda cada combinación:
    cientos de filas comparten pocas."""
    from .toma_muestras import _leer_config, destinatarios_resultado_por_tipo

    if contactos is None:
        contactos = _leer_config("contactos_laboratorio.json", [])
    memoria: dict[tuple[str, str, str], dict[str, str]] = {}

    def calcular(sold_to: Any, ship_to: Any, especie: Any) -> dict[str, str]:
        clave = (str(sold_to or "").strip(), str(ship_to or "").strip(), str(especie or "").strip())
        if clave not in memoria:
            d = destinatarios_resultado_por_tipo("", clave[1], clave[0], clave[2], contactos)
            memoria[clave] = {
                "lista_para": "; ".join(d["to"]),
                "lista_cc": "; ".join(d["cc"]),
                "lista_cco": "; ".join(d["bcc"]),
            }
        return memoria[clave]

    return calcular


def fila_desde_campos(
    campos: dict[str, str],
    *,
    codigo_muestra: str | None = None,
    peso_extraido: float | None = None,
    fecha_recepcion: str | None = None,
    hora_recepcion: str | None = None,
    listas: Callable[[Any, Any, Any], dict[str, str]] | None = None,
) -> dict[str, Any]:
    """La fila común de una solicitud de AgroFresh tal como la lista la pantalla
    de Ingreso al laboratorio (campos con su etiqueta humana)."""
    fila: dict[str, Any] = {}
    for clave, etiqueta in CAMPOS_GENERALES_ETIQUETAS:
        fila[_RENOMBRE.get(clave, clave)] = campos.get(etiqueta) or None
    fila["codigo_muestra"] = codigo_muestra
    fila["peso_extraido"] = peso_extraido
    fila["fecha_recepcion"] = a_fecha(fecha_recepcion)
    fila["hora_recepcion"] = hora_recepcion
    fila["csg_packing"] = campos.get("Código del Packing") or None
    fila["tipo_servicio"] = campos.get("Tipo Aplicación") or None
    for clave, etiqueta in CAMPOS_FUNGICIDAS:
        fila[clave] = campos.get(etiqueta) or None
    for clave in ("fecha_solicitud", "fecha_muestreo", "fecha_informe"):
        fila[clave] = a_fecha(fila.get(clave))
    # Semana, mes y temporada de la muestra: la misma regla de respaldo que la BD
    # (semana ISO y mes del día de muestreo, temporada = su año).
    f = fila.get("fecha_muestreo")
    if isinstance(f, (date, datetime)):
        fila["semana"] = f.isocalendar()[1]
        fila["mes"] = f.month
        fila["temporada"] = f.year
    if listas:
        fila.update(listas(fila.get("sold_to"), fila.get("ship_to"), fila.get("especie")))
    return fila
