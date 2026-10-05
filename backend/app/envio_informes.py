"""
AgroFresh Lab → Envío de informes.

Paz sube el PDF de un informe, el sistema lo reconoce por su N° de solicitud y lo
manda por correo a la lista de distribución de resultados de esa solicitud, con
la plantilla del correo.

Reglas (decisión del usuario, 05-10-2026):

  - **La lista de distribución es la de la SOLICITUD del informe, tal cual**: Para,
    Copia y Copia oculta que lleva su PDF y su JSON (`plan_desde_solicitud`, con la
    misma función, su servicio y su regla de «sin lista»). Encima se SUMAN las
    copias internas de este módulo (`internos`: hoy Paz y Jorge en copia oculta,
    editables). Nada de esto toca la base ni los contactos de los laboratorios.
  - **Modo prueba / producción**. Parte siempre en PRUEBA: todo lo que se envía
    llega solo a `DESTINATARIOS_PRUEBA`, con «(PRUEBA)» en el asunto y un aviso
    arriba que dice a quién habría ido de verdad. Pasar a producción pide la
    contraseña de quien lo hace.
  - Paz puede corregir Para / CC / CCO, el asunto y el texto antes de enviar; el
    template por laboratorio (Administración → Laboratorios) es solo el punto
    de partida.

Nada de esto escribe en la lista de distribución ni en las solicitudes.
"""
from __future__ import annotations

import base64
import json
import logging
import mimetypes
import os
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from . import actividad, config_store, correo, informe_lectura, mail_templates, seguridad
from .auth import Usuario, usuario_actual
from .db import conexion, cursor_dict
from .listados import clave_normalizada
from .servicios import clave_servicio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/envio-informes", tags=["envio-informes"])

ARCHIVO_CONFIG = "envio_informes.json"
ARCHIVO_CONTACTOS = "contactos_laboratorio.json"
MODULO_LAB = "agrofresh_lab"

# El laboratorio es siempre AGROFRESH (por ahora). Cambiarlo, o corregir a mano
# el Sold To / Ship To / especie que se lee del PDF, solo lo habilita el
# administrador principal con su clave.
LABORATORIO_FIJO = "AGROFRESH"

MODO_PRUEBA = "prueba"
MODO_PRODUCCION = "produccion"

# En modo prueba el correo sale SOLO a estas dos personas.
DESTINATARIOS_PRUEBA = ["psalazar@agrofresh.com", "jorge.sandoval@agrofresh.com"]

# Copias internas de cada envío. Hoy van en copia oculta y se pueden cambiar
# desde la pantalla (la forma final se define más adelante con el laboratorio).
INTERNOS_DEFECTO: dict[str, list[str]] = {
    "cc": [],
    "bcc": ["psalazar@agrofresh.com", "jorge.sandoval@agrofresh.com"],
}

# Adjuntos: lo que Paz necesita mandar de verdad, sin abrir la puerta a ejecutables.
EXTENSIONES_PERMITIDAS = {".pdf", ".xlsx", ".xls", ".csv", ".zip", ".png", ".jpg", ".jpeg", ".docx"}
MAX_ADJUNTOS = 15
MAX_BYTES_ADJUNTO = 20 * 1024 * 1024
MAX_BYTES_TOTAL = 24 * 1024 * 1024  # Gmail rechaza sobre 25 MB, y el correo mismo pesa


# ---------------------------------------------------------------------------
# Acceso
# ---------------------------------------------------------------------------

def puede_usar(usuario: Usuario) -> bool:
    """Quién usa el módulo: el admin general y quien tiene AgroFresh Lab. Si la
    cuenta no tiene permisos asignados a mano rigen los de su perfil (espejo de
    `modulosPredeterminados` en el frontend). Gerencia mira pero no envía."""
    if usuario.tipoAcceso == "admin_general":
        return True
    if usuario.tipoAcceso in ("cliente", "gerencia", "muestreador"):
        return False
    if usuario.modulos is not None:
        return MODULO_LAB in usuario.modulos
    if usuario.tipoAcceso == "analista":
        return True
    return usuario.tipoAcceso == "admin_area" and usuario.area in ("cromatografia", "ryd")


def es_principal(usuario: Usuario) -> bool:
    """El administrador principal: el único que puede habilitar lo bloqueado."""
    from . import toma_muestras as tm

    return usuario.tipoAcceso == "admin_general" and usuario.email.strip().lower() == tm._SUPER_ADMIN_EMAIL


def acceso(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    if not puede_usar(usuario):
        raise HTTPException(403, "Tu cuenta no tiene acceso al envío de informes.")
    return usuario


# ---------------------------------------------------------------------------
# Configuración (modo y copias internas)
# ---------------------------------------------------------------------------

def _limpiar_correos(valores: list[str] | None) -> list[str]:
    """Correos sin espacios ni repetidos (sin mayúsculas), en el mismo orden."""
    salida: list[str] = []
    vistos: set[str] = set()
    for v in valores or []:
        email = str(v or "").strip()
        clave = email.casefold()
        if email and clave not in vistos:
            vistos.add(clave)
            salida.append(email)
    return salida


def _exigir_correos_validos(valores: list[str], campo: str) -> None:
    malos = [v for v in valores if not correo.es_email_valido(v)]
    if malos:
        raise HTTPException(400, f"Correo inválido en {campo}: {', '.join(malos)}")


def leer_config() -> dict[str, Any]:
    """Modo vigente y copias internas. Sin archivo, o con un modo ilegible, es PRUEBA."""
    try:
        cfg = config_store.leer(ARCHIVO_CONFIG, {})  # type: ignore[arg-type]
    except (OSError, ValueError):
        cfg = {}
    if not isinstance(cfg, dict):
        cfg = {}
    internos = cfg.get("internos") if isinstance(cfg.get("internos"), dict) else None
    return {
        "modo": MODO_PRODUCCION if cfg.get("modo") == MODO_PRODUCCION else MODO_PRUEBA,
        "internos": {
            "cc": _limpiar_correos((internos or INTERNOS_DEFECTO).get("cc")),
            "bcc": _limpiar_correos((internos or INTERNOS_DEFECTO).get("bcc")),
        },
        "modo_cambiado_por": cfg.get("modo_cambiado_por"),
        "modo_cambiado_en": cfg.get("modo_cambiado_en"),
    }


def _guardar_config(cfg: dict[str, Any]) -> None:
    config_store.escribir(ARCHIVO_CONFIG, cfg)  # type: ignore[arg-type]


def _laboratorios() -> list[str]:
    from . import toma_muestras as tm

    return list(tm.LABORATORIOS())


def _exigir_laboratorio(laboratorio: str) -> str:
    laboratorio = (laboratorio or "").strip()
    if laboratorio not in _laboratorios():
        raise HTTPException(400, f"Laboratorio inválido: {laboratorio or '(vacío)'}")
    return laboratorio


# ---------------------------------------------------------------------------
# A quién va
# ---------------------------------------------------------------------------

def repartir(para: list[str], cc: list[str], bcc: list[str]) -> dict[str, list[str]]:
    """Nadie va dos veces: quien está en Para no se repite en copia, ni en oculta."""
    para = _limpiar_correos(para)
    vistos = {e.casefold() for e in para}
    cc = [e for e in _limpiar_correos(cc) if e.casefold() not in vistos]
    vistos |= {e.casefold() for e in cc}
    bcc = [e for e in _limpiar_correos(bcc) if e.casefold() not in vistos]
    return {"to": para, "cc": cc, "bcc": bcc}


def plan_desde_solicitud(datos: dict, internos: dict[str, list[str]] | None = None) -> dict[str, Any]:
    """A quién va el informe: la lista de distribución de resultados de SU
    SOLICITUD, TAL CUAL —Para, Copia y Copia oculta, con su servicio y su regla de
    «sin lista»: la misma función que arma el PDF y el JSON de la solicitud
    (`_datos_pdf_con_destinatarios_resultados`)—, MÁS las copias internas del
    módulo (`internos`), que se suman a las de la solicitud."""
    from . import toma_muestras as tm

    internos = internos if internos is not None else leer_config()["internos"]
    detalle = tm._datos_pdf_con_destinatarios_resultados(datos)["destinatarios_resultados_detalle"]
    plan = repartir(
        detalle["para"],
        [*detalle["cc"], *internos.get("cc", [])],
        [*detalle["bcc"], *internos.get("bcc", [])],
    )
    return {**plan, "sin_lista": tm.solicitud_sin_lista(datos), "especies": [], "origen": "solicitud"}


_TIPO_DE_SERVICIO = {"actimist": "Actimist", "ecofog": "Ecofog"}


def plan_destinatarios(
    sold_to: str, ship_to: str, especie: str = "", internos: dict[str, list[str]] | None = None,
    servicio: str = "",
) -> dict[str, Any]:
    """La misma lista que daría una solicitud con ese Sold To, Ship To, especie y
    servicio. Sirve cuando el informe no trae N° de solicitud (o la solicitud no
    existe) y para corregir a mano esos datos. Paz puede cambiarla antes de enviar."""
    datos = {
        "sold_to": sold_to, "ship_to": ship_to, "especie": especie,
        "campos_laboratorio": {"Tipo Aplicación": _TIPO_DE_SERVICIO.get(clave_servicio(servicio), "Línea de proceso")},
    }
    return {**plan_desde_solicitud(datos, internos), "origen": "planta"}


def _solicitudes_por_numero() -> dict[str, tuple[str, dict]]:
    """Las solicitudes del sistema por su N° (OT-AGF0075), en mayúsculas."""
    from . import toma_muestras as tm

    salida: dict[str, tuple[str, dict]] = {}
    for archivo, datos in tm.leer_todas_las_solicitudes():
        numero = str(datos.get("numero_solicitud") or "").strip().upper()
        if numero:
            salida.setdefault(numero, (archivo, datos))
    return salida


# ---------------------------------------------------------------------------
# Armado del correo
# ---------------------------------------------------------------------------

def _hoy() -> str:
    try:
        ahora = datetime.now(ZoneInfo("America/Santiago"))
    except ZoneInfoNotFoundError:
        ahora = datetime.now()
    return ahora.strftime("%d-%m-%Y")


class DatosEnvio(BaseModel):
    laboratorio: str
    sold_to: str
    ship_to: str
    especie: str = ""
    # Servicio del informe (`''` Línea de proceso, `actimist`, `ecofog`): elige la plantilla.
    servicio: str = ""
    asunto: str | None = None
    cuerpo: str | None = None
    para: list[str] = Field(default_factory=list)
    cc: list[str] = Field(default_factory=list)
    bcc: list[str] = Field(default_factory=list)


def _aviso_de_prueba(reales: dict[str, list[str]]) -> str:
    def linea(rotulo: str, lista: list[str]) -> str:
        return f"{rotulo}: {', '.join(lista) if lista else '—'}"

    return (
        "CORREO DE PRUEBA. El sistema está en modo prueba, por eso este informe llegó solo "
        "a ti y no a la lista del cliente.\nEn producción habría ido a:\n"
        + "\n".join([linea("Para", reales["to"]), linea("CC", reales["cc"]), linea("CCO", reales["bcc"])])
    )


def armar_correo(
    datos: DatosEnvio, usuario: Usuario, modo: str, nombres_adjuntos: list[str],
) -> dict[str, Any]:
    """Todo lo que se va a mandar, sin mandarlo: lo usan la vista previa y el envío."""
    laboratorio = _exigir_laboratorio(datos.laboratorio)
    if laboratorio != LABORATORIO_FIJO and not es_principal(usuario):
        raise HTTPException(403, f"Por ahora los informes se envían solo con {LABORATORIO_FIJO}.")
    sold_to, ship_to = datos.sold_to.strip(), datos.ship_to.strip()
    if not sold_to or not ship_to:
        raise HTTPException(400, "Elige el Sold To y el Ship To.")
    for campo, lista in (("Para", datos.para), ("CC", datos.cc), ("CCO", datos.bcc)):
        _exigir_correos_validos(_limpiar_correos(lista), campo)

    reales = repartir(datos.para, datos.cc, datos.bcc)
    if modo == MODO_PRUEBA:
        efectivos = {"to": list(DESTINATARIOS_PRUEBA), "cc": [], "bcc": []}
        aviso = _aviso_de_prueba(reales)
    else:
        efectivos = reales
        aviso = ""

    valores = {
        "laboratorio": laboratorio,
        "sold_to": sold_to,
        "ship_to": ship_to,
        "especie": datos.especie.strip(),
        "fecha_envio": _hoy(),
        "enviado_por": usuario.nombre,
        "cantidad_informes": str(len(nombres_adjuntos)),
        "nombre_archivo": ", ".join(nombres_adjuntos),
    }
    # Lo que la plantilla da por sí sola: es el punto de partida que la pantalla
    # muestra editable, sin el «(PRUEBA)» ni el aviso.
    asunto_base, texto_base = mail_templates.textos_informe(valores, servicio=datos.servicio)
    asunto, texto, html, imagenes = mail_templates.renderizar_informe(
        valores, servicio=datos.servicio, asunto=datos.asunto, cuerpo=datos.cuerpo, aviso=aviso,
    )
    if modo == MODO_PRUEBA:
        asunto = f"(PRUEBA) {asunto}"
    return {
        "laboratorio": laboratorio, "asunto": asunto, "texto": texto, "html": html,
        "imagenes": imagenes, "reales": reales, "efectivos": efectivos, "modo": modo,
        "asunto_base": asunto_base, "texto_base": texto_base,
    }


def _html_para_pantalla(html: str, imagenes: list[correo.ImagenInline]) -> str:
    """El logo del correo viaja por Content-ID; el navegador no lo entiende, así
    que para la vista previa se incrusta como imagen."""
    for img in imagenes:
        b64 = base64.b64encode(img.contenido).decode()
        html = html.replace(f"cid:{img.content_id}", f"data:image/{img.subtype};base64,{b64}")
    return html


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/estado")
def estado(usuario: Usuario = Depends(acceso)) -> dict[str, Any]:
    cfg = leer_config()
    return {
        "modo": cfg["modo"],
        "destinatarios_prueba": DESTINATARIOS_PRUEBA,
        "internos": cfg["internos"],
        "laboratorios": _laboratorios(),
        "laboratorio_fijo": LABORATORIO_FIJO,
        "modo_cambiado_por": cfg["modo_cambiado_por"],
        "modo_cambiado_en": cfg["modo_cambiado_en"],
    }


class ModoIn(BaseModel):
    modo: str
    password: str | None = None


def _clave_correcta(usuario: Usuario, password: str | None) -> bool:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT password_hash FROM usuario WHERE id = %s", (usuario.id,))
        fila = cur.fetchone()
    return bool(fila and seguridad.verificar_password(password or "", fila.get("password_hash")))


@router.put("/modo")
def cambiar_modo(body: ModoIn, usuario: Usuario = Depends(acceso)) -> dict[str, Any]:
    """Pasar a PRODUCCIÓN pide la contraseña de quien lo hace: desde ahí los
    envíos llegan a clientes de verdad. Volver a PRUEBA no la pide."""
    if body.modo not in (MODO_PRUEBA, MODO_PRODUCCION):
        raise HTTPException(400, "El modo es «prueba» o «produccion».")
    cfg = leer_config()
    if body.modo == MODO_PRODUCCION and cfg["modo"] != MODO_PRODUCCION:
        if not _clave_correcta(usuario, body.password):
            # 403 y no 401: el navegador trata todo 401 como «la sesión venció» y
            # cerraría la sesión de quien solo se equivocó al escribir la clave.
            raise HTTPException(403, "Contraseña incorrecta.")
    if body.modo != cfg["modo"]:
        cfg["modo"] = body.modo
        cfg["modo_cambiado_por"] = usuario.nombre
        cfg["modo_cambiado_en"] = datetime.now(timezone.utc).isoformat()
        _guardar_config(cfg)
        actividad.registrar(
            usuario.email, usuario.nombre, "sensible", "envio_informes_modo",
            f"pasó el envío de informes a {'PRODUCCIÓN' if body.modo == MODO_PRODUCCION else 'PRUEBA'}",
            sensible=True,
        )
    return estado(usuario)


class InternosIn(BaseModel):
    cc: list[str] = Field(default_factory=list)
    bcc: list[str] = Field(default_factory=list)


@router.put("/internos")
def guardar_internos(body: InternosIn, usuario: Usuario = Depends(acceso)) -> dict[str, Any]:
    """Las copias internas que se proponen en cada envío (por ahora, copia oculta)."""
    internos = {"cc": _limpiar_correos(body.cc), "bcc": _limpiar_correos(body.bcc)}
    _exigir_correos_validos(internos["cc"], "CC")
    _exigir_correos_validos(internos["bcc"], "CCO")
    cfg = leer_config()
    cfg["internos"] = internos
    _guardar_config(cfg)
    actividad.registrar(
        usuario.email, usuario.nombre, "sensible", "envio_informes_internos",
        f"cambió las copias internas del envío de informes (CC {len(internos['cc'])}, CCO {len(internos['bcc'])})",
        sensible=True,
    )
    return estado(usuario)


@router.get("/lista")
def lista_de_distribucion(
    sold_to: str, ship_to: str, especie: str = "", servicio: str = "", usuario: Usuario = Depends(acceso),
) -> dict[str, Any]:
    """Lo que se propone para esta planta, especie y servicio. Solo lee."""
    return plan_destinatarios(sold_to, ship_to, especie, servicio=servicio)


class DesbloqueoIn(BaseModel):
    password: str


@router.post("/desbloquear")
def desbloquear_edicion(body: DesbloqueoIn, usuario: Usuario = Depends(acceso)) -> dict[str, bool]:
    """Habilita, solo en la pantalla de quien lo pide, el laboratorio y los datos
    leídos del PDF (Sold To, Ship To, especie). Solo el administrador principal,
    con su contraseña. 403 y no 401: un 401 cierra la sesión en el navegador."""
    if not es_principal(usuario):
        raise HTTPException(403, "Solo el administrador principal puede habilitar esta edición.")
    if not _clave_correcta(usuario, body.password):
        raise HTTPException(403, "Contraseña incorrecta.")
    return {"ok": True}


MAX_INFORMES_LOTE = 30


@router.post("/analizar")
async def analizar_informes(
    archivos: list[UploadFile] = File(...), usuario: Usuario = Depends(acceso),
) -> dict[str, Any]:
    """Lee cada PDF (Sold To, Ship To, especie, tipo de aplicación) y propone su
    lista de distribución. No envía nada: es lo que la pantalla muestra al subir."""
    if not archivos:
        raise HTTPException(400, "Sube al menos un informe.")
    if len(archivos) > MAX_INFORMES_LOTE:
        raise HTTPException(400, f"Son demasiados informes: el máximo es {MAX_INFORMES_LOTE} por vez.")
    contactos = config_store.leer(ARCHIVO_CONTACTOS, [])
    internos = leer_config()["internos"]
    solicitudes: dict[str, tuple[str, dict]] | None = None  # se lee una vez, y solo si hace falta
    items: list[dict[str, Any]] = []
    disponible = True
    for archivo in archivos:
        nombre = os.path.basename((archivo.filename or "").replace("\\", "/")).strip()
        item: dict[str, Any] = {
            "nombre": nombre, "leido": False, "error": None, "sold_to": "", "ship_to": "", "especie": "",
            "tipo_aplicacion": "", "numero_solicitud": "", "servicio": "", "plan": None, "solicitud": None,
        }
        contenido = await archivo.read()
        if not contenido.lstrip()[:5].startswith(b"%PDF"):
            item["error"] = "No es un PDF válido."
        elif len(contenido) > MAX_BYTES_ADJUNTO:
            item["error"] = f"Pesa más de {MAX_BYTES_ADJUNTO // (1024 * 1024)} MB."
        else:
            try:
                texto = informe_lectura.texto_de_pdf(contenido)
                datos = informe_lectura.datos_de_informe(texto)
            except informe_lectura.LecturaNoDisponible as exc:
                disponible = False
                item["error"] = str(exc)
            except Exception:
                logger.warning("No se pudo leer el PDF %s", nombre, exc_info=True)
                item["error"] = "No se pudo leer el PDF."
            else:
                # Lo principal: el N° de solicitud del informe. La solicitud trae su
                # Sold To, Ship To, especie, servicio y su lista de distribución.
                encontrada = None
                if datos["numero_solicitud"]:
                    if solicitudes is None:
                        try:
                            solicitudes = _solicitudes_por_numero()
                        except Exception:
                            logger.warning("No se pudieron leer las solicitudes.", exc_info=True)
                            solicitudes = {}
                    encontrada = solicitudes.get(datos["numero_solicitud"].strip().upper())
                if encontrada:
                    from .servicios import servicio_de_datos

                    archivo_sol, sol = encontrada
                    datos["sold_to"] = str(sol.get("sold_to") or "").strip()
                    datos["ship_to"] = str(sol.get("ship_to") or "").strip()
                    datos["especie"] = str(sol.get("especie") or "").strip()
                    datos["servicio"] = servicio_de_datos(sol)
                    item["solicitud"] = archivo_sol
                    item.update(datos)
                    item["leido"] = True
                    item["plan"] = plan_desde_solicitud(sol, internos)
                    items.append(item)
                    continue
                if not (datos["sold_to"] and datos["ship_to"]):
                    # Respaldo: un Sold To + Ship To que el sistema ya conoce, escrito en el texto.
                    pares = sorted({
                        (str(c.get("sold_to") or "").strip(), str(c.get("ship_to") or "").strip())
                        for c in contactos if c.get("sold_to") and c.get("ship_to")
                    })
                    hallado = informe_lectura.buscar_por_nombres(texto, pares)
                    if hallado:
                        datos["sold_to"], datos["ship_to"] = hallado
                item.update(datos)
                if datos["sold_to"] and datos["ship_to"]:
                    item["leido"] = True
                    item["plan"] = plan_destinatarios(
                        datos["sold_to"], datos["ship_to"], datos["especie"], internos, servicio=datos["servicio"],
                    )
                else:
                    logger.warning(
                        "No se encontró Sold To / Ship To en %s. Texto leído (inicio): %r", nombre, texto[:600],
                    )
                    item["error"] = (
                        "No encontré el Sold To y el Ship To en este PDF"
                        + (" (no trae texto: ¿es una imagen escaneada?)." if not texto.strip() else ". ¿Es un informe de AgroFresh?")
                    )
        items.append(item)
    return {"disponible": disponible, "items": items}


class TemplateIn(BaseModel):
    asunto: str
    cuerpo: str


def _exigir_clave_plantilla(clave: str) -> str:
    if clave not in mail_templates.CLAVES_INFORME:
        raise HTTPException(400, f"Plantilla desconocida: {clave}")
    return clave


@router.get("/template/{clave}")
def obtener_template(clave: str, usuario: Usuario = Depends(acceso)) -> dict:
    """La plantilla del correo. Hoy hay una sola para todos, la «predeterminado»;
    otra clave (un servicio) devuelve la suya si la tiene y, si no, la predeterminada."""
    return mail_templates.obtener_informe(_exigir_clave_plantilla(clave))


@router.put("/template/{clave}")
def guardar_template(clave: str, body: TemplateIn, usuario: Usuario = Depends(acceso)) -> dict:
    clave = _exigir_clave_plantilla(clave)
    if not body.asunto.strip() or not body.cuerpo.strip():
        raise HTTPException(400, "El asunto y el cuerpo son obligatorios.")
    return mail_templates.guardar_informe(clave, body.asunto, body.cuerpo)


class VistaPreviaIn(DatosEnvio):
    nombres_adjuntos: list[str] = Field(default_factory=list)


@router.post("/vista-previa")
def vista_previa(body: VistaPreviaIn, usuario: Usuario = Depends(acceso)) -> dict[str, Any]:
    """El correo tal como saldría, con la plantilla y lo que Paz lleva corregido."""
    armado = armar_correo(body, usuario, leer_config()["modo"], body.nombres_adjuntos)
    return {
        "modo": armado["modo"],
        "asunto": armado["asunto"],
        "texto": armado["texto"],
        "asunto_base": armado["asunto_base"],
        "texto_base": armado["texto_base"],
        "html": _html_para_pantalla(armado["html"], armado["imagenes"]),
        "reales": armado["reales"],
        "efectivos": armado["efectivos"],
    }


def _lista_json(valor: str, campo: str) -> list[str]:
    try:
        datos = json.loads(valor or "[]")
    except ValueError as exc:
        raise HTTPException(400, f"«{campo}» no es una lista válida.") from exc
    if not isinstance(datos, list) or any(not isinstance(x, str) for x in datos):
        raise HTTPException(400, f"«{campo}» no es una lista válida.")
    return datos


async def _leer_adjuntos(archivos: list[UploadFile]) -> list[correo.Adjunto]:
    if not archivos:
        raise HTTPException(400, "Sube al menos un archivo para enviar.")
    if len(archivos) > MAX_ADJUNTOS:
        raise HTTPException(400, f"Son demasiados archivos: el máximo es {MAX_ADJUNTOS} por correo.")
    adjuntos: list[correo.Adjunto] = []
    total = 0
    usados: set[str] = set()
    for archivo in archivos:
        nombre = os.path.basename((archivo.filename or "").replace("\\", "/")).strip()
        extension = os.path.splitext(nombre)[1].lower()
        if not nombre or extension not in EXTENSIONES_PERMITIDAS:
            raise HTTPException(
                400,
                f"«{nombre or 'archivo sin nombre'}» no se puede enviar. Formatos permitidos: "
                + ", ".join(sorted(EXTENSIONES_PERMITIDAS)) + ".",
            )
        contenido = await archivo.read()
        if not contenido:
            raise HTTPException(400, f"«{nombre}» está vacío.")
        if len(contenido) > MAX_BYTES_ADJUNTO:
            raise HTTPException(400, f"«{nombre}» pesa más de {MAX_BYTES_ADJUNTO // (1024 * 1024)} MB.")
        if extension == ".pdf" and not contenido.lstrip()[:5].startswith(b"%PDF"):
            raise HTTPException(400, f"«{nombre}» no es un PDF válido.")
        if nombre.casefold() in usados:
            raise HTTPException(400, f"«{nombre}» está repetido.")
        usados.add(nombre.casefold())
        total += len(contenido)
        adjuntos.append(correo.Adjunto(
            nombre, contenido, mimetypes.guess_type(nombre)[0] or "application/octet-stream",
        ))
    if total > MAX_BYTES_TOTAL:
        raise HTTPException(
            400, f"Los archivos pesan {total // (1024 * 1024)} MB juntos; el máximo por correo es {MAX_BYTES_TOTAL // (1024 * 1024)} MB.",
        )
    return adjuntos


def _registrar_envio(
    *, usuario: Usuario, modo: str, armado: dict[str, Any], datos: DatosEnvio,
    adjuntos: list[correo.Adjunto], enviado: dict[str, list[str]],
    exitoso: bool, mensaje_id: str | None, error: str | None,
) -> None:
    """Best-effort a propósito, como `envio_solicitud_log`: si la base falla, o falta
    la migración 0052, el envío que ya salió no se oculta ni se tumba."""
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                """
                INSERT INTO envio_informe_log
                    (usuario_email, usuario_nombre, modo, laboratorio, sold_to, ship_to, especie, asunto,
                     para, cc, bcc, enviado_to, enviado_cc, enviado_bcc, adjuntos, exitoso, mensaje_id, error)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    usuario.email, usuario.nombre, modo, armado["laboratorio"], datos.sold_to.strip(),
                    datos.ship_to.strip(), datos.especie.strip(), armado["asunto"],
                    json.dumps(armado["reales"]["to"]), json.dumps(armado["reales"]["cc"]),
                    json.dumps(armado["reales"]["bcc"]),
                    json.dumps(enviado["to"]), json.dumps(enviado["cc"]), json.dumps(enviado["bcc"]),
                    json.dumps([{"nombre": a.nombre, "bytes": len(a.contenido)} for a in adjuntos]),
                    exitoso, mensaje_id, error,
                ),
            )
    except Exception:
        logger.exception("No se pudo registrar el envío de informe en envio_informe_log (exitoso=%s)", exitoso)


@router.post("/enviar")
async def enviar_informe(
    laboratorio: str = Form(...),
    sold_to: str = Form(...),
    ship_to: str = Form(...),
    especie: str = Form(""),
    servicio: str = Form(""),
    asunto: str = Form(""),
    cuerpo: str = Form(""),
    para: str = Form("[]"),
    cc: str = Form("[]"),
    bcc: str = Form("[]"),
    archivos: list[UploadFile] = File(...),
    usuario: Usuario = Depends(acceso),
) -> dict[str, Any]:
    datos = DatosEnvio(
        laboratorio=laboratorio, sold_to=sold_to, ship_to=ship_to, especie=especie, servicio=servicio,
        asunto=asunto or None, cuerpo=cuerpo or None,
        para=_lista_json(para, "Para"), cc=_lista_json(cc, "CC"), bcc=_lista_json(bcc, "CCO"),
    )
    adjuntos = await _leer_adjuntos(archivos)
    modo = leer_config()["modo"]
    armado = armar_correo(datos, usuario, modo, [a.nombre for a in adjuntos])

    if not armado["reales"]["to"]:
        raise HTTPException(
            400,
            "Esta planta no tiene lista de distribución: escribe al menos un correo en Para "
            "o elige otra planta o especie.",
        )

    efectivos = armado["efectivos"]
    try:
        resultado = correo.enviar(
            ", ".join(efectivos["to"]), armado["asunto"], armado["html"], armado["texto"], adjuntos,
            cc=efectivos["cc"], bcc=efectivos["bcc"], imagenes_inline=armado["imagenes"],
        )
    except HTTPException as exc:
        _registrar_envio(
            usuario=usuario, modo=modo, armado=armado, datos=datos, adjuntos=adjuntos,
            enviado=efectivos, exitoso=False, mensaje_id=None, error=str(exc.detail),
        )
        raise

    enviado = {"to": resultado.to, "cc": resultado.cc, "bcc": resultado.bcc}
    _registrar_envio(
        usuario=usuario, modo=modo, armado=armado, datos=datos, adjuntos=adjuntos,
        enviado=enviado, exitoso=True, mensaje_id=resultado.mensaje_id, error=None,
    )
    if modo == MODO_PRUEBA:
        mensaje = f"Prueba enviada a {', '.join(resultado.to)}. No salió nada al cliente."
    else:
        mensaje = f"Informe enviado a {', '.join(resultado.to)}."
    return {"ok": mensaje, "modo": modo, **enviado, "mensaje_id": resultado.mensaje_id}


@router.get("/historial")
def historial(limite: int = 40, usuario: Usuario = Depends(acceso)) -> dict[str, Any]:
    """Los últimos envíos. Sin la migración 0052 devuelve `disponible: false`."""
    limite = max(1, min(limite, 200))
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(
                """
                SELECT id, creado_en, usuario_nombre, modo, laboratorio, sold_to, ship_to, especie, asunto,
                       para, cc, bcc, enviado_to, adjuntos, exitoso, error
                FROM envio_informe_log ORDER BY creado_en DESC LIMIT %s
                """,
                (limite,),
            )
            filas = cur.fetchall()
    except Exception:
        logger.warning("No se pudo leer envio_informe_log (¿falta la migración 0052?).", exc_info=True)
        return {"disponible": False, "items": []}
    items = [{**f, "creado_en": f["creado_en"].isoformat()} for f in filas]
    return {"disponible": True, "items": items}


@router.delete("/historial/{registro_id}")
def eliminar_registro(registro_id: int, usuario: Usuario = Depends(acceso)) -> dict[str, str]:
    """Borra UN registro del historial. Solo el administrador principal (en la
    pantalla pide además su contraseña) y de a uno: no hay borrado en lote."""
    if not es_principal(usuario):
        raise HTTPException(403, "Solo el administrador principal puede eliminar registros del historial.")
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                "DELETE FROM envio_informe_log WHERE id = %s RETURNING asunto, creado_en", (registro_id,)
            )
            fila = cur.fetchone()
    except Exception as exc:
        logger.warning("No se pudo borrar el registro %s de envio_informe_log.", registro_id, exc_info=True)
        raise HTTPException(503, "No se pudo borrar: el historial no está disponible (¿falta la migración 0052?).") from exc
    if fila is None:
        raise HTTPException(404, "Ese registro ya no existe.")
    actividad.registrar(
        usuario.email, usuario.nombre, "sensible", "envio_informe_registro_eliminado",
        f"eliminó un registro del historial de envío de informes ({fila['asunto'] or 'sin asunto'})",
        sensible=True,
    )
    return {"estado": "eliminado"}
