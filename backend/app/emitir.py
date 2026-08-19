import io

import openpyxl
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .gc_parser import parsear_gc_txt

router = APIRouter(prefix="/api/emitir/cromatografia", tags=["emitir"])


class ResultadoAnalitoOut(BaseModel):
    analito: str
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
    return [
        MuestraGCOut(
            codigo=m.codigo,
            seq_line=m.seq_line,
            fecha_inyeccion=m.fecha_inyeccion,
            resultados=[ResultadoAnalitoOut(analito=r.analito, area=r.area, amount=r.amount) for r in m.resultados],
        )
        for m in muestras
    ]


class FilaCruceIn(BaseModel):
    codigo: str
    archivo_solicitud: str | None = None
    seq_line: int | None = None
    fecha_inyeccion: str | None = None
    resultados: list[ResultadoAnalitoOut]


@router.post("/excel")
def generar_excel(filas: list[FilaCruceIn]) -> StreamingResponse:
    if not filas:
        raise HTTPException(400, "No hay filas para exportar.")

    analitos: list[str] = []
    for fila in filas:
        for r in fila.resultados:
            if r.analito not in analitos:
                analitos.append(r.analito)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Resultados GC"

    ws.cell(row=1, column=1, value="Código")
    ws.cell(row=1, column=2, value="Archivo solicitud")
    ws.cell(row=1, column=3, value="Seq Line")
    ws.cell(row=1, column=4, value="Fecha inyección")
    col = 5
    for analito in analitos:
        ws.merge_cells(start_row=1, start_column=col, end_row=1, end_column=col + 1)
        ws.cell(row=1, column=col, value=analito)
        ws.cell(row=2, column=col, value="Area")
        ws.cell(row=2, column=col + 1, value="Amount")
        col += 2

    fila_excel = 3
    for fila in filas:
        ws.cell(row=fila_excel, column=1, value=fila.codigo)
        ws.cell(row=fila_excel, column=2, value=fila.archivo_solicitud)
        ws.cell(row=fila_excel, column=3, value=fila.seq_line)
        ws.cell(row=fila_excel, column=4, value=fila.fecha_inyeccion)
        por_analito = {r.analito: r for r in fila.resultados}
        col = 5
        for analito in analitos:
            r = por_analito.get(analito)
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
