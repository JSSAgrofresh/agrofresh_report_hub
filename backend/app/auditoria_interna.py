"""
Auditoría interna: panel de solicitudes emitidas vs. informes recibidos, y las
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
import io
import logging
import unicodedata
import zipfile
from contextlib import contextmanager
from datetime import datetime
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from . import informes_storage
from . import r2_auditoria as r2a
from .auth import Usuario, solo_admin_general, usuario_actual
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auditoria-interna", tags=["auditoria-interna"])

MODULO = "auditoria_interna"
MAX_PDF_BYTES = 25 * 1024 * 1024


def puede_auditoria(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    if usuario.tipoAcceso == "admin_general":
        return usuario
    if usuario.tipoAcceso != "cliente" and MODULO in (usuario.modulos or []):
        return usuario
    raise HTTPException(403, "No tienes acceso al módulo de Auditoría interna.")


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
        content=datos,
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
    fecha_envio: str = Form(""),
    fecha: str = Form(""),
    analisis: str = Form(""),
    usuario: Usuario = Depends(usuario_actual),
) -> dict:
    """Guarda el PDF en <laboratorio>/<ship to>/ (la carpeta se crea sola con el
    primer archivo) y lo registra. Volver a subir el mismo informe lo reemplaza.

    Aparte, deja una copia en Storage → Informes, por planta / fecha de muestreo
    / tipo de análisis / laboratorio (`informes_storage`). Esa copia no depende
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
            ship_to=ship_to, sold_to=sold_to, fecha=fecha, analisis=analisis, laboratorio=laboratorio,
        )
    except Exception:
        logger.exception("No se pudo guardar %s en Storage → Informes", archivo.filename)

    _exigir_r2()
    envio = parsear_fecha_envio(fecha_envio)
    nro = nro_informe.strip() or None
    ot = archivo_solicitud.strip() or None
    lab = laboratorio.strip()

    carpeta = f"{r2a.segmento_seguro(lab, 'Sin laboratorio')}/{r2a.segmento_seguro(ship_to, 'Sin ship to')}"
    nombre = r2a.segmento_seguro(archivo.filename, "informe.pdf")

    with conexion() as conn, cursor_dict(conn) as cur:
        numero_ot = None
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
    return {"id": nuevo_id, "ruta": key, "ruta_informes": ruta_informes}


# ── Panel ───────────────────────────────────────────────────────────────

def _iso(valor) -> str | None:
    return valor.isoformat() if valor is not None else None


@router.get("/solicitudes")
def listar_solicitudes(_: Usuario = Depends(puede_auditoria)) -> list[dict]:
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
                   (ia.id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM solicitud s WHERE s.nro_solicitud = ia.nro_informe
                   )) AS en_report
            FROM solicitud_archivo sa
            LEFT JOIN LATERAL (
                SELECT * FROM informe_auditoria i
                WHERE i.archivo_solicitud = sa.archivo
                ORDER BY i.subido_en DESC LIMIT 1
            ) ia ON true
            ORDER BY sa.creado_en DESC
            """
        )
        filas = cur.fetchall()
    salida = []
    for f in filas:
        tiene_pdf = f["informe_id"] is not None
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
            } if tiene_pdf else None,
            "en_report": bool(f["en_report"]),
            "concretada": tiene_pdf and bool(f["en_report"]),
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
def descargar_informe(informe_id: int, _: Usuario = Depends(puede_auditoria)) -> Response:
    _exigir_r2()
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT r2_key, nombre_archivo FROM informe_auditoria WHERE id = %s", (informe_id,))
        fila = cur.fetchone()
    if fila is None:
        raise HTTPException(404, "Informe no encontrado.")
    with errores_r2():
        datos = r2a.descargar(fila["r2_key"])
    if datos is None:
        raise HTTPException(404, "El PDF ya no está en el bucket de auditoría.")
    return _respuesta_pdf(datos, fila["nombre_archivo"])


# ── Carpetas ────────────────────────────────────────────────────────────

def _ruta(ruta: str) -> str:
    try:
        return r2a.ruta_segura(ruta)
    except ValueError:
        raise HTTPException(400, "Ruta inválida.")


@router.get("/carpetas")
def listar_carpeta(ruta: str = Query(""), _: Usuario = Depends(puede_auditoria)) -> dict:
    """Lo que hay en una carpeta (''= raíz). Las carpetas no existen hasta que
    llega su primer informe."""
    _exigir_r2()
    ruta = _ruta(ruta)
    with errores_r2():
        carpetas, archivos = r2a.listar_nivel(ruta)
    por_key: dict[str, dict] = {}
    if archivos:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(
                "SELECT id, r2_key, numero_solicitud, nro_informe, fecha_envio, subido_en"
                " FROM informe_auditoria WHERE r2_key = ANY(%s)",
                ([a["key"] for a in archivos],),
            )
            por_key = {f["r2_key"]: f for f in cur.fetchall()}
    return {
        "ruta": ruta,
        "carpetas": [{"nombre": c, "ruta": f"{ruta}/{c}" if ruta else c} for c in carpetas],
        "archivos": [
            {
                "nombre": a["nombre"],
                "ruta": a["key"],
                "tamano_bytes": a["tamano_bytes"],
                "modificado": a["modificado"],
                "informe_id": por_key[a["key"]]["id"] if a["key"] in por_key else None,
                "numero_solicitud": por_key[a["key"]]["numero_solicitud"] if a["key"] in por_key else None,
                "nro_informe": por_key[a["key"]]["nro_informe"] if a["key"] in por_key else None,
                "fecha_envio": _iso(por_key[a["key"]]["fecha_envio"]) if a["key"] in por_key else None,
            }
            for a in archivos
        ],
    }


@router.get("/carpetas/archivo")
def descargar_archivo(ruta: str = Query(...), _: Usuario = Depends(puede_auditoria)) -> Response:
    _exigir_r2()
    key = _ruta(ruta)
    if not key:
        raise HTTPException(400, "Falta la ruta del archivo.")
    with errores_r2():
        datos = r2a.descargar(key)
    if datos is None:
        raise HTTPException(404, "Archivo no encontrado.")
    return _respuesta_pdf(datos, key.rsplit("/", 1)[-1])


@router.delete("/carpetas/archivo")
def eliminar_archivo(ruta: str = Query(...), _: Usuario = Depends(solo_admin_general)) -> dict:
    _exigir_r2()
    key = _ruta(ruta)
    if not key or "/" not in key:
        raise HTTPException(400, "Ruta inválida.")
    with errores_r2():
        r2a.eliminar(key)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM informe_auditoria WHERE r2_key = %s", (key,))
    return {"ok": True}


@router.delete("/carpetas/carpeta")
def eliminar_carpeta(ruta: str = Query(...), _: Usuario = Depends(solo_admin_general)) -> dict:
    """Borra lo que hay DENTRO de una carpeta. La raíz del bucket no se toca
    nunca: sin ruta, este endpoint rechaza."""
    _exigir_r2()
    carpeta = _ruta(ruta)
    if not carpeta:
        raise HTTPException(400, "La carpeta raíz de auditoría no se puede borrar.")
    with errores_r2():
        keys = r2a.listar_recursivo(f"{carpeta}/")
        for key in keys:
            r2a.eliminar(key)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM informe_auditoria WHERE r2_key LIKE %s ESCAPE '\\'", (
            carpeta.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "/%",
        ))
    return {"eliminados": len(keys)}


MAX_ARCHIVOS_ZIP = 300
MAX_BYTES_ZIP = 400 * 1024 * 1024


class ZipIn(BaseModel):
    rutas: list[str]
    # nombre del .zip (sin extensión); si no viene, «informes_auditoria»
    nombre: str | None = None


@router.post("/carpetas/zip")
def descargar_zip(body: ZipIn, _: Usuario = Depends(puede_auditoria)) -> Response:
    """Varios informes en un solo .zip (uno, varios o todos los de una carpeta).

    Dentro del zip los archivos van sin carpetas y, si dos se llaman igual, el
    segundo lleva « (2)». Un archivo que ya no esté se omite; si no queda
    ninguno, 404. Los topes existen para no armar un zip que agote la memoria.
    """
    _exigir_r2()
    rutas: list[str] = []
    for r in body.rutas:
        key = _ruta(r)
        if not key or "/" not in key:
            raise HTTPException(400, "Ruta inválida.")
        if key not in rutas:
            rutas.append(key)
    if not rutas:
        raise HTTPException(400, "No hay informes seleccionados.")
    if len(rutas) > MAX_ARCHIVOS_ZIP:
        raise HTTPException(413, f"Son demasiados informes de una vez (máximo {MAX_ARCHIVOS_ZIP}).")

    salida = io.BytesIO()
    usados: set[str] = set()
    total = 0
    incluidos = 0
    with errores_r2(), zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED) as z:
        for key in rutas:
            datos = r2a.descargar(key)
            if datos is None:
                continue
            total += len(datos)
            if total > MAX_BYTES_ZIP:
                raise HTTPException(413, "Los informes pesan demasiado para un solo zip: descarga menos a la vez.")
            nombre = key.rsplit("/", 1)[-1]
            base, punto, ext = nombre.rpartition(".")
            n = 2
            while nombre.lower() in usados:
                nombre = f"{base} ({n}){punto}{ext}"
                n += 1
            usados.add(nombre.lower())
            z.writestr(nombre, datos)
            incluidos += 1
    if incluidos == 0:
        raise HTTPException(404, "Ninguno de los informes elegidos está en la carpeta.")
    nombre_zip = r2a.segmento_seguro(body.nombre, "informes_auditoria") + ".zip"
    return Response(
        content=salida.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": _disposicion(nombre_zip)},
    )


class RenombrarIn(BaseModel):
    ruta: str
    nuevo_nombre: str


@router.post("/carpetas/renombrar")
def renombrar_archivo(body: RenombrarIn, _: Usuario = Depends(solo_admin_general)) -> dict:
    _exigir_r2()
    origen = _ruta(body.ruta)
    if not origen or "/" not in origen:
        raise HTTPException(400, "Ruta inválida.")
    nombre = r2a.segmento_seguro(body.nuevo_nombre, "")
    if not nombre:
        raise HTTPException(400, "El nombre no puede quedar vacío.")
    if not nombre.lower().endswith(".pdf"):
        nombre += ".pdf"
    destino = f"{origen.rsplit('/', 1)[0]}/{nombre}"
    if destino == origen:
        return {"ruta": origen}
    with errores_r2():
        if r2a.existe(destino):
            raise HTTPException(409, "Ya existe un archivo con ese nombre en la carpeta.")
        r2a.copiar(origen, destino)
        r2a.eliminar(origen)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "UPDATE informe_auditoria SET r2_key = %s, nombre_archivo = %s WHERE r2_key = %s",
            (destino, nombre, origen),
        )
    return {"ruta": destino}
