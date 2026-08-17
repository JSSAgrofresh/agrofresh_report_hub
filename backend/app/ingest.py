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

    # En preview (escribir=False) nada se inserta de verdad — cada fila del lote
    # "ve" la base tal como estaba antes de empezar, así que sin esta caché, un
    # mismo cliente/planta repetido 50 veces en el Excel se contaría como 50
    # clientes nuevos en vez de 1. La caché recuerda, dentro de este mismo lote,
    # qué cliente/planta ya se resolvió antes (nuevo o existente).
    clientes_cache: dict[str, int | None] = {}
    plantas_cache: dict[tuple[str, str], int | None] = {}

    for i, fila in enumerate(filas):
        n_fila = i + 2  # misma numeración que usa Ingest en el frontend (fila 1 = encabezado)
        sol = mapeo.mapear_solicitud(fila)
        motivos: list[str] = []

        if not sol["nro_solicitud"]:
            resumen["filas_omitidas"] += 1
            detalle.append({"fila": n_fila, "omitida": True, "motivos": ["Sin N° de solicitud (Informe)"]})
            continue
        if not sol["laboratorio"]:
            # laboratorio es NOT NULL en la tabla solicitud: en vez de perder la fila
            # completa por este dato faltante, se guarda con un valor de relleno para
            # no perder el resto (kg, fechas, resultados, etc.) — homogenización
            # pendiente se encarga después de decidir el laboratorio real.
            sol["laboratorio"] = "Sin definir"
            motivos.append("Sin Laboratorio: se guardó como 'Sin definir', revisar y corregir después")

        cliente_id = None
        nombre_cliente = sol["sold_to_raw"]
        if nombre_cliente:
            if nombre_cliente in clientes_cache:
                cliente_id = clientes_cache[nombre_cliente]
            else:
                cliente_id, cliente_es_nuevo = _cliente_id(cur, nombre_cliente, escribir)
                clientes_cache[nombre_cliente] = cliente_id
                if cliente_es_nuevo:
                    resumen["clientes_nuevos"] += 1

        planta_id = None
        if sol["ship_to_raw"] and nombre_cliente:
            clave_planta = (nombre_cliente, sol["ship_to_raw"])
            if clave_planta in plantas_cache:
                planta_id = plantas_cache[clave_planta]
            else:
                if cliente_id is not None:
                    planta_id, nueva_planta = _planta_id(cur, cliente_id, sol["ship_to_raw"], escribir)
                else:
                    # Solo puede pasar en preview: el cliente todavía no existe en la base
                    # (nunca se inserta de verdad), así que tampoco hay id para buscar la
                    # planta — pero como el cliente es nuevo, esta combinación también lo es.
                    nueva_planta = True
                plantas_cache[clave_planta] = planta_id
                if nueva_planta:
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
