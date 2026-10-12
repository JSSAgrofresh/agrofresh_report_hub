"""
Qué tipo de servicio es cada informe que ya estaba en Report antes de la migración 0055.

Desde la 0055 cada informe nuevo lleva su `solicitud.servicio`. Lo cargado antes tiene NULL y Report lo
trata como Línea de proceso, aunque sea de Actimist, Ecofog o RYD (los informes propios de AgroFresh que
sube «Ingreso al laboratorio» se guardan todos como «Cromatografía»). Acá se deduce su servicio de lo
que SÍ quedó guardado, por orden de confianza:

  1. La solicitud de Toma de muestras del informe (su OT está en `solicitud.referencia`): su «Tipo Aplicación».
  2. El «Tipo Aplicación» de los productos aplicados de ese informe (`producto_aplicado`).
  3. Quiteca escribía «Actimist» en `tipo_servicio` cuando el tratamiento era FOGGER o ACTIMIST.

Lo que no se puede deducir, o es Línea de proceso, se deja como está (NULL). Nada se inventa.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

from .servicios import _norm, clave_lista


def servicio_de_tipo(valor: Any) -> str:
    """'actimist' | 'ecofog' | 'ryd' | '' (Línea de proceso, o un valor que no dice nada)."""
    n = _norm(valor)
    if "fogger" in n or "actimist" in n:           # Quiteca: FOGGER y ACTIMIST son el mismo tratamiento
        return "actimist"
    return clave_lista(n)


def clasificar(tipo_toma: Any, tipos_productos: list[Any], tipo_servicio: Any) -> tuple[str, str]:
    """(servicio, de dónde salió). Servicio vacío = Línea de proceso o sin dato."""
    if _norm(tipo_toma):
        return servicio_de_tipo(tipo_toma), "solicitud"
    por_producto = Counter(s for s in (servicio_de_tipo(t) for t in tipos_productos if _norm(t)))
    con_servicio = {s: n for s, n in por_producto.items() if s}
    if con_servicio:
        return max(con_servicio.items(), key=lambda kv: (kv[1], kv[0]))[0], "productos"
    if por_producto:                               # todos los productos dicen Línea de proceso
        return "", "productos"
    if _norm(tipo_servicio) == "actimist":
        return "actimist", "tipo_servicio"
    return "", "sin_dato"


_SQL = """
SELECT s.id, s.nro_solicitud, s.referencia, s.tipo_servicio,
       {tipo_toma} AS tipo_toma,
       COALESCE(array_agg(DISTINCT pa.tipo_aplicacion) FILTER (WHERE pa.tipo_aplicacion IS NOT NULL), '{{}}') AS tipos
FROM solicitud s
LEFT JOIN producto_aplicado pa ON pa.solicitud_id = s.id
WHERE s.servicio IS NULL
GROUP BY s.id
ORDER BY s.id
"""
_TIPO_TOMA = (
    "(SELECT sa.datos->'campos_laboratorio'->>'Tipo Aplicación' FROM solicitud_archivo sa"
    " WHERE upper(btrim(sa.numero_solicitud)) = upper(btrim(s.referencia)) AND btrim(COALESCE(s.referencia, '')) <> '' LIMIT 1)"
)


def clasificar_todas(cur, aplicar: bool = False) -> dict[str, Any]:
    """Deduce el servicio de cada informe con `servicio` NULL. Con `aplicar` lo escribe (solo donde
    NULL y solo los que no son Línea de proceso). Devuelve los conteos y los ids por servicio."""
    cur.execute("SELECT to_regclass('solicitud_archivo') IS NOT NULL AS hay")
    hay_toma = cur.fetchone()["hay"]
    cur.execute(_SQL.format(tipo_toma=_TIPO_TOMA if hay_toma else "NULL::text"))
    filas = cur.fetchall()

    por_servicio: dict[str, list[int]] = {"actimist": [], "ecofog": [], "ryd": []}
    origenes: Counter = Counter()
    linea = 0
    ejemplos: dict[str, list[str]] = {"actimist": [], "ecofog": [], "ryd": []}
    for f in filas:
        servicio, origen = clasificar(f["tipo_toma"], list(f["tipos"] or []), f["tipo_servicio"])
        if not servicio:
            linea += 1
            continue
        por_servicio[servicio].append(f["id"])
        origenes[origen] += 1
        if len(ejemplos[servicio]) < 5:
            ejemplos[servicio].append(f["nro_solicitud"])
    escritos = 0
    if aplicar:
        for servicio, ids in por_servicio.items():
            if ids:
                cur.execute("UPDATE solicitud SET servicio = %s WHERE id = ANY(%s) AND servicio IS NULL", (servicio, ids))
                escritos += cur.rowcount
    return {
        "revisadas": len(filas),
        "linea_de_proceso": linea,
        "por_servicio": {s: len(ids) for s, ids in por_servicio.items()},
        "ids": por_servicio,
        "ejemplos": ejemplos,
        "origen": dict(origenes),
        "escritos": escritos,
    }
