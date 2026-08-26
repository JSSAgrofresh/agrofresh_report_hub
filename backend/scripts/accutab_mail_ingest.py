"""
Ingesta automatica de correos AccuTab desde Gmail a Cloudflare R2.

Deteccion automatica: busca correos cuyo remitente contenga "accutab"
O cuyo asunto contenga "accutab". No necesita etiquetas manuales.

Flujo:
  1. Busca en Gmail emails que coincidan con el criterio AccuTab y que
     NO tengan la etiqueta ACCUTAB_PROCESADO.
  2. Por cada email:
     a. Sanitiza el asunto -> nombre de carpeta.
     b. Si ya existe una carpeta con ese nombre, agrega sufijo (2), (3)...
     c. Descarga todos los adjuntos (.csv, .zip, .xlsx, .pdf, ...).
     d. Para archivos .zip: extrae y sube cada entrada preservando la ruta
        interna (PH/, ORP/, etc.).
     e. Sube todos los archivos a R2 bajo accutab/mail/<carpeta>/.
     f. Solo si todo subio bien, aplica la etiqueta ACCUTAB_PROCESADO.
  3. Imprime resumen al terminar.

Uso (Windows Task Scheduler o manual):
    cd backend
    .venv\\Scripts\\python.exe scripts\\accutab_mail_ingest.py

Variables de entorno requeridas (en backend/.env):
    GMAIL_CLIENT_ID
    GMAIL_CLIENT_SECRET
    GMAIL_REFRESH_TOKEN
    GMAIL_ACCOUNT
    R2_ENDPOINT_URL
    R2_ACCESS_KEY_ID
    R2_SECRET_ACCESS_KEY
    R2_BUCKET
"""

from __future__ import annotations

import base64
import io
import logging
import os
import re
import sys
import unicodedata
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Bootstrap: asegurar que el paquete `app` sea importable al ejecutar el
# script directamente desde la carpeta backend/ o backend/scripts/.
# ---------------------------------------------------------------------------
_HERE = Path(__file__).resolve().parent
_BACKEND = _HERE.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app import config  # noqa: E402  (importacion post-sys.path)

# Importar r2 despues de ajustar el path
from app import r2 as _r2  # noqa: E402

# ---------------------------------------------------------------------------
# Configuracion
# ---------------------------------------------------------------------------

LABEL_PROCESADO = "ACCUTAB_PROCESADO"
QUERY_ACCUTAB = "(from:accutab OR subject:accutab) has:attachment"
R2_PREFIX = "accutab/mail/"
BATCH_SIZE = 100
MAX_WORKERS = 4          # subidas paralelas a R2 por email
GMAIL_API = "https://gmail.googleapis.com/gmail/v1"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("accutab_ingest")

# ---------------------------------------------------------------------------
# Utilidades de texto
# ---------------------------------------------------------------------------

_CHARS_INVALIDOS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_ESPACIOS_MULTIPLES = re.compile(r"\s+")


def sanitizar_nombre(texto: str) -> str:
    """Convierte un asunto de correo en nombre de carpeta seguro para R2 y Windows."""
    # Normalizar Unicode (acentos → ASCII cuando sea posible)
    normalizado = unicodedata.normalize("NFKD", texto)
    sin_combining = "".join(c for c in normalizado if unicodedata.category(c) != "Mn")
    # Reemplazar caracteres invalidos
    limpio = _CHARS_INVALIDOS.sub("_", sin_combining)
    # Colapsar espacios/guiones bajos multiples
    limpio = _ESPACIOS_MULTIPLES.sub(" ", limpio).strip()
    # Truncar (R2 admite hasta 1024 bytes, dejar margen para el sufijo)
    return limpio[:200] or "sin_asunto"


def _nombre_unico(base: str, existentes: set[str]) -> str:
    """Devuelve base si no esta en existentes; si no, agrega (2), (3), ..."""
    if base not in existentes:
        return base
    i = 2
    while f"{base} ({i})" in existentes:
        i += 1
    return f"{base} ({i})"


# ---------------------------------------------------------------------------
# Gmail API helpers
# ---------------------------------------------------------------------------

def _access_token() -> str:
    """Obtiene un access_token fresco usando el refresh_token del .env."""
    if not (config.GMAIL_CLIENT_ID and config.GMAIL_CLIENT_SECRET and config.GMAIL_REFRESH_TOKEN):
        raise RuntimeError(
            "Faltan credenciales Gmail en .env: "
            "GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN"
        )
    resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": config.GMAIL_CLIENT_ID,
            "client_secret": config.GMAIL_CLIENT_SECRET,
            "refresh_token": config.GMAIL_REFRESH_TOKEN,
            "grant_type": "refresh_token",
        },
        timeout=15,
    )
    if resp.status_code != 200:
        data = resp.json()
        raise RuntimeError(f"Error OAuth: {data.get('error_description', resp.text)}")
    token = resp.json().get("access_token")
    if not token:
        raise RuntimeError("Google no devolvio access_token")
    return token


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Gestion de etiquetas Gmail
# ---------------------------------------------------------------------------

def _obtener_o_crear_label(token: str, nombre: str) -> str:
    """Devuelve el id de la etiqueta, creandola si no existe."""
    resp = requests.get(f"{GMAIL_API}/users/me/labels", headers=_headers(token), timeout=10)
    resp.raise_for_status()
    for label in resp.json().get("labels", []):
        if label["name"] == nombre:
            return label["id"]
    # Crear
    resp2 = requests.post(
        f"{GMAIL_API}/users/me/labels",
        json={"name": nombre, "labelListVisibility": "labelShow", "messageListVisibility": "show"},
        headers=_headers(token),
        timeout=10,
    )
    resp2.raise_for_status()
    return resp2.json()["id"]


def _listar_mensajes_pendientes(token: str, label_procesado_id: str) -> list[str]:
    """
    Devuelve ids de mensajes AccuTab no procesados.
    Busca automaticamente correos de AccuTab (por remitente o asunto)
    que NO tengan la etiqueta ACCUTAB_PROCESADO.
    """
    params: dict = {
        "maxResults": BATCH_SIZE,
        "q": f"-label:{LABEL_PROCESADO} {QUERY_ACCUTAB}",
    }

    ids: list[str] = []
    page_token = None
    while True:
        p = dict(params)
        if page_token:
            p["pageToken"] = page_token
        resp = requests.get(f"{GMAIL_API}/users/me/messages", headers=_headers(token), params=p, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        for m in data.get("messages", []):
            ids.append(m["id"])
        page_token = data.get("nextPageToken")
        if not page_token or len(ids) >= BATCH_SIZE:
            break
    return ids[:BATCH_SIZE]


def _obtener_mensaje(token: str, msg_id: str) -> dict:
    resp = requests.get(
        f"{GMAIL_API}/users/me/messages/{msg_id}",
        headers=_headers(token),
        params={"format": "full"},
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def _asunto_mensaje(mensaje: dict) -> str:
    for header in mensaje.get("payload", {}).get("headers", []):
        if header["name"].lower() == "subject":
            return header["value"]
    return ""


def _extraer_partes(payload: dict) -> list[dict]:
    """Aplana recursivamente todas las partes del mensaje MIME."""
    partes: list[dict] = []
    if "parts" in payload:
        for p in payload["parts"]:
            partes.extend(_extraer_partes(p))
    else:
        partes.append(payload)
    return partes


def _descargar_attachment(token: str, msg_id: str, attachment_id: str) -> bytes:
    resp = requests.get(
        f"{GMAIL_API}/users/me/messages/{msg_id}/attachments/{attachment_id}",
        headers=_headers(token),
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json().get("data", "")
    # Gmail API usa base64url
    return base64.urlsafe_b64decode(data + "==")


def _datos_adjunto(token: str, msg_id: str, parte: dict) -> tuple[str, bytes] | None:
    """Devuelve (nombre_archivo, bytes) o None si la parte no es adjunto."""
    filename = parte.get("filename", "")
    if not filename:
        return None
    body = parte.get("body", {})
    att_id = body.get("attachmentId")
    if att_id:
        data = _descargar_attachment(token, msg_id, att_id)
    else:
        raw = body.get("data", "")
        if not raw:
            return None
        data = base64.urlsafe_b64decode(raw + "==")
    return filename, data


# ---------------------------------------------------------------------------
# Subida a R2
# ---------------------------------------------------------------------------

_CONTENT_TYPES: dict[str, str] = {
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".txt": "text/plain",
    ".json": "application/json",
}


def _content_type(nombre: str) -> str:
    ext = Path(nombre).suffix.lower()
    return _CONTENT_TYPES.get(ext, "application/octet-stream")


def _subir_archivo(r2_key: str, data: bytes, nombre: str) -> None:
    _r2.subir(r2_key, data, _content_type(nombre))


def _procesar_zip(zip_data: bytes, carpeta_r2: str) -> list[str]:
    """Extrae un ZIP y sube cada entrada a R2 preservando la ruta interna."""
    subidos: list[str] = []
    with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            nombre_interno = info.filename
            # Sanitizar separadores de ruta internos (ZIP usa '/')
            nombre_limpio = nombre_interno.replace("\\", "/").lstrip("/")
            if not nombre_limpio:
                continue
            contenido = zf.read(info)
            key = f"{carpeta_r2}{nombre_limpio}"
            _subir_archivo(key, contenido, Path(nombre_interno).name)
            subidos.append(key)
    return subidos


# ---------------------------------------------------------------------------
# Procesamiento de un email
# ---------------------------------------------------------------------------

def _procesar_email(
    token: str,
    msg_id: str,
    carpetas_existentes: set[str],
    label_procesado_id: str,
) -> dict:
    """
    Procesa un email AccuTab. Devuelve un dict de resumen con:
      - msg_id, asunto, carpeta, archivos_subidos, ok, error
    """
    resultado: dict = {"msg_id": msg_id, "asunto": "", "carpeta": "", "archivos_subidos": [], "ok": False, "error": ""}

    try:
        mensaje = _obtener_mensaje(token, msg_id)
        asunto = _asunto_mensaje(mensaje)
        resultado["asunto"] = asunto

        nombre_base = sanitizar_nombre(asunto)
        carpeta = _nombre_unico(nombre_base, carpetas_existentes)
        carpetas_existentes.add(carpeta)  # reservar para emails siguientes en el mismo lote
        resultado["carpeta"] = carpeta
        carpeta_r2 = f"{R2_PREFIX}{carpeta}/"

        partes = _extraer_partes(mensaje.get("payload", {}))
        adjuntos: list[tuple[str, bytes]] = []
        for parte in partes:
            adj = _datos_adjunto(token, msg_id, parte)
            if adj:
                adjuntos.append(adj)

        if not adjuntos:
            log.warning("[%s] Sin adjuntos — carpeta vacia en R2.", asunto[:60])

        archivos_subidos: list[str] = []

        def _subir(item: tuple[str, bytes]) -> list[str]:
            nombre, data = item
            ext = Path(nombre).suffix.lower()
            if ext == ".zip":
                return _procesar_zip(data, carpeta_r2)
            else:
                key = f"{carpeta_r2}{nombre}"
                _subir_archivo(key, data, nombre)
                return [key]

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futuros = {pool.submit(_subir, adj): adj[0] for adj in adjuntos}
            for fut in as_completed(futuros):
                nombre_adj = futuros[fut]
                try:
                    archivos_subidos.extend(fut.result())
                except Exception as exc:
                    raise RuntimeError(f"Error subiendo '{nombre_adj}': {exc}") from exc

        resultado["archivos_subidos"] = archivos_subidos

        # Marcar como procesado solo si todo subio bien
        modify_body: dict = {
            "addLabelIds": [label_procesado_id],
            "removeLabelIds": [],
        }

        resp = requests.post(
            f"{GMAIL_API}/users/me/messages/{msg_id}/modify",
            json=modify_body,
            headers=_headers(token),
            timeout=15,
        )
        resp.raise_for_status()

        resultado["ok"] = True
        log.info("OK  [%s] → %s (%d archivo/s)", asunto[:60], carpeta, len(archivos_subidos))

    except Exception as exc:
        resultado["error"] = str(exc)
        log.error("ERR [%s] %s: %s", resultado.get("asunto", msg_id)[:60], msg_id, exc)

    return resultado


# ---------------------------------------------------------------------------
# Punto de entrada
# ---------------------------------------------------------------------------

def main() -> int:
    log.info("=== AccuTab Mail Ingest ===")

    if not _r2.disponible():
        log.error("R2 no esta configurado. Verifica R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET en .env")
        return 1

    try:
        token = _access_token()
    except RuntimeError as exc:
        log.error("No se pudo obtener token Gmail: %s", exc)
        return 1

    # Obtener o crear etiqueta de control
    label_procesado_id = _obtener_o_crear_label(token, LABEL_PROCESADO)
    log.info("Etiqueta procesado: %s", label_procesado_id)
    log.info("Busqueda automatica: %s", QUERY_ACCUTAB)

    # Determinar carpetas ya existentes en R2 (para deduplicacion de nombres)
    keys_existentes = _r2.listar_keys(R2_PREFIX)
    carpetas_existentes: set[str] = set()
    for k in keys_existentes:
        # "accutab/mail/Nombre Carpeta/archivo.csv" → "Nombre Carpeta"
        relativo = k[len(R2_PREFIX):]
        partes = relativo.split("/", 1)
        if partes[0]:
            carpetas_existentes.add(partes[0])

    log.info("Carpetas existentes en R2: %d", len(carpetas_existentes))

    # Listar mensajes pendientes
    ids = _listar_mensajes_pendientes(token, label_procesado_id)
    log.info("Emails pendientes a procesar: %d", len(ids))

    if not ids:
        log.info("Nada que procesar.")
        return 0

    resultados = []
    for msg_id in ids:
        r = _procesar_email(token, msg_id, carpetas_existentes, label_procesado_id)
        resultados.append(r)

    # Resumen
    ok = [r for r in resultados if r["ok"]]
    err = [r for r in resultados if not r["ok"]]
    total_archivos = sum(len(r["archivos_subidos"]) for r in ok)

    log.info("=== Resumen ===")
    log.info("  Procesados OK : %d", len(ok))
    log.info("  Con errores   : %d", len(err))
    log.info("  Archivos en R2: %d", total_archivos)
    if err:
        for r in err:
            log.error("  FALLO [%s]: %s", r["asunto"][:60], r["error"])

    return 0 if not err else 2


if __name__ == "__main__":
    sys.exit(main())
