"""Hoja «Para el informe» del Excel de la solicitud, solo para Diagnofruit.

Diagnofruit entrega un informe de 2 hojas por OT: el resultado y una hoja final de
«Observaciones adicionales». Ellos copian de esta hoja lo que hay que pegar en esas
observaciones, así el sistema lee el informe sin adivinar nada del texto:

  1. La cadena de la solicitud: todos sus datos separados por « // », siempre en
     la misma posición (un dato vacío deja sus separadores: «a // // c»).
  2. «Sold To // Ship To» con los nombres oficiales de Listados.
  3. La lista de distribución de resultados, una celda para Para, otra para CC y otra
     para CCO (la misma que arma el PDF y el JSON de la solicitud).

Solo la llevan las solicitudes de Diagnofruit creadas desde que existe la marca
`hoja_informe_v1`; las anteriores y las de otros laboratorios salen como siempre.
"""
from __future__ import annotations

from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.worksheet import Worksheet

from .json_als import SEP, _dmy, _txt

MARCA_HOJA_INFORME = "hoja_informe_v1"
NOMBRE_HOJA = "Para el informe"

# (clave en `datos`, nombre del campo). El ORDEN ES EL CONTRATO con el lector del
# informe: agregar un campo al FINAL, nunca en el medio ni quitar uno.
CAMPOS_CADENA: list[tuple[str, str]] = [
    ("numero_solicitud", "N° Solicitud (OT)"),
    ("tipo_aplicacion", "Tipo de servicio"),
    ("fecha_solicitud", "Fecha solicitud"),
    ("fecha_muestreo", "Fecha muestreo"),
    ("hora_muestreo", "Hora muestreo"),
    ("especie", "Especie"),
    ("variedad", "Variedad"),
    ("linea_proceso", "Línea de proceso"),
    ("csg_productor", "CSG productor"),
    ("csg_packing", "CSG packing"),
    ("lote", "Lote"),
    ("posicion_muestreo", "Posición muestreo"),
    ("numero_camara", "N° cámara"),
    ("numero_orden", "N° orden"),
    ("kilos_procesados", "Kilos procesados"),
    ("producto_utilizado", "Producto utilizado"),
    ("tipo_muestra", "Tipo de muestra"),
    ("nombre_muestreador", "Muestreador"),
    ("email_solicitante", "Email muestreador"),
    ("gasto", "Gasto"),
    ("observacion", "Observación"),
]

_FECHAS = {"fecha_solicitud", "fecha_muestreo"}


def es_diagnofruit(laboratorio: object) -> bool:
    return str(laboratorio or "").strip().casefold() == "diagnofruit"


def lleva_hoja(datos: dict) -> bool:
    return bool(datos.get(MARCA_HOJA_INFORME)) and es_diagnofruit(datos.get("laboratorio"))


def _valor(datos: dict, clave: str) -> str:
    campos = datos.get("campos_laboratorio")
    campos = campos if isinstance(campos, dict) else {}
    if clave == "tipo_aplicacion":
        bruto = campos.get("Tipo Aplicación")
    elif clave == "gasto":
        bruto = campos.get("Gasto")
    else:
        bruto = datos.get(clave)
    texto = _dmy(bruto) if clave in _FECHAS else _txt(bruto)
    # Un « // » dentro de un dato (p. ej. en la observación) rompería las posiciones.
    return " ".join(texto.replace("//", "/").split())


def cadena_solicitud(datos: dict) -> str:
    """Todos los datos en su posición fija; los vacíos conservan sus separadores."""
    return " ".join(SEP.join(_valor(datos, k) for k, _ in CAMPOS_CADENA).split())


def partes_de_cadena(cadena: str) -> list[str]:
    """Inverso de `cadena_solicitud`: separa por «//» (no por « // »: dos vacíos seguidos
    comparten el espacio) y recorta; siempre da un elemento por cada dato, vacío o no."""
    return [p.strip() for p in str(cadena or "").split("//")]


def sold_to_ship_to(datos: dict) -> str:
    return " ".join(SEP.join(_txt(datos.get(k)).replace("//", "/") for k in ("sold_to", "ship_to")).split())


def destinatarios(datos: dict) -> dict[str, list[str]]:
    """Para / CC / CCO de resultados, igual que el PDF y el JSON de la solicitud."""
    from . import toma_muestras as tm

    try:
        detalle = tm._datos_pdf_con_destinatarios_resultados(datos)["destinatarios_resultados_detalle"]
    except Exception:
        # La lista viene de la configuración (R2): sin ella la hoja sale igual, sin lista.
        return {"para": [], "cc": [], "bcc": []}
    return {k: list(detalle.get(k) or []) for k in ("para", "cc", "bcc")}


def agregar_hoja(wb: Workbook, datos: dict, listas: dict[str, list[str]] | None = None) -> Worksheet:
    """Agrega la hoja «Para el informe» al libro de la solicitud."""
    listas = listas if listas is not None else destinatarios(datos)
    ws = wb.create_sheet(NOMBRE_HOJA)
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 120
    rotulo = Font(bold=True)
    caja = PatternFill("solid", fgColor="E8F3DC")
    cabecera = PatternFill("solid", fgColor="D9D9D9")
    ajustar = Alignment(wrap_text=True, vertical="top")

    def bloque(fila: int, titulo_bloque: str, filas: list[tuple[str, str]]) -> int:
        """Un título gris y, debajo, una celda verde por dato; devuelve la fila siguiente libre."""
        for col in (1, 2):
            ws.cell(fila, col).fill = cabecera
        ws.cell(fila, 1, titulo_bloque).font = rotulo
        for etiqueta, texto in filas:
            fila += 1
            ws.cell(fila, 1, etiqueta).font = rotulo
            ws.cell(fila, 1).alignment = ajustar
            c = ws.cell(fila, 2, texto)
            c.fill = caja
            c.alignment = ajustar
        return fila + 1

    fila = bloque(1, "A · Pegar en «Predio/planta» (hoja 1 del informe)", [
        ("Sold To // Ship To", sold_to_ship_to(datos)),
    ])
    fila = bloque(fila + 1, "B · Pegar en «OBSERVACIONES ADICIONALES» (hoja final del informe)", [
        ("Solicitud", cadena_solicitud(datos)),
        ("Para", "; ".join(listas.get("para", []))),
        ("CC", "; ".join(listas.get("cc", []))),
        ("CCO", "; ".join(listas.get("bcc", []))),
    ])

    fila += 1
    ws.cell(fila, 1, "Posición de cada dato de la cadena").font = rotulo
    fila += 1
    for col, texto in ((1, "N°"), (2, "Dato")):
        c = ws.cell(fila, col, texto)
        c.font = rotulo
        c.fill = cabecera
    for pos, (_, nombre) in enumerate(CAMPOS_CADENA, 1):
        fila += 1
        ws.cell(fila, 1, pos).alignment = Alignment(horizontal="left")
        ws.cell(fila, 2, nombre)
    return ws


def convertir_al_formato_nuevo(datos: dict[str, Any]) -> dict[str, Any]:
    """Una COPIA de la solicitud con el formato nuevo (hoja «Para el informe»), para descargar
    el Excel de una solicitud que ya salió sin ella. Lo guardado y lo ya enviado no se tocan.
    La lista sale con las reglas vigentes, como cuando se envía el informe
    (`envio_informes.plan_desde_solicitud`). Otros laboratorios quedan igual."""
    from .servicios import MARCA_RESPALDO_RYD, es_tipo_ryd

    if not es_diagnofruit(datos.get("laboratorio")):
        return datos
    nuevo = {**datos, MARCA_HOJA_INFORME: True}
    if not es_tipo_ryd(datos):
        nuevo[MARCA_RESPALDO_RYD] = True
    return nuevo


def marcar(datos: dict[str, Any]) -> None:
    """Solo las solicitudes de Diagnofruit creadas desde ahora llevan la hoja."""
    if es_diagnofruit(datos.get("laboratorio")):
        datos[MARCA_HOJA_INFORME] = True
