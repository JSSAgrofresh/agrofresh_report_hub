"""
Registro de TODOS los informes (Ingreso de Informes → «Todos los informes»): una fila por solicitud y su informe.

Une lo que el sistema sabe de cada informe en un solo lugar:

  · la SOLICITUD (Toma de muestras): OT, cuándo se emitió y cuándo salió al laboratorio;
  · el INFORME: N°, fecha de muestreo, cuándo llegó, cuándo se cargó a Report y cuándo se envió al cliente;
  · CÓMO se cargó: automática (aceptado desde el correo), manual (Converter), Ingreso al laboratorio (los propios de AgroFresh)
    o carga masiva de Excel, y quién;
  · lo que salió MAL: el envío (a quién llegó, qué faltó: lo que revisa la bandeja del correo) y el diagnóstico de los datos
    (`diagnostico_informes`: servicio, fechas, resultados…).

Además de lo ya cargado, trae lo que llegó al correo y aún no se acepta (por aceptar / rechazado) y las solicitudes que
salieron al laboratorio y todavía esperan su informe. Solo lectura. `armar_registro` es pura y se prueba sin base.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends

from . import diagnostico_informes as di
from .auth import Usuario
from .correo_informes import exigir_principal
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/registro-informes", tags=["registro-informes"])

ORIGEN = {"correo": "automatica", "converter": "manual", "emitir_cromatografia": "ingreso_lab", "ingest": "excel", "ingesta": "excel"}


def _iso(v: Any) -> str | None:
    return v.isoformat() if isinstance(v, (datetime, date)) else (str(v) if v else None)


def _clave(laboratorio: Any, nro: Any) -> tuple[str, str]:
    return di.lab_base(laboratorio), str(nro or "").strip().upper()


def clasificar_origen(origen_solicitud: Any, origen_carga: Any, correo: dict | None) -> str:
    """automatica | manual | ingreso_lab | excel | sin_registro (anterior al registro de cargas)."""
    if correo and correo.get("decision") == "aceptado" and correo.get("carga_id"):
        return "automatica"
    for o in (origen_solicitud, origen_carga):
        clave = ORIGEN.get(str(o or "").strip().lower())
        if clave:
            return clave
    return "sin_registro"


def problemas_del_correo(correo: dict | None) -> list[dict[str, str]]:
    """Lo que la revisión del buzón encontró: un envío en rojo que nadie resolvió es grave; amarillo, a revisar."""
    if not correo:
        return []
    salida: list[dict[str, str]] = []
    resuelto = bool(correo.get("resuelto_en"))
    for h in correo.get("hallazgos") or []:
        nivel = h.get("nivel")
        if nivel not in ("rojo", "amarillo"):
            continue
        gravedad = di.INFO if (nivel == "rojo" and resuelto) else (di.ALTO if nivel == "rojo" else di.MEDIO)
        salida.append({"codigo": f"correo_{h.get('codigo', '')}", "gravedad": gravedad, "texto": str(h.get("texto") or ""),
                       "origen": "envio"})
    if correo.get("tuvo_incidente") and correo.get("estado") != "rojo":
        salida.append({"codigo": "correo_corregido", "gravedad": di.INFO, "texto": "Un envío anterior salió mal y llegó bien en un reenvío.", "origen": "envio"})
    if correo.get("homogeneo") is False and correo.get("decision") == "pendiente":
        salida.append({"codigo": "correo_no_homogeneo", "gravedad": di.MEDIO, "texto": "No calza con Listados: hay que homogeneizarlo antes de cargarlo.", "origen": "envio"})
    return salida


def armar_registro(
    informes: list[dict], resultados: dict[int, list[dict]], tomas: dict[str, dict], correos: list[dict],
    enviadas: dict[str, Any], clientes: dict[str, Any], auditoria: dict[tuple[str, str], dict],
) -> list[dict[str, Any]]:
    """Una fila por informe de Report, una por correo que aún no está en Report y una por solicitud que espera su informe."""
    por_clave = {_clave(c["laboratorio"], c["nro_informe"]): c for c in correos if c.get("nro_informe")}
    filas: list[dict[str, Any]] = []
    vistos_correo: set[tuple[str, str]] = set()
    ots_con_informe: set[str] = set()

    for inf in informes:
        clave = _clave(inf["laboratorio"], inf["nro_solicitud"])
        correo = por_clave.get(clave)
        if correo:
            vistos_correo.add(clave)
        ot = str(inf.get("referencia") or (correo or {}).get("ot") or "").strip().upper()
        toma = tomas.get(ot) if ot else None
        if ot:
            ots_con_informe.add(ot)
        aud = auditoria.get(clave) or {}
        archivo = (toma or {}).get("archivo")
        problemas = [
            {"codigo": h["codigo"], "gravedad": h["gravedad"], "texto": h["detalle"], "origen": "datos"}
            for h in di.revisar(inf, resultados.get(inf["id"], []), toma) if h["gravedad"] != di.INFO
        ] + problemas_del_correo(correo)
        llegada = (correo or {}).get("llegada_en") or aud.get("fecha_envio") or aud.get("subido_en")
        filas.append({
            "id": f"inf-{inf['id']}", "situacion": "cargado",
            "laboratorio": inf["laboratorio"], "ot": ot or None, "informe": inf["nro_solicitud"],
            "sold_to": inf.get("sold_to"), "ship_to": inf.get("ship_to"), "especie": inf.get("especie"),
            "tipo_aplicacion": di.NOMBRE_SERVICIO.get(di._servicio(inf.get("servicio")), "Línea de proceso"),
            "emitida": _iso((toma or {}).get("emitida")), "enviada_lab": _iso(enviadas.get(archivo)) if archivo else None,
            "fecha_muestreo": _iso(inf.get("fecha_muestreo")), "fecha_informe": _iso(inf.get("fecha_informe")),
            "llegada": _iso(llegada), "llegada_por": "correo" if correo else ("anotada a mano" if aud.get("fecha_envio") else ("subida" if aud.get("subido_en") else None)),
            "cargado": _iso(inf.get("cargado_en")), "cargado_por": inf.get("cargado_por") or (correo or {}).get("decidido_por"),
            "carga_archivo": inf.get("carga_archivo"),
            "origen": clasificar_origen(inf.get("origen"), inf.get("carga_origen"), correo),
            "enviado_cliente": _iso(clientes.get(archivo)) if archivo else None,
            "correo_id": (correo or {}).get("id"), "envios": (correo or {}).get("envios") or (1 if correo else 0),
            "problemas": problemas,
        })

    for clave, c in por_clave.items():
        if clave in vistos_correo:
            continue
        ot = str(c.get("ot") or "").strip().upper()
        toma = tomas.get(ot) if ot else None
        if ot:
            ots_con_informe.add(ot)
        archivo = (toma or {}).get("archivo")
        situacion = {"aceptado": "cargado", "rechazado": "rechazado"}.get(c.get("decision") or "", "por_aceptar")
        problemas = problemas_del_correo(c)
        if c.get("decision") == "aceptado":
            problemas.append({"codigo": "aceptado_sin_report", "gravedad": di.ALTO, "texto": "Se aceptó pero no aparece en Report (¿se deshizo la carga?).", "origen": "datos"})
        filas.append({
            "id": f"correo-{c['id']}", "situacion": situacion,
            "laboratorio": c["laboratorio"], "ot": ot or None, "informe": c.get("nro_informe"),
            "sold_to": c.get("sold_to"), "ship_to": c.get("ship_to"), "especie": c.get("especie"), "tipo_aplicacion": None,
            "emitida": _iso((toma or {}).get("emitida")), "enviada_lab": _iso(enviadas.get(archivo)) if archivo else None,
            "fecha_muestreo": _iso(c.get("fecha_muestreo")), "fecha_informe": None,
            "llegada": _iso(c.get("llegada_en")), "llegada_por": "correo",
            "cargado": None, "cargado_por": c.get("decidido_por") if c.get("decision") == "aceptado" else None, "carga_archivo": None,
            "origen": "sin_cargar", "enviado_cliente": _iso(clientes.get(archivo)) if archivo else None,
            "correo_id": c["id"], "envios": c.get("envios") or 1, "problemas": problemas,
        })

    for ot, t in tomas.items():
        archivo = t.get("archivo")
        if ot in ots_con_informe or archivo not in enviadas:
            continue
        filas.append({
            "id": f"ot-{ot}", "situacion": "esperando",
            "laboratorio": t.get("laboratorio"), "ot": ot, "informe": None,
            "sold_to": t.get("sold_to"), "ship_to": t.get("ship_to"), "especie": t.get("especie"), "tipo_aplicacion": t.get("tipo_aplicacion"),
            "emitida": _iso(t.get("emitida")), "enviada_lab": _iso(enviadas.get(archivo)),
            "fecha_muestreo": _iso(t.get("fecha_muestreo")), "fecha_informe": None, "llegada": None, "llegada_por": None,
            "cargado": None, "cargado_por": None, "carga_archivo": None, "origen": "sin_cargar", "enviado_cliente": None,
            "correo_id": None, "envios": 0, "problemas": [],
        })
    return filas


# ── Lectura de la base (cada fuente por separado: si falta una tabla, el resto sigue) ─────────────────────────

def _filas(sql: str, params: tuple = ()) -> list[dict] | None:
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(sql, params)
            return list(cur.fetchall())
    except Exception:  # noqa: BLE001
        logger.warning("Registro de informes: no se pudo leer una fuente.", exc_info=True)
        return None


_SQL_INFORMES = """
    SELECT s.id, s.nro_solicitud, s.laboratorio, to_jsonb(s) ->> 'referencia' AS referencia, to_jsonb(s) ->> 'servicio' AS servicio,
           to_jsonb(s) ->> 'origen' AS origen, s.tipo_servicio, s.especie, s.variedad, s.planta_id, s.fecha_muestreo, s.fecha_entrada,
           s.fecha_recepcion, s.fecha_informe, s.fecha_analisis,
           COALESCE(c.nombre, s.sold_to_raw) AS sold_to, COALESCE(p.nombre, s.ship_to_raw) AS ship_to,
           cd.creado_en AS cargado_en, cd.creado_por AS cargado_por, cd.origen AS carga_origen, cd.archivo AS carga_archivo
    FROM solicitud s
    LEFT JOIN planta p ON p.id = s.planta_id
    LEFT JOIN cliente c ON c.id = p.cliente_id
    LEFT JOIN carga_datos cd ON cd.id = s.carga_id AND cd.deshecha_en IS NULL
    WHERE s.vigente
    ORDER BY s.id
"""
_SQL_INFORMES_SIN_CARGAS = _SQL_INFORMES.replace(
    "cd.creado_en AS cargado_en, cd.creado_por AS cargado_por, cd.origen AS carga_origen, cd.archivo AS carga_archivo",
    "NULL::timestamptz AS cargado_en, NULL AS cargado_por, NULL AS carga_origen, NULL AS carga_archivo",
).replace("    LEFT JOIN carga_datos cd ON cd.id = s.carga_id AND cd.deshecha_en IS NULL\n", "")
_SQL_CORREOS = """
    SELECT c.id, c.laboratorio, c.nro_informe, c.ot, COALESCE(NULLIF(c.sold_to, ''), sa.sold_to) AS sold_to,
           COALESCE(NULLIF(c.ship_to, ''), sa.ship_to) AS ship_to, c.especie, c.fecha_muestreo, c.llegada_en, c.estado, c.decision,
           c.decidido_por, c.resuelto_en, c.hallazgos, c.carga_id, c.homogeneo,
           (SELECT COUNT(*) FROM correo_informe x WHERE x.laboratorio = c.laboratorio AND x.nro_informe <> ''
              AND upper(btrim(x.nro_informe)) = upper(btrim(c.nro_informe))) AS envios,
           EXISTS (SELECT 1 FROM correo_informe x WHERE x.laboratorio = c.laboratorio AND x.nro_informe <> ''
              AND upper(btrim(x.nro_informe)) = upper(btrim(c.nro_informe)) AND x.estado = 'rojo') AS tuvo_incidente
    FROM correo_informe c LEFT JOIN solicitud_archivo sa ON sa.archivo = c.archivo_solicitud
    WHERE NOT EXISTS (SELECT 1 FROM correo_informe x WHERE x.laboratorio = c.laboratorio AND x.nro_informe <> ''
              AND upper(btrim(x.nro_informe)) = upper(btrim(c.nro_informe)) AND x.llegada_en > c.llegada_en)
    ORDER BY c.llegada_en DESC
"""
_SQL_TOMAS = """
    SELECT upper(btrim(numero_solicitud)) AS ot, archivo, laboratorio, sold_to, ship_to, especie, fecha_muestreo,
           creado_en AS emitida, datos->'campos_laboratorio'->>'Tipo Aplicación' AS tipo_aplicacion, datos
    FROM solicitud_archivo
    WHERE btrim(COALESCE(numero_solicitud, '')) <> '' AND COALESCE(datos->>'es_prueba', '') <> 'true'
"""


def leer_registro() -> list[dict[str, Any]]:
    informes = _filas(_SQL_INFORMES)
    if informes is None:
        informes = _filas(_SQL_INFORMES_SIN_CARGAS) or []
    resultados: dict[int, list[dict]] = {}
    for r in _filas("SELECT r.solicitud_id, r.analito_id, r.analito_raw, a.codigo, r.valor_num, r.valor_texto FROM resultado r LEFT JOIN analito a ON a.id = r.analito_id") or []:
        resultados.setdefault(r["solicitud_id"], []).append(r)
    tomas = {t["ot"]: t for t in _filas(_SQL_TOMAS) or []}
    correos = _filas(_SQL_CORREOS) or []
    enviadas = {f["archivo"]: f["t"] for f in _filas("SELECT archivo, min(creado_en) AS t FROM envio_solicitud_log WHERE exitoso GROUP BY archivo") or []}
    clientes = {f["archivo"]: f["t"] for f in _filas("SELECT archivo, min(enviado_en) AS t FROM envio_cliente_manual GROUP BY archivo") or []}
    auditoria = {
        _clave(f["laboratorio"], f["nro_informe"]): f
        for f in _filas("SELECT laboratorio, nro_informe, fecha_envio, subido_en FROM informe_auditoria") or []
    }
    return armar_registro(informes, resultados, tomas, correos, enviadas, clientes, auditoria)


@router.get("")
def registro(_: Usuario = Depends(exigir_principal)) -> dict[str, Any]:
    """Todos los informes con su solicitud, cómo se cargaron, sus fechas y lo que salió mal."""
    return {"filas": leer_registro()}
