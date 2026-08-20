import io
import os
import re
import zipfile
from datetime import date, datetime

import openpyxl
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .db import conexion, cursor_dict
from .gc_parser import NOMBRE_GC_A_CODIGO, es_codigo_puro, parsear_gc_txt
from .informe_pdf import generar_informe_pdf
from .mapeo import LABORATORIO_CATALOGO, calcular_semana
from .solicitud_parser import parsear_solicitudes_html
from .storage import _carpeta_raiz, _nombre_seguro

_PAT_CODIGO_COLUMNA = re.compile(r"\(([A-Za-z]+)\)\s*$")
_PREFIJO_RESULTADO = "Resultado:"

router = APIRouter(prefix="/api/emitir/cromatografia", tags=["emitir"])

CARPETA_SOLICITUDES = "Solicitud de Muestreo"


def _asignar_folios(cur, cantidad: int) -> list[str]:
    """Reserva `cantidad` folios consecutivos LAB-YYYYMMDD-NNN para hoy,
    de forma atómica (INSERT+UPDATE dentro de la misma transacción de
    escritura). El correlativo es por fecha: al cambiar el día vuelve a
    partir en 001."""
    hoy = date.today()
    cur.execute("INSERT INTO informe_folio (fecha, siguiente) VALUES (%s, 1) ON CONFLICT (fecha) DO NOTHING", (hoy,))
    cur.execute(
        "UPDATE informe_folio SET siguiente = siguiente + %s WHERE fecha = %s RETURNING siguiente",
        (cantidad, hoy),
    )
    siguiente_tras = cur.fetchone()["siguiente"]
    primero = siguiente_tras - cantidad
    prefijo = f"LAB-{hoy.strftime('%Y%m%d')}"
    return [f"{prefijo}-{n:03d}" for n in range(primero, siguiente_tras)]


class InformeConfigOut(BaseModel):
    analizado_por_nombre: str
    analizado_por_cargo: str
    aprobado_por_nombre: str
    aprobado_por_cargo: str


@router.get("/config-informe")
def obtener_config_informe() -> InformeConfigOut:
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT analizado_por_nombre, analizado_por_cargo, aprobado_por_nombre, aprobado_por_cargo "
            "FROM informe_config WHERE id = 1"
        )
        fila = cur.fetchone()
        if not fila:
            raise HTTPException(500, "No existe la configuración del informe (falta la migración 0008).")
        return InformeConfigOut(**fila)


@router.put("/config-informe")
def guardar_config_informe(body: InformeConfigOut) -> InformeConfigOut:
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            """
            UPDATE informe_config
            SET analizado_por_nombre = %s, analizado_por_cargo = %s,
                aprobado_por_nombre = %s, aprobado_por_cargo = %s,
                actualizado_en = now()
            WHERE id = 1
            RETURNING analizado_por_nombre, analizado_por_cargo, aprobado_por_nombre, aprobado_por_cargo
            """,
            (
                body.analizado_por_nombre.strip(),
                body.analizado_por_cargo.strip(),
                body.aprobado_por_nombre.strip(),
                body.aprobado_por_cargo.strip(),
            ),
        )
        return InformeConfigOut(**cur.fetchone())


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
    codigo_vial: str | None = None
    fecha_inyeccion: str | None = None


@router.post("/excel")
def generar_excel(filas: list[FilaCruceIn]) -> StreamingResponse:
    if not filas:
        raise HTTPException(400, "No hay filas para exportar.")

    with conexion() as conn, cursor_dict(conn) as cur:
        folios = _asignar_folios(cur, len(filas))

    # Mismas columnas que el archivo de solicitud original, en el mismo orden
    # (unión por si alguna solicitud trae un campo que otra no tiene), más el
    # folio interno al inicio.
    columnas: list[str] = []
    for fila in filas:
        for columna in fila.campos:
            if columna not in columnas:
                columnas.append(columna)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Solicitudes con resultado"

    ws.cell(row=1, column=1, value="N° Informe")
    for col_idx, columna in enumerate(columnas, start=2):
        ws.cell(row=1, column=col_idx, value=columna)

    for fila_idx, (fila, folio) in enumerate(zip(filas, folios), start=2):
        ws.cell(row=fila_idx, column=1, value=folio)
        for col_idx, columna in enumerate(columnas, start=2):
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


def _nombre_informe(campos: dict[str, str]) -> str:
    n_solicitud = (campos.get("N° Solicitud") or "solicitud").replace("/", "-")
    return f"Informe_{n_solicitud}.pdf"


@router.post("/informes-pdf")
def generar_informes_pdf(filas: list[FilaCruceIn]) -> StreamingResponse:
    if not filas:
        raise HTTPException(400, "No hay filas para exportar.")

    with conexion() as conn, cursor_dict(conn) as cur:
        folios = _asignar_folios(cur, len(filas))
        cur.execute(
            "SELECT analizado_por_nombre, analizado_por_cargo, aprobado_por_nombre, aprobado_por_cargo "
            "FROM informe_config WHERE id = 1"
        )
        config_fila = cur.fetchone() or {}

    def _generar(fila: FilaCruceIn, folio: str) -> bytes:
        return generar_informe_pdf(
            campos=fila.campos,
            analitos_solicitados=fila.analitos_solicitados,
            resultados_por_codigo=fila.resultados_por_codigo,
            codigo_vial=fila.codigo_vial,
            fecha_inyeccion=fila.fecha_inyeccion,
            folio=folio,
            analizado_por_nombre=config_fila.get("analizado_por_nombre") or "",
            analizado_por_cargo=config_fila.get("analizado_por_cargo") or "",
            aprobado_por_nombre=config_fila.get("aprobado_por_nombre") or "",
            aprobado_por_cargo=config_fila.get("aprobado_por_cargo") or "",
        )

    if len(filas) == 1:
        fila = filas[0]
        pdf_bytes = _generar(fila, folios[0])
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{_nombre_informe(fila.campos)}"'},
        )

    # Varias solicitudes cruzadas a la vez: un PDF por cada una, empaquetados
    # en un único zip para descargar de una sola vez.
    buffer = io.BytesIO()
    usados: set[str] = set()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for fila, folio in zip(filas, folios):
            pdf_bytes = _generar(fila, folio)
            base, ext = os.path.splitext(_nombre_informe(fila.campos))
            nombre, n = f"{base}{ext}", 2
            while nombre in usados:
                nombre, n = f"{base} ({n}){ext}", n + 1
            usados.add(nombre)
            zf.writestr(nombre, pdf_bytes)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="informes_cromatografia.zip"'},
    )


# ---------------------------------------------------------------------------
# Subir a base de datos: la fila cruzada (solicitud + resultado del GC ya
# validado, sin cruces sospechosos) pasa a ser un registro real de `solicitud`
# + `resultado`, visible en Report/DataCore igual que cualquier otro dato
# cargado por Ingest. Se identifica con NUESTRO folio (LAB-YYYYMMDD-NNN) en
# vez del N° de solicitud original -así el registro queda trazado al informe
# que se emitió, no al papeleo de origen-.
# ---------------------------------------------------------------------------

TIPO_SERVICIO_CROMATOGRAFIA = "Cromatografía"


def _parse_fecha(texto: str | None, formato: str) -> date | None:
    if not texto:
        return None
    try:
        return datetime.strptime(texto.strip(), formato).date()
    except ValueError:
        return None


def _fecha_ddmmyyyy(texto: str | None) -> date | None:
    """'18-08-2026' o '19-08-2026 14:59' -> solo la fecha, se descarta la hora
    (la tabla solicitud guarda DATE, no timestamp, para estos campos)."""
    if not texto:
        return None
    return _parse_fecha(texto, "%d-%m-%Y %H:%M") or _parse_fecha(texto, "%d-%m-%Y")


def _fecha_inyeccion_gc(texto: str | None) -> date | None:
    """Formato de Agilent ChemStation: '7/25/2026 9:14:59 AM'."""
    return _parse_fecha(texto, "%m/%d/%Y %I:%M:%S %p")


class FilaSubidaOut(BaseModel):
    nro_solicitud_original: str
    codigo_vial: str | None
    estado: str  # 'creada' | 'ya_existia' | 'error'
    folio: str | None = None
    mensaje: str | None = None


def _resolver_cliente_planta(cur, sold_to: str | None, ship_to: str | None) -> tuple[int | None, int | None, str | None]:
    """Nunca crea cliente/planta nuevos acá -eso es responsabilidad exclusiva
    del catálogo oficial (Listados, ver catalogo.py)-: si el Sold To/Ship To
    de la solicitud no calza exacto con algo ya cargado ahí, se rechaza con un
    mensaje claro en vez de inventar un cliente nuevo silenciosamente."""
    if not sold_to:
        return None, None, "La solicitud no trae Sold To: no se puede subir a la base de datos."
    cur.execute("SELECT id FROM cliente WHERE nombre = %s AND activo", (sold_to,))
    cliente = cur.fetchone()
    if not cliente:
        return None, None, f'Sold To "{sold_to}" no está en el catálogo (Listados). Agrégalo ahí primero.'
    cliente_id = cliente["id"]
    if not ship_to:
        return cliente_id, None, None
    cur.execute("SELECT id FROM planta WHERE cliente_id = %s AND nombre = %s AND activo", (cliente_id, ship_to))
    planta = cur.fetchone()
    if not planta:
        return None, None, f'Ship To "{ship_to}" no está en el catálogo (Listados) para el Sold To "{sold_to}". Agrégalo ahí primero.'
    return cliente_id, planta["id"], None


@router.post("/subir-bd")
def subir_bd(filas: list[FilaCruceIn]) -> list[FilaSubidaOut]:
    if not filas:
        raise HTTPException(400, "No hay filas para subir.")

    salida: list[FilaSubidaOut] = []
    con_folio: list[tuple[FilaCruceIn, str, int | None]] = []

    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        for fila in filas:
            nro_original = fila.campos.get("N° Solicitud") or "—"
            codigo_vial = fila.codigo_vial

            # Ya se subió antes: misma solicitud original + mismo vial ya tiene
            # un registro (referencia/nro_orden), así que no se duplica -clic
            # repetido al botón, o volver a cruzar lo mismo por accidente-.
            cur.execute(
                "SELECT nro_solicitud FROM solicitud WHERE referencia = %s AND nro_orden = %s AND laboratorio = %s",
                (nro_original, codigo_vial, LABORATORIO_CATALOGO),
            )
            existente = cur.fetchone()
            if existente:
                salida.append(
                    FilaSubidaOut(
                        nro_solicitud_original=nro_original,
                        codigo_vial=codigo_vial,
                        estado="ya_existia",
                        folio=existente["nro_solicitud"],
                        mensaje="Esta solicitud y vial ya se habían subido antes; no se duplicó.",
                    )
                )
                continue

            cliente_id, planta_id, error = _resolver_cliente_planta(
                cur, fila.campos.get("Sold To (Nombre)"), fila.campos.get("Ship To (Nombre)")
            )
            if error:
                salida.append(
                    FilaSubidaOut(nro_solicitud_original=nro_original, codigo_vial=codigo_vial, estado="error", mensaje=error)
                )
                continue

            con_folio.append((fila, nro_original, planta_id))

        if con_folio:
            folios = _asignar_folios(cur, len(con_folio))
            for (fila, nro_original, planta_id), folio in zip(con_folio, folios):
                fecha_muestreo = _fecha_ddmmyyyy(fila.campos.get("Fecha Muestreo"))
                datos_solicitud = {
                    "nro_solicitud": folio,
                    "laboratorio": LABORATORIO_CATALOGO,
                    "fecha_solicitud": _fecha_ddmmyyyy(fila.campos.get("Fecha Solicitud")),
                    "fecha_muestreo": fecha_muestreo,
                    "fecha_analisis": _fecha_inyeccion_gc(fila.fecha_inyeccion),
                    "fecha_informe": date.today(),
                    "planta_id": planta_id,
                    "sold_to_raw": fila.campos.get("Sold To (Nombre)"),
                    "ship_to_raw": fila.campos.get("Ship To (Nombre)") or None,
                    "especie": fila.campos.get("Especie") or None,
                    "variedad": fila.campos.get("Variedad") or None,
                    "tipo_muestra": fila.campos.get("Tipo Muestra") or None,
                    "tipo_servicio": TIPO_SERVICIO_CROMATOGRAFIA,
                    "lote": fila.campos.get("Lote") or None,
                    "solicitante": fila.campos.get("Solicitante") or None,
                    "nombre_muestreador": fila.campos.get("Nombre Muestreador") or None,
                    "generado_por": fila.campos.get("Generado Por") or None,
                    "email_solicitante": fila.campos.get("Email Solicitante") or None,
                    "nro_orden": fila.codigo_vial,
                    "referencia": nro_original,
                    "observacion": fila.campos.get("Producto Utilizado") or None,
                    "semana_muestreo": calcular_semana(fecha_muestreo.isoformat()) if fecha_muestreo else None,
                    "mes": fecha_muestreo.month if fecha_muestreo else None,
                    "origen": "emitir_cromatografia",
                }
                columnas = list(datos_solicitud.keys())
                placeholders = ", ".join(["%s"] * len(columnas))
                cur.execute(
                    f"INSERT INTO solicitud ({', '.join(columnas)}) VALUES ({placeholders}) RETURNING id",
                    [datos_solicitud[c] for c in columnas],
                )
                solicitud_id = cur.fetchone()["id"]

                for codigo in fila.analitos_solicitados:
                    valor = fila.resultados_por_codigo.get(codigo)
                    cur.execute("SELECT id FROM analito WHERE codigo = %s AND laboratorio = %s", (codigo, LABORATORIO_CATALOGO))
                    analito = cur.fetchone()
                    cur.execute(
                        """INSERT INTO resultado (solicitud_id, analito_id, analito_raw, valor_num)
                           VALUES (%s, %s, %s, %s)
                           ON CONFLICT (solicitud_id, analito_id) DO NOTHING""",
                        (solicitud_id, analito["id"] if analito else None, None if analito else codigo, valor),
                    )

                salida.append(
                    FilaSubidaOut(nro_solicitud_original=nro_original, codigo_vial=fila.codigo_vial, estado="creada", folio=folio)
                )

    return salida
