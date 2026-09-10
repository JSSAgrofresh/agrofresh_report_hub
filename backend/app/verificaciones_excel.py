"""
Los dos Excel del módulo de Verificaciones diarias.

    libro_del_dia       el formulario de un día, para imprimir y firmar.
                        Reemplaza a la hoja «Formulario_Impresion».
    libro_historico     resumen diario + una hoja por sección.
                        Reemplaza a las siete hojas de histórico que la macro
                        del libro anterior mantenía a mano.

El sistema deja de necesitar Excel para funcionar, pero el laboratorio sigue
necesitando un papel firmado y un archivo que mandar: eso es lo que sale de
acá. Los colores son los mismos que usa `solicitud_excel.py`, para que un
documento del sistema se vea siempre igual venga de donde venga.
"""
from __future__ import annotations

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.worksheet import Worksheet

from .solicitud_excel import GRIS_LINEA, GRIS_TEXTO, VERDE_CLARO, VERDE_OSCURO

_BORDE = Border(*(Side(style="thin", color=GRIS_LINEA),) * 4)
_ROJO = "B0271F"
_VERDE_OK = "2F7D32"


def _titulo(ws: Worksheet, fila: int, texto: str, columnas: int) -> int:
    ws.merge_cells(start_row=fila, start_column=1, end_row=fila, end_column=columnas)
    celda = ws.cell(row=fila, column=1, value=texto)
    celda.font = Font(bold=True, size=11, color=VERDE_OSCURO)
    celda.fill = PatternFill("solid", fgColor=VERDE_CLARO)
    celda.alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[fila].height = 20
    return fila + 1


def _encabezados(ws: Worksheet, fila: int, textos: list[str]) -> int:
    for i, texto in enumerate(textos, start=1):
        celda = ws.cell(row=fila, column=i, value=texto)
        celda.font = Font(bold=True, size=9, color="FFFFFF")
        celda.fill = PatternFill("solid", fgColor=VERDE_OSCURO)
        celda.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        celda.border = _BORDE
    ws.row_dimensions[fila].height = 26
    return fila + 1


def _fila(ws: Worksheet, fila: int, valores: list, columna_resultado: int | None = None) -> int:
    for i, valor in enumerate(valores, start=1):
        celda = ws.cell(row=fila, column=i, value=valor)
        celda.border = _BORDE
        celda.alignment = Alignment(horizontal="center" if i > 1 else "left", vertical="center")
        # El veredicto se lee de un vistazo: es lo único que se colorea.
        if columna_resultado == i and isinstance(valor, str) and valor:
            celda.font = Font(bold=True, color=_ROJO if valor.startswith("No") else _VERDE_OK)
    return fila + 1


def _anchos(ws: Worksheet, anchos: list[int]) -> None:
    for i, ancho in enumerate(anchos, start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = ancho


def _n(valor) -> str:
    """8.0 -> «8», 1.2 -> «1,2». Un criterio impreso como «± 8.0 µL» se lee
    como si tuviera una precisión que no tiene."""
    if valor is None:
        return ""
    if float(valor).is_integer():
        return str(int(valor))
    return str(valor)


def _analista(mediciones) -> str:
    """El analista de la sección. Se guarda por medición porque puede cambiar
    a mitad de una sección; para mostrarlo basta el primero que haya."""
    for m in mediciones:
        if m.analista:
            return m.analista
    return ""


def libro_del_dia(registro) -> Workbook:
    wb = Workbook()
    ws = wb.active
    ws.title = "Verificación diaria"
    _anchos(ws, [34, 15, 13, 13, 13, 15, 26, 16])

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=8)
    encabezado = ws.cell(
        row=1, column=1, value="Registro de verificaciones diarias — Laboratorio de Cromatografía AgroFresh"
    )
    encabezado.font = Font(bold=True, size=13, color=VERDE_OSCURO)
    encabezado.alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 24

    fila = 3
    for etiqueta, valor in (
        ("Fecha", registro.fecha.strftime("%d-%m-%Y")),
        ("Temperatura del agua (°C)", registro.temperatura_agua),
        ("Factor Z (µL/mg)", registro.factor_z),
        ("Resultado del día", registro.resultado),
    ):
        c1 = ws.cell(row=fila, column=1, value=etiqueta)
        c1.font = Font(bold=True, size=9.5, color=GRIS_TEXTO)
        c2 = ws.cell(row=fila, column=2, value=valor)
        if etiqueta == "Resultado del día" and isinstance(valor, str):
            c2.font = Font(bold=True, color=_ROJO if valor.startswith("No") else _VERDE_OK)
        fila += 1
    fila += 1

    fila = _titulo(ws, fila, f"1. MICROPIPETAS — verificación gravimétrica    ·    Analista: {_analista(registro.micropipetas)}", 8)
    fila = _encabezados(ws, fila, ["Equipo", "Vol. nominal (µL)", "Peso 1 (mg)", "Peso 2 (mg)", "Peso 3 (mg)", "Vol. medio (µL)", "Criterio", "Resultado"])
    for m in registro.micropipetas:
        fila = _fila(ws, fila, [m.nombre, m.volumen_nominal, m.peso_1, m.peso_2, m.peso_3, m.volumen_medio, f"± {_n(m.tolerancia)} µL", m.resultado], 8)
    fila += 1

    fila = _titulo(ws, fila, f"2. BALANZA ANALÍTICA — pesas patrón    ·    Analista: {_analista(registro.balanza)}", 8)
    fila = _encabezados(ws, fila, ["Pesa patrón", "Valor nominal (g)", "Lectura 1", "Lectura 2", "Lectura 3", "Promedio", "Criterio", "Resultado"])
    for b in registro.balanza:
        fila = _fila(ws, fila, [b.nombre, b.valor_nominal, b.lectura_1, b.lectura_2, b.lectura_3, b.promedio, f"± {_n(b.tolerancia)} g", b.resultado], 8)
    fila += 1

    fila = _titulo(ws, fila, f"3. TEMPERATURA    ·    Analista: {_analista(registro.temperaturas)}", 8)
    fila = _encabezados(ws, fila, ["Punto de control", "Lectura (°C)", "", "", "", "", "Criterio", "Resultado"])
    for t in registro.temperaturas:
        fila = _fila(ws, fila, [t.nombre, t.lectura, None, None, None, None, f"{_n(t.minimo)} a {_n(t.maximo)} °C", t.resultado], 8)
    fila += 1

    fila = _titulo(ws, fila, f"4. PRESIÓN DE GASES    ·    Analista: {_analista(registro.gases)}", 8)
    fila = _encabezados(ws, fila, ["Gas", "Código del cilindro", "P. contenido (psi)", "P. trabajo (psi)", "", "", "Criterio", "Resultado"])
    for g in registro.gases:
        fila = _fila(ws, fila, [g.nombre, g.codigo_cilindro, g.presion_contenido, g.presion_trabajo, None, None, "", g.resultado], 8)
    fila = _fila(ws, fila, ["¿Fugas visibles en alguna conexión?", registro.fugas_visibles, None, None, None, None, "Debe ser No", registro.resultado_fugas], 8)
    fila += 1

    i, d = registro.inyector, registro.detector
    fila = _titulo(ws, fila, f"5. INYECTOR    ·    Analista: {i.analista}", 8)
    fila = _encabezados(ws, fila, ["Parámetro", "Respuesta", "", "", "", "", "Criterio", "Resultado"])
    for etiqueta, valor, criterio in (
        ("Limpieza de aguja realizada", i.limpieza_aguja, "Sí"),
        ("¿Aguja dañada?", i.aguja_danada, "No"),
        ("Aguja reemplazada", i.aguja_reemplazada, "Sí / No / N.A."),
        ("Cambio de septa realizado", i.cambio_septa, "Sí / No / N.A."),
    ):
        fila = _fila(ws, fila, [etiqueta, valor, None, None, None, None, criterio, ""], 8)
    fila = _fila(ws, fila, ["Resultado de la sección", None, None, None, None, None, "", i.resultado], 8)
    fila += 1

    fila = _titulo(ws, fila, f"6. DETECTOR Y MÉTODO    ·    Analista: {d.analista}", 8)
    fila = _encabezados(ws, fila, ["Parámetro", "Valor", "", "", "", "", "Criterio", "Resultado"])
    for etiqueta, valor, resultado in (
        ("Voltaje de la perla (V)", d.voltaje_perla, d.resultado_voltaje),
        ("Método correcto cargado", d.metodo_correcto, d.resultado_metodo),
        ("Output del detector", d.output_detector, d.resultado_output),
    ):
        fila = _fila(ws, fila, [etiqueta, valor, None, None, None, None, "", resultado], 8)
    fila += 2

    for etiqueta, valor in (("Observaciones", registro.observaciones), ("Revisado por", registro.revisado_por)):
        celda = ws.cell(row=fila, column=1, value=etiqueta)
        celda.font = Font(bold=True, size=9.5, color=GRIS_TEXTO)
        ws.merge_cells(start_row=fila, start_column=2, end_row=fila, end_column=8)
        ws.cell(row=fila, column=2, value=valor).alignment = Alignment(wrap_text=True, vertical="top")
        fila += 2

    return wb


# Cada hoja de histórico: cómo se llama, de dónde salen sus filas y qué
# columnas tiene. Tenerlo como datos y no como seis funciones casi iguales es
# lo que hace que agregar una columna sea una línea.
_HOJAS = [
    (
        "Micropipetas",
        "micropipetas",
        ["Fecha", "Analista", "Equipo", "Vol. nominal (µL)", "Temp. agua (°C)", "Z (µL/mg)",
         "Peso 1 (mg)", "Peso 2 (mg)", "Peso 3 (mg)", "Vol. medio (µL)", "Error sist. (%)",
         "Desv. (µL)", "Tolerancia (µL)", "Resultado"],
        lambda r, m: [r.fecha, m.analista, m.nombre, m.volumen_nominal, r.temperatura_agua,
                      r.factor_z, m.peso_1, m.peso_2, m.peso_3, m.volumen_medio, m.error_pct,
                      m.desviacion, m.tolerancia, m.resultado],
    ),
    (
        "Balanza",
        "balanza",
        ["Fecha", "Analista", "Pesa patrón", "Valor nominal (g)", "Lectura 1", "Lectura 2",
         "Lectura 3", "Promedio", "Desviación", "Tolerancia", "Resultado"],
        lambda r, m: [r.fecha, m.analista, m.nombre, m.valor_nominal, m.lectura_1, m.lectura_2,
                      m.lectura_3, m.promedio, m.desviacion, m.tolerancia, m.resultado],
    ),
    (
        "Temperatura",
        "temperaturas",
        ["Fecha", "Analista", "Punto de control", "Lectura (°C)", "Mínimo", "Máximo", "Resultado"],
        lambda r, m: [r.fecha, m.analista, m.nombre, m.lectura, m.minimo, m.maximo, m.resultado],
    ),
    (
        "Gases",
        "gases",
        ["Fecha", "Analista", "Gas", "Código cilindro", "P. contenido (psi)", "P. trabajo (psi)",
         "¿Fugas visibles?", "Resultado"],
        lambda r, m: [r.fecha, m.analista, m.nombre, m.codigo_cilindro, m.presion_contenido,
                      m.presion_trabajo, r.fugas_visibles, m.resultado],
    ),
]


def libro_historico(registros: list) -> Workbook:
    wb = Workbook()

    ws = wb.active
    ws.title = "Resumen diario"
    _anchos(ws, [13, 15, 13, 15, 12, 13, 18, 17, 40, 22])
    fila = _encabezados(ws, 1, ["Fecha", "Micropipetas", "Balanza", "Temperatura", "Gases",
                                "Inyector", "Detector y método", "Resultado del día",
                                "Observaciones", "Revisado por"])
    for r in registros:
        s = r.resultados_seccion
        fila = _fila(ws, fila, [r.fecha, s.get("micropipetas"), s.get("balanza"),
                                s.get("temperatura"), s.get("gases"), s.get("inyector"),
                                s.get("detector"), r.resultado, r.observaciones, r.revisado_por], 8)

    for titulo, atributo, columnas, construir in _HOJAS:
        hoja = wb.create_sheet(titulo)
        _anchos(hoja, [13] + [16] * (len(columnas) - 1))
        fila = _encabezados(hoja, 1, columnas)
        for r in registros:
            for m in getattr(r, atributo):
                fila = _fila(hoja, fila, construir(r, m), len(columnas))

    hoja = wb.create_sheet("Inyector")
    _anchos(hoja, [13, 18, 18, 16, 18, 18, 30, 14])
    fila = _encabezados(hoja, 1, ["Fecha", "Analista", "Limpieza aguja", "¿Aguja dañada?",
                                  "Aguja reemplazada", "Cambio de septa", "Observaciones", "Resultado"])
    for r in registros:
        i = r.inyector
        fila = _fila(hoja, fila, [r.fecha, i.analista, i.limpieza_aguja, i.aguja_danada,
                                  i.aguja_reemplazada, i.cambio_septa, i.observaciones, i.resultado], 8)

    hoja = wb.create_sheet("Detector y método")
    _anchos(hoja, [13, 18, 17, 14, 18, 14, 16, 14, 14])
    fila = _encabezados(hoja, 1, ["Fecha", "Analista", "Voltaje perla (V)", "Resultado",
                                  "Método correcto", "Resultado", "Output", "Resultado",
                                  "Resultado general"])
    for r in registros:
        d = r.detector
        fila = _fila(hoja, fila, [r.fecha, d.analista, d.voltaje_perla, d.resultado_voltaje,
                                  d.metodo_correcto, d.resultado_metodo, d.output_detector,
                                  d.resultado_output, d.resultado], 9)

    return wb
