from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from . import mapeo
from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


class CargaRequest(BaseModel):
    filas: list[dict[str, Any]]


def _cliente_id(cur, nombre: str, escribir: bool) -> tuple[int | None, bool]:
    cur.execute("SELECT id FROM cliente WHERE nombre = %s", (nombre,))
    row = cur.fetchone()
    if row:
        return row["id"], False
    if not escribir:
        return None, True
    cur.execute("INSERT INTO cliente (nombre) VALUES (%s) RETURNING id", (nombre,))
    return cur.fetchone()["id"], True


def _planta_id(cur, cliente_id: int | None, nombre: str, escribir: bool) -> tuple[int | None, bool]:
    if cliente_id is None:
        return None, False
    cur.execute("SELECT id FROM planta WHERE cliente_id = %s AND nombre = %s", (cliente_id, nombre))
    row = cur.fetchone()
    if row:
        return row["id"], False
    if not escribir:
        return None, True
    cur.execute("INSERT INTO planta (cliente_id, nombre) VALUES (%s, %s) RETURNING id", (cliente_id, nombre))
    return cur.fetchone()["id"], True


def _analito_id(cur, codigo: str, laboratorio: str | None) -> tuple[int | None, str | None]:
    if laboratorio:
        cur.execute("SELECT id FROM analito WHERE codigo = %s AND laboratorio = %s", (codigo, laboratorio))
        row = cur.fetchone()
        if row:
            return row["id"], None
    cur.execute("SELECT id, laboratorio FROM analito WHERE codigo = %s LIMIT 1", (codigo,))
    row = cur.fetchone()
    if row:
        return row["id"], f"Analito {codigo}: el laboratorio '{laboratorio}' no calzó exacto, se usó el catálogo de '{row['laboratorio']}'"
    return None, f"Analito {codigo} no está en el catálogo todavía, se guardó en analito_raw"


def _procesar_filas(cur, filas: list[dict[str, Any]], escribir: bool) -> dict[str, Any]:
    resumen = {
        "solicitudes_nuevas": 0,
        "solicitudes_existentes": 0,
        "clientes_nuevos": 0,
        "plantas_nuevas": 0,
        "productos_aplicados": 0,
        "resultados": 0,
        "filas_omitidas": 0,
    }
    detalle: list[dict[str, Any]] = []
    advertencias: list[str] = []

    for i, fila in enumerate(filas):
        n_fila = i + 2  # misma numeración que usa Ingest en el frontend (fila 1 = encabezado)
        sol = mapeo.mapear_solicitud(fila)
        motivos: list[str] = []

        if not sol["nro_solicitud"]:
            resumen["filas_omitidas"] += 1
            detalle.append({"fila": n_fila, "omitida": True, "motivos": ["Sin N° de solicitud (Informe)"]})
            continue
        if not sol["laboratorio"]:
            # laboratorio es NOT NULL en la tabla solicitud: si se intentara insertar
            # igual, revienta la transacción completa y se pierden también las filas
            # válidas del mismo lote. Se omite esta fila en vez de arriesgar eso.
            resumen["filas_omitidas"] += 1
            detalle.append(
                {
                    "fila": n_fila,
                    "nro_solicitud": sol["nro_solicitud"],
                    "omitida": True,
                    "motivos": ["Sin Laboratorio (columna obligatoria en la base, no se puede cargar sin este dato)"],
                }
            )
            advertencias.append(f"Fila {n_fila}: Sin Laboratorio (columna obligatoria en la base, no se puede cargar sin este dato)")
            continue

        cliente_id = None
        cliente_es_nuevo = False
        if sol["sold_to_raw"]:
            cliente_id, cliente_es_nuevo = _cliente_id(cur, sol["sold_to_raw"], escribir)
            if cliente_es_nuevo:
                resumen["clientes_nuevos"] += 1

        planta_id = None
        if sol["ship_to_raw"] and sol["sold_to_raw"]:
            if cliente_id is not None:
                planta_id, nueva_planta = _planta_id(cur, cliente_id, sol["ship_to_raw"], escribir)
                if nueva_planta:
                    resumen["plantas_nuevas"] += 1
            elif cliente_es_nuevo:
                # En preview el cliente nuevo no se inserta de verdad (rollback),
                # así que no hay cliente_id para buscar la planta. Pero si el
                # cliente es nuevo, la planta también sería nueva sí o sí.
                resumen["plantas_nuevas"] += 1

        cur.execute("SELECT id FROM solicitud WHERE nro_solicitud = %s", (sol["nro_solicitud"],))
        ya_existe = cur.fetchone() is not None
        if ya_existe:
            resumen["solicitudes_existentes"] += 1
            resumen["filas_omitidas"] += 1
            motivos.append(f"La solicitud {sol['nro_solicitud']} ya existe en la base: se omite (no se sobreescribe)")
            detalle.append({"fila": n_fila, "nro_solicitud": sol["nro_solicitud"], "omitida": True, "motivos": motivos})
            advertencias.extend(f"Fila {n_fila}: {m}" for m in motivos)
            continue

        productos = mapeo.mapear_productos_aplicados(fila)
        resultados = mapeo.mapear_resultados(fila)

        productos_resueltos = []
        for p in productos:
            analito_id, adv = _analito_id(cur, p["analito_codigo"], sol["laboratorio"])
            if adv:
                motivos.append(adv)
            productos_resueltos.append({**p, "analito_id": analito_id})

        resultados_resueltos = []
        for r in resultados:
            analito_id, adv = _analito_id(cur, r["analito_codigo"], sol["laboratorio"])
            if adv:
                motivos.append(adv)
            resultados_resueltos.append({**r, "analito_id": analito_id})

        solicitud_id = None
        if escribir:
            datos = {**sol, "planta_id": planta_id}
            columnas = list(datos.keys())
            placeholders = ", ".join(["%s"] * len(columnas))
            cur.execute(
                f"INSERT INTO solicitud ({', '.join(columnas)}) VALUES ({placeholders}) RETURNING id",
                [datos[c] for c in columnas],
            )
            solicitud_id = cur.fetchone()["id"]

            for p in productos_resueltos:
                cur.execute(
                    """INSERT INTO producto_aplicado
                       (solicitud_id, analito_id, analito_raw, producto_raw, dosis, tipo_aplicacion, linea_proceso)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (solicitud_id, analito_id) DO NOTHING""",
                    (
                        solicitud_id,
                        p["analito_id"],
                        None if p["analito_id"] else p["analito_codigo"],
                        p["producto_raw"],
                        p["dosis"],
                        p["tipo_aplicacion"],
                        p["linea_proceso"],
                    ),
                )

            for r in resultados_resueltos:
                cur.execute(
                    """INSERT INTO resultado (solicitud_id, analito_id, analito_raw, valor_num, valor_texto)
                       VALUES (%s, %s, %s, %s, %s)
                       ON CONFLICT (solicitud_id, analito_id) DO NOTHING""",
                    (
                        solicitud_id,
                        r["analito_id"],
                        None if r["analito_id"] else r["analito_codigo"],
                        r["valor_num"],
                        r["valor_texto"],
                    ),
                )

        resumen["solicitudes_nuevas"] += 1
        resumen["productos_aplicados"] += len(productos_resueltos)
        resumen["resultados"] += len(resultados_resueltos)

        motivos = list(dict.fromkeys(motivos))
        detalle.append(
            {
                "fila": n_fila,
                "nro_solicitud": sol["nro_solicitud"],
                "solicitud_id": solicitud_id,
                "cliente": sol["sold_to_raw"],
                "planta": sol["ship_to_raw"],
                "productos_aplicados": len(productos_resueltos),
                "resultados": len(resultados_resueltos),
                "motivos": motivos,
            }
        )
        advertencias.extend(f"Fila {n_fila}: {m}" for m in motivos)

    return {"resumen": resumen, "detalle": detalle, "advertencias": advertencias}


@router.post("/preview")
def preview(payload: CargaRequest) -> dict[str, Any]:
    """Solo lecturas: nunca escribe en la base, sin importar lo que pase."""
    with conexion(escribir=False) as conn:
        with cursor_dict(conn) as cur:
            resultado = _procesar_filas(cur, payload.filas, escribir=False)
    resultado["modo"] = "preview"
    return resultado


@router.post("/confirmar")
def confirmar(payload: CargaRequest) -> dict[str, Any]:
    """Escritura real, en una sola transacción: si algo falla, no queda nada a medias."""
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            resultado = _procesar_filas(cur, payload.filas, escribir=True)
    resultado["modo"] = "confirmado"
    return resultado
