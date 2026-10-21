"""
Panel de «Ingreso de informes»: KPIs, solicitudes y tendencia de demora.

Mezcla tres fuentes que ya existen y cada una se lee aparte (si falta una tabla, el resto sigue):
las solicitudes que salieron al laboratorio (`solicitud_archivo` + `envio_solicitud_log`), los
informes ya cargados (`informe_auditoria` y Report) y la bandeja del correo (`correo_informe`).

El cálculo es PURO (listas que entran, números que salen) para poder probarlo; `leer_panel` solo lee
la base y se lo entrega. La demora se mide en días hábiles (lunes a viernes, sin feriados, igual que
los indicadores de entrega): desde que la solicitud salió al laboratorio hasta que el informe llegó
al correo.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from statistics import median
from typing import Any, Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import psycopg2.errors

from .db import conexion, cursor_dict

try:
    CHILE = ZoneInfo("America/Santiago")
except ZoneInfoNotFoundError:  # pragma: no cover - en Windows sin tzdata
    CHILE = None


def _a_chile(dt: datetime) -> datetime:
    return dt.astimezone(CHILE) if CHILE else dt


def dias_habiles(desde: datetime, hasta: datetime) -> float:
    """Días hábiles (lunes a viernes) entre dos instantes, con fracción. Negativo no existe: 0."""
    if hasta <= desde:
        return 0.0
    a, b = _a_chile(desde), _a_chile(hasta)
    total = 0.0
    dia = datetime(a.year, a.month, a.day, tzinfo=a.tzinfo)
    while dia < b:
        siguiente = dia + timedelta(days=1)
        if dia.weekday() < 5:
            total += (min(b, siguiente) - max(a, dia)).total_seconds() / 86400
        dia = siguiente
    return round(total, 2)


def lunes_de(dt: datetime) -> date:
    d = _a_chile(dt).date()
    return d - timedelta(days=d.weekday())


def regresion(puntos: list[tuple[float, float]]) -> tuple[float, float] | None:
    """Recta de mínimos cuadrados (pendiente, intercepto). None con menos de 2 puntos o sin variación en x."""
    n = len(puntos)
    if n < 2:
        return None
    mx = sum(x for x, _ in puntos) / n
    my = sum(y for _, y in puntos) / n
    sxx = sum((x - mx) ** 2 for x, _ in puntos)
    if sxx == 0:
        return None
    pendiente = sum((x - mx) * (y - my) for x, y in puntos) / sxx
    return pendiente, my - pendiente * mx


def tendencia_de_demora(demoras: Iterable[tuple[datetime, str, float]]) -> dict[str, Any]:
    """`demoras`: (cuándo llegó el informe, laboratorio, días hábiles que tardó).

    Una barra por semana (mediana y cuántos informes), una serie por laboratorio y la recta de tendencia
    sobre las medianas semanales (`pendiente`: días hábiles que sube o baja la demora por semana)."""
    por_semana: dict[date, list[float]] = {}
    por_lab: dict[str, dict[date, list[float]]] = {}
    for llegada, lab, dias in demoras:
        semana = lunes_de(llegada)
        por_semana.setdefault(semana, []).append(dias)
        por_lab.setdefault(lab or "Sin laboratorio", {}).setdefault(semana, []).append(dias)
    semanas = sorted(por_semana)
    puntos = [
        {"semana": s.isoformat(), "n": len(por_semana[s]), "mediana": round(median(por_semana[s]), 2),
         "por_laboratorio": {lab: round(median(d[s]), 2) for lab, d in por_lab.items() if s in d}}
        for s in semanas
    ]
    recta = regresion([(float(i), p["mediana"]) for i, p in enumerate(puntos)])
    return {
        "puntos": puntos,
        "laboratorios": sorted(por_lab),
        "pendiente_por_semana": round(recta[0], 3) if recta else None,
        "recta": [round(recta[1] + recta[0] * i, 3) for i in range(len(puntos))] if recta else [],
    }


def _cuantil(ordenados: list[float], q: float) -> float:
    """Cuantil por interpolación lineal (el mismo de Excel/numpy)."""
    pos = (len(ordenados) - 1) * q
    i = int(pos)
    resto = pos - i
    return ordenados[i] if i + 1 >= len(ordenados) else ordenados[i] + (ordenados[i + 1] - ordenados[i]) * resto


def cajas_de_demora(demoras: Iterable[tuple[str, float]]) -> list[dict[str, Any]]:
    """Diagrama de caja de la demora por laboratorio: cuartiles, mediana, media, bigotes (el dato más lejano
    dentro de 1,5 veces el rango intercuartil) y los atípicos que quedan fuera de ellos."""
    por_lab: dict[str, list[float]] = {}
    for lab, d in demoras:
        por_lab.setdefault(lab or "Sin laboratorio", []).append(d)
    cajas = []
    for lab, valores in sorted(por_lab.items()):
        v = sorted(valores)
        q1, q3 = _cuantil(v, 0.25), _cuantil(v, 0.75)
        rango = q3 - q1
        dentro = [x for x in v if q1 - 1.5 * rango <= x <= q3 + 1.5 * rango]
        cajas.append({
            "laboratorio": lab, "n": len(v), "minimo": v[0], "maximo": v[-1],
            "q1": round(q1, 2), "mediana": round(_cuantil(v, 0.5), 2), "q3": round(q3, 2), "media": round(sum(v) / len(v), 2),
            "bigote_bajo": min(dentro), "bigote_alto": max(dentro),
            "atipicos": [x for x in v if x not in dentro], "valores": v,
        })
    return cajas


def estado_de_solicitud(ot: str, cargadas: set[str], correo: dict[str, list[dict]]) -> str:
    """`cargado` (su informe ya está en Converter/Report), `recibido` (llegó por correo, aún sin cargar),
    `rechazado` (solo llegaron copias que se rechazaron) o `esperando`."""
    if ot in cargadas:
        return "cargado"
    filas = correo.get(ot, [])
    if not filas:
        return "esperando"
    return "rechazado" if all(f["decision"] == "rechazado" for f in filas) else "recibido"


def _incidentes(correo: list[dict], desde: datetime) -> dict[str, int]:
    """Incidentes de envío (`por_informar`: los abiertos de los que nadie ha avisado al laboratorio): UNO por informe (laboratorio y N°), no uno por correo. Un informe que Quiteca mandó mal,
    reenvió y volvió a mandar es la misma historia. Está *abierto* si su última copia sigue en rojo y nadie lo resolvió;
    si una copia posterior llegó bien (o se resolvió a mano) queda *cerrado*, pero sigue contando como incidente del período."""
    grupos: dict[tuple[str, str], list[dict]] = {}
    for f in sorted((x for x in correo if x.get("llegada_en")), key=lambda x: x["llegada_en"]):
        grupos.setdefault((f.get("laboratorio") or "", (f.get("nro_informe") or f"#{f['id']}").strip().upper()), []).append(f)
    incidentes = abiertos = por_informar = 0
    for filas in grupos.values():
        rojas = [f for f in filas if f["estado"] == "rojo"]
        if not rojas:
            continue
        ultima = filas[-1]
        abierto = ultima["estado"] == "rojo" and not ultima.get("resuelto_en")
        if abierto or rojas[0]["llegada_en"] >= desde:
            incidentes += 1
            abiertos += 1 if abierto else 0
            # «Ya se informó» vale para el informe entero: no se vuelve a alertar si el laboratorio lo sigue mandando mal.
            if abierto and not any(f.get("informado_en") for f in filas):
                por_informar += 1
    return {"incidentes": incidentes, "incidentes_abiertos": abiertos, "incidentes_cerrados": incidentes - abiertos,
            "incidentes_por_informar": por_informar}


def armar_panel(
    solicitudes: list[dict], correo: list[dict], cargadas: set[str], ahora: datetime, dias: int,
    fechas_sistema: dict[str, datetime] | None = None,
) -> dict[str, Any]:
    """KPIs, solicitudes y tendencia. `solicitudes`: salieron al laboratorio (con `enviada_en`);
    `correo`: filas de `correo_informe`; `cargadas`: OT con su informe ya en Converter o Report.
    `fechas_sistema`: OT → cuándo llegó su informe según lo que ya estaba en el sistema (fecha de envío anotada, «enviado al
    cliente»…): sirve para medir la demora de los informes que no llegaron por este correo. La del correo manda."""
    desde = ahora - timedelta(days=dias)
    por_ot: dict[str, list[dict]] = {}
    for f in correo:
        if f.get("ot"):
            por_ot.setdefault(f["ot"].strip().upper(), []).append(f)

    filas_solicitud: list[dict[str, Any]] = []
    demoras: list[tuple[datetime, str, float]] = []
    for s in solicitudes:
        ot = (s["ot"] or "").strip().upper()
        estado = estado_de_solicitud(ot, cargadas, por_ot)
        llegadas = [f["llegada_en"] for f in por_ot.get(ot, []) if f["decision"] != "rechazado" and f["llegada_en"]]
        llegada = min(llegadas) if llegadas else (fechas_sistema or {}).get(ot)
        origen = "correo" if llegadas else ("sistema" if llegada else None)
        demora = dias_habiles(s["enviada_en"], llegada) if llegada else None
        if llegada and demora is not None and llegada >= desde:
            demoras.append((llegada, s["laboratorio"], demora))
        ultimo = max(por_ot.get(ot, []), key=lambda f: f["llegada_en"] or desde, default=None)
        filas_solicitud.append({
            "ot": ot, "laboratorio": s["laboratorio"], "sold_to": s["sold_to"], "ship_to": s["ship_to"],
            "especie": s.get("especie"), "enviada_en": s["enviada_en"], "estado": estado,
            "dias_esperando": dias_habiles(s["enviada_en"], ahora) if estado == "esperando" else None,
            "llegada_en": llegada, "demora": demora, "origen_fecha": origen,
            "informe_id": ultimo["id"] if ultimo else None, "nro_informe": ultimo["nro_informe"] if ultimo else None,
            "decision": ultimo["decision"] if ultimo else None,
        })
    # Primero las que siguen esperando su informe (las que llevan más días arriba), después el resto, de la más reciente a la más antigua.
    filas_solicitud.sort(key=lambda f: (0, -(f["dias_esperando"] or 0)) if f["estado"] == "esperando" else (1, -f["enviada_en"].timestamp()))

    # Una copia por informe (la última que llegó): un reenvío no cuenta dos veces.
    ultimas: dict[tuple[str, str], dict] = {}
    for f in sorted((x for x in correo if x["llegada_en"]), key=lambda x: x["llegada_en"]):
        ultimas[(f["laboratorio"] or "", (f["nro_informe"] or f"#{f['id']}").upper())] = f
    del_periodo = [f for f in ultimas.values() if f["llegada_en"] >= desde]

    def n(decision: str) -> int:
        return sum(1 for f in del_periodo if f["decision"] == decision)

    medianas = [d for _, _, d in demoras]
    laboratorios: dict[str, dict[str, Any]] = {}
    for f in filas_solicitud:
        lab = laboratorios.setdefault(f["laboratorio"] or "Sin laboratorio", {"esperando": 0, "recibidos": 0, "demoras": []})
        if f["estado"] == "esperando":
            lab["esperando"] += 1
        elif f["demora"] is not None and f["llegada_en"] and f["llegada_en"] >= desde:
            lab["recibidos"] += 1
            lab["demoras"].append(f["demora"])
    return {
        "dias": dias,
        "kpis": {
            "recibidos": len(del_periodo),
            "pendientes": n("pendiente"),
            "aceptados": n("aceptado"),
            "rechazados": n("rechazado"),
            **_incidentes(correo, desde),
            "esperando": sum(1 for f in filas_solicitud if f["estado"] == "esperando"),
            "demora_mediana": round(median(medianas), 2) if medianas else None,
            "demora_maxima": round(max(medianas), 2) if medianas else None,
        },
        "tendencia": tendencia_de_demora(demoras),
        "cajas": cajas_de_demora((lab, d) for _, lab, d in demoras),
        "laboratorios": [
            {"laboratorio": lab, "esperando": d["esperando"], "recibidos": d["recibidos"],
             "demora_mediana": round(median(d["demoras"]), 2) if d["demoras"] else None}
            for lab, d in sorted(laboratorios.items())
        ],
        "solicitudes": filas_solicitud,
    }


# ---------------------------------------------------------------------------
# Lectura de la base
# ---------------------------------------------------------------------------

def _filas(cur, sql: str, params: tuple = ()) -> list[dict]:
    """Una consulta que tolera que su tabla todavía no exista en el servidor."""
    try:
        cur.execute("SAVEPOINT panel_informes")
        cur.execute(sql, params)
        filas = cur.fetchall()
        cur.execute("RELEASE SAVEPOINT panel_informes")
        return [dict(f) for f in filas]
    except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
        cur.execute("ROLLBACK TO SAVEPOINT panel_informes")
        return []


def _fechas_del_sistema(cur) -> dict[str, datetime]:
    """OT → cuándo llegó su informe, para lo que no entró por este correo. Cada fuente se lee aparte y manda la
    primera que exista: la fecha de envío del informe (Converter), la de «enviado al cliente», la anotada a mano
    (informes propios), cuándo se subió el PDF y, por último, cuándo se cargó a Report."""
    fuentes = (
        "SELECT upper(btrim(numero_solicitud)) AS ot, min(fecha_envio) AS t FROM informe_auditoria"
        " WHERE numero_solicitud IS NOT NULL AND fecha_envio IS NOT NULL GROUP BY 1",
        "SELECT upper(btrim(sa.numero_solicitud)) AS ot, min(e.enviado_en) AS t FROM envio_cliente_manual e"
        " JOIN solicitud_archivo sa ON sa.archivo = e.archivo WHERE sa.numero_solicitud IS NOT NULL GROUP BY 1",
        "SELECT upper(btrim(sa.numero_solicitud)) AS ot, min(m.fecha_envio) AS t FROM informe_fecha_manual m"
        " JOIN solicitud_archivo sa ON sa.archivo = m.archivo WHERE sa.numero_solicitud IS NOT NULL GROUP BY 1",
        "SELECT upper(btrim(numero_solicitud)) AS ot, min(subido_en) AS t FROM informe_auditoria"
        " WHERE numero_solicitud IS NOT NULL GROUP BY 1",
        "SELECT upper(btrim(s.referencia)) AS ot, min(cd.creado_en) AS t FROM solicitud s JOIN carga_datos cd ON cd.id = s.carga_id"
        " WHERE s.referencia ~* '^OT-' AND cd.deshecha_en IS NULL GROUP BY 1",
    )
    fechas: dict[str, datetime] = {}
    for sql in fuentes:
        for f in _filas(cur, sql):
            if f["ot"] and f["t"] and f["ot"] not in fechas:
                fechas[f["ot"]] = f["t"]
    return fechas


def leer_panel(dias: int = 60, ahora: datetime | None = None) -> dict[str, Any]:
    ahora = ahora or datetime.now().astimezone()
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        solicitudes = _filas(
            cur,
            "SELECT sa.numero_solicitud AS ot, sa.laboratorio, sa.sold_to, sa.ship_to, sa.especie, e.enviada_en"
            " FROM solicitud_archivo sa"
            " JOIN (SELECT archivo, MIN(creado_en) AS enviada_en FROM envio_solicitud_log WHERE exitoso GROUP BY archivo) e"
            "   ON e.archivo = sa.archivo"
            " WHERE sa.numero_solicitud IS NOT NULL AND sa.numero_solicitud !~ '^OTP-'"
            "   AND COALESCE(sa.datos->>'es_prueba', '') NOT IN ('true', 'True', '1')"
            "   AND e.enviada_en >= now() - make_interval(days => %s)",
            (dias,),
        )
        correo = _filas(
            cur,
            "SELECT id, ot, nro_informe, laboratorio, llegada_en, decision, estado, resuelto_en, informado_en FROM correo_informe",
        )
        cargadas = {
            str(f["ot"]).strip().upper()
            for f in _filas(
                cur,
                "SELECT numero_solicitud AS ot FROM informe_auditoria WHERE numero_solicitud IS NOT NULL"
                " UNION SELECT referencia AS ot FROM solicitud WHERE referencia ~* '^OT-'",
            )
            if f["ot"]
        }
        fechas = _fechas_del_sistema(cur)
    return armar_panel(solicitudes, correo, cargadas, ahora, dias, fechas)
