"""
Ingesta de Datos → Correo (etapa 1: leer y clasificar, SIN cargar nada).

Revisa el buzón del Report Hub, toma los PDF de informe que mandan los laboratorios (y Paz, desde el
laboratorio de AgroFresh), los lee, los cruza con SU solicitud por la OT impresa y revisa a quién llegó
el correo contra la lista de distribución que esa solicitud dice. Cada PDF queda como una fila en
`correo_informe` con su estado (ok / amarillo / rojo) y sus hallazgos. Nada se sube a Report: eso es de
la etapa 2 («Aceptar»).

El buzón es SOLO DE LECTURA: se abre con `readonly` y se baja con `BODY.PEEK`. No se marca nada como
leído, no se mueven etiquetas ni se borra. Lo ya examinado se anota en `correo_informe_visto`, en la
base (la lección de Accu-Tab: Gmail no deja quitar etiquetas por IMAP de forma confiable).

Solo lo ve y lo usa el administrador principal.
"""
from __future__ import annotations

import email
import email.policy
import hashlib
import imaplib
import logging
import re
import threading
import time
from datetime import datetime, timedelta
from email.message import EmailMessage
from typing import Any

import psycopg2.errors
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from psycopg2.extras import Json
from pydantic import BaseModel, Field

from . import config, correo_informes_lectura as lectura
from .auth import Usuario, usuario_actual
from .confirmar_clave import es_principal
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

IMAP_HOST = "imap.gmail.com"
CARPETA = "INBOX"
DIAS_POR_DEFECTO = 14
MAXIMO_POR_REVISION = 300
MAX_PDF_BYTES = 15 * 1024 * 1024
MAX_CORREO_BYTES = 25 * 1024 * 1024
PRESUPUESTO_S = 900            # una revisión se corta a los 15 min; la siguiente sigue donde quedó
PREFIJO_R2 = "correo_informes/"

router = APIRouter(prefix="/api/correo-informes", tags=["correo-informes"])


def exigir_principal(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    if not es_principal(usuario):
        raise HTTPException(403, "Solo el administrador principal puede ver el correo de informes.")
    return usuario


# ---------------------------------------------------------------------------
# Un correo → sus informes (puro: no toca el buzón ni la base)
# ---------------------------------------------------------------------------

def es_respuesta_o_reenvio(mensaje: EmailMessage) -> bool:
    """«RE:», «FW:», «RV:» o un correo que contesta a otro: no es el envío original del laboratorio."""
    asunto = str(mensaje.get("Subject", "") or "").strip()
    return bool(
        re.match(r"^(re|rv|fw|fwd|enc)\s*:", asunto, re.I)
        or mensaje.get("In-Reply-To") or mensaje.get("References")
    )


def pdfs_del_correo(mensaje: EmailMessage) -> list[tuple[str, bytes]]:
    """Los PDF adjuntos (nombre, bytes). Las imágenes de firma y banners no cuentan."""
    salida: list[tuple[str, bytes]] = []
    for parte in mensaje.walk():
        nombre = parte.get_filename()
        if not nombre or not str(nombre).lower().endswith(".pdf"):
            continue
        datos = parte.get_payload(decode=True)
        if datos and datos.startswith(b"%PDF") and len(datos) <= MAX_PDF_BYTES:
            salida.append((str(nombre), datos))
    return salida


def elegir_pdfs(pdfs: list[tuple[str, bytes]], laboratorios: list[str | None]) -> list[tuple[str, bytes]]:
    """ALS manda cada informe en español y en inglés: vale solo el que trae «INF» en su nombre. El
    resto de los laboratorios, todos sus PDF."""
    if not any(l == "ALS" for l in laboratorios):
        return pdfs
    return [(n, d) for (n, d), lab in zip(pdfs, laboratorios) if lab != "ALS" or re.search(r"\bINF\b|[-_ ]INF[-_ .]", n, re.I)]


def leer_pdf(contenido: bytes) -> tuple[str | None, dict[str, str], str]:
    """(laboratorio, datos leídos, texto) de un PDF. Nunca lanza: un PDF que no se lee vuelve vacío."""
    from .informe_lectura import texto_de_pdf, texto_quiteca

    try:
        texto = texto_de_pdf(contenido)
    except Exception:  # noqa: BLE001 — un PDF dañado no frena la revisión
        return None, {}, ""
    lab = lectura.detectar_laboratorio(texto)
    try:
        texto_q = texto_quiteca(contenido) if lab == "Quiteca" else ""
    except Exception:  # noqa: BLE001
        texto_q = ""
    return lab, lectura.leer_informe(lab, texto, texto_q), texto


def _propios() -> set[str]:
    return {c for c in (config.GMAIL_ACCOUNT, "agrofreshreporthub@gmail.com") if c}


def revisar_pdf(
    nombre: str, contenido: bytes, mensaje: EmailMessage, *, buscar_solicitud, plan_de, ya_cargado_de,
) -> dict[str, Any]:
    """Una fila de `correo_informe` (sin guardar) para un PDF de un correo.

    `buscar_solicitud(ot) -> (archivo, datos) | None`, `plan_de(datos) -> {to, cc, bcc}` y
    `ya_cargado_de(leido) -> bool` se reciben de afuera para poder probar esto sin base."""
    lab, leido, texto = leer_pdf(contenido)
    real = {
        "to": lectura.direcciones(mensaje.get("To")),
        "cc": lectura.direcciones(mensaje.get("Cc")),
        "bcc": lectura.direcciones(mensaje.get("Bcc")),
    }
    soportado = lab in lectura.LABORATORIOS_CON_LECTOR
    hallazgos: list[dict[str, str]] = []
    solicitud = esperado = None
    if not lab:
        hallazgos.append({"nivel": lectura.AMARILLO, "codigo": "pdf_no_reconocido",
                          "texto": "No se pudo reconocer de qué laboratorio es este PDF (o no se pudo leer)."})
    elif not soportado:
        hallazgos.append({"nivel": lectura.AMARILLO, "codigo": "sin_lector",
                          "texto": f"Todavía no hay lector automático para {lab}: se registra, pero hay que cargarlo con el Converter."})
    else:
        ot = leido.get("ot", "")
        solicitud = buscar_solicitud(ot) if ot else None
        if solicitud is not None:
            esperado = plan_de(solicitud[1])
        hallazgos += lectura.revisar_informe(leido, texto, solicitud, esperado, real, _propios())
    return {
        "pdf_nombre": nombre,
        "pdf_sha256": hashlib.sha256(contenido).hexdigest(),
        "laboratorio": lab,
        "soportado": soportado,
        "nro_informe": leido.get("nro_informe", ""),
        "ot": leido.get("ot", ""),
        "sold_to": leido.get("sold_to", ""),
        "ship_to": leido.get("ship_to", ""),
        "especie": leido.get("especie", ""),
        "fecha_muestreo": leido.get("fecha_muestreo") or None,
        "archivo_solicitud": solicitud[0] if solicitud else None,
        "esperado": esperado or {},
        "hallazgos": hallazgos,
        "estado": lectura.estado_de(hallazgos),
        "ya_cargado": bool(leido.get("nro_informe") or leido.get("ot")) and ya_cargado_de(leido),
        "para": real["to"], "cc": real["cc"], "bcc": real["bcc"],
    }


# ---------------------------------------------------------------------------
# Base de datos
# ---------------------------------------------------------------------------

class SinTabla(RuntimeError):
    """Falta correr la migración 0064."""


def _buscar_solicitud(ot: str) -> tuple[str, dict] | None:
    from . import indice_solicitudes

    return indice_solicitudes.buscar_por_numero(ot)


def _plan_de(datos: dict) -> dict[str, list[str]]:
    from .envio_informes import plan_desde_solicitud

    plan = plan_desde_solicitud(datos)
    return {"to": list(plan.get("to", [])), "cc": list(plan.get("cc", [])), "bcc": list(plan.get("bcc", []))}


def _ya_cargado(leido: dict[str, str]) -> bool:
    """¿El informe ya está en Converter/Report? Por su N° de informe o, en los propios de AgroFresh, por la OT."""
    nro, ot = (leido.get("nro_informe") or "").strip().upper(), (leido.get("ot") or "").strip().upper()
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(
                "SELECT EXISTS ("
                " SELECT 1 FROM informe_auditoria WHERE %s <> '' AND upper(btrim(nro_informe)) = %s"
                " UNION ALL SELECT 1 FROM solicitud WHERE (%s <> '' AND upper(btrim(nro_solicitud)) = %s)"
                " OR (%s <> '' AND upper(btrim(referencia)) = %s)"
                ") AS hay", (nro, nro, nro, nro, ot, ot),
            )
            return bool(cur.fetchone()["hay"])
    except psycopg2.Error:
        logger.exception("No se pudo comprobar si el informe %s ya estaba cargado", nro or ot)
        return False


def _guardar_pdf(llave: str, contenido: bytes) -> str | None:
    """Copia el PDF a R2 (para verlo desde la bandeja y, en la etapa 2, cargarlo). None si no se puede."""
    from . import r2

    try:
        if not r2.disponible():
            return None
        r2.subir(llave, contenido, "application/pdf")
        return llave
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo guardar el PDF %s en R2", llave)
        return None


_COLUMNAS = (
    "pdf_nombre", "pdf_sha256", "laboratorio", "soportado", "nro_informe", "ot", "sold_to", "ship_to", "especie",
    "fecha_muestreo", "archivo_solicitud", "estado", "ya_cargado",
)


def guardar_fila(cur, buzon: str, message_id: str, correo: dict[str, Any], fila: dict[str, Any], r2_key: str | None) -> bool:
    """Inserta un informe de un correo. False si ya estaba (mismo correo y mismo PDF)."""
    duplicado = None
    if fila["nro_informe"] and fila["laboratorio"]:
        cur.execute(
            "SELECT llegada_en FROM correo_informe WHERE upper(btrim(nro_informe)) = upper(%s) AND laboratorio = %s"
            " ORDER BY llegada_en ASC LIMIT 1", (fila["nro_informe"], fila["laboratorio"]),
        )
        previo = cur.fetchone()
        duplicado = previo["llegada_en"] if previo else None
    hallazgos = list(fila["hallazgos"])
    if duplicado:
        hallazgos.append({"nivel": lectura.INFO, "codigo": "ya_llego_antes",
                          "texto": f"Este informe ya había llegado el {duplicado.astimezone().strftime('%d-%m-%Y %H:%M')}."})
    cur.execute(
        f"""
        INSERT INTO correo_informe (buzon, message_id, r2_key, asunto, remitente, llegada_en, enviado_en,
                                    para, cc, bcc, esperado, hallazgos, {", ".join(_COLUMNAS)})
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, {", ".join(["%s"] * len(_COLUMNAS))})
        ON CONFLICT (message_id, pdf_sha256) DO NOTHING
        """,
        (buzon, message_id, r2_key, correo["asunto"], correo["remitente"], correo["llegada_en"], correo["enviado_en"],
         Json(fila["para"]), Json(fila["cc"]), Json(fila["bcc"]), Json(fila["esperado"]), Json(hallazgos),
         *[fila[c] for c in _COLUMNAS]),
    )
    return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Buzón (IMAP, solo lectura)
# ---------------------------------------------------------------------------

def _conectar() -> imaplib.IMAP4_SSL:
    clave = (config.GMAIL_APP_PASSWORD or "").replace(" ", "")
    if not (config.GMAIL_ACCOUNT and clave):
        raise RuntimeError("Faltan GMAIL_ACCOUNT y GMAIL_APP_PASSWORD en el .env del servidor.")
    try:
        imap = imaplib.IMAP4_SSL(IMAP_HOST, timeout=30)
        imap.login(config.GMAIL_ACCOUNT, clave)
    except imaplib.IMAP4.error as exc:
        raise RuntimeError(f"Gmail rechazó el login IMAP ({exc}). Revisa la clave de aplicación y que IMAP esté habilitado.") from exc
    return imap


def _buscar_uids(imap: imaplib.IMAP4_SSL, dias: int) -> list[bytes]:
    """UIDs de los correos con adjuntos de los últimos `dias` (los más nuevos al final)."""
    desde = datetime.now() - timedelta(days=dias)
    # Solo correos con PDF: el buzón también recibe los correos de Accu-Tab (CSV y zip pesados) que no
    # son informes y no hay que bajar.
    typ, data = imap.uid("SEARCH", "X-GM-RAW", f'"has:attachment filename:pdf after:{desde.strftime("%Y/%m/%d")}"')
    if typ != "OK" or not data or not data[0]:
        return []
    return data[0].split()


def _cabecera(imap: imaplib.IMAP4_SSL, uid: bytes) -> tuple[str, datetime | None, int]:
    """(Message-ID, fecha de llegada, tamaño en bytes) de un correo, bajando solo su encabezado."""
    typ, data = imap.uid("FETCH", uid, "(INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])")
    if typ != "OK" or not data or not isinstance(data[0], tuple):
        return "", None, 0
    llegada = None
    tupla = imaplib.Internaldate2tuple(data[0][0])
    if tupla:
        llegada = datetime(*tupla[:6]).astimezone()  # noqa: DTZ001 — la tupla viene en hora local del servidor
    m = re.search(rb"Message-ID:\s*(<[^>\r\n]+>|\S+)", data[0][1], re.I)
    tam = re.search(rb"RFC822\.SIZE (\d+)", data[0][0])
    return (m.group(1).decode("utf-8", "replace").strip() if m else ""), llegada, int(tam.group(1)) if tam else 0


def _mensaje(imap: imaplib.IMAP4_SSL, uid: bytes) -> EmailMessage | None:
    typ, data = imap.uid("FETCH", uid, "(BODY.PEEK[])")
    if typ != "OK" or not data or not isinstance(data[0], tuple):
        return None
    return email.message_from_bytes(data[0][1], policy=email.policy.default)  # type: ignore[return-value]


def _fecha_del_correo(mensaje: EmailMessage) -> datetime | None:
    from email.utils import parsedate_to_datetime

    try:
        return parsedate_to_datetime(str(mensaje.get("Date", ""))).astimezone()
    except (TypeError, ValueError):
        return None


def examinar_mensaje(
    mensaje: EmailMessage, *, buscar_solicitud=_buscar_solicitud, plan_de=_plan_de, ya_cargado_de=_ya_cargado,
) -> tuple[str, list[dict[str, Any]], list[tuple[str, bytes]]]:
    """(motivo, filas, pdfs elegidos). Sin filas, `motivo` dice por qué el correo no trae informes."""
    if es_respuesta_o_reenvio(mensaje):
        return "respuesta_o_reenvio", [], []
    remitente = lectura.direcciones(mensaje.get("From"))
    if remitente and remitente[0] in _propios():
        return "saliente_del_hub", [], []
    pdfs = pdfs_del_correo(mensaje)
    if not pdfs:
        return "sin_pdf", [], []
    labs = [lectura.detectar_laboratorio(_texto(d)) for _, d in pdfs]
    elegidos = elegir_pdfs(pdfs, labs)
    filas = [
        revisar_pdf(n, d, mensaje, buscar_solicitud=buscar_solicitud, plan_de=plan_de, ya_cargado_de=ya_cargado_de)
        for n, d in elegidos
    ]
    return ("informes" if filas else "sin_informes"), filas, elegidos


def _texto(contenido: bytes) -> str:
    from .informe_lectura import texto_de_pdf

    try:
        return texto_de_pdf(contenido)
    except Exception:  # noqa: BLE001
        return ""


def iniciar_sondeo(dias: int, disparado_por: str = "") -> tuple[int, bool]:
    """Anota que arranca una revisión. (id, ya_estaba): si hay una en curso (menos de 20 min), no se abre otra."""
    with conexion() as conn, cursor_dict(conn) as cur:
        try:
            cur.execute(
                "SELECT id FROM correo_informe_sondeo WHERE terminado_en IS NULL"
                " AND iniciado_en > now() - interval '20 minutes' ORDER BY id DESC LIMIT 1"
            )
        except psycopg2.errors.UndefinedTable as exc:
            raise SinTabla("Falta correr la migración 0064_correo_informe.sql en el servidor.") from exc
        en_curso = cur.fetchone()
        if en_curso:
            return en_curso["id"], True
        cur.execute("INSERT INTO correo_informe_sondeo (disparado_por, dias) VALUES (%s, %s) RETURNING id", (disparado_por, dias))
        return cur.fetchone()["id"], False


def correr_sondeo(sondeo_id: int, dias: int, maximo: int = MAXIMO_POR_REVISION, presupuesto_s: float = PRESUPUESTO_S) -> dict[str, Any]:
    """Hace la revisión de un sondeo ya anotado. Lo que alcanza a registrar queda guardado aunque se corte:
    la próxima revisión sigue desde donde quedó (lo ya examinado no se vuelve a bajar)."""
    buzon = (config.GMAIL_ACCOUNT or "").lower()
    examinados = nuevos = 0
    error: str | None = None
    inicio = time.monotonic()
    try:
        imap = _conectar()
        try:
            typ, _ = imap.select(f'"{CARPETA}"', readonly=True)
            if typ != "OK":
                raise RuntimeError(f"No se pudo abrir la carpeta {CARPETA} del buzón.")
            uids = _buscar_uids(imap, dias)[-maximo:]
            with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
                cur.execute("SELECT message_id FROM correo_informe_visto WHERE buzon = %s", (buzon,))
                conocidos = {f["message_id"] for f in cur.fetchall()}
                cur.execute("SELECT DISTINCT message_id FROM correo_informe WHERE buzon = %s", (buzon,))
                conocidos |= {f["message_id"] for f in cur.fetchall()}
            for uid in reversed(uids):       # primero los más nuevos
                if time.monotonic() - inicio > presupuesto_s:
                    logger.warning("La revisión del correo de informes se cortó por tiempo; la próxima sigue.")
                    break
                message_id, llegada, tamano = _cabecera(imap, uid)
                if not message_id or message_id in conocidos:
                    continue
                examinados += 1
                if tamano > MAX_CORREO_BYTES:
                    filas, motivo, elegidos, mensaje = [], "muy_grande", [], None
                else:
                    mensaje = _mensaje(imap, uid)
                    if mensaje is None:
                        continue
                    motivo, filas, elegidos = examinar_mensaje(mensaje)
                correo = {
                    "asunto": str(mensaje.get("Subject", "") or "").replace("\r", " ").replace("\n", " ").strip()[:500] if mensaje else "",
                    "remitente": (lectura.direcciones(mensaje.get("From")) or [""])[0] if mensaje else "",
                    "llegada_en": llegada, "enviado_en": _fecha_del_correo(mensaje) if mensaje else None,
                }
                datos_pdf = dict(elegidos)
                with conexion() as conn, cursor_dict(conn) as cur:
                    for fila in filas:
                        llave = None
                        if fila["laboratorio"] and fila["soportado"]:
                            sello = (llegada or datetime.now()).strftime("%Y/%m")
                            nombre = re.sub(r"[^\w.\- ]+", "_", fila["pdf_nombre"])[:120]
                            llave = _guardar_pdf(f"{PREFIJO_R2}{sello}/{fila['pdf_sha256'][:12]}_{nombre}", datos_pdf[fila["pdf_nombre"]])
                        if guardar_fila(cur, buzon, message_id, correo, fila, llave):
                            nuevos += 1
                    cur.execute(
                        "INSERT INTO correo_informe_visto (buzon, message_id, motivo) VALUES (%s, %s, %s)"
                        " ON CONFLICT DO NOTHING", (buzon, message_id, motivo),
                    )
                    # El avance se ve en pantalla mientras corre.
                    cur.execute("UPDATE correo_informe_sondeo SET examinados = %s, nuevos = %s WHERE id = %s",
                                (examinados, nuevos, sondeo_id))
        finally:
            try:
                imap.logout()
            except Exception:  # noqa: BLE001
                pass
    except Exception as exc:  # noqa: BLE001 — se anota en la revisión y se vuelve a lanzar abajo
        error = str(exc)
        logger.exception("Falló la revisión del correo de informes")
    finally:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                "UPDATE correo_informe_sondeo SET terminado_en = now(), examinados = %s, nuevos = %s, error = %s WHERE id = %s",
                (examinados, nuevos, error, sondeo_id),
            )
    if error:
        raise RuntimeError(error)
    return {"examinados": examinados, "nuevos": nuevos, "dias": dias}


def sondear(dias: int = DIAS_POR_DEFECTO, maximo: int = MAXIMO_POR_REVISION, disparado_por: str = "") -> dict[str, Any]:
    """Una revisión del buzón, de principio a fin (la usa el script). Devuelve el resumen."""
    sondeo_id, ya_en_curso = iniciar_sondeo(dias, disparado_por)
    if ya_en_curso:
        raise RuntimeError("Ya hay una revisión del correo en curso.")
    return correr_sondeo(sondeo_id, dias, maximo)


def _hilo(sondeo_id: int, dias: int) -> None:
    try:
        correr_sondeo(sondeo_id, dias)
    except Exception:  # noqa: BLE001 — el error ya quedó anotado en la revisión
        pass


def sondear_en_segundo_plano(dias: int, disparado_por: str = "") -> dict[str, Any]:
    """Arranca la revisión y vuelve de inmediato: tarda más de lo que aguanta una petición (el túnel
    corta a los ~100 s). La pantalla ve el avance leyendo `ultimo_sondeo` de la bandeja."""
    if not (config.GMAIL_ACCOUNT and (config.GMAIL_APP_PASSWORD or "").replace(" ", "")):
        raise RuntimeError("Faltan GMAIL_ACCOUNT y GMAIL_APP_PASSWORD en el .env del servidor.")
    sondeo_id, ya_en_curso = iniciar_sondeo(dias, disparado_por)
    if not ya_en_curso:
        threading.Thread(target=_hilo, args=(sondeo_id, dias), name=f"correo-informes-{sondeo_id}", daemon=True).start()
    return {"id": sondeo_id, "en_curso": True, "ya_estaba_en_curso": ya_en_curso}


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

class SondearIn(BaseModel):
    dias: int = Field(DIAS_POR_DEFECTO, ge=1, le=90)


_CAMPOS_LISTA = (
    "id, laboratorio, soportado, nro_informe, ot, sold_to, ship_to, especie, fecha_muestreo, asunto, remitente,"
    " llegada_en, enviado_en, estado, ya_cargado, revisado_en, resuelto_en, hallazgos, pdf_nombre, (r2_key IS NOT NULL) AS tiene_pdf"
)


def _tabla_o_503(cur, sql: str, params: tuple = ()):
    try:
        cur.execute(sql, params)
    except psycopg2.errors.UndefinedTable as exc:
        raise HTTPException(503, "Falta correr la migración 0064_correo_informe.sql en el servidor.") from exc


@router.get("")
def listar(
    estado: str = Query("", description="rojo, amarillo, ok o vacío para todos"),
    laboratorio: str = "", q: str = "", limite: int = Query(200, ge=1, le=500),
    _: Usuario = Depends(exigir_principal),
) -> dict[str, Any]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        _tabla_o_503(cur, "SELECT estado, ya_cargado, count(*) AS n FROM correo_informe GROUP BY estado, ya_cargado")
        conteos: dict[str, int] = {"todos": 0, "rojo": 0, "amarillo": 0, "ok": 0, "ya_cargado": 0}
        for f in cur.fetchall():
            conteos["todos"] += f["n"]
            conteos[f["estado"]] = conteos.get(f["estado"], 0) + f["n"]
            if f["ya_cargado"]:
                conteos["ya_cargado"] += f["n"]
        filtros, params = [], []
        if estado == "ya_cargado":
            filtros.append("ya_cargado")
        elif estado:
            filtros.append("estado = %s")
            params.append(estado)
        if laboratorio:
            filtros.append("laboratorio = %s")
            params.append(laboratorio)
        if q.strip():
            filtros.append("(nro_informe ILIKE %s OR ot ILIKE %s OR asunto ILIKE %s OR ship_to ILIKE %s OR sold_to ILIKE %s)")
            params += [f"%{q.strip()}%"] * 5
        donde = ("WHERE " + " AND ".join(filtros)) if filtros else ""
        cur.execute(f"SELECT {_CAMPOS_LISTA} FROM correo_informe {donde} ORDER BY llegada_en DESC NULLS LAST, id DESC LIMIT %s",
                    (*params, limite))
        filas = cur.fetchall()
        cur.execute("SELECT id, iniciado_en, terminado_en, nuevos, examinados, error, dias FROM correo_informe_sondeo ORDER BY id DESC LIMIT 1")
        ultimo = cur.fetchone()
    return {"conteos": conteos, "informes": filas, "ultimo_sondeo": ultimo}


@router.get("/{informe_id}")
def detalle(informe_id: int, _: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        _tabla_o_503(cur, "SELECT * FROM correo_informe WHERE id = %s", (informe_id,))
        fila = cur.fetchone()
    if not fila:
        raise HTTPException(404, "Ese informe no está en la bandeja.")
    fila.pop("r2_key", None)
    fila["propios"] = sorted(_propios())     # nuestras cuentas: no cuentan como destinatarios de más
    return fila


@router.get("/{informe_id}/pdf")
def pdf(informe_id: int, _: Usuario = Depends(exigir_principal)) -> Response:
    from . import pdf_permisos, r2

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        _tabla_o_503(cur, "SELECT r2_key, pdf_nombre FROM correo_informe WHERE id = %s", (informe_id,))
        fila = cur.fetchone()
    if not fila or not fila["r2_key"]:
        raise HTTPException(404, "El PDF de este informe no se guardó.")
    datos = r2.descargar(fila["r2_key"])
    if datos is None:
        raise HTTPException(404, "El PDF ya no está en el almacenamiento.")
    nombre = re.sub(r"[^\w.\- ]+", "_", fila["pdf_nombre"])
    return Response(
        pdf_permisos.sin_restricciones(datos), media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{nombre}"'},
    )


@router.post("/sondear")
def revisar_ahora(body: SondearIn, usuario: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    try:
        return sondear_en_segundo_plano(body.dias, disparado_por=usuario.email)
    except SinTabla as exc:
        raise HTTPException(503, str(exc)) from exc
    except RuntimeError as exc:
        # 503 y no 401: un 401 cerraría la sesión de quien solo tiene mal la clave del buzón.
        raise HTTPException(503, str(exc)) from exc
