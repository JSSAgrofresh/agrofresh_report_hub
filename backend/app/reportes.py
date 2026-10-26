import io
import re
from datetime import date
from typing import Any

import openpyxl
import psycopg2.errors
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .auth import Usuario, accesos_de_cuenta, alcance_de_datos, con_lista_de_accesos, es_comercial, solo_interno, usuario_actual
from . import funciones, informe_visto
from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/reportes", tags=["reportes"])


# ---------------------------------------------------------------------------
# Datos para los gráficos: formato largo, una fila por analito medido.
# ---------------------------------------------------------------------------

DATOS_QUERY = """
    SELECT
        s.id AS solicitud_id,
        s.nro_solicitud,
        s.laboratorio,
        COALESCE(s.fecha_muestreo, s.fecha_entrada, s.fecha_informe, s.fecha_analisis) AS fecha_muestreo,
        COALESCE(s.fecha_entrada, s.fecha_muestreo, s.fecha_informe, s.fecha_analisis) AS fecha_entrada,
        s.especie,
        s.variedad,
        COALESCE(s.semana_muestreo, date_part('week', COALESCE(s.fecha_muestreo, s.fecha_entrada, s.fecha_informe, s.fecha_analisis))::int) AS semana_muestreo,
        COALESCE(date_part('month', s.fecha_muestreo)::int, s.mes, date_part('month', COALESCE(s.fecha_entrada, s.fecha_informe, s.fecha_analisis))::int) AS mes,
        s.temporada,
        s.tipo_servicio,
        to_jsonb(s) ->> 'servicio' AS servicio,
        s.nro_linea,
        s.posicion_muestreo,
        s.codigo_ensayo,
        s.nro_ensayo,
        COALESCE(c.nombre, s.sold_to_raw) AS cliente,
        COALESCE(p.nombre, s.ship_to_raw) AS planta,
        pa.tipo_aplicacion,
        COALESCE(a.codigo, r.analito_raw) AS ingrediente,
        r.valor_num,
        r.valor_texto
    FROM solicitud s
    LEFT JOIN resultado r ON r.solicitud_id = s.id
    LEFT JOIN planta p ON p.id = s.planta_id
    LEFT JOIN cliente c ON c.id = p.cliente_id
    LEFT JOIN analito a ON a.id = r.analito_id
    LEFT JOIN producto_aplicado pa ON pa.solicitud_id = r.solicitud_id AND pa.analito_id = r.analito_id
    WHERE s.vigente
    {filtro_cliente}
    ORDER BY COALESCE(s.fecha_muestreo, s.fecha_entrada, s.fecha_informe, s.fecha_analisis) DESC NULLS LAST, s.id DESC
"""


def _filtro_alcance(
    usuario: Usuario,
    cliente: str | None,
    planta: str | None,
) -> tuple[str, dict[str, Any]]:
    """El `AND ...` que acota una consulta a lo que esta sesión puede ver.

    El filtro se arma SIEMPRE acá y nunca a partir del parámetro crudo: para
    una cuenta de cliente, `alcance_de_datos` descarta lo que pidió el
    navegador y devuelve lo que dice su fila. Ese es el único punto donde se
    decide, y por eso los cuatro endpoints que muestran datos pasan por él.
    """
    cliente, planta = alcance_de_datos(usuario, cliente, planta)
    if usuario.tipoAcceso == "cliente" and con_lista_de_accesos(usuario):
        # Con lista de accesos manda la lista (más abajo), no el cliente y la sucursal sueltos de su fila.
        cliente = planta = None
    condiciones = []
    params: dict[str, Any] = {}
    # Report muestra solo los tipos de servicio encendidos en Administración
    # General → Funciones (de fábrica, solo Línea de proceso). Vale para todos.
    condicion_servicio, params_servicio = funciones.condicion_report("s")
    if condicion_servicio:
        condiciones.append(condicion_servicio[len("AND "):])
        params.update(params_servicio)
    if cliente:
        condiciones.append("COALESCE(c.nombre, s.sold_to_raw) = %(cliente)s")
        params["cliente"] = cliente
    if planta:
        condiciones.append("COALESCE(p.nombre, s.ship_to_raw) = %(planta)s")
        params["planta"] = planta
    if con_lista_de_accesos(usuario):
        # Un comercial o un cliente con varios accesos ve SOLO lo de su lista (cliente, planta y especie; lo decide la
        # sesión, nunca el navegador). Sin accesos: nada.
        alternativas = []
        for i, (cli, pla, esp) in enumerate(accesos_de_cuenta(usuario)):
            parte = f"COALESCE(c.nombre, s.sold_to_raw) = %(com_c{i})s"
            params[f"com_c{i}"] = cli
            if pla:
                parte += f" AND COALESCE(p.nombre, s.ship_to_raw) = %(com_p{i})s"
                params[f"com_p{i}"] = pla
            if esp:
                parte += f" AND lower(btrim(COALESCE(s.especie, ''))) = lower(btrim(%(com_e{i})s))"
                params[f"com_e{i}"] = esp
            alternativas.append(f"({parte})")
        condiciones.append("(" + " OR ".join(alternativas) + ")" if alternativas else "FALSE")
    return ("AND " + " AND ".join(condiciones)) if condiciones else "", params


@router.get("/vista")
def vista(usuario: Usuario = Depends(usuario_actual)) -> dict[str, Any]:
    """Cómo muestra Report algunas cosas, según lo que el administrador principal encendió en Funciones.
    Lo lee cualquier cuenta (los clientes también ven ALS y Diagnofruit)."""
    return {
        "graficos_informes": funciones.graficos_informes_activos(),
        "tema_cliente": funciones.tema_de_cuenta(usuario.id, usuario.tipoAcceso),
    }


@router.get("/resumen")
def resumen(usuario: Usuario = Depends(usuario_actual)) -> dict[str, Any]:
    """Versión liviana para tarjetas de panel (no trae el detalle largo de /datos)."""
    # Sin este filtro, la cuenta de un cliente veía en su panel el total de
    # solicitudes de TODOS los clientes del sistema.
    filtro, params = _filtro_alcance(usuario, None, None)
    with conexion(escribir=False) as conn:
        with cursor_dict(conn) as cur:
            cur.execute(
                f"""
                SELECT count(*) AS total FROM solicitud s
                LEFT JOIN planta p ON p.id = s.planta_id
                LEFT JOIN cliente c ON c.id = p.cliente_id
                WHERE s.vigente {filtro}
                """,
                params,
            )
            total_solicitudes = cur.fetchone()["total"]
            # "Fecha de ingreso" = fecha_entrada (cuándo entró la muestra al laboratorio),
            # ventana móvil de los últimos 7 días contra la fecha real del servidor —
            # nunca un valor fijo, así siempre refleja la semana en la que se está.
            cur.execute(
                f"""
                SELECT count(*) AS total FROM solicitud s
                LEFT JOIN planta p ON p.id = s.planta_id
                LEFT JOIN cliente c ON c.id = p.cliente_id
                WHERE s.vigente AND s.fecha_entrada >= CURRENT_DATE - INTERVAL '7 days' {filtro}
                """,
                params,
            )
            registros_ultima_semana = cur.fetchone()["total"]
    return {"total_solicitudes": total_solicitudes, "registros_ultima_semana": registros_ultima_semana}


_MESES_PANEL = 12


def _meses_recientes(hoy: date, cuantos: int) -> list[str]:
    """Los últimos `cuantos` meses como «AAAA-MM», del más antiguo al actual."""
    salida: list[str] = []
    y, m = hoy.year, hoy.month
    for _ in range(cuantos):
        salida.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(salida))


@router.get("/panel-cliente")
def panel_cliente(usuario: Usuario = Depends(usuario_actual)) -> dict[str, Any]:
    """Cifras del Panel general de un cliente: SOLO de su planta (o de su Sold To, según su cuenta).

    El alcance sale de la sesión (`_filtro_alcance`), nunca de un parámetro, y respeta lo que Report muestra
    (Funciones). Cada bloque se lee aparte: si uno falla, los demás igual salen."""
    filtro, params = _filtro_alcance(usuario, None, None)
    desde = """
        FROM solicitud s
        LEFT JOIN planta p ON p.id = s.planta_id
        LEFT JOIN cliente c ON c.id = p.cliente_id
    """
    fecha = "COALESCE(s.fecha_muestreo, s.fecha_entrada, s.fecha_informe, s.fecha_analisis)"
    salida: dict[str, Any] = {
        "informes": 0, "mediciones": 0, "analitos": 0, "especies": 0, "ultimos_30_dias": 0,
        "ultimo": None, "por_mes": [], "por_especie": [], "por_analito": [],
    }
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        try:
            cur.execute(
                f"""
                SELECT count(*) AS informes,
                       count(*) FILTER (WHERE {fecha} >= CURRENT_DATE - INTERVAL '30 days') AS recientes,
                       count(DISTINCT NULLIF(trim(s.especie), '')) AS especies
                {desde} WHERE s.vigente {filtro}
                """,
                params,
            )
            r = cur.fetchone()
            salida.update(informes=int(r["informes"]), ultimos_30_dias=int(r["recientes"]), especies=int(r["especies"]))
        except Exception:
            conn.rollback()
        try:
            cur.execute(
                f"""
                SELECT count(*) AS mediciones, count(DISTINCT COALESCE(a.codigo, r.analito_raw)) AS analitos
                {desde}
                JOIN resultado r ON r.solicitud_id = s.id
                LEFT JOIN analito a ON a.id = r.analito_id
                WHERE s.vigente {filtro}
                """,
                params,
            )
            r = cur.fetchone()
            salida.update(mediciones=int(r["mediciones"]), analitos=int(r["analitos"]))
        except Exception:
            conn.rollback()
        try:
            cur.execute(
                f"""
                SELECT s.nro_solicitud, s.referencia, s.laboratorio, s.especie, s.variedad, {fecha} AS fecha
                {desde} WHERE s.vigente {filtro} AND {fecha} IS NOT NULL
                ORDER BY {fecha} DESC, s.id DESC LIMIT 1
                """,
                params,
            )
            r = cur.fetchone()
            if r:
                salida["ultimo"] = {
                    "informe": r["nro_solicitud"], "solicitud": r["referencia"], "laboratorio": r["laboratorio"],
                    "especie": r["especie"], "variedad": r["variedad"],
                    "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                }
        except Exception:
            conn.rollback()
        try:
            meses = _meses_recientes(date.today(), _MESES_PANEL)
            cur.execute(
                f"""
                SELECT to_char({fecha}, 'YYYY-MM') AS mes, count(*) AS n
                {desde} WHERE s.vigente {filtro} AND {fecha} >= %(desde_mes)s
                GROUP BY 1
                """,
                {**params, "desde_mes": date.fromisoformat(meses[0] + "-01")},
            )
            por_mes = {r["mes"]: int(r["n"]) for r in cur.fetchall()}
            salida["por_mes"] = [{"dia": m, "n": por_mes.get(m, 0)} for m in meses]
        except Exception:
            conn.rollback()
        try:
            cur.execute(
                f"""
                SELECT COALESCE(NULLIF(trim(s.especie), ''), 'Sin dato') AS nombre, count(*) AS n
                {desde} WHERE s.vigente {filtro}
                GROUP BY 1 ORDER BY n DESC, nombre LIMIT 8
                """,
                params,
            )
            salida["por_especie"] = [{"nombre": r["nombre"], "n": int(r["n"])} for r in cur.fetchall()]
        except Exception:
            conn.rollback()
        try:
            cur.execute(
                f"""
                SELECT COALESCE(a.nombre, a.codigo, r.analito_raw) AS nombre, count(*) AS n
                {desde}
                JOIN resultado r ON r.solicitud_id = s.id
                LEFT JOIN analito a ON a.id = r.analito_id
                WHERE s.vigente {filtro} AND COALESCE(a.nombre, a.codigo, r.analito_raw) IS NOT NULL
                GROUP BY 1 ORDER BY n DESC, nombre LIMIT 8
                """,
                params,
            )
            salida["por_analito"] = [{"nombre": r["nombre"], "n": int(r["n"])} for r in cur.fetchall()]
        except Exception:
            conn.rollback()
    return salida



@router.get("/datos")
def datos(
    cliente: str | None = Query(
        None, description="Si se pasa, solo trae los datos de este cliente (portal de cliente)."
    ),
    planta: str | None = Query(
        None,
        description="Si se pasa (junto con cliente), acota además a esta sucursal — cuentas "
        "de cliente creadas por Ship To, en vez de por Sold To completo.",
    ),
    usuario: Usuario = Depends(usuario_actual),
) -> dict[str, Any]:
    # El filtro se aplica siempre en el SQL, nunca en el navegador. Y para una
    # cuenta de cliente sale de su sesión, no de estos parámetros: antes bastaba
    # con editar `?cliente=` en la barra de direcciones para ver a otro cliente.
    filtro_cliente, params = _filtro_alcance(usuario, cliente, planta)
    with conexion(escribir=False) as conn:
        with cursor_dict(conn) as cur:
            cur.execute(DATOS_QUERY.format(filtro_cliente=filtro_cliente), params)
            filas = cur.fetchall()
            # Aparte del join con resultado (que solo trae solicitudes con al menos un
            # analito medido), se cuenta el total real de solicitudes cargadas: esto es
            # lo que se muestra como "Total de registros" en el KPI inicial de Report.
            cur.execute(
                f"""
                SELECT count(*) AS total FROM solicitud s
                LEFT JOIN planta p ON p.id = s.planta_id
                LEFT JOIN cliente c ON c.id = p.cliente_id
                WHERE s.vigente {filtro_cliente}
                """,
                params,
            )
            total_solicitudes = cur.fetchone()["total"]
    # «Reporte observado»: si es un cliente, queda anotado qué solicitudes vio (nunca falla).
    informe_visto.registrar(usuario, (f.get("solicitud_id") for f in filas))
    return {"filas": filas, "total": len(filas), "total_solicitudes": total_solicitudes}


_ENCABEZADOS_EXCEL_DATOS = [
    ("nro_solicitud", "N° Solicitud"),
    ("laboratorio", "Laboratorio"),
    ("fecha_muestreo", "Fecha Muestreo"),
    ("fecha_entrada", "Fecha Entrada"),
    ("especie", "Especie"),
    ("variedad", "Variedad"),
    ("semana_muestreo", "Semana"),
    ("mes", "Mes"),
    ("temporada", "Temporada"),
    ("tipo_servicio", "Tipo de Servicio"),
    ("cliente", "Cliente (Sold To)"),
    ("planta", "Sucursal (Ship To)"),
    ("tipo_aplicacion", "Tipo Aplicación"),
    ("posicion_muestreo", "Posición Muestreo"),
    ("codigo_ensayo", "Código de Ensayo"),
    ("nro_ensayo", "N° Ensayo"),
    ("ingrediente", "Ingrediente"),
    ("valor_num", "Valor"),
    ("valor_texto", "Valor (texto)"),
]

_PAT_NO_SEGURO = re.compile(r"[^A-Za-z0-9._-]+")


def _nombre_archivo_datos(cliente: str | None, planta: str | None) -> str:
    partes = [p for p in (cliente, planta) if p]
    base = _PAT_NO_SEGURO.sub("_", " ".join(partes)).strip("_") or "todos"
    return f"Datos_{base}.xlsx"


@router.get("/datos/excel")
def datos_excel(
    cliente: str | None = Query(None, description="Acota la descarga a este cliente (solo personal interno)."),
    planta: str | None = Query(None, description="Acota además a esta sucursal (solo personal interno)."),
    usuario: Usuario = Depends(usuario_actual),
) -> StreamingResponse:
    """Ruta antigua del botón «Descargar mi historial». Ya no existe ese Excel plano: baja la MISMA BD que
    `/bd/excel` (todo lo que esta sesión puede ver, sin filtros de pantalla), para que un navegador con la pantalla
    vieja abierta tampoco reciba el formato de antes."""
    return _respuesta_bd(usuario, None, None, None, cliente, planta)


# ---------------------------------------------------------------------------
# BD de resultados en Excel (Report → Laboratorio): formato de Solicitudes,
# una fila por solicitud, con el resultado de cada analito en su columna.
# ---------------------------------------------------------------------------

class BdExcelIn(BaseModel):
    # Solicitudes a descargar. None = TODAS. El filtrado lo hace la pantalla
    # (es quien tiene los filtros) y manda aquí lo que quedó a la vista.
    solicitud_ids: list[int] | None = None
    # Solo estos analitos (por su código). None = todos los que tengan dato.
    ingredientes: list[str] | None = None
    # Texto legible de los filtros aplicados; va en una hoja aparte del Excel.
    descripcion_filtros: str | None = None


_CONSULTA_BD = """
    SELECT
        s.id,
        s.nro_solicitud AS nro_informe,
        s.referencia AS nro_solicitud,
        s.laboratorio,
        s.fecha_solicitud, s.fecha_muestreo, s.fecha_entrada, s.fecha_recepcion, s.fecha_informe, s.fecha_analisis,
        s.hora_muestreo,
        to_jsonb(s) ->> 'hora_recepcion' AS hora_recepcion,
        to_jsonb(s) ->> 'servicio' AS servicio,
        {codigo_muestra},
        s.codigo_ensayo, s.nro_ensayo,
        COALESCE(date_part('week', s.fecha_muestreo)::int, s.semana_muestreo, date_part('week', COALESCE(s.fecha_entrada, s.fecha_informe, s.fecha_analisis))::int) AS semana,
        COALESCE(date_part('month', s.fecha_muestreo)::int, s.mes, date_part('month', COALESCE(s.fecha_entrada, s.fecha_informe, s.fecha_analisis))::int) AS mes,
        s.temporada, s.tipo_servicio, s.solicitante,
        COALESCE(c.nombre, s.sold_to_raw) AS sold_to,
        COALESCE(p.nombre, s.ship_to_raw) AS ship_to,
        s.especie, s.variedad,
        s.nro_linea AS linea_proceso, s.csg, s.lote, s.posicion_muestreo,
        s.nro_camara AS numero_camara, s.nro_orden AS numero_orden,
        s.kg_procesados AS kilos_procesados,
        s.producto_utilizado, s.tipo_muestra, s.nombre_muestreador, s.generado_por,
        s.email_solicitante, s.email_laboratorio, s.observacion
    FROM solicitud s
    LEFT JOIN planta p ON p.id = s.planta_id
    LEFT JOIN cliente c ON c.id = p.cliente_id
    WHERE s.vigente
    {filtro_alcance}
    {filtro_ids}
    ORDER BY COALESCE(s.fecha_muestreo, s.fecha_entrada, s.fecha_informe, s.fecha_analisis) DESC NULLS LAST, s.id DESC
"""


def _texto_seguro_excel(texto: str | None) -> str | None:
    """Un texto que llega de la pantalla y se escribe en una celda: si empezara
    con «=» Excel lo ejecutaría como fórmula."""
    texto = (texto or "").strip()[:2000]
    if not texto:
        return None
    return "'" + texto if texto[:1] in "=+-@" else texto


def _con_cruce(fila_archivo: dict) -> dict:
    """Los datos de la solicitud más su cruce con la muestra (N° de muestra y
    momento de la recepción), que viven en columnas aparte del índice."""
    datos = dict(fila_archivo["datos"] or {})
    if fila_archivo.get("codigo_muestra"):
        datos["codigo_muestra"] = fila_archivo["codigo_muestra"]
    if fila_archivo.get("cruzado_en"):
        datos["recepcion_en"] = fila_archivo["cruzado_en"].isoformat()
    return datos


def _completar_con_solicitudes(cur, filas: list[dict[str, Any]], correos_laboratorio) -> None:
    """Une cada fila con la solicitud de Toma de muestras que la originó (por su
    N° de OT) y llena lo que la base no trae: muestreador, tipo de muestra, etc."""
    from .bd_excel import buscar_por_parecido, completar_fila
    from .columnas_base import calculador_listas

    claves = {str(v).strip().upper() for f in filas for v in (f.get("nro_solicitud"), f.get("nro_informe")) if v}
    por_ot: dict[str, dict] = {}
    if claves:
        try:
            cur.execute(
                "SELECT upper(numero_solicitud) AS ot, datos, codigo_muestra, cruzado_en FROM solicitud_archivo"
                " WHERE upper(numero_solicitud) = ANY(%(claves)s) ORDER BY indexado_en ASC",
                {"claves": sorted(claves)},
            )
            for r in cur.fetchall():
                por_ot[r["ot"]] = _con_cruce(r)  # ante un repetido queda la más reciente
        except psycopg2.errors.UndefinedTable:
            cur.connection.rollback()  # sin la tabla del índice: se sigue sin solicitudes
    enlazadas = [
        next(
            (por_ot[str(v).strip().upper()] for v in (f.get("nro_solicitud"), f.get("nro_informe")) if v and str(v).strip().upper() in por_ot),
            None,
        )
        for f in filas
    ]
    # Los resultados que llegaron sin OT (Quiteca no lo trae) se buscan por
    # parecido, y solo se aceptan si la coincidencia es única.
    fechas = sorted({f["fecha_muestreo"] for f, d in zip(filas, enlazadas) if d is None and f.get("fecha_muestreo")})
    candidatos: list[dict] = []
    if fechas:
        try:
            cur.execute(
                "SELECT numero_solicitud, laboratorio, ship_to, especie, fecha_muestreo, datos,"
                " codigo_muestra, cruzado_en"
                " FROM solicitud_archivo WHERE fecha_muestreo = ANY(%(fechas)s)",
                {"fechas": fechas},
            )
            candidatos = [{**dict(r), "datos": _con_cruce(r)} for r in cur.fetchall()]
        except psycopg2.errors.UndefinedTable:
            cur.connection.rollback()
    correos: dict[str, list[str]] = {}
    listas = calculador_listas()
    for f, datos in zip(filas, enlazadas):
        if datos is None and candidatos:
            datos = buscar_por_parecido(f, candidatos)
        lab = str(f.get("laboratorio") or "")
        if correos_laboratorio and lab not in correos:
            correos[lab] = correos_laboratorio(lab)
        completar_fila(f, datos, correos.get(lab))
        # Lista de distribución de resultados (misma regla que el correo, el PDF y el JSON).
        # El servicio decide la lista (Actimist, Ecofog, RYD o Línea de proceso): primero el «Tipo
        # Aplicación» de la solicitud, si no el `servicio` de la base (0055). El `tipo_servicio` viejo
        # (Cromatografía / Línea de proceso) nunca decía el servicio, por eso todo caía en Línea de proceso.
        campos = (datos or {}).get("campos_laboratorio") or {}
        servicio = (
            (campos.get("Tipo Aplicación") if isinstance(campos, dict) else None)
            or (datos or {}).get("tipo_aplicacion")
            or f.get("servicio")
            or f.get("tipo_servicio")
        )
        f.update(listas(f.get("sold_to"), f.get("ship_to"), f.get("especie"), servicio))


def filas_de_bd(
    cur,
    filtro_alcance: str,
    params: dict,
    ids: list[int] | None,
    correos_laboratorio=None,
) -> list[dict[str, Any]]:
    """Las solicitudes pedidas, cada una con sus resultados y sus dosis.

    `correos_laboratorio(laboratorio) -> list[str]` da los contactos del
    laboratorio para «Email Laboratorio»; sin él esa columna queda como esté."""
    filtro_ids = ""
    if ids is not None:
        filtro_ids = "AND s.id = ANY(%(ids)s)"
        params = {**params, "ids": ids}
    from .ingest import columna_solicitud_existe

    codigo_muestra = "s.codigo_muestra" if columna_solicitud_existe(cur, "codigo_muestra") else "NULL AS codigo_muestra"
    cur.execute(
        _CONSULTA_BD.format(filtro_alcance=filtro_alcance, filtro_ids=filtro_ids, codigo_muestra=codigo_muestra),
        params,
    )
    filas = [dict(f) for f in cur.fetchall()]
    por_id = {f["id"]: f for f in filas}
    for f in filas:
        f["resultados"] = {}
        f["dosis"] = {}
        f["tipo_aplicacion"] = None
    if not por_id:
        return filas
    _completar_con_solicitudes(cur, filas, correos_laboratorio)
    cur.execute(
        """
        SELECT r.solicitud_id, COALESCE(a.codigo, r.analito_raw) AS codigo,
               COALESCE(a.nombre, r.analito_raw) AS nombre, r.valor_num, r.valor_texto
        FROM resultado r LEFT JOIN analito a ON a.id = r.analito_id
        WHERE r.solicitud_id = ANY(%(ids)s)
        """,
        {"ids": list(por_id)},
    )
    for r in cur.fetchall():
        if not r["codigo"]:
            continue
        valor = r["valor_num"] if r["valor_num"] is not None else r["valor_texto"]
        if valor is not None:
            por_id[r["solicitud_id"]]["resultados"][r["codigo"]] = {"valor": valor, "nombre": r["nombre"]}
    cur.execute(
        """
        SELECT pa.solicitud_id, COALESCE(a.codigo, pa.analito_raw) AS codigo, pa.dosis, pa.tipo_aplicacion
        FROM producto_aplicado pa LEFT JOIN analito a ON a.id = pa.analito_id
        WHERE pa.solicitud_id = ANY(%(ids)s)
        """,
        {"ids": list(por_id)},
    )
    for r in cur.fetchall():
        fila = por_id[r["solicitud_id"]]
        if r["codigo"] and r["dosis"] is not None:
            fila["dosis"][r["codigo"]] = r["dosis"]
        if r["tipo_aplicacion"] and not fila["tipo_aplicacion"]:
            fila["tipo_aplicacion"] = r["tipo_aplicacion"]
    return filas


def _correos_de_laboratorio(laboratorio: str) -> list[str]:
    """Contactos del laboratorio (Para y CC; el CCO no es de quien lee el
    archivo) tal como están en Laboratorios → Contacto laboratorio. La base
    guarda «Als» y la configuración «ALS»."""
    from .toma_muestras import contactos_de_solicitud_por_envio

    envio = contactos_de_solicitud_por_envio(laboratorio.strip().upper())
    return [*envio["to"], *envio["cc"]]


# Columnas que son del equipo de AgroFresh y no de quien recibe el informe: correos (de quien pidió la muestra y del
# laboratorio), listas de distribución (con sus copias ocultas) y quién generó la solicitud. A una cuenta de cliente
# el Excel le llega con el MISMO formato, pero estas columnas vacías.
COLUMNAS_INTERNAS = ("email_solicitante", "email_laboratorio", "lista_para", "lista_cc", "lista_cco", "generado_por")


def ocultar_columnas_internas(filas: list[dict[str, Any]]) -> None:
    for fila in filas:
        for clave in COLUMNAS_INTERNAS:
            fila[clave] = None


def _respuesta_bd(
    usuario: Usuario,
    ids: list[int] | None,
    ingredientes: list[str] | None,
    descripcion_filtros: str | None,
    cliente: str | None = None,
    planta: str | None = None,
) -> StreamingResponse:
    """La BD en Excel de lo que esta sesión puede ver (ver `bd_excel`). `cliente` y `planta` solo acotan al personal
    interno; a una cuenta de cliente la acota su sesión."""
    from datetime import date

    from . import config_store
    from .bd_excel import construir_workbook_bd
    from .toma_muestras import ANALITOS_DEFECTO

    # El comercial baja lo mismo que un cliente (sin columnas internas), pero de sus plantas.
    es_cliente = usuario.tipoAcceso in ("cliente", "comercial")
    if usuario.tipoAcceso == "cliente" and not any(alcance_de_datos(usuario, None, None)):
        raise HTTPException(403, "Tu cuenta no tiene un cliente o sucursal asignados.")
    if es_comercial(usuario) and not accesos_de_cuenta(usuario):
        raise HTTPException(403, "Tu cuenta de comercial no tiene plantas asignadas.")
    filtro_alcance, params = _filtro_alcance(usuario, cliente, planta)
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        filas = filas_de_bd(cur, filtro_alcance, params, ids, None if es_cliente else _correos_de_laboratorio)
    if es_cliente:
        ocultar_columnas_internas(filas)
    analitos = config_store.leer("analitos.json", ANALITOS_DEFECTO)
    filtrado = ids is not None or bool(ingredientes)
    nota = None
    if filtrado:
        nota = _texto_seguro_excel(descripcion_filtros) or "Se aplicaron filtros en Report."
    wb = construir_workbook_bd(
        filas,
        analitos,
        set(ingredientes) if ingredientes else None,
        nota_filtro=nota,
    )
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    nombre = f"BD_Laboratorio_{'filtrada' if filtrado else 'completa'}_{date.today():%Y%m%d}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.post("/bd/excel")
def bd_excel(datos: BdExcelIn, usuario: Usuario = Depends(usuario_actual)) -> StreamingResponse:
    """Descarga la BD de resultados. Sin `solicitud_ids` baja TODO; con ellos,
    solo esas solicitudes (lo que la pantalla tiene filtrado) y con las columnas
    acotadas a lo que tienen. Un archivo filtrado lleva una hoja «Filtros
    aplicados» avisando que no es la base completa.

    Una cuenta de cliente baja el MISMO formato, pero solo de su Sold To / Ship To (lo decide la sesión, nunca lo
    que pida el navegador) y sin las columnas internas. Una cuenta de cliente sin cliente ni sucursal asignados no
    baja nada: sin acotar, el filtro dejaría pasar todo."""
    return _respuesta_bd(usuario, datos.solicitud_ids, datos.ingredientes, datos.descripcion_filtros)


@router.get("/clientes")
def clientes(_: Usuario = Depends(solo_interno)) -> list[str]:
    """Nombres de cliente que ya tienen datos cargados — mismo criterio (COALESCE)
    que /datos, para que la lista calce exacto con lo que aparece en el filtro de
    Report. Se usa para el selector de cliente al crear un usuario tipo Cliente.

    Cerrado a las cuentas de cliente: la lista completa revela quiénes son
    clientes de AgroFresh, que no es asunto de ninguno de ellos."""
    condicion_servicio, params_servicio = funciones.condicion_report("s")
    with conexion(escribir=False) as conn:
        with cursor_dict(conn) as cur:
            cur.execute(
                f"""
                SELECT DISTINCT COALESCE(c.nombre, s.sold_to_raw) AS cliente
                FROM solicitud s
                LEFT JOIN planta p ON p.id = s.planta_id
                LEFT JOIN cliente c ON c.id = p.cliente_id
                WHERE s.vigente AND COALESCE(c.nombre, s.sold_to_raw) IS NOT NULL {condicion_servicio}
                ORDER BY 1
                """,
                params_servicio,
            )
            return [fila["cliente"] for fila in cur.fetchall()]


# ---------------------------------------------------------------------------
# Catálogo de analitos: consulta para todos, edición solo para administradores
# (el frontend controla quién ve los botones; el backend no valida roles
# porque hoy no hay autenticación real todavía).
# ---------------------------------------------------------------------------


class AnalitoIn(BaseModel):
    codigo: str
    nombre: str
    categoria: str
    laboratorio: str
    unidad: str
    limite_deteccion: str | None = None
    limite_cuantificacion: str | None = None
    matriz: str | None = None
    activo: bool = True
    limite_min: float | None = None
    limite_central: float | None = None
    limite_max: float | None = None


class AnalitoUpdate(BaseModel):
    codigo: str | None = None
    nombre: str | None = None
    categoria: str | None = None
    laboratorio: str | None = None
    unidad: str | None = None
    limite_deteccion: str | None = None
    limite_cuantificacion: str | None = None
    matriz: str | None = None
    activo: bool | None = None
    limite_min: float | None = None
    limite_central: float | None = None
    limite_max: float | None = None


ANALITOS_QUERY = """
    SELECT id, codigo, nombre, categoria, laboratorio, unidad, limite_deteccion,
           limite_cuantificacion, matriz, activo, limite_min, limite_central, limite_max
    FROM analito
    ORDER BY laboratorio, codigo
"""


@router.get("/analitos")
def listar_analitos() -> list[dict[str, Any]]:
    with conexion(escribir=False) as conn:
        with cursor_dict(conn) as cur:
            cur.execute(ANALITOS_QUERY)
            return cur.fetchall()


RETURNING_COLS = (
    "id, codigo, nombre, categoria, laboratorio, unidad, limite_deteccion, "
    "limite_cuantificacion, matriz, activo, limite_min, limite_central, limite_max"
)


@router.post("/analitos")
def crear_analito(payload: AnalitoIn) -> dict[str, Any]:
    datos = payload.model_dump()
    columnas = list(datos.keys())
    placeholders = ", ".join(["%s"] * len(columnas))
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            try:
                cur.execute(
                    f"INSERT INTO analito ({', '.join(columnas)}) VALUES ({placeholders}) RETURNING {RETURNING_COLS}",
                    [datos[c] for c in columnas],
                )
            except psycopg2.errors.UniqueViolation as err:
                raise HTTPException(
                    409, f"Ya existe un analito con el código '{payload.codigo}' en el laboratorio '{payload.laboratorio}'."
                ) from err
            return cur.fetchone()


@router.put("/analitos/{analito_id}")
def actualizar_analito(analito_id: int, payload: AnalitoUpdate) -> dict[str, Any]:
    cambios = payload.model_dump(exclude_unset=True)
    if not cambios:
        raise HTTPException(400, "No se enviaron campos para actualizar.")
    set_clause = ", ".join(f"{campo} = %s" for campo in cambios)
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            try:
                cur.execute(
                    f"UPDATE analito SET {set_clause} WHERE id = %s RETURNING {RETURNING_COLS}",
                    [*cambios.values(), analito_id],
                )
            except psycopg2.errors.UniqueViolation as err:
                raise HTTPException(409, "Ya existe otro analito con ese código y laboratorio.") from err
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(404, "Analito no encontrado.")
    return fila


@router.delete("/analitos/{analito_id}")
def eliminar_analito(analito_id: int) -> dict[str, Any]:
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            try:
                cur.execute("DELETE FROM analito WHERE id = %s RETURNING id", (analito_id,))
            except psycopg2.errors.ForeignKeyViolation as err:
                raise HTTPException(
                    409,
                    "No se puede eliminar: este analito ya tiene resultados o aplicaciones cargadas en la base. "
                    "Puedes desactivarlo en vez de eliminarlo (edítalo y desmarca 'Activo').",
                ) from err
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(404, "Analito no encontrado.")
    return {"id": analito_id}


# ---------------------------------------------------------------------------
# Límites por analito, especie y tipo de servicio: un mismo analito puede tener
# distintos límites según la fruta y el tipo de servicio (ej. FDL en Cereza vs.
# FDL en Manzana-Actimist). especie="" / tipo_servicio="" es el comodín "aplica
# a todo".
# ---------------------------------------------------------------------------


class LimiteAnalitoIn(BaseModel):
    analito_id: int
    especie: str = ""
    tipo_servicio: str = ""
    limite_min: float | None = None
    limite_central: float | None = None
    limite_max: float | None = None


class LimiteAnalitoUpdate(BaseModel):
    especie: str | None = None
    tipo_servicio: str | None = None
    limite_min: float | None = None
    limite_central: float | None = None
    limite_max: float | None = None


LIMITES_RETURNING = "id, analito_id, especie, tipo_servicio, limite_min, limite_central, limite_max"


@router.get("/limites")
def listar_limites() -> list[dict[str, Any]]:
    with conexion(escribir=False) as conn:
        with cursor_dict(conn) as cur:
            cur.execute(
                f"SELECT {LIMITES_RETURNING} FROM analito_limite ORDER BY analito_id, tipo_servicio, especie"
            )
            return cur.fetchall()


@router.post("/limites")
def crear_limite(payload: LimiteAnalitoIn) -> dict[str, Any]:
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            try:
                cur.execute(
                    f"""
                    INSERT INTO analito_limite (analito_id, especie, tipo_servicio, limite_min, limite_central, limite_max)
                    VALUES (%(analito_id)s, %(especie)s, %(tipo_servicio)s, %(limite_min)s, %(limite_central)s, %(limite_max)s)
                    ON CONFLICT (analito_id, especie, tipo_servicio)
                    DO UPDATE SET limite_min = EXCLUDED.limite_min, limite_central = EXCLUDED.limite_central,
                                  limite_max = EXCLUDED.limite_max, actualizado_en = now()
                    RETURNING {LIMITES_RETURNING}
                    """,
                    payload.model_dump(),
                )
            except psycopg2.errors.ForeignKeyViolation as err:
                raise HTTPException(404, "Analito no encontrado.") from err
            return cur.fetchone()


@router.put("/limites/{limite_id}")
def actualizar_limite(limite_id: int, payload: LimiteAnalitoUpdate) -> dict[str, Any]:
    cambios = payload.model_dump(exclude_unset=True)
    if not cambios:
        raise HTTPException(400, "No se enviaron campos para actualizar.")
    set_clause = ", ".join(f"{campo} = %s" for campo in cambios) + ", actualizado_en = now()"
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            try:
                cur.execute(
                    f"UPDATE analito_limite SET {set_clause} WHERE id = %s RETURNING {LIMITES_RETURNING}",
                    [*cambios.values(), limite_id],
                )
            except psycopg2.errors.UniqueViolation as err:
                raise HTTPException(
                    409, "Ya existe un límite para esa especie y tipo de servicio en este analito."
                ) from err
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(404, "Límite no encontrado.")
            return fila


@router.delete("/limites/{limite_id}")
def eliminar_limite(limite_id: int) -> dict[str, Any]:
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            cur.execute("DELETE FROM analito_limite WHERE id = %s RETURNING id", (limite_id,))
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(404, "Límite no encontrado.")
            return {"id": limite_id}
