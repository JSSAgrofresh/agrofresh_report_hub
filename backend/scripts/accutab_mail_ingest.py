"""
Ingesta automatica de correos AccuTab desde Gmail a Cloudflare R2.

Flujo:
  1. Busca en Gmail emails con etiqueta ACCUTAB_PENDIENTE.
     Para que sea automatico, crear un filtro en Gmail que aplique
     ACCUTAB_PENDIENTE a los correos de AccuTab al llegar.
  2. Por cada email:
     a. Sanitiza el asunto -> nombre de carpeta.
     b. Si ya existe una carpeta con ese nombre, agrega sufijo (2), (3)...
     c. Descarga todos los adjuntos (.csv, .zip, .xlsx, .pdf, ...).
     d. Para archivos .zip: extrae y sube cada entrada preservando la ruta
        interna (PH/, ORP/, etc.).
     e. Sube todos los archivos a R2 bajo accutab/mail/<carpeta>/.
     f. Solo si todo subio bien, anota el correo en el registro de
        procesados (R2, `accutab/_control/procesados.json`) y lo pasa de
        ACCUTAB_PENDIENTE a ACCUTAB_PROCESADO.
  3. Imprime resumen al terminar.

Un correo ya anotado en el registro NO se vuelve a subir aunque siga con la
etiqueta ACCUTAB_PENDIENTE: solo se le corrige la etiqueta. Antes la unica
defensa era la etiqueta, Gmail no la quitaba y cada corrida volvia a subir
todos los correos (carpetas "AGROFRESH_DEMO (582)", "(583)"... y un reporte
duplicado en Post Venta por cada uno).

Primera corrida tras ese arreglo (los pendientes ya se subieron antes):
    .venv\\Scripts\\python.exe scripts\\accutab_mail_ingest.py --solo-marcar
anota y saca de pendientes todo lo que hay, sin subir nada.

Uso (Windows Task Scheduler o manual):
    cd backend
    .venv\\Scripts\\python.exe scripts\\accutab_mail_ingest.py

Variables de entorno requeridas (en backend/.env):
    GMAIL_ACCOUNT
    GMAIL_APP_PASSWORD   (contrasena de aplicacion; IMAP debe estar habilitado)
    R2_ENDPOINT_URL
    R2_ACCESS_KEY_ID
    R2_SECRET_ACCESS_KEY
    R2_BUCKET
"""

from __future__ import annotations

import argparse
import email
import email.policy
import hashlib
import imaplib
import io
import json
import logging
import os
import re
import sys
import unicodedata
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path

# ---------------------------------------------------------------------------
# Bootstrap: asegurar que el paquete `app` sea importable al ejecutar el
# script directamente desde la carpeta backend/ o backend/scripts/.
# ---------------------------------------------------------------------------
_HERE = Path(__file__).resolve().parent
_BACKEND = _HERE.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app import config  # noqa: E402  (importacion post-sys.path)
from app import r2 as _r2  # noqa: E402
from app.accutab_parser import calcular_estadisticas, parsear_archivos_csv  # noqa: E402

# ---------------------------------------------------------------------------
# Configuracion
# ---------------------------------------------------------------------------

LABEL_PROCESADO = "ACCUTAB_PROCESADO"
LABEL_PENDIENTE = "ACCUTAB_PENDIENTE"
R2_PREFIX = "accutab/mail/"
# Fuera de accutab/mail para que Storage no lo muestre como un correo mas.
R2_REGISTRO_PROCESADOS = "accutab/_control/procesados.json"
BATCH_SIZE = 100
MAX_WORKERS = 4          # subidas paralelas a R2 por email
IMAP_HOST = "imap.gmail.com"

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
# Gmail por IMAP (contrasena de aplicacion)
# ---------------------------------------------------------------------------

def _conectar() -> imaplib.IMAP4_SSL:
    """Abre sesion IMAP en Gmail con GMAIL_ACCOUNT + GMAIL_APP_PASSWORD."""
    clave = (config.GMAIL_APP_PASSWORD or "").replace(" ", "")
    if not (config.GMAIL_ACCOUNT and clave):
        raise RuntimeError(
            "Faltan credenciales Gmail en .env: GMAIL_ACCOUNT y GMAIL_APP_PASSWORD"
        )
    try:
        imap = imaplib.IMAP4_SSL(IMAP_HOST, timeout=30)
        imap.login(config.GMAIL_ACCOUNT, clave)
    except imaplib.IMAP4.error as exc:
        raise RuntimeError(
            f"Gmail rechazo el login IMAP ({exc}). Revisa la contrasena de aplicacion "
            "y que IMAP este habilitado en la cuenta."
        ) from exc
    return imap


def _asegurar_label(imap: imaplib.IMAP4_SSL, nombre: str) -> None:
    """En Gmail las etiquetas son carpetas IMAP. Si ya existe, CREATE responde NO y se ignora."""
    imap.create(nombre)


def _listar_pendientes(imap: imaplib.IMAP4_SSL) -> list[bytes]:
    """UIDs de los correos con la etiqueta ACCUTAB_PENDIENTE (los mas viejos primero)."""
    typ, _ = imap.select(f'"{LABEL_PENDIENTE}"')
    if typ != "OK":
        log.warning("No existe la etiqueta %s en Gmail. No se encontraron emails.", LABEL_PENDIENTE)
        return []
    typ, data = imap.uid("SEARCH", None, "ALL")
    if typ != "OK" or not data or not data[0]:
        return []
    return data[0].split()[:BATCH_SIZE]


def _obtener_mensaje(imap: imaplib.IMAP4_SSL, uid: bytes) -> tuple[EmailMessage, bytes]:
    typ, data = imap.uid("FETCH", uid, "(BODY.PEEK[])")
    if typ != "OK" or not data or not isinstance(data[0], tuple):
        raise RuntimeError(f"No se pudo descargar el correo uid={uid.decode()}")
    crudo = data[0][1]
    return email.message_from_bytes(crudo, policy=email.policy.default), crudo  # type: ignore[return-value]


def _asunto_mensaje(mensaje: EmailMessage) -> str:
    return str(mensaje.get("Subject", "") or "").replace("\r", " ").replace("\n", " ").strip()


def _adjuntos(mensaje: EmailMessage) -> list[tuple[str, bytes]]:
    """(nombre_archivo, bytes) de cada adjunto del correo."""
    salida: list[tuple[str, bytes]] = []
    for parte in mensaje.walk():
        nombre = parte.get_filename()
        if not nombre:
            continue
        data = parte.get_payload(decode=True)
        if data is None:
            continue
        salida.append((nombre, data))
    return salida


def _identificador(mensaje: EmailMessage, crudo: bytes) -> str:
    """Identifica un correo para no subirlo dos veces: su Message-ID o, si no
    trae, un hash del correo completo."""
    mid = str(mensaje.get("Message-ID", "") or "").strip()
    if mid:
        return mid
    return "sha256:" + hashlib.sha256(crudo).hexdigest()


def _marcar_procesado(imap: imaplib.IMAP4_SSL, uid: bytes) -> None:
    """Pone ACCUTAB_PROCESADO y saca el correo de ACCUTAB_PENDIENTE.

    La carpeta abierta es ACCUTAB_PENDIENTE. Quitarle esa misma etiqueta con
    `-X-GM-LABELS` no surte efecto aunque Gmail responda OK (por eso los
    correos se reprocesaban). En Gmail, borrar + EXPUNGE dentro de una carpeta
    de etiqueta solo quita ESA etiqueta: el correo sigue en "Todos" y en
    ACCUTAB_PROCESADO, que se pone antes.
    """
    typ, _ = imap.uid("STORE", uid, "+X-GM-LABELS", f'("{LABEL_PROCESADO}")')
    if typ != "OK":
        raise RuntimeError("No se pudo aplicar la etiqueta ACCUTAB_PROCESADO")
    typ, _ = imap.uid("STORE", uid, "+FLAGS", "(\\Deleted)")
    if typ != "OK":
        raise RuntimeError("No se pudo sacar el correo de ACCUTAB_PENDIENTE")
    imap.expunge()
    typ, data = imap.uid("SEARCH", None, f"UID {uid.decode()}")
    if typ == "OK" and data and data[0] and uid in data[0].split():
        raise RuntimeError("Gmail no saco el correo de ACCUTAB_PENDIENTE")


# ---------------------------------------------------------------------------
# Registro de correos ya procesados (R2)
# ---------------------------------------------------------------------------

def _leer_procesados() -> dict[str, dict]:
    datos = _r2.leer_json(R2_REGISTRO_PROCESADOS, {})
    return datos if isinstance(datos, dict) else {}


def _anotar_procesado(procesados: dict[str, dict], ident: str, asunto: str, carpeta: str) -> None:
    procesados[ident] = {
        "asunto": asunto[:200],
        "carpeta": carpeta,
        "procesado_en": datetime.now(tz=timezone.utc).isoformat(),
    }
    _r2.escribir_json(R2_REGISTRO_PROCESADOS, procesados)


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


def _procesar_zip(zip_data: bytes, carpeta_r2: str) -> tuple[list[str], dict[str, bytes]]:
    """Extrae un ZIP y sube cada entrada a R2 preservando la ruta interna.
    Devuelve (keys_subidos, archivos_contenido) para parsing posterior."""
    subidos: list[str] = []
    contenidos: dict[str, bytes] = {}
    with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            nombre_interno = info.filename
            nombre_limpio = nombre_interno.replace("\\", "/").lstrip("/")
            if not nombre_limpio:
                continue
            contenido = zf.read(info)
            key = f"{carpeta_r2}{nombre_limpio}"
            _subir_archivo(key, contenido, Path(nombre_interno).name)
            subidos.append(key)
            contenidos[nombre_limpio] = contenido
    return subidos, contenidos


# ---------------------------------------------------------------------------
# Generacion automatica de reporte
# ---------------------------------------------------------------------------

CARPETA_ACCUTAB = "Accutab"
ARCHIVO_REGISTRO = "registro.json"
_PATRON_CARPETA = re.compile(r"^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$")


def _raiz_accutab() -> str:
    ruta = os.path.normpath(os.path.join(config.STORAGE_DIR, CARPETA_ACCUTAB))
    os.makedirs(ruta, exist_ok=True)
    return ruta


def _generar_reporte(asunto: str, archivos: dict[str, bytes]) -> bool:
    """Parsea los CSV adjuntos y crea un registro.json en Storage/Accutab/
    para que aparezca en el dashboard de Post Venta."""
    filas = parsear_archivos_csv(archivos)
    if not filas:
        log.info("  No se pudo parsear datos pH/ORP de los adjuntos — sin reporte.")
        return False

    estadisticas = calcular_estadisticas(filas)
    raiz = _raiz_accutab()
    momento = datetime.now()
    for _ in range(60):
        marca = momento.strftime("%Y-%m-%d_%H-%M-%S")
        destino = os.path.join(raiz, marca)
        try:
            os.makedirs(destino)
            break
        except FileExistsError:
            momento += timedelta(seconds=1)
    else:
        log.error("  No se pudo reservar carpeta para el reporte.")
        return False

    registro = {
        "guardado_en": datetime.now(tz=timezone.utc).isoformat(),
        "cliente": None,
        "planta": None,
        "equipo": asunto[:120] if asunto else None,
        "responsable": None,
        "limites": None,
        "estadisticas": estadisticas,
        "filas": filas,
        "archivos": [],
        "tiene_pdf": False,
        "origen": "email",
    }
    ruta_json = os.path.join(destino, ARCHIVO_REGISTRO)
    with open(ruta_json, "w", encoding="utf-8") as f:
        json.dump(registro, f, ensure_ascii=False)

    log.info("  Reporte creado: %s (%d filas, pH=%.2f, mV=%.0f)",
             marca, len(filas),
             estadisticas["ph"]["prom"] or 0,
             estadisticas["mv"]["prom"] or 0)
    return True


# ---------------------------------------------------------------------------
# Procesamiento de un email
# ---------------------------------------------------------------------------

def _procesar_email(
    imap: imaplib.IMAP4_SSL,
    uid: bytes,
    carpetas_existentes: set[str],
    procesados: dict[str, dict],
    solo_marcar: bool = False,
) -> dict:
    """
    Procesa un email AccuTab. Devuelve un dict de resumen con:
      - msg_id, asunto, carpeta, archivos_subidos, ok, error, repetido

    Si el correo ya esta en `procesados` (o `solo_marcar`), no sube nada:
    solo lo anota y le corrige la etiqueta.
    """
    msg_id = uid.decode()
    resultado: dict = {"msg_id": msg_id, "asunto": "", "carpeta": "", "archivos_subidos": [], "ok": False, "error": "", "reporte": False, "repetido": False}

    try:
        mensaje, crudo = _obtener_mensaje(imap, uid)
        asunto = _asunto_mensaje(mensaje)
        resultado["asunto"] = asunto
        ident = _identificador(mensaje, crudo)

        if ident in procesados or solo_marcar:
            if ident not in procesados:
                _anotar_procesado(procesados, ident, asunto, "")
            _marcar_procesado(imap, uid)
            resultado["repetido"] = True
            resultado["ok"] = True
            log.info("YA  [%s] ya estaba subido: solo se saca de pendientes.", asunto[:60])
            return resultado

        nombre_base = sanitizar_nombre(asunto)
        carpeta = _nombre_unico(nombre_base, carpetas_existentes)
        carpetas_existentes.add(carpeta)
        resultado["carpeta"] = carpeta
        carpeta_r2 = f"{R2_PREFIX}{carpeta}/"

        adjuntos = _adjuntos(mensaje)

        if not adjuntos:
            log.warning("[%s] Sin adjuntos — carpeta vacia en R2.", asunto[:60])

        archivos_subidos: list[str] = []
        todos_contenidos: dict[str, bytes] = {}

        def _subir(item: tuple[str, bytes]) -> tuple[list[str], dict[str, bytes]]:
            nombre, data = item
            ext = Path(nombre).suffix.lower()
            if ext == ".zip":
                return _procesar_zip(data, carpeta_r2)
            else:
                key = f"{carpeta_r2}{nombre}"
                _subir_archivo(key, data, nombre)
                return [key], {nombre: data}

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futuros = {pool.submit(_subir, adj): adj[0] for adj in adjuntos}
            for fut in as_completed(futuros):
                nombre_adj = futuros[fut]
                try:
                    keys, contenidos = fut.result()
                    archivos_subidos.extend(keys)
                    todos_contenidos.update(contenidos)
                except Exception as exc:
                    raise RuntimeError(f"Error subiendo '{nombre_adj}': {exc}") from exc

        resultado["archivos_subidos"] = archivos_subidos

        resultado["reporte"] = _generar_reporte(asunto, todos_contenidos)

        # Se anota ANTES de tocar la etiqueta: si la etiqueta falla, la
        # proxima corrida lo reconoce y no lo vuelve a subir.
        _anotar_procesado(procesados, ident, asunto, carpeta)
        _marcar_procesado(imap, uid)

        resultado["ok"] = True
        log.info("OK  [%s] → %s (%d archivo/s, reporte=%s)", asunto[:60], carpeta, len(archivos_subidos), resultado["reporte"])

    except Exception as exc:
        resultado["error"] = str(exc)
        log.error("ERR [%s] %s: %s", resultado.get("asunto", msg_id)[:60], msg_id, exc)

    return resultado


# ---------------------------------------------------------------------------
# Punto de entrada
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Ingesta de correos AccuTab desde Gmail a R2.")
    ap.add_argument(
        "--solo-marcar", action="store_true",
        help="No sube nada: anota los pendientes como ya procesados y los saca "
             "de ACCUTAB_PENDIENTE. Para la primera corrida tras el arreglo.",
    )
    args = ap.parse_args(argv)
    log.info("=== AccuTab Mail Ingest ===%s", " (solo marcar)" if args.solo_marcar else "")

    if not _r2.disponible():
        log.error("R2 no esta configurado. Verifica R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET en .env")
        return 1

    try:
        imap = _conectar()
    except (RuntimeError, OSError) as exc:
        log.error("No se pudo conectar a Gmail: %s", exc)
        return 1

    try:
        return _ejecutar(imap, solo_marcar=args.solo_marcar)
    finally:
        try:
            imap.logout()
        except Exception:
            pass


def _ejecutar(imap: imaplib.IMAP4_SSL, solo_marcar: bool = False) -> int:
    _asegurar_label(imap, LABEL_PROCESADO)
    _asegurar_label(imap, LABEL_PENDIENTE)

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
    ids = _listar_pendientes(imap)
    log.info("Emails pendientes a procesar: %d", len(ids))

    if not ids:
        log.info("Nada que procesar.")
        return 0

    procesados = _leer_procesados()

    resultados = []
    for msg_id in ids:
        r = _procesar_email(imap, msg_id, carpetas_existentes, procesados, solo_marcar)
        resultados.append(r)

    # Resumen
    repetidos = [r for r in resultados if r["ok"] and r["repetido"]]
    ok = [r for r in resultados if r["ok"] and not r["repetido"]]
    err = [r for r in resultados if not r["ok"]]
    total_archivos = sum(len(r["archivos_subidos"]) for r in ok)

    log.info("=== Resumen ===")
    log.info("  Procesados OK : %d", len(ok))
    log.info("  Ya subidos    : %d (solo se sacaron de pendientes)", len(repetidos))
    log.info("  Con errores   : %d", len(err))
    log.info("  Archivos en R2: %d", total_archivos)
    if err:
        for r in err:
            log.error("  FALLO [%s]: %s", r["asunto"][:60], r["error"])

    return 0 if not err else 2


if __name__ == "__main__":
    sys.exit(main())
