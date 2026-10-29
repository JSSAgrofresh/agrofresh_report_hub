"""
Panel de control interno: panel de solicitudes emitidas vs. informes recibidos, y las
carpetas de auditoría (bucket "auditoria" de R2) donde quedan los PDF.

No confundir con `auditoria.py` (prefijo /api/auditoria), que es la auditoría
de HOMOGENIZACIÓN de la base y vive en DataCore. Éste es /api/auditoria-interna.

Quién entra:

  - El panel y las carpetas: el admin general, y quien tenga el módulo
    `auditoria_interna` asignado. Gerencia NO lo ve salvo que se lo asignen.
  - Editar (fecha de envío, renombrar, borrar): solo el admin general.
  - Subir un PDF y ver las OT abiertas: cualquier cuenta interna. Lo usa
    Converter, que no tiene por qué ser gente de auditoría.

Una solicitud emitida (`solicitud_archivo`) está "concretada" cuando tiene su
PDF guardado Y sus resultados ya se ven en Report (`solicitud.nro_solicitud`).
El amarre OT <-> informe lo confirma quien sube el informe en Converter: el PDF
del laboratorio trae SU número de informe, no nuestro OT-xxxx.
"""
import logging
import unicodedata
from contextlib import contextmanager
from datetime import datetime
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from . import informes_storage
from . import r2_auditoria as r2a
from .auth import Usuario, planta_permitida, solo_admin_general, usuario_actual
from .db import conexion, cursor_dict
from .pdf_permisos import sin_restricciones

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auditoria-interna", tags=["auditoria-interna"])

MODULO = "auditoria_interna"
MAX_PDF_BYTES = 25 * 1024 * 1024


def puede_auditoria(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    if usuario.tipoAcceso == "admin_general":
        return usuario
    if usuario.tipoAcceso != "cliente" and MODULO in (usuario.modulos or []):
        return usuario
    raise HTTPException(403, "No tienes acceso al módulo del Panel de control interno.")


def _exigir_r2() -> None:
    if not r2a.disponible():
        raise HTTPException(
            503,
            "R2 no está configurado en el servidor: faltan las llaves de R2 en el .env del backend.",
        )


@contextmanager
def errores_r2():
    """Traduce los fallos de R2 a un mensaje que diga QUÉ arreglar.

    Sin esto, un 403 de Cloudflare -el token no tiene permiso sobre el bucket-
    salía como un 500 «ClientError» sin más, y quien subía el informe veía que
    "no pasó nada". Un 502 con la causa en español llega hasta la pantalla.
    """
    try:
        yield
    except ClientError as exc:
        codigo = str(exc.response.get("Error", {}).get("Code", ""))
        bucket = r2a.config.R2_AUDITORIA_BUCKET + (f"/{r2a.config.R2_AUDITORIA_PREFIJO}" if r2a.config.R2_AUDITORIA_PREFIJO else "")
        logger.exception("R2 (auditoría) respondió %s", codigo)
        if codigo in ("403", "AccessDenied", "Forbidden", "InvalidAccessKeyId", "SignatureDoesNotMatch"):
            detalle = (
                f"Cloudflare rechazó el acceso al bucket «{bucket}» ({codigo}): el token de R2 no tiene "
                "permiso sobre ese bucket. Dale permiso de lectura y escritura de objetos en Cloudflare, "
                "o define R2_AUDITORIA_ACCESS_KEY_ID y R2_AUDITORIA_SECRET_ACCESS_KEY en el .env del backend."
            )
        elif codigo in ("NoSuchBucket", "404") and "bucket" in str(exc).lower():
            detalle = f"El bucket «{bucket}» no existe en Cloudflare R2: créalo con ese nombre."
        else:
            detalle = f"R2 respondió un error ({codigo or 'desconocido'}) al usar el bucket «{bucket}»."
        raise HTTPException(502, detalle)
    except BotoCoreError as exc:
        logger.exception("No se pudo hablar con R2 (auditoría)")
        raise HTTPException(502, f"No se pudo conectar con R2: {exc}")


def _zona() -> ZoneInfo | None:
    try:
        return ZoneInfo("America/Santiago")
    except ZoneInfoNotFoundError:
        return None


def parsear_fecha_envio(texto: str | None) -> datetime | None:
    """La fecha y hora de envío que escribió una persona. Vacío = sin fecha.

    Si viene sin zona horaria se toma como hora de Chile: es la que escribe
    quien está en la oficina, y guardarla como UTC correría la hora.
    """
    limpio = (texto or "").strip()
    if not limpio:
        return None
    try:
        fecha = datetime.fromisoformat(limpio.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, f"Fecha de envío inválida: {texto!r}")
    if fecha.tzinfo is None:
        zona = _zona()
        if zona is not None:
            fecha = fecha.replace(tzinfo=zona)
    return fecha


def _disposicion(nombre: str) -> str:
    # Los encabezados HTTP no son UTF-8 (ver CLAUDE.md): filename* + un filename sin tildes.
    ascii_seguro = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode() or "informe.pdf"
    ascii_seguro = ascii_seguro.replace('"', "")
    return f"attachment; filename=\"{ascii_seguro}\"; filename*=UTF-8''{quote(nombre)}"


def _respuesta_pdf(datos: bytes, nombre: str) -> Response:
    return Response(
        content=sin_restricciones(datos),
        media_type="application/pdf",
        headers={"Content-Disposition": _disposicion(nombre)},
    )


# ── Converter: subir un PDF y ver las OT abiertas ───────────────────────

@router.get("/solicitudes-abiertas")
def solicitudes_abiertas() -> list[dict]:
    """OT emitidas que todavía no tienen informe: las candidatas del desplegable
    de Converter. Más recientes primero."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            """
            SELECT sa.archivo, sa.numero_solicitud, sa.laboratorio, sa.sold_to, sa.ship_to,
                   sa.especie, sa.fecha_solicitud, sa.fecha_muestreo
            FROM solicitud_archivo sa
            WHERE NOT EXISTS (SELECT 1 FROM informe_auditoria i WHERE i.archivo_solicitud = sa.archivo)
            ORDER BY sa.creado_en DESC
            """
        )
        filas = cur.fetchall()
    return [
        {
            **f,
            "fecha_solicitud": f["fecha_solicitud"].isoformat() if f["fecha_solicitud"] else None,
            "fecha_muestreo": f["fecha_muestreo"].isoformat() if f["fecha_muestreo"] else None,
        }
        for f in filas
    ]


@router.post("/informes")
async def subir_informe(
    archivo: UploadFile = File(...),
    laboratorio: str = Form(...),
    ship_to: str = Form(""),
    sold_to: str = Form(""),
    nro_informe: str = Form(""),
    archivo_solicitud: str = Form(""),
    # El OT que viene impreso en el PDF («N° Solicitud: OT-…»). Si existe en el
    # sistema, MANDA sobre `archivo_solicitud` (la elección del desplegable):
    # elegir a mano fue lo que dejó informes en la OT equivocada.
    ot_informe: str = Form(""),
    fecha_envio: str = Form(""),
    fecha: str = Form(""),
    analisis: str = Form(""),
    # «Envío a cliente» de Converter: el informe ya salió al cliente (no es una prueba interna).
    enviado_cliente: str = Form(""),
    usuario: Usuario = Depends(usuario_actual),
) -> dict:
    """Guarda el PDF en <laboratorio>/<ship to>/ (la carpeta se crea sola con el
    primer archivo) y lo registra. Volver a subir el mismo informe lo reemplaza.

    Aparte, deja una copia en Storage → Informes, por planta / laboratorio
    / fecha del informe (`informes_storage`). Esa copia no depende
    de Auditoría: se guarda primero y, si falla, el informe igual sigue su curso."""
    datos = await archivo.read()
    if not (archivo.filename or "").lower().endswith(".pdf") or not datos.startswith(b"%PDF"):
        raise HTTPException(400, "El archivo no es un PDF.")
    if len(datos) > MAX_PDF_BYTES:
        raise HTTPException(413, "El PDF pesa más de 25 MB.")
    if not laboratorio.strip():
        raise HTTPException(400, "Falta el laboratorio.")

    ruta_informes = None
    try:
        ruta_informes = informes_storage.guardar(
            datos, archivo.filename or "informe.pdf",
            ship_to=ship_to, sold_to=sold_to, fecha=fecha, laboratorio=laboratorio,
        )
    except Exception:
        logger.exception("No se pudo guardar %s en Storage → Informes", archivo.filename)

    _exigir_r2()
    envio = parsear_fecha_envio(fecha_envio)
    nro = nro_informe.strip() or None
    ot = archivo_solicitud.strip() or None
    lab = laboratorio.strip()

    carpeta = f"{r2a.segmento_seguro(informes_storage.laboratorio_visible(lab), 'Sin laboratorio')}/{r2a.segmento_seguro(ship_to, 'Sin ship to')}"
    nombre = r2a.segmento_seguro(archivo.filename, "informe.pdf")

    with conexion() as conn, cursor_dict(conn) as cur:
        numero_ot = None
        ot_pdf = ot_informe.strip()
        if ot_pdf:
            cur.execute(
                "SELECT archivo FROM solicitud_archivo WHERE upper(btrim(numero_solicitud)) = upper(%s) LIMIT 1",
                (ot_pdf,),
            )
            fila = cur.fetchone()
            if fila is not None:
                ot = fila["archivo"]
        if ot:
            cur.execute("SELECT numero_solicitud FROM solicitud_archivo WHERE archivo = %s", (ot,))
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(400, "La solicitud elegida ya no existe.")
            numero_ot = fila["numero_solicitud"]

        previo = None
        if nro:
            cur.execute(
                "SELECT id, r2_key FROM informe_auditoria WHERE laboratorio = %s AND nro_informe = %s",
                (lab, nro),
            )
            previo = cur.fetchone()

        key = f"{carpeta}/{nombre}"
        if not (previo and previo["r2_key"] == key):
            base, punto, ext = nombre.rpartition(".")
            n = 2
            with errores_r2():
                while r2a.existe(key):
                    key = f"{carpeta}/{base} ({n}){punto}{ext}"
                    n += 1

        with errores_r2():
            r2a.subir(key, datos)
        try:
            cur.execute(
                """
                INSERT INTO informe_auditoria
                    (archivo_solicitud, numero_solicitud, nro_informe, laboratorio, sold_to, ship_to,
                     nombre_archivo, r2_key, tamano_bytes, fecha_envio, subido_por_email, subido_por_nombre)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (laboratorio, nro_informe) WHERE nro_informe IS NOT NULL DO UPDATE SET
                    archivo_solicitud = COALESCE(EXCLUDED.archivo_solicitud, informe_auditoria.archivo_solicitud),
                    numero_solicitud  = COALESCE(EXCLUDED.numero_solicitud, informe_auditoria.numero_solicitud),
                    sold_to = EXCLUDED.sold_to, ship_to = EXCLUDED.ship_to,
                    nombre_archivo = EXCLUDED.nombre_archivo, r2_key = EXCLUDED.r2_key,
                    tamano_bytes = EXCLUDED.tamano_bytes,
                    fecha_envio = COALESCE(EXCLUDED.fecha_envio, informe_auditoria.fecha_envio),
                    subido_por_email = EXCLUDED.subido_por_email,
                    subido_por_nombre = EXCLUDED.subido_por_nombre,
                    subido_en = now()
                RETURNING id
                """,
                (ot, numero_ot, nro, lab, sold_to.strip() or None, ship_to.strip() or None,
                 key.rsplit("/", 1)[-1], key, len(datos), envio, usuario.email, usuario.nombre),
            )
            nuevo_id = cur.fetchone()["id"]
        except Exception:
            try:
                r2a.eliminar(key)
            except Exception:
                logger.exception("No se pudo deshacer la subida de %s", key)
            raise

    if previo and previo["r2_key"] != key:
        try:
            r2a.eliminar(previo["r2_key"])
        except Exception:
            logger.exception("No se pudo borrar el PDF anterior %s", previo["r2_key"])
    marcado = False
    if ot and enviado_cliente.strip().lower() in ("1", "true", "si", "sí"):
        try:
            from . import envio_cliente
            with conexion(escribir=True) as conn, conn.cursor() as cur:
                marcado = envio_cliente.marcar(cur, [ot], usuario, "converter", envio) > 0
        except Exception:
            logger.exception("No se pudo marcar %s como enviado al cliente (¿falta la migración 0058?)", ot)
    return {"id": nuevo_id, "ruta": key, "ruta_informes": ruta_informes, "enviado_cliente": marcado}


# ── Panel ───────────────────────────────────────────────────────────────

def _iso(valor) -> str | None:
    return valor.isoformat() if valor is not None else None


# Informe de una solicitud que NO pasó por Converter (los propios de AgroFresh): sus resultados están
# en Report y traen el OT de la solicitud en `referencia`. Solo se mira si no hay PDF de Converter.
# Se usa con el alias `sa` (solicitud_archivo) e `ia` (informe_auditoria).
SQL_INFORME_EN_REPORT = """
            LEFT JOIN LATERAL (
                SELECT s.nro_solicitud, cd.creado_en AS cargado_en
                FROM solicitud s LEFT JOIN carga_datos cd ON cd.id = s.carga_id
                WHERE ia.id IS NULL
                  AND s.referencia IS NOT NULL AND btrim(s.referencia) <> ''
                  AND upper(btrim(s.referencia)) = upper(btrim(sa.numero_solicitud))
                ORDER BY s.id LIMIT 1
            ) rp ON true"""


def analisis_de_solicitud(laboratorio: str | None, codigos: list, analitos: list[dict], analisis: list[dict]) -> list[str]:
    """Los nombres de los Análisis (ej. «FSMA», «ANÁLISIS DE RESIDUOS EN FRUTA») que pidió una solicitud.

    Sus analitos (códigos) se buscan en el catálogo del laboratorio y cada uno cuenta para el
    PRIMER análisis activo del laboratorio que lo incluya, por orden: el mismo criterio del
    checklist de la solicitud y de su PDF. Sin catálogo o sin coincidencia, lista vacía."""
    lab = (laboratorio or "").strip().upper()
    if not lab:
        return []
    ids = {}
    for a in analitos:
        if str(a.get("laboratorio") or "").strip().upper() == lab:
            ids[str(a.get("codigo") or "").strip().upper()] = a.get("id")
    del_lab = sorted(
        (x for x in analisis if str(x.get("laboratorio") or "").strip().upper() == lab and x.get("activo", True)),
        key=lambda x: x.get("orden", 0),
    )
    nombres: list[str] = []
    for codigo in codigos:
        analito_id = ids.get(str(codigo).strip().upper())
        if analito_id is None:
            continue
        for x in del_lab:
            if any(i.get("analito_id") == analito_id for i in x.get("analitos", [])):
                nombre = str(x.get("nombre") or "").strip()
                if nombre and nombre not in nombres:
                    nombres.append(nombre)
                break
    return nombres


def _fechas_envio_manuales() -> dict:
    """Fecha de envío anotada a mano de informes que no pasan por Converter (migración 0061).
    Sin la tabla, vacío."""
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT archivo, fecha_envio FROM informe_fecha_manual")
            return {f["archivo"]: f["fecha_envio"] for f in cur.fetchall()}
    except Exception:  # noqa: BLE001 - falta la migración: todo sigue como antes
        return {}


def _catalogos_de_analisis() -> tuple[list[dict], list[dict]]:
    """Analitos y Análisis configurados (mantenedor de Laboratorios). Si no se pueden leer,
    vacíos: la pantalla agrupa entonces como «Sin análisis definido»."""
    try:
        from . import config_store, toma_muestras

        return (
            config_store.leer("analitos.json", toma_muestras.ANALITOS_DEFECTO),
            config_store.leer("analisis_laboratorio.json", []),
        )
    except Exception:  # noqa: BLE001 - un catálogo ilegible no puede tumbar el listado
        logging.getLogger(__name__).exception("No se pudo leer el catálogo de análisis")
        return [], []


@router.get("/solicitudes")
def listar_solicitudes(usuario: Usuario = Depends(puede_auditoria)) -> list[dict]:
    """Las solicitudes emitidas por el sistema, con su informe (si tiene) y si
    ya se ven en Report. Más recientes primero."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            """
            SELECT sa.archivo, sa.numero_solicitud, sa.laboratorio, sa.sold_to, sa.ship_to,
                   sa.especie, sa.fecha_solicitud, sa.fecha_muestreo, sa.creado_en,
                   sa.datos->'campos_laboratorio'->>'Tipo Aplicación' AS tipo_servicio,
                   sa.datos->>'variedad' AS variedad,
                   sa.datos->'analitos_solicitados' AS analitos,
                   ia.id AS informe_id, ia.nro_informe, ia.nombre_archivo, ia.r2_key,
                   ia.fecha_envio, ia.subido_en,
                   rp.nro_solicitud AS report_nro, rp.cargado_en AS report_cargado_en,
                   ((ia.id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM solicitud s WHERE s.nro_solicitud = ia.nro_informe
                   )) OR rp.nro_solicitud IS NOT NULL) AS en_report
            FROM solicitud_archivo sa
            LEFT JOIN LATERAL (
                SELECT * FROM informe_auditoria i
                WHERE i.archivo_solicitud = sa.archivo
                ORDER BY i.subido_en DESC LIMIT 1
            ) ia ON true
            """ + SQL_INFORME_EN_REPORT + """
            ORDER BY sa.creado_en DESC
            """
        )
        # Un comercial ve solo las solicitudes de sus plantas (el resto de las cuentas, todas).
        filas = [f for f in cur.fetchall() if planta_permitida(usuario, f["sold_to"], f["ship_to"])]
    analitos_cat, analisis_cat = _catalogos_de_analisis()
    manuales = _fechas_envio_manuales()
    salida = []
    for f in filas:
        tiene_pdf = f["informe_id"] is not None
        # Los informes propios de AgroFresh no pasan por Converter: llegan a Report con el OT en
        # `referencia`. Esos también cuentan como informe recibido (si no, salían como pendientes).
        solo_report = not tiene_pdf and f.get("report_nro") is not None
        salida.append({
            "archivo": f["archivo"],
            "numero_solicitud": f["numero_solicitud"],
            "laboratorio": f["laboratorio"],
            "sold_to": f["sold_to"],
            "ship_to": f["ship_to"],
            "especie": f["especie"],
            "variedad": f["variedad"],
            "tipo_servicio": (f["tipo_servicio"] or "").strip() or None,
            "analitos": [str(a) for a in f["analitos"]] if isinstance(f["analitos"], list) else [],
            # Los Análisis que pidió (FSMA, residuos en fruta, patógenos…), por el catálogo del laboratorio.
            "analisis": analisis_de_solicitud(
                f["laboratorio"], f["analitos"] if isinstance(f["analitos"], list) else [], analitos_cat, analisis_cat,
            ),
            "fecha_solicitud": _iso(f["fecha_solicitud"]),
            "fecha_muestreo": _iso(f["fecha_muestreo"]),
            "emitida_en": f["creado_en"],
            "informe": {
                "id": f["informe_id"],
                "nro_informe": f["nro_informe"],
                "nombre_archivo": f["nombre_archivo"],
                "ruta": f["r2_key"],
                "cargado_en": _iso(f["subido_en"]),
                "fecha_envio": _iso(f["fecha_envio"]),
            } if tiene_pdf else {
                "id": None,
                "nro_informe": f["report_nro"],
                "nombre_archivo": None,
                "ruta": None,
                "cargado_en": _iso(f.get("report_cargado_en")),
                "fecha_envio": _iso(manuales.get(f["archivo"])),
            } if solo_report else None,
            "en_report": bool(f["en_report"]),
            "concretada": (tiene_pdf or solo_report) and bool(f["en_report"]),
        })
    return salida


class FechaEnvioIn(BaseModel):
    fecha_envio: str | None = None


@router.patch("/informes/{informe_id}/fecha-envio")
def editar_fecha_envio(informe_id: int, body: FechaEnvioIn, _: Usuario = Depends(solo_admin_general)) -> dict:
    envio = parsear_fecha_envio(body.fecha_envio)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "UPDATE informe_auditoria SET fecha_envio = %s WHERE id = %s RETURNING fecha_envio",
            (envio, informe_id),
        )
        fila = cur.fetchone()
    if fila is None:
        raise HTTPException(404, "Informe no encontrado.")
    return {"fecha_envio": _iso(fila["fecha_envio"])}


@router.get("/informes/{informe_id}/pdf")
def descargar_informe(informe_id: int, usuario: Usuario = Depends(puede_auditoria)) -> Response:
    _exigir_r2()
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT i.r2_key, i.nombre_archivo, sa.sold_to, sa.ship_to FROM informe_auditoria i"
            " LEFT JOIN solicitud_archivo sa ON sa.archivo = i.archivo_solicitud WHERE i.id = %s",
            (informe_id,),
        )
        fila = cur.fetchone()
    # Un comercial solo baja informes de SUS plantas; uno sin solicitud enlazada no se sabe de quién es: no.
    if fila is None or (usuario.tipoAcceso == "comercial" and not planta_permitida(usuario, fila["sold_to"], fila["ship_to"])):
        raise HTTPException(404, "Informe no encontrado.")
    with errores_r2():
        datos = r2a.descargar(fila["r2_key"])
    if datos is None:
        raise HTTPException(404, "El PDF ya no está en el bucket de auditoría.")
    return _respuesta_pdf(datos, fila["nombre_archivo"])
