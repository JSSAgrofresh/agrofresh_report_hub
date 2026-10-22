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
# Después de eso y hasta aquí sigue en la lista, apagado («estuvo hace un rato»).
SEGUNDOS_RECIENTE = 30 * 60
# Si pasan más de esto sin latido, la próxima señal abre una conexión nueva (reinicia «desde»).
SEGUNDOS_CONEXION_NUEVA = 10 * 60
HORAS_PULSO = 24
TOPE_LINEA_DE_TIEMPO = 250


def exigir_principal(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    if not es_principal(usuario):
        raise HTTPException(403, "Solo el administrador principal puede ver el monitoreo.")
    return usuario


# ── Piezas puras (se prueban sin base) ───────────────────────────────────

def inicio_del_dia(ahora: datetime) -> datetime:
    """Medianoche de Chile del día de `ahora`, en UTC."""
    local = ahora.astimezone(ZONA).replace(hour=0, minute=0, second=0, microsecond=0)
    return local.astimezone(timezone.utc)


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
        salida[email] = {
            "email": email, "nombre": p["nombre"] or email, "tipo": p["tipo_acceso"], "area": p["area"],
            "modulo": p["modulo"], "ruta": p["ruta"], "desde": _iso(p["desde"]),
            "ultimo": _iso(p["ultimo_latido"]), "segundos": int(seg),
            "estado": "en_linea" if seg <= SEGUNDOS_EN_LINEA else "reciente",
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
            "modulo": e["modulo"], "ruta": None, "desde": None, "ultimo": _iso(e["t"]), "segundos": int(seg),
            "estado": "reciente", "origen": "actividad", "yo": email == (yo or "").lower(), **datos_trabajo(email),
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
    return _filas("SELECT email, nombre, tipo_acceso, area, ruta, modulo, desde, ultimo_latido FROM presencia "
                  "WHERE ultimo_latido > now() - make_interval(secs => %s)", (SEGUNDOS_RECIENTE,))


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


def _contar(sql: str, params: tuple = ()) -> int:
    filas = _filas(sql, params)
    return int(filas[0]["n"]) if filas else 0


# ── Endpoints ────────────────────────────────────────────────────────────

class LatidoIn(BaseModel):
    ruta: str = ""


@router_latido.post("/latido")
def latido(body: LatidoIn, usuario: Usuario = Depends(usuario_actual)) -> dict[str, Any]:
    """Cada pestaña abierta avisa que sigue ahí. Nunca falla: es un adorno que no puede tumbar nada."""
    ruta = (body.ruta or "")[:200]
    modulo = actividad.modulo_de_ruta(ruta) or ("Panel general" if ruta in ("", "/") else None)
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                """
                INSERT INTO presencia (email, nombre, tipo_acceso, area, ruta, modulo, desde, ultimo_latido)
                VALUES (%(e)s, %(n)s, %(t)s, %(a)s, %(r)s, %(m)s, now(), now())
                ON CONFLICT (email) DO UPDATE SET
                    nombre = EXCLUDED.nombre, tipo_acceso = EXCLUDED.tipo_acceso, area = EXCLUDED.area,
                    ruta = EXCLUDED.ruta, modulo = EXCLUDED.modulo,
                    desde = CASE WHEN presencia.ultimo_latido < now() - make_interval(secs => %(s)s)
                                 THEN now() ELSE presencia.desde END,
                    ultimo_latido = now()
                """,
                {"e": usuario.email.lower(), "n": usuario.nombre, "t": usuario.tipoAcceso, "a": usuario.area,
                 "r": ruta or None, "m": modulo, "s": SEGUNDOS_CONEXION_NUEVA},
            )
        return {"ok": True}
    except Exception:
        logger.warning("No se pudo anotar el latido.", exc_info=True)
        return {"ok": False}


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
    return {
        "ahora": _iso(ahora),
        "conectados": conectados,
        "en_linea": sum(1 for c in conectados if c["estado"] == "en_linea"),
        "kpis": {
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
    return {
        "email": email, "nombre": nombre, "desde": _iso(desde), "origen_desde": origen, "ahora": _iso(ahora),
        "en_linea": bool(pres and (ahora - pres["ultimo_latido"]).total_seconds() <= SEGUNDOS_EN_LINEA),
        "modulo_actual": (pres or {}).get("modulo"),
        "total": len(lineas),
        "acciones": sum(1 for l in lineas if l["categoria"] in CATEGORIAS_TRABAJO),
        "por_categoria": dict(Counter(l["categoria"] for l in lineas if l["categoria"] in CATEGORIAS_TRABAJO)),
        "recorrido": modulos,
        "eventos": lineas,
    }
