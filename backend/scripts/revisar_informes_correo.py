"""
Revisión (SOLO LECTURA) de los informes de resultados: qué hay en el sistema y qué llegó al correo.

Sirve para decidir, antes de construir la recepción automática de informes, si lo que
llega por correo calza con lo que esperamos. NO escribe en la base, NO sube nada a R2,
NO envía correos y NO toca el buzón: abre la carpeta en modo solo lectura y baja los
mensajes con BODY.PEEK (no los marca como leídos, no mueve etiquetas, no borra).

Qué hace:
  1. SISTEMA (base de datos): por laboratorio, cuántas solicitudes hay, cuántas salieron al
     laboratorio, cuántas tienen informe (PDF de Converter) o resultados en Report, la fecha
     del último informe, los N° de informe de ejemplo y las solicitudes enviadas hace más de
     N días que siguen sin informe.
  2. CORREO: recorre los correos con adjuntos de los últimos N días, lee el texto de cada PDF
     (pypdf) y deduce laboratorio, OT (OT-AGF0075…) y N° de informe. Cada correo queda como:
        NUEVO          el informe no está en el sistema todavía (lo que la recepción automática cargaría)
        YA CARGADO     su N° de informe ya está en Converter/Report
        OT DESCONOCIDA el correo trae una OT que no existe en el índice de solicitudes
        SIN DATOS      no se pudo deducir laboratorio ni N° de informe del PDF
        SALIENTE       lo mandó una de nuestras cuentas (p. ej. la solicitud al laboratorio)
  3. RESUMEN por laboratorio, remitentes más frecuentes (para saber de quién fiarse) y las
     solicitudes enviadas cuyo informe no apareció en el correo.

Dos buzones: el del Report Hub (por defecto GMAIL_ACCOUNT / GMAIL_APP_PASSWORD del .env) y
otro cualquiera (el de Jorge, que sale en copia de todas las solicitudes) con --cuenta y
--host. La clave del segundo buzón se toma de una variable de entorno (--clave-env) o se
pide por teclado; NUNCA se pasa como argumento ni se imprime.

Uso (PowerShell, dentro de backend):
    .venv\\Scripts\\python.exe scripts\\revisar_informes_correo.py
    .venv\\Scripts\\python.exe scripts\\revisar_informes_correo.py --dias 60 --lab Quiteca
    .venv\\Scripts\\python.exe scripts\\revisar_informes_correo.py --solo-sistema
    .venv\\Scripts\\python.exe scripts\\revisar_informes_correo.py --solo-correo --json logs\\revision_correo.json

    # El buzón de Jorge (pide la clave por teclado; --host según el proveedor):
    .venv\\Scripts\\python.exe scripts\\revisar_informes_correo.py --solo-correo `
        --cuenta jorge.sandoval@agrofresh.com --host imap.gmail.com

Es una lectura heurística: la detección de laboratorio y de N° de informe se parece a la del
Converter pero no es la misma. Sirve para mirar, no para cargar.
"""
from __future__ import annotations

import argparse
import email
import email.policy
import getpass
import imaplib
import io
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from email.utils import getaddresses, parsedate_to_datetime
from pathlib import Path
from typing import Any

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

IMAP_HOST_GMAIL = "imap.gmail.com"
MAX_PDF_BYTES = 15 * 1024 * 1024
LABS = ("AgroFresh", "Quiteca", "ALS", "Diagnofruit")


# ---------------------------------------------------------------------------
# Texto: funciones puras (con pruebas en tests/test_revisar_informes_correo.py)
# ---------------------------------------------------------------------------

def plano(texto: str) -> str:
    """Minúsculas, sin tildes y con los espacios colapsados."""
    t = unicodedata.normalize("NFKD", texto or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip().lower()


def detectar_laboratorio(texto: str) -> str | None:
    """Espejo, en Python, de `detectar` del Converter (public/modules/converter.html)."""
    t = plano(texto)
    if re.search(r"solicitud de an[aá]lisis\s+n°\s*ot-", texto or "", re.I) and "agrofresh.com" in t:
        return "AgroFresh"
    if re.search(r"informe de an[aá]lisis\s+n[°º]?\s*agf\d", texto or "", re.I) and re.search(
        r"n[°º] solicitud\s+ot-", texto or "", re.I
    ):
        return "AgroFresh"
    if "quiteca" in t:
        return "Quiteca"
    if "diagnofruit" in t:
        return "Diagnofruit"
    if "microbiologia" in t and ("als food" in t or "alsfoodchile" in t or "alsglobal" in t or (
        "laboratorio microbiologia" in t and "identificacion muestra (ni)" in t
    )):
        return "ALS"
    if "corthorn" in t or "cromatografia" in t:
        return "ALS"
    return None


_OT = re.compile(r"\bOT\s*-?\s*([A-Z]{2,5})\s*-?\s*(\d{3,5})\b", re.I)


def extraer_ots(texto: str) -> list[str]:
    """Todas las OT del texto, normalizadas a «OT-AGF0075». Une las que ALS parte en
    «OT-» / «ALS0007» (el regex tolera el salto de línea entre las dos mitades)."""
    vistas: list[str] = []
    for m in _OT.finditer(texto or ""):
        ot = f"OT-{m.group(1).upper()}{m.group(2)}"
        if ot not in vistas:
            vistas.append(ot)
    return vistas


def extraer_nro_informe(texto: str, laboratorio: str | None) -> str | None:
    """El N° de informe del laboratorio, a partir del texto de su PDF (heurístico)."""
    texto = texto or ""
    if laboratorio == "Quiteca":
        m = re.search(r"Informe N°\s*([\w-]+)", texto)
        return m.group(1) if m else None
    if laboratorio == "AgroFresh":
        m = re.search(r"INFORME DE AN[ÁA]LISIS\s+N[°º]?\s*(AGF[\w-]+)", texto, re.I)
        return m.group(1).upper() if m else None
    if laboratorio == "Diagnofruit":
        m = re.search(r"\b(\d{5,7}-DIAG\d{3,5})\b", texto, re.I)
        if m:
            return m.group(1).upper()
        m = re.search(r"Informe\s*(?:N°|Nº|No\.?)?\s*:?\s*(\d[\w-]+)", texto, re.I)
        return m.group(1) if m else None
    if laboratorio == "ALS":
        m = re.search(r"(?:Informe|Certificado)\s*(?:de\s+\w+\s*)?(?:N°|Nº|No\.?)\s*:?\s*([\w-]+)", texto, re.I)
        return m.group(1) if m else None
    return None


def laboratorio_por_remitente(remitente: str) -> str | None:
    """Pista barata cuando el PDF no se puede leer: el dominio o nombre del remitente."""
    r = plano(remitente)
    for clave, lab in (("quiteca", "Quiteca"), ("diagnofruit", "Diagnofruit"),
                       ("alsglobal", "ALS"), ("alsfood", "ALS"), ("als", "ALS")):
        if clave in r:
            return lab
    return None


def clasificar(
    *, saliente: bool, laboratorio: str | None, nro_informe: str | None, ots: list[str],
    informes_cargados: set[str], ots_conocidas: set[str],
) -> str:
    """El estado de un correo frente al sistema (ver la docstring del módulo)."""
    if saliente:
        return "SALIENTE"
    if nro_informe and nro_informe.upper() in informes_cargados:
        return "YA CARGADO"
    if ots and not any(o in ots_conocidas for o in ots):
        return "OT DESCONOCIDA"
    if not laboratorio and not nro_informe:
        return "SIN DATOS"
    return "NUEVO"


# ---------------------------------------------------------------------------
# Sistema (base de datos), solo lectura
# ---------------------------------------------------------------------------

def _filas(cur, sql: str, params: tuple = ()) -> list[dict]:
    """Una consulta que tolera que su tabla/columna no exista todavía en el servidor."""
    import psycopg2

    try:
        cur.execute("SAVEPOINT revision")
        cur.execute(sql, params)
        filas = cur.fetchall()
        cur.execute("RELEASE SAVEPOINT revision")
        return [dict(f) for f in filas]
    except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
        cur.execute("ROLLBACK TO SAVEPOINT revision")
        return []


def _norm_lab(lab: Any) -> str:
    """AGROFRESH / Agrofresh / «ALS (Corthon)» → una clave comparable."""
    t = plano(str(lab or ""))
    t = re.sub(r"\(.*?\)", "", t).strip()
    for clave, nombre in (("agrofresh", "AgroFresh"), ("quiteca", "Quiteca"), ("diagnofruit", "Diagnofruit"), ("als", "ALS")):
        if t.startswith(clave):
            return nombre
    return (lab or "(sin laboratorio)").strip() or "(sin laboratorio)"


def leer_sistema(dias_sin_informe: int) -> dict[str, Any]:
    from app.db import conexion, cursor_dict

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        solicitudes = _filas(
            cur, "SELECT archivo, numero_solicitud, laboratorio, ship_to, especie, fecha_muestreo, creado_en"
                 " FROM solicitud_archivo ORDER BY numero_solicitud")
        envios = _filas(
            cur, "SELECT archivo, MIN(creado_en) AS primero FROM envio_solicitud_log"
                 " WHERE exitoso GROUP BY archivo")
        auditoria = _filas(
            cur, "SELECT archivo_solicitud, numero_solicitud, nro_informe, laboratorio, subido_en FROM informe_auditoria")
        report = _filas(
            cur, "SELECT nro_solicitud, referencia, laboratorio, fecha_muestreo FROM solicitud")

    enviada_en = {e["archivo"]: e["primero"] for e in envios}
    ots_con_informe: set[str] = set()
    for a in auditoria:
        if a["numero_solicitud"]:
            ots_con_informe.add(str(a["numero_solicitud"]).strip().upper())
    for r in report:
        ref = str(r.get("referencia") or "").strip().upper()
        if ref.startswith("OT"):
            ots_con_informe.add(ref)

    por_lab: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "solicitudes": 0, "enviadas": 0, "con_informe": 0, "informes_converter": 0,
        "informes_report": 0, "ultimo_informe": None, "ejemplos_nro": [], "sin_informe_atrasadas": [],
    })
    ahora = datetime.now().astimezone()
    for s in solicitudes:
        lab = _norm_lab(s["laboratorio"])
        d = por_lab[lab]
        d["solicitudes"] += 1
        ot = str(s["numero_solicitud"] or "").strip().upper()
        if s["archivo"] in enviada_en:
            d["enviadas"] += 1
        if ot in ots_con_informe:
            d["con_informe"] += 1
        elif s["archivo"] in enviada_en and not ot.startswith("OTP-"):
            envio = enviada_en[s["archivo"]]
            if envio and (ahora - envio).days >= dias_sin_informe:
                d["sin_informe_atrasadas"].append({"ot": ot, "enviada": envio.date().isoformat(),
                                                   "dias": (ahora - envio).days, "ship_to": s["ship_to"]})
    for a in auditoria:
        d = por_lab[_norm_lab(a["laboratorio"])]
        d["informes_converter"] += 1
        if a["nro_informe"] and len(d["ejemplos_nro"]) < 4:
            d["ejemplos_nro"].append(a["nro_informe"])
        if a["subido_en"] and (d["ultimo_informe"] is None or a["subido_en"] > d["ultimo_informe"]):
            d["ultimo_informe"] = a["subido_en"]
    for r in report:
        por_lab[_norm_lab(r["laboratorio"])]["informes_report"] += 1

    informes_cargados = {str(a["nro_informe"]).strip().upper() for a in auditoria if a["nro_informe"]}
    informes_cargados |= {str(r["nro_solicitud"]).strip().upper() for r in report if r["nro_solicitud"]}
    ots_conocidas = {str(s["numero_solicitud"]).strip().upper() for s in solicitudes if s["numero_solicitud"]}
    return {"por_lab": dict(por_lab), "informes_cargados": informes_cargados, "ots_conocidas": ots_conocidas,
            "enviada_en": {s["numero_solicitud"]: enviada_en.get(s["archivo"]) for s in solicitudes if s["numero_solicitud"]}}


def imprimir_sistema(sis: dict[str, Any], solo: str) -> None:
    print("\n" + "=" * 78)
    print("1. LO QUE HAY EN EL SISTEMA (por laboratorio)")
    print("=" * 78)
    if not sis["por_lab"]:
        print("  No se encontraron solicitudes (¿base sin migrar o sin datos?).")
        return
    for lab, d in sorted(sis["por_lab"].items()):
        if solo and lab.lower() != solo.lower():
            continue
        ult = d["ultimo_informe"].astimezone().strftime("%d-%m-%Y %H:%M") if d["ultimo_informe"] else "—"
        print(f"\n  {lab}")
        print(f"    solicitudes: {d['solicitudes']}   enviadas al laboratorio: {d['enviadas']}   con informe: {d['con_informe']}")
        print(f"    informes en Converter: {d['informes_converter']}   filas en Report: {d['informes_report']}   último informe subido: {ult}")
        if d["ejemplos_nro"]:
            print(f"    ejemplos de N° de informe: {', '.join(d['ejemplos_nro'])}")
        atras = sorted(d["sin_informe_atrasadas"], key=lambda x: -x["dias"])
        if atras:
            print(f"    enviadas y SIN informe (>= plazo): {len(atras)}")
            for x in atras[:5]:
                print(f"      · {x['ot']}  enviada {x['enviada']} ({x['dias']} d)  {x['ship_to'] or ''}")
            if len(atras) > 5:
                print(f"      … y {len(atras) - 5} más")


# ---------------------------------------------------------------------------
# Correo (IMAP, solo lectura)
# ---------------------------------------------------------------------------

def conectar(host: str, cuenta: str, clave: str) -> imaplib.IMAP4_SSL:
    try:
        imap = imaplib.IMAP4_SSL(host, timeout=30)
        imap.login(cuenta, clave)
    except imaplib.IMAP4.error as exc:
        raise RuntimeError(f"El buzón rechazó el login IMAP ({exc}). Revisa la clave y que IMAP esté habilitado.") from exc
    return imap


def _texto_pdf(datos: bytes) -> str:
    if len(datos) > MAX_PDF_BYTES or not datos.startswith(b"%PDF"):
        return ""
    try:
        from pypdf import PdfReader

        lector = PdfReader(io.BytesIO(datos))
        if lector.is_encrypted:
            lector.decrypt("")
        return "\n".join((p.extract_text() or "") for p in lector.pages)
    except Exception:  # noqa: BLE001 — un PDF dañado no frena la revisión
        return ""


def _direcciones(mensaje: EmailMessage, *campos: str) -> list[str]:
    return [a.lower() for _, a in getaddresses([str(mensaje.get(c, "") or "") for c in campos]) if a]


def revisar_mensaje(mensaje: EmailMessage, propias: set[str], sis: dict[str, Any]) -> dict[str, Any] | None:
    """Una fila de la revisión, o None si el correo no trae adjuntos."""
    adjuntos: list[tuple[str, bytes]] = []
    for parte in mensaje.walk():
        nombre = parte.get_filename()
        if nombre:
            datos = parte.get_payload(decode=True)
            if datos is not None:
                adjuntos.append((str(nombre), datos))
    if not adjuntos:
        return None

    de = _direcciones(mensaje, "From")
    remitente = de[0] if de else ""
    asunto = str(mensaje.get("Subject", "") or "").replace("\r", " ").replace("\n", " ").strip()
    try:
        fecha = parsedate_to_datetime(str(mensaje.get("Date", ""))).astimezone().date().isoformat()
    except Exception:  # noqa: BLE001
        fecha = ""
    cuerpo = mensaje.get_body(preferencelist=("plain", "html"))
    texto_cuerpo = cuerpo.get_content() if cuerpo is not None else ""

    pdfs = [(n, d) for n, d in adjuntos if n.lower().endswith(".pdf")]
    texto_pdf = "\n".join(_texto_pdf(d) for _, d in pdfs)
    fuente = f"{asunto}\n{texto_cuerpo}\n{texto_pdf}"

    laboratorio = detectar_laboratorio(texto_pdf) or laboratorio_por_remitente(remitente) \
        or detectar_laboratorio(f"{asunto}\n{texto_cuerpo}")
    nro = extraer_nro_informe(texto_pdf, laboratorio) if texto_pdf else None
    ots = extraer_ots(fuente)
    estado = clasificar(
        saliente=remitente in propias, laboratorio=laboratorio, nro_informe=nro, ots=ots,
        informes_cargados=sis["informes_cargados"], ots_conocidas=sis["ots_conocidas"],
    )
    return {
        "fecha": fecha, "de": remitente, "asunto": asunto, "laboratorio": laboratorio, "nro_informe": nro,
        "ots": ots, "estado": estado, "adjuntos": [n for n, _ in adjuntos], "pdfs": len(pdfs),
        "pdf_legible": bool(texto_pdf.strip()),
        "para": _direcciones(mensaje, "To"), "cc": _direcciones(mensaje, "Cc"),
    }


def leer_buzon(imap: imaplib.IMAP4_SSL, carpeta: str, dias: int, maximo: int, host: str) -> list[EmailMessage]:
    """Los mensajes con adjuntos de los últimos `dias`, en SOLO LECTURA (BODY.PEEK)."""
    typ, _ = imap.select(f'"{carpeta}"', readonly=True)
    if typ != "OK":
        raise RuntimeError(f"No se pudo abrir la carpeta «{carpeta}» (usa --carpeta; en Gmail: «[Gmail]/Todos los mensajes»).")
    desde = (date.today() - timedelta(days=dias)).strftime("%d-%b-%Y")
    if host == IMAP_HOST_GMAIL:
        typ, data = imap.uid("SEARCH", "X-GM-RAW", f'"has:attachment after:{(date.today() - timedelta(days=dias)).strftime("%Y/%m/%d")}"')
    else:
        typ, data = imap.uid("SEARCH", None, "SINCE", desde)
    if typ != "OK" or not data or not data[0]:
        return []
    uids = data[0].split()[-maximo:]
    salida: list[EmailMessage] = []
    for uid in uids:
        typ, datos = imap.uid("FETCH", uid, "(BODY.PEEK[])")
        if typ == "OK" and datos and isinstance(datos[0], tuple):
            salida.append(email.message_from_bytes(datos[0][1], policy=email.policy.default))  # type: ignore[arg-type]
    return salida


def imprimir_correo(filas: list[dict[str, Any]], buzon: str, solo: str, sis: dict[str, Any], dias_sin_informe: int) -> None:
    print("\n" + "=" * 78)
    print(f"2. LO QUE LLEGÓ AL CORREO ({buzon})")
    print("=" * 78)
    filas = [f for f in filas if not solo or (f["laboratorio"] or "").lower() == solo.lower()]
    if not filas:
        print("  Sin correos con adjuntos en el período.")
        return
    print(f"  {'FECHA':10}  {'ESTADO':14}  {'LAB':11}  {'OT':13}  {'N° INFORME':16}  DE / ASUNTO")
    for f in sorted(filas, key=lambda x: x["fecha"]):
        ot = f["ots"][0] if f["ots"] else "—"
        print(f"  {f['fecha']:10}  {f['estado']:14}  {(f['laboratorio'] or '—'):11}  {ot:13}  "
              f"{(f['nro_informe'] or '—'):16}  {f['de']} | {f['asunto'][:60]}")

    print("\n" + "-" * 78)
    print("RESUMEN POR LABORATORIO (solo correos entrantes)")
    resumen: dict[str, Counter] = defaultdict(Counter)
    remitentes: dict[str, Counter] = defaultdict(Counter)
    for f in filas:
        if f["estado"] == "SALIENTE":
            continue
        lab = f["laboratorio"] or "(sin identificar)"
        resumen[lab][f["estado"]] += 1
        remitentes[lab][f["de"]] += 1
    for lab, c in sorted(resumen.items()):
        partes = "  ".join(f"{k}: {v}" for k, v in sorted(c.items()))
        print(f"  {lab:18} {partes}")
        top = ", ".join(f"{r} ({n})" for r, n in remitentes[lab].most_common(3))
        print(f"  {'':18} remitentes: {top}")

    sin_pdf = [f for f in filas if f["estado"] != "SALIENTE" and not f["pdf_legible"]]
    if sin_pdf:
        print(f"\n  OJO: {len(sin_pdf)} correo(s) entrantes con adjuntos sin PDF legible (¿zip, imagen, Excel o PDF escaneado?):")
        for f in sin_pdf[:8]:
            print(f"    · {f['fecha']} {f['de']}  {', '.join(f['adjuntos'])[:70]}")

    vistas = {o for f in filas for o in f["ots"] if f["estado"] != "SALIENTE"}
    faltan = []
    ahora = datetime.now().astimezone()
    for ot, envio in sis["enviada_en"].items():
        o = str(ot).strip().upper()
        if envio and not o.startswith("OTP-") and (ahora - envio).days >= dias_sin_informe \
                and o not in vistas:
            faltan.append((o, envio))
    if faltan:
        print(f"\n  Solicitudes enviadas hace >= {dias_sin_informe} días cuya OT NO aparece en ningún correo entrante: {len(faltan)}")
        for o, envio in sorted(faltan, key=lambda x: x[1])[:10]:
            print(f"    · {o} (enviada {envio.date().isoformat()})")


# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dias", type=int, default=30, help="Cuántos días atrás mirar en el correo (30)")
    ap.add_argument("--max", type=int, default=300, help="Tope de correos a descargar (300)")
    ap.add_argument("--lab", default="", help="Solo este laboratorio (AgroFresh, Quiteca, ALS, Diagnofruit)")
    ap.add_argument("--plazo", type=int, default=5, help="Días tras el envío para dar por atrasado un informe (5)")
    ap.add_argument("--solo-sistema", action="store_true", help="No abrir el correo")
    ap.add_argument("--solo-correo", action="store_true", help="No consultar la base de datos")
    ap.add_argument("--cuenta", default="", help="Otro buzón (p. ej. jorge.sandoval@agrofresh.com). Por defecto GMAIL_ACCOUNT")
    ap.add_argument("--host", default=IMAP_HOST_GMAIL, help="Servidor IMAP del buzón (imap.gmail.com)")
    ap.add_argument("--clave-env", default="", help="Variable de entorno con la clave de ese buzón (si no, se pide por teclado)")
    ap.add_argument("--carpeta", default="INBOX", help="Carpeta a revisar (INBOX; en Gmail «[Gmail]/Todos los mensajes» incluye lo archivado)")
    ap.add_argument("--propias", default="", help="Direcciones nuestras separadas por coma (sus correos cuentan como SALIENTE)")
    ap.add_argument("--json", default="", help="Guardar la revisión en este archivo JSON")
    args = ap.parse_args(argv)

    sis: dict[str, Any] = {"por_lab": {}, "informes_cargados": set(), "ots_conocidas": set(), "enviada_en": {}}
    if not args.solo_correo:
        try:
            sis = leer_sistema(args.plazo)
            imprimir_sistema(sis, args.lab)
        except Exception as exc:  # noqa: BLE001
            print(f"\nNo se pudo leer la base de datos: {exc}\n(Se sigue con el correo; usa --solo-correo para omitir este paso.)")

    filas: list[dict[str, Any]] = []
    if not args.solo_sistema:
        from app import config

        cuenta = args.cuenta or config.GMAIL_ACCOUNT
        if args.cuenta:
            clave = os.getenv(args.clave_env, "") if args.clave_env else getpass.getpass(f"Clave de aplicación de {cuenta}: ")
        else:
            clave = config.GMAIL_APP_PASSWORD
        if not (cuenta and clave):
            print("\nFaltan las credenciales del buzón (GMAIL_ACCOUNT / GMAIL_APP_PASSWORD en .env, o --cuenta con su clave).")
            return 2
        propias = {cuenta.lower(), (config.GMAIL_ACCOUNT or "").lower()} | {p.strip().lower() for p in args.propias.split(",") if p.strip()}
        propias.discard("")
        try:
            imap = conectar(args.host, cuenta, clave.replace(" ", ""))
            try:
                mensajes = leer_buzon(imap, args.carpeta, args.dias, args.max, args.host)
            finally:
                try:
                    imap.logout()
                except Exception:  # noqa: BLE001
                    pass
        except RuntimeError as exc:
            print(f"\n{exc}")
            return 2
        for m in mensajes:
            fila = revisar_mensaje(m, propias, sis)
            if fila:
                filas.append(fila)
        print(f"\n  ({len(mensajes)} correos con adjuntos descargados en modo solo lectura de {cuenta}, últimos {args.dias} días)")
        imprimir_correo(filas, cuenta, args.lab, sis, args.plazo)

    if args.json:
        ruta = Path(args.json)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        salida = {"correos": filas, "sistema": {k: v for k, v in sis.get("por_lab", {}).items()}}
        ruta.write_text(json.dumps(salida, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        print(f"\nRevisión guardada en {ruta}")
    print("\nListo. Nada se escribió ni se movió: es solo una revisión.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
