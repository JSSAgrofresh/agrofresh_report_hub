"""
Panel de Administración General: qué pasa en el sistema y qué hace cada persona.

Solo el admin general. No hay tablas nuevas para casi nada: la actividad de cada
persona se arma uniendo lo que ya queda anotado (solicitudes creadas y enviadas,
cargas de datos, cruces del laboratorio, verificaciones guardadas, correcciones
del Converter, informes subidos) más el registro de la migración 0047 (accesos,
visitas a módulos y cambios sensibles).

Cada fuente se lee por separado: si a una le falta su migración, el panel sigue
con las demás.
"""
from __future__ import annotations

import logging
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query

from . import config_store
from .auth import Usuario, solo_admin_general
from .db import conexion, cursor_dict
from .listas_distribucion import ARCHIVO_CONTACTOS, _listados, del_servicio, estado_desde_contactos, estado_para_tabla

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin-panel", tags=["admin-panel"])

ZONA = ZoneInfo("America/Santiago")
TOPE_POR_FUENTE = 20000

# categoría del evento → módulo con el que se muestra
ETIQUETA_CATEGORIA = {
    "solicitudes": "Toma de muestras",
    "cargas": "Ingesta / Converter",
    "verificaciones": "Verificaciones",
    "laboratorio": "AgroFresh Lab",
    "informes": "Auditoría / Informes",
    "acceso": "Accesos",
    "sensible": "Cambios sensibles",
}
# lo que cuenta como "trabajo" en el gráfico y el ranking (no accesos ni visitas)
CATEGORIAS_TRABAJO = ("solicitudes", "cargas", "verificaciones", "laboratorio", "informes")
SERIE = ("solicitudes", "cargas", "verificaciones", "laboratorio")


# ── Piezas puras (se prueban sin base) ───────────────────────────────────

def variacion(actual: float, previo: float) -> float | None:
    """Cambio porcentual contra el período anterior; None si no hay con qué comparar."""
    if not previo:
        return None
    return round((actual - previo) * 100 / previo, 1)


def puntaje_salud(
    *,
    pendientes_ingesta: int,
    plantas_con_problema: int,
    total_plantas: int,
    verif_sin_revisar: int,
    pdf_sin_report: int,
) -> dict[str, Any]:
    """100 menos lo que pesa cada problema. Los descuentos se devuelven uno por
    uno para que se vea de dónde sale el número."""
    ratio = min(1.0, plantas_con_problema / total_plantas) if total_plantas else 0.0
    componentes = [
        {"clave": "pendientes", "titulo": "Filas pendientes de ingesta", "cantidad": pendientes_ingesta,
         "descuento": min(30, pendientes_ingesta)},
        {"clave": "plantas", "titulo": "Plantas sin técnico, sin lista de cliente o sin lista", "cantidad": plantas_con_problema,
         "descuento": round(30 * ratio)},
        {"clave": "verificaciones", "titulo": "Verificaciones no aceptables sin revisar", "cantidad": verif_sin_revisar,
         "descuento": min(20, 5 * verif_sin_revisar)},
        {"clave": "pdf", "titulo": "PDF sin Report (más de 7 días)", "cantidad": pdf_sin_report,
         "descuento": min(20, pdf_sin_report)},
    ]
    return {"puntaje": max(0, 100 - sum(c["descuento"] for c in componentes)), "componentes": componentes}


def resolver_nombres(eventos: list[dict], por_nombre: dict[str, str]) -> None:
    """Hay fuentes que solo guardan el nombre de quien actuó (cargas de datos);
    se les pone el correo de la cuenta con ese nombre para sumarlas a la misma persona."""
    for e in eventos:
        if not e.get("email") and e.get("nombre"):
            e["email"] = por_nombre.get((e["nombre"] or "").strip().lower())


def resumen_por_usuario(eventos: list[dict]) -> dict[str, dict]:
    """Por persona: acciones de trabajo, desglose por categoría, accesos, visitas y última actividad."""
    r: dict[str, dict] = {}
    for e in eventos:
        k = e.get("email")
        if not k:
            continue
        u = r.setdefault(k, {"acciones": 0, "por_categoria": Counter(), "accesos": 0, "visitas": 0,
                             "por_modulo_visitas": Counter(), "ultima": None, "nombre": e.get("nombre")})
        if e["t"] and (u["ultima"] is None or e["t"] > u["ultima"]):
            u["ultima"] = e["t"]
        if not u["nombre"]:
            u["nombre"] = e.get("nombre")
        cat = e["categoria"]
        if cat in CATEGORIAS_TRABAJO:
            u["acciones"] += 1
            u["por_categoria"][cat] += 1
        elif cat == "acceso" and e["accion"] == "login":
            u["accesos"] += 1
        elif cat == "visita":
            u["visitas"] += 1
            u["por_modulo_visitas"][e.get("modulo") or "Otros"] += 1
    return r


def serie_diaria(eventos: list[dict], desde: datetime, hasta: datetime) -> list[dict]:
    """Acciones por día (hora de Chile), con todos los días del rango aunque estén en cero."""
    dia = desde.astimezone(ZONA).date()
    fin = hasta.astimezone(ZONA).date()
    filas: dict[Any, dict] = {}
    while dia <= fin:
        filas[dia] = {"fecha": dia.isoformat(), **{c: 0 for c in SERIE}, "otros": 0}
        dia += timedelta(days=1)
    for e in eventos:
        if e["categoria"] not in CATEGORIAS_TRABAJO or not e["t"]:
            continue
        f = filas.get(e["t"].astimezone(ZONA).date())
        if f is None:
            continue
        f[e["categoria"] if e["categoria"] in SERIE else "otros"] += 1
    return list(filas.values())


# ── Lectura de fuentes ───────────────────────────────────────────────────

def _filas(sql: str, params: tuple | dict = ()) -> list[dict]:
    """Una consulta de solo lectura; si falla (falta una tabla) devuelve vacío."""
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(sql, params)
            return list(cur.fetchall())
    except Exception:
        logger.warning("Panel: no se pudo leer una fuente.", exc_info=True)
        return []


def _ev(t, email, nombre, categoria, accion, texto="", modulo=None) -> dict:
    return {"t": t, "email": (email or "").strip().lower() or None, "nombre": nombre, "categoria": categoria,
            "accion": accion, "texto": texto, "modulo": modulo}


def leer_eventos(desde: datetime) -> list[dict]:
    p = {"d": desde}
    ev: list[dict] = []
    for f in _filas(
        """SELECT creado_en, datos->>'email_solicitante' AS email, datos->>'generado_por' AS nombre,
                  numero_solicitud, laboratorio, ship_to
           FROM solicitud_archivo
           WHERE creado_en >= %(d)s AND coalesce(datos->>'es_prueba', '') <> 'true'
           LIMIT %(n)s""", {**p, "n": TOPE_POR_FUENTE}):
        ev.append(_ev(f["creado_en"], f["email"], f["nombre"], "solicitudes", "solicitud_creada",
                      f"creó la solicitud {f['numero_solicitud'] or ''} · {f['laboratorio'] or ''} · {f['ship_to'] or ''}".strip(" ·")))
    for f in _filas(
        """SELECT creado_en, usuario_email, usuario_nombre, numero_solicitud, laboratorio, exitoso
           FROM envio_solicitud_log WHERE creado_en >= %(d)s LIMIT %(n)s""", {**p, "n": TOPE_POR_FUENTE}):
        ev.append(_ev(f["creado_en"], f["usuario_email"], f["usuario_nombre"], "solicitudes",
                      "solicitud_enviada" if f["exitoso"] else "envio_fallido",
                      ("envió" if f["exitoso"] else "intentó enviar (falló)") + f" la solicitud {f['numero_solicitud'] or ''} a {f['laboratorio'] or 'el laboratorio'}"))
    for f in _filas(
        """SELECT creado_en, origen, archivo, filas, creado_por, deshecha_en, deshecha_por
           FROM carga_datos WHERE creado_en >= %(d)s OR deshecha_en >= %(d)s LIMIT %(n)s""", {**p, "n": TOPE_POR_FUENTE}):
        origen = "Converter (PDF)" if f["origen"] == "converter" else "Ingesta (Excel)"
        if f["creado_en"] >= desde:
            ev.append(_ev(f["creado_en"], None, f["creado_por"], "cargas", "carga",
                          f"cargó {f['filas']} filas por {origen}" + (f" · {f['archivo']}" if f["archivo"] else "")))
        if f["deshecha_en"] and f["deshecha_en"] >= desde:
            ev.append(_ev(f["deshecha_en"], None, f["deshecha_por"], "sensible", "carga_deshecha",
                          f"deshizo la carga de {f['filas']} filas ({origen})"))
    for f in _filas(
        """SELECT creado_en, accion, numero_solicitud, codigo_muestra, usuario_email, usuario_nombre
           FROM lab_actividad WHERE creado_en >= %(d)s LIMIT %(n)s""", {**p, "n": TOPE_POR_FUENTE}):
        ev.append(_ev(f["creado_en"], f["usuario_email"], f["usuario_nombre"], "laboratorio", f["accion"],
                      f"{(f['accion'] or '').replace('_', ' ')} · {f['codigo_muestra'] or f['numero_solicitud'] or ''}".strip(" ·")))
    for f in _filas(
        """SELECT guardado_en, fecha, seccion, analista, email
           FROM verif_seccion_lock WHERE guardado_en >= %(d)s LIMIT %(n)s""", {**p, "n": TOPE_POR_FUENTE}):
        ev.append(_ev(f["guardado_en"], f["email"], f["analista"], "verificaciones", "seccion_guardada",
                      f"guardó la sección {f['seccion']} del {f['fecha']}"))
    for f in _filas(
        """SELECT creado_en, campo, valor_crudo, valor_oficial, creado_por_email, creado_por_nombre
           FROM correccion_converter WHERE creado_en >= %(d)s LIMIT %(n)s""", {**p, "n": TOPE_POR_FUENTE}):
        ev.append(_ev(f["creado_en"], f["creado_por_email"], f["creado_por_nombre"], "cargas", "correccion_converter",
                      f"corrigió en el Converter {f['campo']}: «{f['valor_crudo']}» → «{f['valor_oficial']}»"))
    for f in _filas(
        """SELECT subido_en, nro_informe, laboratorio, subido_por_email, subido_por_nombre
           FROM informe_auditoria WHERE subido_en >= %(d)s LIMIT %(n)s""", {**p, "n": TOPE_POR_FUENTE}):
        ev.append(_ev(f["subido_en"], f["subido_por_email"], f["subido_por_nombre"], "informes", "informe_subido",
                      f"subió el informe {f['nro_informe'] or ''} de {f['laboratorio'] or ''}".strip()))
    for f in _filas(
        """SELECT creado_en, usuario_email, usuario_nombre, modo, laboratorio, ship_to, exitoso
           FROM envio_informe_log WHERE creado_en >= %(d)s LIMIT %(n)s""", {**p, "n": TOPE_POR_FUENTE}):
        prueba = " (prueba)" if f["modo"] == "prueba" else ""
        ev.append(_ev(f["creado_en"], f["usuario_email"], f["usuario_nombre"], "informes",
                      "informe_enviado" if f["exitoso"] else "informe_envio_fallido",
                      ("envió" if f["exitoso"] else "intentó enviar (falló)")
                      + f" un informe de {f['laboratorio'] or ''} a {f['ship_to'] or 'un cliente'}{prueba}"))
    for f in _filas(
        """SELECT creado_en, email, nombre, categoria, accion, modulo, detalle, sensible
           FROM actividad_usuario WHERE creado_en >= %(d)s ORDER BY creado_en DESC LIMIT %(n)s""", {**p, "n": TOPE_POR_FUENTE}):
        texto = {"login": "inició sesión", "login_fallido": "intento de ingreso fallido"}.get(f["accion"]) or f["detalle"] or f["accion"]
        if f["accion"] in ("login_fallido",) and f["detalle"]:
            texto += f" · {f['detalle']}"
        ev.append(_ev(f["creado_en"], f["email"], f["nombre"], "sensible" if f["sensible"] else f["categoria"],
                      f["accion"], texto, f["modulo"]))
    por_nombre = {(u["nombre"] or "").strip().lower(): u["email"].lower() for u in _usuarios()}
    resolver_nombres(ev, por_nombre)
    return ev


def _usuarios() -> list[dict]:
    return _filas("SELECT id, email, nombre, tipo_acceso, area, creado_en FROM usuario ORDER BY nombre")


def _ultimo_uso() -> dict[int, datetime]:
    return {f["usuario_id"]: f["u"] for f in _filas("SELECT usuario_id, max(ultimo_uso) AS u FROM sesion GROUP BY usuario_id")}


def _iso(t: datetime | None) -> str | None:
    return t.isoformat() if t else None


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/resumen")
def resumen(dias: int = Query(30, ge=7, le=180), _: Usuario = Depends(solo_admin_general)) -> dict:
    ahora = datetime.now(timezone.utc)
    desde = ahora - timedelta(days=dias)
    previo_desde = desde - timedelta(days=dias)

    eventos = leer_eventos(previo_desde)
    actual = [e for e in eventos if e["t"] and e["t"] >= desde]
    anterior = [e for e in eventos if e["t"] and e["t"] < desde]
    usuarios = _usuarios()
    internos = [u for u in usuarios if u["tipo_acceso"] != "cliente"]
    ultimo_uso = _ultimo_uso()

    activos = {e["email"] for e in actual if e["email"] and e["categoria"] in (*CATEGORIAS_TRABAJO, "acceso", "visita")}
    activos_prev = {e["email"] for e in anterior if e["email"] and e["categoria"] in (*CATEGORIAS_TRABAJO, "acceso", "visita")}

    # Solicitudes e informes
    sol = _filas(
        """SELECT sa.archivo, sa.creado_en, sa.laboratorio,
                  (SELECT min(i.subido_en) FROM informe_auditoria i WHERE i.archivo_solicitud = sa.archivo) AS pdf_en,
                  EXISTS (SELECT 1 FROM informe_auditoria i JOIN solicitud s ON s.nro_solicitud = i.nro_informe
                          WHERE i.archivo_solicitud = sa.archivo) AS concretada
           FROM solicitud_archivo sa
           WHERE sa.creado_en >= %s AND coalesce(sa.datos->>'es_prueba', '') <> 'true'""", (previo_desde,))
    emitidas = [s for s in sol if s["creado_en"] >= desde]
    emitidas_prev = [s for s in sol if s["creado_en"] < desde]
    externas = [s for s in emitidas if (s["laboratorio"] or "").strip().upper() != "AGROFRESH"]
    externas_prev = [s for s in emitidas_prev if (s["laboratorio"] or "").strip().upper() != "AGROFRESH"]

    def pct(lista):
        return round(100 * sum(1 for s in lista if s["concretada"]) / len(lista), 1) if lista else None

    def dias_medios(lista):
        v = [(s["pdf_en"] - s["creado_en"]).total_seconds() / 86400 for s in lista if s["pdf_en"] and s["pdf_en"] >= s["creado_en"]]
        return round(sum(v) / len(v), 1) if v else None

    por_lab: dict[str, list] = defaultdict(list)
    for s in externas:
        por_lab[s["laboratorio"] or "—"].append(s)

    # Atención y salud
    pendientes = (_filas("SELECT count(*) AS n FROM pendiente_revision") or [{"n": 0}])[0]["n"]
    verif = (_filas(
        """SELECT count(*) AS n FROM verif_registro
           WHERE resultado ILIKE 'No aceptable' AND coalesce(revisado_por, '') = ''
             AND fecha >= (now() - interval '30 days')::date""") or [{"n": 0}])[0]["n"]
    pdf_sin_report = (_filas(
        """SELECT count(*) AS n FROM informe_auditoria i
           WHERE i.subido_en < now() - interval '7 days'
             AND NOT EXISTS (SELECT 1 FROM solicitud s WHERE s.nro_solicitud = i.nro_informe)""") or [{"n": 0}])[0]["n"]
    # Cobertura de la lista de Línea de proceso (la de Actimist todavía no lleva clientes).
    tabla = estado_para_tabla(estado_desde_contactos(del_servicio(config_store.leer(ARCHIVO_CONTACTOS, []))), _listados())
    filas_p = tabla["filas"]
    sin_tecnico = sum(1 for f in filas_p if not f["tecnico"])
    sin_comercial = sum(1 for f in filas_p if not f["comercial"])
    sin_cliente = sum(1 for f in filas_p if not any(f["clientes"].values()))
    listados_sin_lista = tabla["resumen"]["listados_sin_lista"] or 0
    total_plantas = (tabla["resumen"]["plantas_listados"] or len(filas_p))
    salud = puntaje_salud(
        pendientes_ingesta=pendientes, plantas_con_problema=sin_tecnico + sin_cliente + listados_sin_lista,
        total_plantas=total_plantas, verif_sin_revisar=verif, pdf_sin_report=pdf_sin_report)

    resumen_u = resumen_por_usuario(actual)
    corte = ahora - timedelta(days=30)
    filas_usuarios = []
    dormidas = 0
    for u in internos:
        k = u["email"].lower()
        r = resumen_u.get(k)
        ult = max([t for t in (r["ultima"] if r else None, ultimo_uso.get(u["id"])) if t], default=None)
        dormida = ult is None or ult < corte
        dormidas += dormida
        filas_usuarios.append({
            "email": u["email"], "nombre": u["nombre"], "tipo": u["tipo_acceso"], "area": u["area"],
            "acciones": r["acciones"] if r else 0, "accesos": r["accesos"] if r else 0,
            "visitas": r["visitas"] if r else 0,
            "por_categoria": dict(r["por_categoria"]) if r else {},
            "ultima_actividad": _iso(ult), "dormida": dormida,
        })
    filas_usuarios.sort(key=lambda f: (-f["acciones"], -f["visitas"], f["nombre"] or ""))

    por_modulo = Counter()
    for e in actual:
        if e["categoria"] in CATEGORIAS_TRABAJO:
            por_modulo[ETIQUETA_CATEGORIA[e["categoria"]]] += 1
    fallos = Counter(e["email"] or e["texto"] for e in actual if e["accion"] == "login_fallido")
    sensibles = sorted((e for e in actual if e["categoria"] == "sensible"), key=lambda e: e["t"], reverse=True)

    atencion = [
        {"clave": "verificaciones", "titulo": "Verificaciones no aceptables sin revisar (30 d)", "cantidad": verif, "severidad": "alta"},
        {"clave": "pendientes", "titulo": "Filas pendientes de ingesta", "cantidad": pendientes, "severidad": "media"},
        {"clave": "sin_tecnico", "titulo": "Plantas sin técnico a cargo", "cantidad": sin_tecnico, "severidad": "media"},
        {"clave": "sin_comercial", "titulo": "Plantas sin comercial a cargo", "cantidad": sin_comercial, "severidad": "media"},
        {"clave": "sin_cliente", "titulo": "Plantas sin lista de cliente", "cantidad": sin_cliente, "severidad": "media"},
        {"clave": "pdf", "titulo": "PDF sin Report (más de 7 días)", "cantidad": pdf_sin_report, "severidad": "media"},
        {"clave": "dormidas", "titulo": "Cuentas sin actividad hace 30+ días", "cantidad": dormidas, "severidad": "baja"},
        {"clave": "fallos_login", "titulo": "Ingresos fallidos en el período", "cantidad": sum(fallos.values()), "severidad": "baja"},
    ]

    return {
        "dias": dias, "desde": _iso(desde), "hasta": _iso(ahora),
        "kpis": {
            "usuarios_activos": {"valor": len(activos), "previo": len(activos_prev), "total": len(internos),
                                 "variacion": len(activos) - len(activos_prev)},
            "solicitudes": {"valor": len(emitidas), "previo": len(emitidas_prev), "variacion_pct": variacion(len(emitidas), len(emitidas_prev))},
            "concretadas": {"pct": pct(externas), "previo": pct(externas_prev), "pendientes": sum(1 for s in externas if not s["concretada"]),
                            "de": len(externas)},
            "tiempo_informe": {"dias": dias_medios(externas), "previo": dias_medios(externas_prev),
                               "por_laboratorio": [{"laboratorio": k, "dias": dias_medios(v), "n": len(v)} for k, v in sorted(por_lab.items())]},
            "salud": salud,
        },
        "serie": serie_diaria(actual, desde, ahora),
        "por_modulo": [{"modulo": k, "total": v} for k, v in por_modulo.most_common()],
        "usuarios": filas_usuarios,
        "atencion": atencion,
        "seguridad": {
            "fallos_login": [{"quien": k, "intentos": v} for k, v in fallos.most_common(8)],
            "sensibles": [{"t": _iso(e["t"]), "email": e["email"], "nombre": e["nombre"], "texto": e["texto"]} for e in sensibles[:10]],
        },
    }


@router.get("/actividad")
def actividad(
    dias: int = Query(30, ge=1, le=180),
    email: str | None = None,
    categoria: str | None = None,
    limite: int = Query(150, ge=10, le=500),
    _: Usuario = Depends(solo_admin_general),
) -> dict:
    """Lo que pasó, de más nuevo a más viejo. Con `email`, la ficha de esa persona."""
    ahora = datetime.now(timezone.utc)
    desde = ahora - timedelta(days=dias)
    eventos = leer_eventos(desde)
    if email:
        eventos = [e for e in eventos if e["email"] == email.strip().lower()]
    base = [e for e in eventos if e["t"]]
    lista = [e for e in base if e["categoria"] == categoria] if categoria else [e for e in base if e["categoria"] != "visita"]
    lista.sort(key=lambda e: e["t"], reverse=True)
    r = resumen_por_usuario(base)
    ficha = r.get(email.strip().lower()) if email else None
    visitas = Counter(e["modulo"] or "Otros" for e in base if e["categoria"] == "visita")
    return {
        "dias": dias,
        "eventos": [{"t": _iso(e["t"]), "email": e["email"], "nombre": e["nombre"], "categoria": e["categoria"],
                     "accion": e["accion"], "texto": e["texto"]} for e in lista[:limite]],
        "total": len(lista),
        "serie": serie_diaria(base, desde, ahora),
        "por_categoria": dict(Counter(e["categoria"] for e in base if e["categoria"] in CATEGORIAS_TRABAJO)),
        "visitas_por_modulo": [{"modulo": k, "visitas": v} for k, v in visitas.most_common()],
        "ficha": None if not ficha else {
            "acciones": ficha["acciones"], "accesos": ficha["accesos"], "visitas": ficha["visitas"],
            "ultima": _iso(ficha["ultima"]),
        },
    }
