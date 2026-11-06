"""
Integridad de datos (Administración General): lectura de la base, guardado de cada análisis y API.

El cálculo vive en `integridad.analizar` (puro). Aquí solo se leen las fuentes, se corre en segundo plano (una revisión con los PDF tarda
más de lo que aguanta una petición), se guarda el resultado en `integridad_analisis` y se sirve a la pantalla, al PDF y al Excel.
Solo LEE: ninguna parte cambia solicitudes ni informes. Solo el administrador principal.
"""
from __future__ import annotations

import logging
import threading
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from psycopg2.extras import Json
from pydantic import BaseModel

from . import diagnostico_informes as di, informe_campos as ic, integridad as it
from .auth import Usuario
from .correo_informes import exigir_principal
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integridad", tags=["integridad"])

MINUTOS_COLGADO = 45
LABS_PDF = {"agrofresh": "AgroFresh", "quiteca": "Quiteca", "diagnofruit": "Diagnofruit"}   # ALS: lector de PDF pendiente

_SQL_TOMAS = """
    SELECT archivo, upper(btrim(numero_solicitud)) AS ot, laboratorio, sold_to, ship_to, especie, fecha_muestreo, datos
    FROM solicitud_archivo
    WHERE btrim(COALESCE(numero_solicitud, '')) <> '' AND COALESCE(datos->>'es_prueba', '') <> 'true'
"""
_SQL_INFORMES = """
    SELECT s.*, COALESCE(c.nombre, s.sold_to_raw) AS sold_to, COALESCE(p.nombre, s.ship_to_raw) AS ship_to
    FROM solicitud s
    LEFT JOIN planta p ON p.id = s.planta_id
    LEFT JOIN cliente c ON c.id = p.cliente_id
    WHERE s.vigente
"""
_SQL_RESULTADOS = "SELECT r.solicitud_id, r.analito_id, r.analito_raw, a.codigo, r.valor_num, r.valor_texto FROM resultado r LEFT JOIN analito a ON a.id = r.analito_id"
_SQL_PRODUCTOS = "SELECT p.solicitud_id, p.analito_raw, a.codigo, p.dosis FROM producto_aplicado p LEFT JOIN analito a ON a.id = p.analito_id"
_SQL_CATALOGO = "SELECT codigo, nombre, laboratorio, unidad, activo FROM analito"
_SQL_PDF = "SELECT btrim(ia.nro_informe) AS nro, lower(btrim(ia.laboratorio)) AS lab, ia.r2_key, upper(btrim(sa.numero_solicitud)) AS ot " \
           "FROM informe_auditoria ia LEFT JOIN solicitud_archivo sa ON sa.archivo = ia.archivo_solicitud ORDER BY ia.subido_en"


def _leer(cur, sql: str, params: tuple = (), opcional: bool = False) -> list[dict]:
    try:
        cur.execute(sql, params)
        return list(cur.fetchall())
    except Exception:  # noqa: BLE001 — una fuente opcional que falta (migración sin correr) no frena el análisis
        if not opcional:
            raise
        logger.warning("Integridad: no se pudo leer una fuente opcional.", exc_info=True)
        cur.connection.rollback()
        return []


def _pdf_leido(r2_key: str | None, laboratorio: str, catalogo: list[dict] | None = None):
    """(lectura, campos): lo que lee el Converter del PDF ({datos, resultados}, o None si no se pudo) y la lectura COMPLETA de sus campos (AgroFresh)."""
    from . import correo_informes_homogeneo as hom, r2_auditoria as r2a
    from .informe_lectura import texto_quiteca

    nombre = LABS_PDF.get(di.lab_base(laboratorio))
    if not r2_key or not nombre or not r2a.disponible():
        return None, None
    try:
        datos = r2a.descargar(r2_key)
    except Exception:  # noqa: BLE001
        return None, None
    if not datos:
        return None, None
    campos = None
    if di.lab_base(laboratorio) == "agrofresh":
        try:
            nombres = [a["nombre"] for a in (catalogo or []) if a.get("nombre")]
            campos = ic.leer_completo(texto_quiteca(datos), nombres)
        except Exception:  # noqa: BLE001 — un PDF raro no frena el análisis
            campos = None
    try:
        return hom.leer(datos, nombre), campos
    except Exception:  # noqa: BLE001
        return None, campos


def correr_analisis(con_pdf: bool, avanzar=lambda texto: None) -> dict[str, Any]:
    """Lee todas las fuentes y devuelve el resultado de `integridad.analizar`."""
    avanzar("Leyendo solicitudes e informes…")
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        tomas = _leer(cur, _SQL_TOMAS)
        informes = _leer(cur, _SQL_INFORMES)
        resultados: dict[int, list[dict]] = defaultdict(list)
        for r in _leer(cur, _SQL_RESULTADOS):
            resultados[r["solicitud_id"]].append(r)
        productos: dict[int, list[dict]] = defaultdict(list)
        for p in _leer(cur, _SQL_PRODUCTOS, opcional=True):
            productos[p["solicitud_id"]].append(p)
        catalogo = [dict(a) for a in _leer(cur, _SQL_CATALOGO, opcional=True)]
        auditoria = _leer(cur, _SQL_PDF, opcional=True)

    ot_de_informe = {(f["lab"].split("(", 1)[0].strip(), f["nro"]): f["ot"] for f in auditoria if f.get("ot") and f.get("nro")}

    leidos: dict[int, dict | None] | None = None
    campos_pdf: dict[int, dict] | None = None
    if con_pdf:
        claves = {(f["lab"].split("(", 1)[0].strip(), f["nro"]): f["r2_key"] for f in auditoria if f.get("r2_key")}
        leidos = {}
        campos_pdf = {}
        pendientes = [i for i in informes if di.lab_base(i.get("laboratorio")) in LABS_PDF]
        for n, inf in enumerate(pendientes, 1):
            leidos[inf["id"]], campos_pdf[inf["id"]] = _pdf_leido(claves.get((di.lab_base(inf["laboratorio"]), str(inf.get("nro_solicitud") or "").strip())), inf["laboratorio"], catalogo)
            if n % 25 == 0:
                avanzar(f"Leyendo PDF: {n} de {len(pendientes)}…")
    avanzar("Comparando solicitudes con informes…")
    return it.analizar(tomas, informes, resultados, productos, catalogo, hoy=date.today(), ot_de_informe=ot_de_informe, leidos_pdf=leidos, campos_pdf=campos_pdf)


# ── Guardado y ejecución en segundo plano ────────────────────────────────────

def _iniciar(con_pdf: bool, origen: str, usuario: str, forzar: bool = False) -> tuple[int, bool]:
    """Abre la fila del análisis. Devuelve (id, ya_estaba_en_curso). Una sola a la vez; la colgada se cierra."""
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "UPDATE integridad_analisis SET estado = 'error', error = 'Quedó colgado', terminado_en = now() "
            "WHERE estado = 'en_curso' AND (%s OR iniciado_en < now() - make_interval(mins => %s))",
            (forzar, MINUTOS_COLGADO),
        )
        cur.execute("SELECT id FROM integridad_analisis WHERE estado = 'en_curso' ORDER BY id DESC LIMIT 1")
        previo = cur.fetchone()
        if previo:
            return previo["id"], True
        cur.execute("INSERT INTO integridad_analisis (origen, usuario, con_pdf, avance) VALUES (%s, %s, %s, 'Empezando…') RETURNING id", (origen, usuario, con_pdf))
        return cur.fetchone()["id"], False


def _avance(analisis_id: int, texto: str) -> None:
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("UPDATE integridad_analisis SET avance = %s WHERE id = %s", (texto, analisis_id))
    except Exception:  # noqa: BLE001
        logger.warning("Integridad: no se pudo anotar el avance.", exc_info=True)


def ejecutar(analisis_id: int, con_pdf: bool) -> None:
    try:
        r = correr_analisis(con_pdf, lambda t: _avance(analisis_id, t))
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                "UPDATE integridad_analisis SET estado = 'listo', terminado_en = now(), avance = 'Listo', resumen = %s, laboratorios = %s, hallazgos = %s WHERE id = %s",
                (Json(r["resumen"], dumps=_dumps), Json(r["laboratorios"], dumps=_dumps), Json(r["hallazgos"], dumps=_dumps), analisis_id),
            )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Integridad: el análisis falló.")
        try:
            with conexion() as conn, cursor_dict(conn) as cur:
                cur.execute("UPDATE integridad_analisis SET estado = 'error', terminado_en = now(), error = %s WHERE id = %s", (str(exc)[:500], analisis_id))
        except Exception:  # noqa: BLE001
            logger.exception("Integridad: no se pudo anotar el error.")


def _dumps(obj: Any) -> str:
    import json

    return json.dumps(obj, default=lambda o: o.isoformat() if hasattr(o, "isoformat") else str(o), ensure_ascii=False)


def lanzar(con_pdf: bool, origen: str, usuario: str, forzar: bool = False) -> dict[str, Any]:
    analisis_id, ya = _iniciar(con_pdf, origen, usuario, forzar)
    if not ya:
        threading.Thread(target=ejecutar, args=(analisis_id, con_pdf), name=f"integridad-{analisis_id}", daemon=True).start()
    return {"id": analisis_id, "en_curso": True, "ya_estaba_en_curso": ya}


# ── API ──────────────────────────────────────────────────────────────────────

class AnalizarIn(BaseModel):
    con_pdf: bool = True
    forzar: bool = False


def _fila(a: dict | None) -> dict | None:
    if not a:
        return None
    out = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in a.items()}
    return out


def _ultimo(cur, con_hallazgos: bool = False, analisis_id: int | None = None) -> dict | None:
    cols = "id, iniciado_en, terminado_en, origen, usuario, con_pdf, estado, avance, error, resumen, laboratorios" + (", hallazgos" if con_hallazgos else "")
    if analisis_id:
        cur.execute(f"SELECT {cols} FROM integridad_analisis WHERE id = %s", (analisis_id,))
    else:
        cur.execute(f"SELECT {cols} FROM integridad_analisis WHERE estado = 'listo' ORDER BY id DESC LIMIT 1")
    return _fila(cur.fetchone())


@router.get("/estado")
def estado(_: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    """El último análisis terminado (resumen y laboratorios) y, si hay, el que está corriendo."""
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT id, iniciado_en, origen, usuario, con_pdf, estado, avance FROM integridad_analisis WHERE estado = 'en_curso' ORDER BY id DESC LIMIT 1")
            en_curso = _fila(cur.fetchone())
            return {"disponible": True, "en_curso": en_curso, "ultimo": _ultimo(cur)}
    except Exception:  # noqa: BLE001
        logger.warning("Integridad: falta la migración 0075.", exc_info=True)
        return {"disponible": False, "en_curso": None, "ultimo": None}


@router.post("/analizar")
def analizar(body: AnalizarIn, usuario: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    try:
        return lanzar(body.con_pdf, "manual", usuario.email, body.forzar)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(503, f"No se pudo iniciar el análisis (¿falta la migración 0075?): {exc}") from exc


@router.get("/historial")
def historial(_: Usuario = Depends(exigir_principal), limite: int = Query(20, ge=1, le=100)) -> list[dict]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT id, iniciado_en, terminado_en, origen, usuario, con_pdf, estado, resumen FROM integridad_analisis ORDER BY id DESC LIMIT %s", (limite,))
        return [_fila(f) for f in cur.fetchall()]


def _resultado(analisis_id: int | None) -> dict[str, Any]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        a = _ultimo(cur, con_hallazgos=True, analisis_id=analisis_id)
    if not a or a["estado"] != "listo":
        raise HTTPException(404, "Todavía no hay un análisis terminado. Usa «Analizar ahora».")
    return a


@router.get("/hallazgos")
def hallazgos(
    _: Usuario = Depends(exigir_principal),
    analisis_id: int | None = None,
    laboratorio: str | None = None,
    gravedad: str | None = Query(None, pattern="^(alto|medio|info)$"),
    codigo: str | None = None,
    q: str | None = None,
    limite: int = Query(200, ge=1, le=1000),
    desde: int = Query(0, ge=0),
) -> dict[str, Any]:
    a = _resultado(analisis_id)
    lista = it.hallazgos_de({"hallazgos": a["hallazgos"] or []}, laboratorio, gravedad, codigo)
    if q and q.strip():
        from .homogenizar_converter import compacto

        buscado = compacto(q)
        lista = [h for h in lista if buscado in compacto(" ".join(str(h.get(k) or "") for k in ("ot", "informe", "sold_to", "ship_to", "especie", "detalle", "titulo")))]
    codigos: dict[str, dict] = {}
    for h in lista:
        c = codigos.setdefault(h["codigo"], {"codigo": h["codigo"], "titulo": h.get("titulo") or it.titulo_de(h["codigo"]), "gravedad": h["gravedad"], "casos": 0})
        c["casos"] += 1
    return {"analisis_id": a["id"], "total": len(lista), "tipos": sorted(codigos.values(), key=lambda c: -c["casos"]), "hallazgos": lista[desde:desde + limite]}


@router.get("/pdf")
def pdf(laboratorio: str, usuario: Usuario = Depends(exigir_principal), analisis_id: int | None = None, incluir_info: bool = False) -> Response:
    from .integridad_pdf import generar_pdf

    a = _resultado(analisis_id)
    lista = it.hallazgos_de({"hallazgos": a["hallazgos"] or []}, laboratorio)
    if not incluir_info:
        lista = [h for h in lista if h["gravedad"] != it.INFO]
    contenido = generar_pdf(laboratorio, {"laboratorios": a["laboratorios"] or []}, lista, usuario.nombre or usuario.email, a.get("terminado_en"))
    nombre = f"Informe de errores - {laboratorio} - {date.today():%Y-%m-%d}.pdf"
    return Response(contenido, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=\"informe_errores_{di.lab_base(laboratorio)}.pdf\"; filename*=UTF-8''{nombre.replace(' ', '%20')}"})


@router.get("/excel")
def excel(usuario: Usuario = Depends(exigir_principal), laboratorio: str | None = None, analisis_id: int | None = None) -> Response:
    from .integridad_pdf import generar_excel

    a = _resultado(analisis_id)
    lista = it.hallazgos_de({"hallazgos": a["hallazgos"] or []}, laboratorio)
    contenido = generar_excel(laboratorio, {"laboratorios": a["laboratorios"] or []}, lista)
    return Response(contenido, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename=\"integridad_{di.lab_base(laboratorio or 'todos')}.xlsx\""})
