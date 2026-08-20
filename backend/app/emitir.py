import io
import os

import openpyxl
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .gc_parser import NOMBRE_GC_A_CODIGO, es_codigo_puro, parsear_gc_txt
from .solicitud_parser import parsear_solicitudes_html
from .storage import _carpeta_raiz, _nombre_seguro

router = APIRouter(prefix="/api/emitir/cromatografia", tags=["emitir"])

CARPETA_SOLICITUDES = "Solicitud de Muestreo"


class ResultadoAnalitoOut(BaseModel):
    analito: str
    codigo: str | None
    area: float | None
    amount: float | None


class MuestraGCOut(BaseModel):
    codigo: str
    seq_line: int | None
    fecha_inyeccion: str | None
    resultados: list[ResultadoAnalitoOut]


@router.post("/parsear-gc")
async def parsear_gc(archivo: UploadFile = File(...)) -> list[MuestraGCOut]:
    contenido = await archivo.read()
    try:
        muestras = parsear_gc_txt(contenido)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if not muestras:
        raise HTTPException(400, "No se encontró ninguna muestra en el archivo. ¿Es el reporte del GC correcto?")

    # Solo los viales con código puro (ej. GCNPD9826) son muestras reales de
    # cliente cruzables: se descartan curvas de calibración, blancos y
    # controles de limpieza (ej. "GCNPD9775 LIMPIEZA NORMAL MET 2").
    muestras_reales = [m for m in muestras if es_codigo_puro(m.codigo)]
    if not muestras_reales:
        raise HTTPException(
            400,
            "El archivo se leyó bien pero ninguna muestra tiene un código puro "
            "(ej. GCNPD9826) — solo se encontraron curvas, blancos o controles.",
        )

    return [
        MuestraGCOut(
            codigo=m.codigo,
            seq_line=m.seq_line,
            fecha_inyeccion=m.fecha_inyeccion,
            resultados=[
                ResultadoAnalitoOut(
                    analito=r.analito,
                    codigo=NOMBRE_GC_A_CODIGO.get(r.analito),
                    area=r.area,
                    amount=r.amount,
                )
                for r in m.resultados
            ],
        )
        for m in muestras_reales
    ]


class SolicitudOut(BaseModel):
    archivo: str
    campos: dict[str, str]
    analitos_solicitados: list[str]


@router.get("/solicitudes")
def listar_solicitudes() -> list[SolicitudOut]:
    carpeta = os.path.join(_carpeta_raiz(), CARPETA_SOLICITUDES)
    if not os.path.isdir(carpeta):
        raise HTTPException(404, f'No existe la carpeta "{CARPETA_SOLICITUDES}" en Storage.')

    salida = []
    for nombre in sorted(os.listdir(carpeta)):
        ruta = os.path.join(carpeta, _nombre_seguro(nombre))
        if not os.path.isfile(ruta):
            continue
        try:
            with open(ruta, encoding="utf-8-sig") as f:
                contenido = f.read()
            solicitudes = parsear_solicitudes_html(contenido)
        except (UnicodeDecodeError, ValueError):
            continue
        for s in solicitudes:
            salida.append(SolicitudOut(archivo=nombre, campos=s.campos, analitos_solicitados=s.analitos_solicitados))
    return salida


class FilaCruceIn(BaseModel):
    codigo: str
    archivo_solicitud: str | None = None
    n_solicitud: str | None = None
    seq_line: int | None = None
    fecha_inyeccion: str | None = None
    resultados: list[ResultadoAnalitoOut]


@router.post("/excel")
def generar_excel(filas: list[FilaCruceIn]) -> StreamingResponse:
    if not filas:
        raise HTTPException(400, "No hay filas para exportar.")

    codigos_analito: list[str] = []
    for fila in filas:
        for r in fila.resultados:
            clave = r.codigo or r.analito
            if clave not in codigos_analito:
                codigos_analito.append(clave)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Resultados GC"

    ws.cell(row=1, column=1, value="N° Solicitud")
    ws.cell(row=1, column=2, value="Código GC")
    ws.cell(row=1, column=3, value="Archivo solicitud")
    ws.cell(row=1, column=4, value="Fecha inyección")
    col = 5
    for codigo in codigos_analito:
        ws.merge_cells(start_row=1, start_column=col, end_row=1, end_column=col + 1)
        ws.cell(row=1, column=col, value=codigo)
        ws.cell(row=2, column=col, value="Area")
        ws.cell(row=2, column=col + 1, value="Amount")
        col += 2

    fila_excel = 3
    for fila in filas:
        ws.cell(row=fila_excel, column=1, value=fila.n_solicitud)
        ws.cell(row=fila_excel, column=2, value=fila.codigo)
        ws.cell(row=fila_excel, column=3, value=fila.archivo_solicitud)
        ws.cell(row=fila_excel, column=4, value=fila.fecha_inyeccion)
        por_codigo = {(r.codigo or r.analito): r for r in fila.resultados}
        col = 5
        for codigo in codigos_analito:
            r = por_codigo.get(codigo)
            if r:
                ws.cell(row=fila_excel, column=col, value=r.area)
                ws.cell(row=fila_excel, column=col + 1, value=r.amount)
            col += 2
        fila_excel += 1

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=resultados_cromatografia.xlsx"},
    )
