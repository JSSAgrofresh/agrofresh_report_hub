"""
Monitoreo: la vista de bolsillo del administrador principal (pensada para el teléfono en vertical).

Junta en una sola respuesta liviana lo que hay que mirar de un vistazo: quién está conectado, los
informes que llegaron al correo, las últimas solicitudes enviadas y lo que falló; y, al tocar a una
persona, todo lo que hizo desde que se conectó. No hay tablas de negocio nuevas: se lee lo que el
sistema ya anota (ver `admin_panel.leer_eventos`). La única pieza nueva es la **presencia** (migración
0068): cada pestaña abierta manda un latido por minuto. Sin esa tabla se infiere de la actividad
reciente, y el resto de la pantalla sigue igual.

Solo el administrador principal (`confirmar_clave.es_principal`).
"""
from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from . import actividad, dashboard
from .admin_panel import CATEGORIAS_TRABAJO, ETIQUETA_CATEGORIA, _filas, _iso, leer_eventos
from .auth import Usuario, usuario_actual
from .confirmar_clave import es_principal
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/monitoreo", tags=["monitoreo"])          # solo el principal
router_latido = APIRouter(prefix="/api/monitoreo", tags=["monitoreo"])   # cualquier cuenta con sesión

ZONA = ZoneInfo("America/Santiago")

# El navegador manda un latido cada 60 s: 3 min toleran que se pierda uno.
SEGUNDOS_EN_LINEA = 180
# Con la pestaña abierta pero sin tocar nada durante este tiempo, la persona está «en pausa».
SEGUNDOS_PAUSA = 180
# Después de eso y hasta aquí sigue en la lista, apagado («estuvo hace un rato»).
SEGUNDOS_RECIENTE = 30 * 60
# Si pasan más de esto sin latido, la próxima señal abre una conexión nueva (reinicia «desde»).
SEGUNDOS_CONEXION_NUEVA = 10 * 60
HORAS_PULSO = 24
TOPE_LINEA_DE_TIEMPO = 250
TOPE_ACTIVIDAD_RECIENTE = 14
TIPOS_CLIENTE = ("cliente", "comercial")


def exigir_principal(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    if not es_principal(usuario):
        raise HTTPException(403, "Solo el administrador principal puede ver el monitoreo.")
    return usuario


# ── Piezas puras (se prueban sin base) ───────────────────────────────────

def inicio_del_dia(ahora: datetime) -> datetime:
    """Medianoche de Chile del día de `ahora`, en UTC."""
    local = ahora.astimezone(ZONA).replace(hour=0, minute=0, second=0, microsecond=0)
    return local.astimezone(timezone.utc)


def pantalla_de_ruta(ruta: str | None, modulo: str | None = None) -> str:
    """Dónde está la persona, en palabras: «Inicio», «Toma de muestras › Solicitudes», «Report»."""
    limpia = (ruta or "").split("?")[0].split("#")[0].rstrip("/") or "/"
    if limpia == "/":
        return "Inicio (Panel general)"
    modulo = modulo or actividad.modulo_de_ruta(limpia)
    resto = [s for s in limpia.strip("/").split("/") if s and not s.isdigit() and len(s) < 30]
    if modulo:
        prefijo = next((p for p, n in actividad.MODULOS if n == modulo and (limpia == p or limpia.startswith(p + "/"))), "")
        cola = [s for s in limpia[len(prefijo):].strip("/").split("/") if s and not s.isdigit() and len(s) < 30]
        if cola:
            return f"{modulo} › {cola[0].replace('-', ' ').capitalize()}"
        return modulo
    return resto[-1].replace("-", " ").capitalize() if resto else "Inicio (Panel general)"


def actividad_de_conexion(p: dict, ahora: datetime) -> str:
    """«activa» (tocó algo hace poco), «pausa» (pestaña abierta, sin tocar nada) o «segundo_plano» (pestaña oculta)."""
    if p.get("visible") is False:
        return "segundo_plano"
    ultima = p.get("ultima_interaccion")
    if ultima is None:  # pestaña antigua o sin la migración: no se sabe, se da por activa mientras late
        return "activa"
    return "activa" if (ahora - ultima).total_seconds() <= SEGUNDOS_PAUSA else "pausa"


def armar_conectados(
    presencias: list[dict], eventos: list[dict], ahora: datetime, yo: str | None = None
) -> list[dict]:
    """Quién está conectado: primero los que mandaron latido hace poco, luego los recientes.

    `presencias` son filas de la tabla; `eventos`, lo de `leer_eventos` de las últimas 24 h. Quien no
    tiene latido pero hizo algo hace menos de `SEGUNDOS_RECIENTE` entra igual, marcado como inferido
    (así la pantalla sirve aunque falte la migración 0068 o la pestaña sea antigua)."""
    hoy = inicio_del_dia(ahora)
    trabajo: dict[str, list[dict]] = {}
    for e in eventos:
        if e["email"] and e["t"] and e["t"] >= hoy and e["categoria"] in CATEGORIAS_TRABAJO:
            trabajo.setdefault(e["email"], []).append(e)

    def datos_trabajo(email: str) -> dict:
        propios = trabajo.get(email, [])
        ultima = max(propios, key=lambda e: e["t"], default=None)
        return {"acciones_hoy": len(propios), "ultima_accion": ultima["texto"] if ultima else None,
                "ultima_accion_en": _iso(ultima["t"]) if ultima else None}

    salida: dict[str, dict] = {}
    for p in presencias:
        email = (p["email"] or "").lower()
        seg = (ahora - p["ultimo_latido"]).total_seconds()
        if seg > SEGUNDOS_RECIENTE:
            continue
        en_linea = seg <= SEGUNDOS_EN_LINEA
        inter = p.get("ultima_interaccion")
        salida[email] = {
            "email": email, "nombre": p["nombre"] or email, "tipo": p["tipo_acceso"], "area": p["area"],
            "modulo": p["modulo"], "ruta": p["ruta"], "pantalla": pantalla_de_ruta(p["ruta"], p["modulo"]),
            "en_inicio": (p["ruta"] or "/").split("?")[0].rstrip("/") in ("", "/"),
            "en_pantalla_desde": _iso(p.get("ruta_desde")), "desde": _iso(p["desde"]),
            "ultimo": _iso(p["ultimo_latido"]), "segundos": int(seg),
            "estado": "en_linea" if en_linea else "reciente",
            "actividad": actividad_de_conexion(p, ahora) if en_linea else None,
            "ultima_interaccion": _iso(inter), "inactivo_segundos": int((ahora - inter).total_seconds()) if inter else None,
            "dispositivo": p.get("dispositivo"), "version": p.get("version"),
            "origen": "latido", "yo": email == (yo or "").lower(), **datos_trabajo(email),
        }
    ultimos: dict[str, dict] = {}
    for e in eventos:
        if e["email"] and e["t"] and e["email"] not in salida:
            if e["email"] not in ultimos or e["t"] > ultimos[e["email"]]["t"]:
                ultimos[e["email"]] = e
    for email, e in ultimos.items():
        seg = (ahora - e["t"]).total_seconds()
        if seg > SEGUNDOS_RECIENTE:
            continue
        salida[email] = {
            "email": email, "nombre": e["nombre"] or email, "tipo": None, "area": None,
            "modulo": e["modulo"], "ruta": None, "pantalla": e["modulo"] or "—", "en_inicio": False,
            "en_pantalla_desde": None, "desde": None, "ultimo": _iso(e["t"]), "segundos": int(seg),
            "estado": "reciente", "actividad": None, "ultima_interaccion": None, "inactivo_segundos": None,
            "dispositivo": None, "version": None,
            "origen": "actividad", "yo": email == (yo or "").lower(), **datos_trabajo(email),
        }
    orden = {"en_linea": 0, "reciente": 1}
    return sorted(salida.values(), key=lambda c: (orden[c["estado"]], c["segundos"]))


def pulso_por_hora(eventos: list[dict], ahora: datetime, horas: int = HORAS_PULSO) -> list[dict]:
    """Actividad por hora (hora de Chile) de las últimas `horas`, la última es la hora en curso."""
    fin = ahora.astimezone(ZONA).replace(minute=0, second=0, microsecond=0)
    bloques = [fin - timedelta(hours=k) for k in range(horas - 1, -1, -1)]
    trabajo: Counter = Counter()
    accesos: Counter = Counter()
    for e in eventos:
        if not e["t"]:
            continue
        clave = e["t"].astimezone(ZONA).replace(minute=0, second=0, microsecond=0)
        if e["categoria"] in CATEGORIAS_TRABAJO:
            trabajo[clave] += 1
        elif e["categoria"] in ("acceso", "visita"):
            accesos[clave] += 1
    return [{"hora": b.isoformat(), "trabajo": trabajo[b], "accesos": accesos[b]} for b in bloques]


def texto_de_evento(e: dict) -> str:
    """Lo que se lee en la línea de tiempo: el texto del evento, o «abrió X» si es una visita."""
    if e["categoria"] == "visita":
        return f"abrió {e['modulo']}" if e.get("modulo") else "abrió una pantalla"
    return e["texto"] or e["accion"] or ""


def linea_de_tiempo(eventos: list[dict], email: str, desde: datetime, limite: int = TOPE_LINEA_DE_TIEMPO) -> list[dict]:
    """Lo que hizo una persona desde `desde`, de lo más nuevo a lo más viejo."""
    propios = [e for e in eventos if e["email"] == email and e["t"] and e["t"] >= desde]
    propios.sort(key=lambda e: e["t"], reverse=True)
    return [{"t": _iso(e["t"]), "categoria": e["categoria"], "accion": e["accion"], "texto": texto_de_evento(e),
             "modulo": e["modulo"] or ETIQUETA_CATEGORIA.get(e["categoria"])} for e in propios[:limite]]


def por_modulo(conectados: list[dict]) -> list[dict]:
    """Dónde está la gente ahora: por módulo, cuántas personas (activas y en pausa), de más a menos."""
    cuenta: dict[str, dict] = {}
    for c in conectados:
        if c["estado"] != "en_linea":
            continue
        clave = c["modulo"] or ("Inicio" if c.get("en_inicio") else "Otras pantallas")
        f = cuenta.setdefault(clave, {"modulo": clave, "personas": 0, "activas": 0, "nombres": []})
        f["personas"] += 1
        f["activas"] += 1 if c.get("actividad") in ("activa", None) else 0
        f["nombres"].append(c["nombre"])
    return sorted(cuenta.values(), key=lambda f: (-f["personas"], f["modulo"]))


def actividad_reciente(eventos: list[dict], limite: int = TOPE_ACTIVIDAD_RECIENTE) -> list[dict]:
    """Lo último que hizo cualquiera, lo más nuevo primero (sin repetir ingresos fallidos ni ruido)."""
    vistos = [e for e in eventos if e["t"] and e["email"] and e["accion"] != "login_fallido"]
    vistos.sort(key=lambda e: e["t"], reverse=True)
    return [{"t": _iso(e["t"]), "email": e["email"], "nombre": e["nombre"] or e["email"], "categoria": e["categoria"],
             "texto": texto_de_evento(e), "modulo": e["modulo"] or ETIQUETA_CATEGORIA.get(e["categoria"])}
            for e in vistos[:limite]]


def recorrido_con_tiempos(eventos_nuevos_primero: list[dict], hasta: datetime) -> list[dict]:
    """El recorrido por módulos con cuánto estuvo en cada uno (aproximado: se mide entre una visita y la siguiente;
    el servidor no repite una visita al mismo módulo dentro de 10 min)."""
    visitas = sorted((e for e in eventos_nuevos_primero if e["categoria"] == "visita" and e["modulo"]), key=lambda e: e["t"])
    salida: list[dict] = []
    for i, v in enumerate(visitas):
        fin = visitas[i + 1]["t"] if i + 1 < len(visitas) else hasta
        minutos = max(0, int((fin - v["t"]).total_seconds() // 60))
        if salida and salida[-1]["modulo"] == v["modulo"]:
            salida[-1]["minutos"] += minutos
            continue
        salida.append({"modulo": v["modulo"], "desde": v["t"], "minutos": minutos})
    return [{"modulo": s["modulo"], "desde": _iso(s["desde"]), "minutos": s["minutos"]} for s in salida]


def agrupar_sesiones(sesiones: list[dict], ahora: datetime) -> list[dict]:
    """Una fila por cuenta con lo que estuvo conectada en el período: visitas, tiempo conectada y tiempo usando el sistema.

    Cada sesión trae `inicio`, `ultimo_latido` y `segundos_activos`. Una visita de un solo latido dura 0: se muestra
    como «menos de 1 min». Primero van los que están en línea, luego quien se conectó más recién."""
    por_cuenta: dict[str, dict] = {}
    for s in sesiones:
        email = (s["email"] or "").lower()
        f = por_cuenta.setdefault(email, {
            "email": email, "nombre": s["nombre"] or email, "tipo": s.get("tipo_acceso"), "cliente": s.get("cliente"),
            "planta": s.get("planta"), "sesiones": 0, "segundos_conectado": 0, "segundos_activo": 0,
            "primera": s["inicio"], "ultima": s["ultimo_latido"], "dispositivo": s.get("dispositivo"),
        })
        f["sesiones"] += 1
        f["segundos_conectado"] += max(0, int((s["ultimo_latido"] - s["inicio"]).total_seconds()))
        dur = max(0, int((s["ultimo_latido"] - s["inicio"]).total_seconds()))
        f["segundos_activo"] += min(max(0, int(s.get("segundos_activos") or 0)), dur)  # nunca más que lo conectado
        f["primera"] = min(f["primera"], s["inicio"])
        if s["ultimo_latido"] >= f["ultima"]:
            f["ultima"], f["dispositivo"] = s["ultimo_latido"], s.get("dispositivo") or f["dispositivo"]
            f["nombre"] = s["nombre"] or f["nombre"]
            f["cliente"], f["planta"] = s.get("cliente") or f["cliente"], s.get("planta") or f["planta"]
    salida = []
    for f in por_cuenta.values():
        seg = (ahora - f["ultima"]).total_seconds()
        salida.append({**f, "primera": _iso(f["primera"]), "ultima": _iso(f["ultima"]), "segundos_desde_ultima": int(seg),
                       "en_linea": seg <= SEGUNDOS_EN_LINEA})
    return sorted(salida, key=lambda f: (not f["en_linea"], f["segundos_desde_ultima"]))


def desde_de_conexion(presencia: dict | None, eventos: list[dict], email: str, ahora: datetime) -> tuple[datetime, str]:
    """Desde cuándo contar lo que hizo: su conexión actual, si no su último ingreso de hoy, si no el inicio del día."""
    if presencia and (ahora - presencia["ultimo_latido"]).total_seconds() <= SEGUNDOS_RECIENTE:
        return presencia["desde"], "conexion"
    hoy = inicio_del_dia(ahora)
    logins = [e["t"] for e in eventos if e["email"] == email and e["accion"] == "login" and e["t"] and e["t"] >= hoy]
    if logins:
        return max(logins), "ingreso"
    return hoy, "hoy"


# ── Lecturas ─────────────────────────────────────────────────────────────

def _presencias() -> list[dict]:
    base = ("SELECT email, nombre, tipo_acceso, area, ruta, modulo, desde, ultimo_latido{extra} FROM presencia "
            "WHERE ultimo_latido > now() - make_interval(secs => %s)")
    # Sin la migración 0069 no existen las columnas de detalle: se lee lo de siempre.
    return (_filas(base.format(extra=", ruta_desde, ultima_interaccion, visible, dispositivo, version"), (SEGUNDOS_RECIENTE,))
            or _filas(base.format(extra=""), (SEGUNDOS_RECIENTE,)))


def _informes_recientes(limite: int = 12) -> list[dict]:
    base = ("SELECT id, laboratorio, nro_informe, ot, ship_to, estado, ya_cargado, {decision} AS decision, "
            "COALESCE(llegada_en, creado_en) AS llegada FROM correo_informe ORDER BY COALESCE(llegada_en, creado_en) DESC LIMIT %s")
    filas = _filas(base.format(decision="decision"), (limite,)) or _filas(base.format(decision="'pendiente'"), (limite,))
    return [{"id": f["id"], "laboratorio": f["laboratorio"], "nro_informe": f["nro_informe"], "ot": f["ot"],
             "ship_to": f["ship_to"], "estado": f["estado"], "ya_cargado": f["ya_cargado"],
             "decision": f["decision"] or "pendiente", "llegada": _iso(f["llegada"])} for f in filas]


def _solicitudes_recientes(limite: int = 12) -> list[dict]:
    filas = _filas(
        """SELECT l.id, l.creado_en, l.numero_solicitud, l.laboratorio, l.usuario_nombre, l.exitoso, l.error,
                  (SELECT s.ship_to FROM solicitud_archivo s WHERE s.numero_solicitud = l.numero_solicitud LIMIT 1) AS ship_to
           FROM envio_solicitud_log l ORDER BY l.creado_en DESC LIMIT %s""", (limite,))
    return [{"id": f["id"], "t": _iso(f["creado_en"]), "numero": f["numero_solicitud"], "laboratorio": f["laboratorio"],
             "enviado_por": f["usuario_nombre"], "exitoso": f["exitoso"], "error": (f["error"] or "")[:160] or None,
             "ship_to": f["ship_to"]} for f in filas]


def _sesiones_de(email: str, limite: int = 15) -> list[dict]:
    """Sus últimas conexiones (migración 0070): cuándo empezó, cuánto duró y cuánto lo usó de verdad."""
    filas = _filas("SELECT inicio, ultimo_latido, segundos_activos, dispositivo FROM presencia_sesion "
                   "WHERE email = %s ORDER BY ultimo_latido DESC LIMIT %s", (email, limite))
    return [{"inicio": _iso(f["inicio"]), "fin": _iso(f["ultimo_latido"]),
             "segundos": max(0, int((f["ultimo_latido"] - f["inicio"]).total_seconds())),
             "segundos_activo": int(f["segundos_activos"] or 0), "dispositivo": f["dispositivo"]} for f in filas]


def _hay_tabla(nombre: str) -> bool:
    filas = _filas("SELECT to_regclass(%s) IS NOT NULL AS hay", (nombre,))
    return bool(filas and filas[0]["hay"])


def _contar(sql: str, params: tuple = ()) -> int:
    filas = _filas(sql, params)
    return int(filas[0]["n"]) if filas else 0


# ── Endpoints ────────────────────────────────────────────────────────────

class LatidoIn(BaseModel):
    ruta: str = ""
    # Detalle opcional (pestañas antiguas no lo mandan): segundos desde el último toque real, si la pestaña está a
    # la vista, desde qué aparato y qué versión de la pantalla tiene cargada.
    inactivo_segundos: int | None = None
    visible: bool = True
    dispositivo: str | None = None
    version: str | None = None


@router_latido.post("/latido")
def latido(body: LatidoIn, usuario: Usuario = Depends(usuario_actual)) -> dict[str, Any]:
    """Cada pestaña abierta avisa que sigue ahí. Nunca falla: es un adorno que no puede tumbar nada."""
    ruta = (body.ruta or "")[:200]
    modulo = actividad.modulo_de_ruta(ruta) or ("Panel general" if ruta in ("", "/") else None)
    base = {"e": usuario.email.lower(), "n": usuario.nombre, "t": usuario.tipoAcceso, "a": usuario.area,
            "r": ruta or None, "m": modulo, "s": SEGUNDOS_CONEXION_NUEVA}
    detalle = {**base, "i": max(0, min(body.inactivo_segundos, 86400)) if body.inactivo_segundos is not None else None,
               "v": body.visible, "d": (body.dispositivo or "")[:80] or None, "ver": (body.version or "")[:40] or None}
    reinicia = "presencia.ultimo_latido < now() - make_interval(secs => %(s)s)"
    con_detalle = f"""
        INSERT INTO presencia (email, nombre, tipo_acceso, area, ruta, modulo, desde, ultimo_latido,
                               ruta_desde, ultima_interaccion, visible, dispositivo, version)
        VALUES (%(e)s, %(n)s, %(t)s, %(a)s, %(r)s, %(m)s, now(), now(), now(),
                CASE WHEN %(i)s::int IS NULL THEN NULL ELSE now() - make_interval(secs => %(i)s::int) END,
                %(v)s, %(d)s, %(ver)s)
        ON CONFLICT (email) DO UPDATE SET
            nombre = EXCLUDED.nombre, tipo_acceso = EXCLUDED.tipo_acceso, area = EXCLUDED.area,
            ruta_desde = CASE WHEN {reinicia} OR presencia.ruta IS DISTINCT FROM EXCLUDED.ruta
                              THEN now() ELSE presencia.ruta_desde END,
            ruta = EXCLUDED.ruta, modulo = EXCLUDED.modulo,
            desde = CASE WHEN {reinicia} THEN now() ELSE presencia.desde END,
            ultimo_latido = now(), ultima_interaccion = EXCLUDED.ultima_interaccion, visible = EXCLUDED.visible,
            dispositivo = EXCLUDED.dispositivo, version = EXCLUDED.version
        """
    sin_detalle = f"""
        INSERT INTO presencia (email, nombre, tipo_acceso, area, ruta, modulo, desde, ultimo_latido)
        VALUES (%(e)s, %(n)s, %(t)s, %(a)s, %(r)s, %(m)s, now(), now())
        ON CONFLICT (email) DO UPDATE SET
            nombre = EXCLUDED.nombre, tipo_acceso = EXCLUDED.tipo_acceso, area = EXCLUDED.area,
            ruta = EXCLUDED.ruta, modulo = EXCLUDED.modulo,
            desde = CASE WHEN {reinicia} THEN now() ELSE presencia.desde END,
            ultimo_latido = now()
        """
    ok = False
    for sql, params in ((con_detalle, detalle), (sin_detalle, base)):
        try:
            with conexion() as conn, cursor_dict(conn) as cur:
                cur.execute(sql, params)
            ok = True
            break
        except Exception:
            logger.warning("No se pudo anotar el latido.", exc_info=True)
    _anotar_sesion({**detalle, "c": usuario.clienteNombre, "p": usuario.plantaNombre})
    return {"ok": ok}


def _anotar_sesion(p: dict) -> None:
    """Historial de conexiones (migración 0070): sigue la visita en curso o abre una nueva. Nunca lanza."""
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                """
                UPDATE presencia_sesion SET
                    segundos_activos = segundos_activos + CASE
                        WHEN %(v)s AND (%(i)s::int IS NULL OR %(i)s::int < %(pausa)s)
                        THEN LEAST(GREATEST(extract(epoch FROM now() - ultimo_latido), 0), 90)::int ELSE 0 END,
                    ultimo_latido = now(), dispositivo = COALESCE(%(d)s, dispositivo), version = COALESCE(%(ver)s, version),
                    nombre = %(n)s, cliente = %(c)s, planta = %(p)s
                WHERE id = (SELECT id FROM presencia_sesion WHERE email = %(e)s
                            AND ultimo_latido > now() - make_interval(secs => %(s)s)
                            ORDER BY ultimo_latido DESC LIMIT 1)
                RETURNING id
                """, {**p, "pausa": SEGUNDOS_PAUSA, "p": p["p"]})
            if cur.fetchone() is None:
                cur.execute(
                    """INSERT INTO presencia_sesion (email, nombre, tipo_acceso, cliente, planta, dispositivo, version)
                       VALUES (%(e)s, %(n)s, %(t)s, %(c)s, %(p)s, %(d)s, %(ver)s)""", p)
    except Exception:
        logger.warning("No se pudo anotar la sesión.", exc_info=True)


@router.get("/resumen")
def resumen(usuario: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    ahora = datetime.now(timezone.utc)
    hoy = inicio_del_dia(ahora)
    eventos = [e for e in leer_eventos(ahora - timedelta(hours=HORAS_PULSO)) if e["t"]]
    conectados = armar_conectados(_presencias(), eventos, ahora, usuario.email)
    de_hoy = [e for e in eventos if e["t"] >= hoy]
    acciones = Counter(e["accion"] for e in de_hoy)
    fallidos = dashboard.envios_fallidos(limite=6)
    rojos = _contar("SELECT count(*) AS n FROM correo_informe WHERE estado = 'rojo' AND resuelto_en IS NULL "
                    "AND COALESCE(decision, 'pendiente') = 'pendiente'")
    if not rojos:  # sin la migración 0065 no existe `decision`
        rojos = _contar("SELECT count(*) AS n FROM correo_informe WHERE estado = 'rojo' AND resuelto_en IS NULL")
    en_linea = [c for c in conectados if c["estado"] == "en_linea"]
    hace_1h = ahora - timedelta(hours=1)
    hace_2h = ahora - timedelta(hours=2)
    return {
        "ahora": _iso(ahora),
        "conectados": conectados,
        "en_linea": len(en_linea),
        "activos": sum(1 for c in en_linea if c["actividad"] in ("activa", None)),
        "en_pausa": sum(1 for c in en_linea if c["actividad"] in ("pausa", "segundo_plano")),
        "clientes_en_linea": sum(1 for c in en_linea if c["tipo"] in TIPOS_CLIENTE),
        "por_modulo": por_modulo(conectados),
        "actividad_reciente": actividad_reciente(eventos),
        "kpis": {
            "acciones_ultima_hora": sum(1 for e in eventos if e["t"] >= hace_1h and e["categoria"] in CATEGORIAS_TRABAJO),
            "acciones_hora_anterior": sum(1 for e in eventos if hace_2h <= e["t"] < hace_1h and e["categoria"] in CATEGORIAS_TRABAJO),
            "informes_hoy": _contar("SELECT count(*) AS n FROM correo_informe WHERE COALESCE(llegada_en, creado_en) >= %s", (hoy,)),
            "solicitudes_creadas_hoy": acciones.get("solicitud_creada", 0),
            "solicitudes_enviadas_hoy": acciones.get("solicitud_enviada", 0),
            "acciones_hoy": sum(1 for e in de_hoy if e["categoria"] in CATEGORIAS_TRABAJO),
            "personas_hoy": len({e["email"] for e in de_hoy if e["email"] and e["categoria"] in CATEGORIAS_TRABAJO}),
        },
        "pulso": pulso_por_hora(eventos, ahora),
        "informes": _informes_recientes(),
        "solicitudes": _solicitudes_recientes(),
        "alertas": {"envios_fallidos": fallidos, "informes_en_rojo": rojos},
    }


@router.get("/clientes")
def clientes_conectados(dias: int = Query(1, ge=1, le=90), _: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    """Las cuentas de cliente y comercial que se conectaron en el período, con cuánto tiempo estuvieron.
    `dias=1` es «hoy» (desde la medianoche de Chile). Sin la migración 0070 responde `disponible: false`."""
    ahora = datetime.now(timezone.utc)
    desde = inicio_del_dia(ahora) if dias == 1 else ahora - timedelta(days=dias)
    if not _hay_tabla("presencia_sesion"):
        return {"disponible": False, "cuentas": [], "dias": dias}
    filas = _filas(
        """SELECT email, nombre, tipo_acceso, cliente, planta, dispositivo, inicio, ultimo_latido, segundos_activos
           FROM presencia_sesion WHERE ultimo_latido >= %s AND tipo_acceso = ANY(%s)""", (desde, list(TIPOS_CLIENTE)))
    cuentas = agrupar_sesiones(filas, ahora)
    return {"disponible": True, "dias": dias, "ahora": _iso(ahora), "cuentas": cuentas,
            "en_linea": sum(1 for c in cuentas if c["en_linea"]),
            "segundos_total": sum(c["segundos_conectado"] for c in cuentas)}


@router.get("/usuario")
def detalle_usuario(email: str = Query(..., min_length=3), _: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    """Todo lo que hizo una persona desde que se conectó."""
    email = email.strip().lower()
    ahora = datetime.now(timezone.utc)
    eventos = [e for e in leer_eventos(ahora - timedelta(hours=HORAS_PULSO)) if e["t"]]
    pres = next((p for p in _presencias() if (p["email"] or "").lower() == email), None)
    desde, origen = desde_de_conexion(pres, eventos, email, ahora)
    lineas = linea_de_tiempo(eventos, email, desde)
    nombre = (pres or {}).get("nombre") or next((e["nombre"] for e in eventos if e["email"] == email and e["nombre"]), None) or email
    modulos: list[str] = []
    for l in reversed(lineas):  # en orden de llegada, sin repetir seguidos
        if l["categoria"] == "visita" and l["modulo"] and (not modulos or modulos[-1] != l["modulo"]):
            modulos.append(l["modulo"])
    en_linea = bool(pres and (ahora - pres["ultimo_latido"]).total_seconds() <= SEGUNDOS_EN_LINEA)
    inter = (pres or {}).get("ultima_interaccion")
    return {
        "email": email, "nombre": nombre, "desde": _iso(desde), "origen_desde": origen, "ahora": _iso(ahora),
        "en_linea": en_linea,
        "actividad": actividad_de_conexion(pres, ahora) if en_linea and pres else None,
        "inactivo_segundos": int((ahora - inter).total_seconds()) if inter else None,
        "ultimo_latido": _iso(pres["ultimo_latido"]) if pres else None,
        "pantalla": pantalla_de_ruta(pres["ruta"], pres["modulo"]) if pres else None,
        "en_pantalla_desde": _iso(pres.get("ruta_desde")) if pres else None,
        "dispositivo": (pres or {}).get("dispositivo"), "version": (pres or {}).get("version"),
        "tipo": (pres or {}).get("tipo_acceso"),
        "sesiones": _sesiones_de(email),
        "recorrido_tiempos": recorrido_con_tiempos([e for e in eventos if e["email"] == email and e["t"] >= desde], ahora),
        "modulo_actual": (pres or {}).get("modulo"),
        "total": len(lineas),
        "acciones": sum(1 for l in lineas if l["categoria"] in CATEGORIAS_TRABAJO),
        "por_categoria": dict(Counter(l["categoria"] for l in lineas if l["categoria"] in CATEGORIAS_TRABAJO)),
        "recorrido": modulos,
        "eventos": lineas,
    }
