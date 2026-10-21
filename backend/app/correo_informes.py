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
        "sold_to": leido.get("sold_to") or (solicitud[1].get("sold_to") if solicitud else "") or "",
        "ship_to": leido.get("ship_to") or (solicitud[1].get("ship_to") if solicitud else "") or "",
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
    """Inserta un informe de un correo. False si ya estaba (mismo correo y mismo PDF).

    Un reenvío del mismo informe es otra fila (otro correo, otros destinatarios): cuál es la primera y cuál la
    última copia se calcula al leer (`_COPIAS`), no al guardar, porque los correos se examinan del más nuevo al más viejo."""
    cur.execute(
        f"""
        INSERT INTO correo_informe (buzon, message_id, r2_key, asunto, remitente, llegada_en, enviado_en,
                                    para, cc, bcc, esperado, hallazgos, {", ".join(_COLUMNAS)})
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, {", ".join(["%s"] * len(_COLUMNAS))})
        ON CONFLICT (message_id, pdf_sha256) DO NOTHING
        """,
        (buzon, message_id, r2_key, correo["asunto"], correo["remitente"], correo["llegada_en"], correo["enviado_en"],
         Json(fila["para"]), Json(fila["cc"]), Json(fila["bcc"]), Json(fila["esperado"]), Json(fila["hallazgos"]),
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


# La última copia de cada informe (mismo laboratorio y N°): es la que vale; las anteriores son su historia.
_VIGENTE = (
    "NOT EXISTS (SELECT 1 FROM correo_informe x WHERE x.laboratorio = c.laboratorio AND x.nro_informe <> ''"
    " AND upper(btrim(x.nro_informe)) = upper(btrim(c.nro_informe)) AND x.llegada_en > c.llegada_en)"
)
# Alguna de las copias de este informe salió mal (un informe = un incidente, aunque la última copia ya esté bien).
_TUVO_INCIDENTE = (
    "EXISTS (SELECT 1 FROM correo_informe x WHERE x.laboratorio = c.laboratorio AND x.nro_informe <> ''"
    " AND upper(btrim(x.nro_informe)) = upper(btrim(c.nro_informe)) AND x.estado = 'rojo')"
)
# Alguna de las copias ya se informó al laboratorio: no se vuelve a alertar por el mismo incidente.
_INFORMADO = (
    "EXISTS (SELECT 1 FROM correo_informe x WHERE x.laboratorio = c.laboratorio AND x.nro_informe <> ''"
    " AND upper(btrim(x.nro_informe)) = upper(btrim(c.nro_informe)) AND x.informado_en IS NOT NULL)"
)
_CAMPOS_LISTA = (
    "c.id, c.laboratorio, c.soportado, c.nro_informe, c.ot,"
    " COALESCE(NULLIF(c.sold_to, ''), sa.sold_to) AS sold_to, COALESCE(NULLIF(c.ship_to, ''), sa.ship_to) AS ship_to,"
    " c.especie, c.fecha_muestreo, c.asunto, c.remitente, c.llegada_en, c.enviado_en, c.estado, c.ya_cargado,"
    " c.decision, c.decidido_en, c.decidido_por, c.nota, c.resuelto_en, c.resuelto_por, c.hallazgos, c.pdf_nombre,"
    " (c.r2_key IS NOT NULL) AS tiene_pdf,"
    # Copias del mismo informe (mismo laboratorio y N°): desde cuándo llegó la primera y si esta es la última.
    " (SELECT MIN(x.llegada_en) FROM correo_informe x WHERE x.laboratorio = c.laboratorio AND x.nro_informe <> ''"
    "    AND upper(btrim(x.nro_informe)) = upper(btrim(c.nro_informe))) AS primera_llegada,"
    f" {_VIGENTE} AS es_ultima_copia,"
    # Cuántas veces llegó este informe y si alguna de esas veces salió mal (un informe = un incidente, no un correo).
    " (SELECT COUNT(*) FROM correo_informe x WHERE x.laboratorio = c.laboratorio AND x.nro_informe <> ''"
    "    AND upper(btrim(x.nro_informe)) = upper(btrim(c.nro_informe))) AS envios,"
    f" {_TUVO_INCIDENTE} AS tuvo_incidente, {_INFORMADO} AS informado,"
    " c.informado_en, c.informado_por, c.nota_incidente"
)
_DESDE = "FROM correo_informe c LEFT JOIN solicitud_archivo sa ON sa.archivo = c.archivo_solicitud"


def _tabla_o_503(cur, sql: str, params: tuple = ()):
    try:
        cur.execute(sql, params)
    except psycopg2.errors.UndefinedTable as exc:
        raise HTTPException(503, "Falta correr la migración 0064_correo_informe.sql en el servidor.") from exc


@router.get("")
def listar(
    estado: str = Query("", description="rojo, amarillo, ok, ya_cargado o vacío para todos"),
    decision: str = Query("", description="pendiente, aceptado, rechazado o vacío para todas"),
    laboratorio: str = "", q: str = "", limite: int = Query(200, ge=1, le=500),
    copias: bool = Query(False, description="incluir también los envíos anteriores de un mismo informe"),
    _: Usuario = Depends(exigir_principal),
) -> dict[str, Any]:
    """Por defecto, una fila por informe (su última copia). Los reenvíos del mismo informe son SU historia, no más alertas."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        _tabla_o_503(cur, f"SELECT c.estado, c.ya_cargado, c.decision, count(*) AS n FROM correo_informe c {'' if copias else 'WHERE ' + _VIGENTE} GROUP BY c.estado, c.ya_cargado, c.decision")
        conteos: dict[str, int] = {"todos": 0, "rojo": 0, "amarillo": 0, "ok": 0, "ya_cargado": 0,
                                   "pendiente": 0, "aceptado": 0, "rechazado": 0}
        for f in cur.fetchall():
            conteos["todos"] += f["n"]
            conteos[f["estado"]] = conteos.get(f["estado"], 0) + f["n"]
            conteos[f["decision"]] = conteos.get(f["decision"], 0) + f["n"]
            if f["ya_cargado"]:
                conteos["ya_cargado"] += f["n"]
        if not copias:
            cur.execute(f"SELECT count(*) AS n FROM correo_informe c WHERE {_VIGENTE} AND {_TUVO_INCIDENTE}")
            conteos["rojo"] = cur.fetchone()["n"]
        filtros, params = ([] if copias else [_VIGENTE]), []
        if estado == "ya_cargado":
            filtros.append("c.ya_cargado")
        elif estado == "rojo" and not copias:
            filtros.append(_TUVO_INCIDENTE)     # Seguimiento: los informes que salieron mal alguna vez, no solo si la última copia sigue mal
        elif estado:
            filtros.append("c.estado = %s")
            params.append(estado)
        if decision:
            filtros.append("c.decision = %s")
            params.append(decision)
        if laboratorio:
            filtros.append("c.laboratorio = %s")
            params.append(laboratorio)
        if q.strip():
            filtros.append("(c.nro_informe ILIKE %s OR c.ot ILIKE %s OR c.asunto ILIKE %s OR c.ship_to ILIKE %s OR c.sold_to ILIKE %s)")
            params += [f"%{q.strip()}%"] * 5
        donde = ("WHERE " + " AND ".join(filtros)) if filtros else ""
        cur.execute(f"SELECT {_CAMPOS_LISTA} {_DESDE} {donde} ORDER BY c.llegada_en DESC NULLS LAST, c.id DESC LIMIT %s",
                    (*params, limite))
        filas = cur.fetchall()
        cur.execute("SELECT id, iniciado_en, terminado_en, nuevos, examinados, error, dias FROM correo_informe_sondeo ORDER BY id DESC LIMIT 1")
        ultimo = cur.fetchone()
    return {"conteos": conteos, "informes": filas, "ultimo_sondeo": ultimo}


@router.get("/sondeo")
def ultimo_sondeo(_: Usuario = Depends(exigir_principal)) -> dict[str, Any] | None:
    """La última revisión del buzón (liviano: la pantalla lo consulta mientras una revisión corre)."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        _tabla_o_503(cur, "SELECT id, iniciado_en, terminado_en, nuevos, examinados, error, dias FROM correo_informe_sondeo ORDER BY id DESC LIMIT 1")
        return cur.fetchone()


@router.get("/panel")
def panel(dias: int = Query(60, ge=7, le=365), _: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    """KPIs, solicitudes (lo que falta, lo recibido) y tendencia de la demora de los informes."""
    from . import correo_informes_panel

    try:
        return correo_informes_panel.leer_panel(dias)
    except psycopg2.errors.UndefinedTable as exc:
        raise HTTPException(503, "Falta correr la migración 0064_correo_informe.sql en el servidor.") from exc


class DecisionIn(BaseModel):
    nota: str = Field("", max_length=1000)


def _marcar(informe_id: int, sql: str, params: tuple, que: str) -> dict[str, Any]:
    with conexion() as conn, cursor_dict(conn) as cur:
        try:
            cur.execute(sql, (*params, informe_id))
        except psycopg2.errors.UndefinedColumn as exc:
            raise HTTPException(503, "Falta correr las migraciones 0065 y 0066 (correo_informe_decision / correo_informe_informado) en el servidor.") from exc
        if cur.rowcount == 0:
            raise HTTPException(404, "Ese informe no está en la bandeja o ya no está en ese estado.")
    return {"ok": True, "id": informe_id, "accion": que}


class AceptarLoteIn(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=100)


@router.post("/aceptar-lote")
def aceptar_lote(body: AceptarLoteIn, usuario: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    """Acepta varios informes; los que no se pueden vuelven con su motivo y los demás igual se aceptan."""
    from . import correo_informes_aceptar
    return correo_informes_aceptar.aceptar_varios(body.ids, usuario)


@router.post("/{informe_id}/aceptar")
def aceptar_informe(informe_id: int, usuario: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    """Carga el informe a la base (como el Converter) o, si ya estaba, solo lo marca revisado."""
    from . import correo_informes_aceptar
    return correo_informes_aceptar.aceptar(informe_id, usuario)


@router.post("/{informe_id}/deshacer-aceptacion")
def deshacer_aceptacion(informe_id: int, usuario: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    """Borra la carga que hizo «Aceptar» y devuelve el informe a pendiente."""
    from . import correo_informes_aceptar
    return correo_informes_aceptar.deshacer(informe_id, usuario)


@router.post("/{informe_id}/rechazar")
def rechazar(informe_id: int, body: DecisionIn, usuario: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    """Descarta el informe (no se carga): queda en la bandeja como rechazado, con su motivo."""
    if not body.nota.strip():
        raise HTTPException(400, "Escribe el motivo del rechazo.")
    return _marcar(
        informe_id,
        "UPDATE correo_informe SET decision = 'rechazado', decidido_en = now(), decidido_por = %s, nota = %s WHERE id = %s",
        (usuario.email, body.nota.strip()), "rechazado",
    )


@router.post("/{informe_id}/volver-a-pendiente")
def volver_a_pendiente(informe_id: int, usuario: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    """Deshace un rechazo: el informe vuelve a pendiente."""
    return _marcar(
        informe_id,
        "UPDATE correo_informe SET decision = 'pendiente', decidido_en = NULL, decidido_por = NULL"
        " WHERE decision = 'rechazado' AND id = %s",
        (), "pendiente",
    )


@router.post("/{informe_id}/informado")
def informado(informe_id: int, body: DecisionIn, usuario: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    """Anota que el problema ya se le avisó al laboratorio (a quién y qué se pidió, en la nota): no se vuelve a
    alertar por el mismo informe aunque el laboratorio lo siga mandando mal."""
    return _marcar(
        informe_id,
        "UPDATE correo_informe SET informado_en = now(), informado_por = %s, nota_incidente = COALESCE(NULLIF(%s, ''), nota_incidente) WHERE id = %s",
        (usuario.email, body.nota.strip()), "informado",
    )


@router.post("/{informe_id}/resolver")
def resolver(informe_id: int, body: DecisionIn, usuario: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    """Cierra el seguimiento de un informe en rojo (qué se hizo, en la nota del incidente)."""
    return _marcar(
        informe_id,
        "UPDATE correo_informe SET resuelto_en = now(), resuelto_por = %s, nota_incidente = COALESCE(NULLIF(%s, ''), nota_incidente) WHERE id = %s",
        (usuario.email, body.nota.strip()), "resuelto",
    )


@router.get("/{informe_id}")
def detalle(informe_id: int, _: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        _tabla_o_503(cur, f"SELECT c.*, {_CAMPOS_LISTA} {_DESDE} WHERE c.id = %s", (informe_id,))
        fila = cur.fetchone()
    if not fila:
        raise HTTPException(404, "Ese informe no está en la bandeja.")
    fila.pop("r2_key", None)
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT id, llegada_en, estado, para, cc, hallazgos FROM correo_informe c"
            " WHERE %s <> '' AND c.laboratorio = %s AND upper(btrim(c.nro_informe)) = upper(btrim(%s)) ORDER BY c.llegada_en ASC, c.id ASC",
            (fila.get("nro_informe") or "", fila.get("laboratorio"), fila.get("nro_informe") or ""),
        )
        fila["historial"] = [
            {"id": f["id"], "llegada_en": f["llegada_en"], "estado": f["estado"], "para": f["para"], "cc": f["cc"],
             "que_paso": next((h["texto"] for h in (f["hallazgos"] or []) if h.get("nivel") != "info"), "Todo calza con su solicitud.")}
            for f in cur.fetchall()
        ]
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
