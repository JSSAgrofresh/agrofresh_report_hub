import io
import os
import re

import openpyxl
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .gc_parser import NOMBRE_GC_A_CODIGO, es_codigo_puro, parsear_gc_txt
from .solicitud_parser import parsear_solicitudes_html
from .storage import _carpeta_raiz, _nombre_seguro

_PAT_CODIGO_COLUMNA = re.compile(r"\(([A-Za-z]+)\)\s*$")
_PREFIJO_RESULTADO = "Resultado:"

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
    """Una solicitud ya cruzada con su vial del GC: sus campos originales tal
    cual (mismas columnas que el archivo de Storage), qué analitos pidió, y el
    resultado (amount/ppm) por código de analito detectado en el vial
    asignado."""

    campos: dict[str, str]
    analitos_solicitados: list[str]
    resultados_por_codigo: dict[str, float | None]


@router.post("/excel")
def generar_excel(filas: list[FilaCruceIn]) -> StreamingResponse:
    if not filas:
        raise HTTPException(400, "No hay filas para exportar.")

    # Mismas columnas que el archivo de solicitud original, en el mismo orden
    # (unión por si alguna solicitud trae un campo que otra no tiene).
    columnas: list[str] = []
    for fila in filas:
        for columna in fila.campos:
            if columna not in columnas:
                columnas.append(columna)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Solicitudes con resultado"

    for col_idx, columna in enumerate(columnas, start=1):
        ws.cell(row=1, column=col_idx, value=columna)

    for fila_idx, fila in enumerate(filas, start=2):
        for col_idx, columna in enumerate(columnas, start=1):
            valor: str | float | None = fila.campos.get(columna, "") or None
            if columna.startswith(_PREFIJO_RESULTADO):
                # Nunca se escribe el resultado de un analito que esta
                # solicitud no pidió, aunque el vial asignado sí lo haya
                # detectado -es la regla explícita: solicitud y resultado
                # siempre tienen los mismos analitos, sin excepción-.
                m = _PAT_CODIGO_COLUMNA.search(columna)
                codigo = m.group(1).upper() if m else None
                valor = fila.resultados_por_codigo.get(codigo) if codigo and codigo in fila.analitos_solicitados else None
            ws.cell(row=fila_idx, column=col_idx, value=valor)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=resultados_cromatografia.xlsx"},
    )
