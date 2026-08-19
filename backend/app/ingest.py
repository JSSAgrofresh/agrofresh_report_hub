import json
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from . import mapeo
from .auditoria import CAMPOS_HOMOGENIZAR
from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

# Campos de solicitud que se comparan contra el catálogo real antes de
# insertar una solicitud nueva. Reutiliza la misma lista de campos que
# audita DataCore. Ojo: NO se exige calce exacto contra todo lo cargado
# -eso bloquearía cualquier dato nuevo y legítimo (cliente recién onboarded,
# especie que nunca se había cargado)-. Solo se manda a pendiente_revision
# cuando el valor es una variante de mayúsculas/espacios de algo que YA
# existe (probable error de tipeo); un valor genuinamente nuevo entra directo.
CAMPOS_CATALOGO = [(campo, etiqueta) for _tabla, campo, etiqueta in CAMPOS_HOMOGENIZAR]


class CargaRequest(BaseModel):
    filas: list[dict[str, Any]]
    origen: str = "ingest"


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


# sold_to_raw/ship_to_raw no se comparan contra lo que ya hay cargado en
# solicitud (eso solo detecta variantes de algo subido antes): se comparan
# contra el catálogo oficial de Sold To / Ship To (tablas cliente/planta,
# ver catalogo.py y migración 0007), que es la fuente de verdad real.
_TABLA_CATALOGO_OFICIAL = {"sold_to_raw": "cliente", "ship_to_raw": "planta"}


def _cargar_catalogos(cur) -> dict[str, dict[str, set[str]]]:
    """Valores contra los que se compara cada fila nueva -el "catálogo real"-.
    Para sold_to_raw/ship_to_raw es el catálogo oficial (cliente/planta); para
    el resto son los valores ya existentes en solicitud. Guarda tanto los
    valores exactos como su forma normalizada (sin mayúsculas ni espacios de
    más) para poder distinguir "es nuevo de verdad" de "es la misma palabra
    pero mal tipeada"."""
    catalogos: dict[str, dict[str, set[str]]] = {}
    for campo, _etiqueta in CAMPOS_CATALOGO:
        tabla_oficial = _TABLA_CATALOGO_OFICIAL.get(campo)
        if tabla_oficial:
            cur.execute(f"SELECT nombre FROM {tabla_oficial} WHERE activo")
            valores = {r["nombre"] for r in cur.fetchall()}
        else:
            cur.execute(f"SELECT DISTINCT {campo} FROM solicitud WHERE {campo} IS NOT NULL")
            valores = {r[campo] for r in cur.fetchall()}
        catalogos[campo] = {
            "exactos": valores,
            "normalizados": {v.strip().lower() for v in valores},
        }
    return catalogos


def _fuera_de_catalogo(sol: dict[str, Any], catalogos: dict[str, dict[str, set[str]]]) -> list[dict[str, str]]:
    """Solo marca un valor si es variante de mayúsculas/espacios de algo que
    YA existe (probable error de tipeo) — un valor genuinamente nuevo (que no
    se parece a nada cargado antes, ni siquiera normalizado) entra directo,
    sin pedir revisión: no es un error, es un dato nuevo legítimo."""
    motivos = []
    for campo, etiqueta in CAMPOS_CATALOGO:
        valor = sol.get(campo)
        if not valor:
            continue
        cat = catalogos[campo]
        if valor in cat["exactos"]:
            continue
        if valor.strip().lower() in cat["normalizados"]:
            motivos.append({"campo": campo, "etiqueta": etiqueta, "valor": valor})
    return motivos


def _procesar_filas(
    cur,
    filas: list[dict[str, Any]],
    escribir: bool,
    origen: str = "ingest",
    saltar_catalogo: bool = False,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resumen = {
        "solicitudes_nuevas": 0,
        "solicitudes_existentes": 0,
        "clientes_nuevos": 0,
        "plantas_nuevas": 0,
        "productos_aplicados": 0,
        "resultados": 0,
        "filas_omitidas": 0,
        "pendientes_revision": 0,
    }
    catalogos = _cargar_catalogos(cur)
    detalle: list[dict[str, Any]] = []
    advertencias: list[str] = []

    # En preview (escribir=False) nada se inserta de verdad — cada fila del lote
    # "ve" la base tal como estaba antes de empezar, así que sin esta caché, un
    # mismo cliente/planta repetido 50 veces en el Excel se contaría como 50
    # clientes nuevos en vez de 1. La caché recuerda, dentro de este mismo lote,
    # qué cliente/planta ya se resolvió antes (nuevo o existente).
    clientes_cache: dict[str, int | None] = {}
    plantas_cache: dict[tuple[str, str], int | None] = {}

    for i, fila_cruda in enumerate(filas):
        n_fila = i + 2  # misma numeración que usa Ingest en el frontend (fila 1 = encabezado)
        # Encabezados del Excel con espacios de más (ej. " FDL FINAL ") no calzan con
        # los nombres exactos que espera el mapeo — se normalizan acá, una sola vez,
        # antes de que cualquier función de mapeo los use.
        fila = {str(k).strip(): v for k, v in fila_cruda.items()}
        sol = mapeo.mapear_solicitud(fila)
        if overrides:
            sol.update(overrides)
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

        cur.execute("SELECT id FROM solicitud WHERE nro_solicitud = %s", (sol["nro_solicitud"],))
        existente = cur.fetchone()
        ya_existe = existente is not None

        # Antes de tocar nada más -y sobre todo antes de que _cliente_id/_planta_id
        # autocreen un cliente o sucursal nuevo sin avisar-: si esta es una solicitud
        # nueva y trae algún valor que no calza EXACTO con el catálogo real (ya
        # cargado en la base), no se inserta directo. Se guarda entera en
        # pendiente_revision para aprobar, corregir o descartar desde DataCore.
        if not ya_existe and not saltar_catalogo:
            fuera_de_catalogo = _fuera_de_catalogo(sol, catalogos)
            if fuera_de_catalogo:
                resumen["pendientes_revision"] += 1
                if escribir:
                    cur.execute(
                        "INSERT INTO pendiente_revision (origen, fila, motivos) VALUES (%s, %s::jsonb, %s::jsonb)",
                        (origen, json.dumps(fila), json.dumps(fuera_de_catalogo)),
                    )
                detalle.append(
                    {
                        "fila": n_fila,
                        "nro_solicitud": sol["nro_solicitud"],
                        "pendiente_revision": True,
                        "motivos": [f"{m['etiqueta']}: '{m['valor']}' no está en el catálogo" for m in fuera_de_catalogo],
                    }
                )
                continue

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

        if ya_existe:
            resumen["solicitudes_existentes"] += 1
            motivos.append(
                f"La solicitud {sol['nro_solicitud']} ya existe: no se crea de nuevo, "
                "solo se completan analitos que le falten (nunca se sobreescribe lo que ya tiene)"
            )

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

        solicitud_id = existente["id"] if ya_existe else None
        if escribir:
            if not ya_existe:
                datos = {**sol, "planta_id": planta_id, "origen": origen}
                columnas = list(datos.keys())
                placeholders = ", ".join(["%s"] * len(columnas))
                cur.execute(
                    f"INSERT INTO solicitud ({', '.join(columnas)}) VALUES ({placeholders}) RETURNING id",
                    [datos[c] for c in columnas],
                )
                solicitud_id = cur.fetchone()["id"]

            # Si la solicitud ya existía, esto solo agrega lo que le faltaba
            # (ON CONFLICT DO NOTHING protege cualquier analito que ya tuviera).
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

        if not ya_existe:
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
                "ya_existia": ya_existe,
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
            resultado = _procesar_filas(cur, payload.filas, escribir=False, origen=payload.origen)
    resultado["modo"] = "preview"
    return resultado


@router.post("/confirmar")
def confirmar(payload: CargaRequest) -> dict[str, Any]:
    """Escritura real, en una sola transacción: si algo falla, no queda nada a medias."""
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            resultado = _procesar_filas(cur, payload.filas, escribir=True, origen=payload.origen)
    resultado["modo"] = "confirmado"
    return resultado


# ---------------------------------------------------------------------------
# Pendientes de revisión: filas de Ingest/Converter que trajeron algo fuera
# del catálogo real y no se insertaron directo (ver _fuera_de_catalogo).
# Vive en DataCore, pero acá está la lógica porque reutiliza _procesar_filas.
# ---------------------------------------------------------------------------


class AprobarPendienteIn(BaseModel):
    # Correcciones por campo YA MAPEADO de solicitud (ej. "especie", "sold_to_raw"),
    # no por columna cruda del Excel/Converter -evita tener que saber de qué
    # columna original venía cada uno, que varía según el origen-.
    correcciones: dict[str, str] | None = None


class LotePendientesIn(BaseModel):
    # None = todos los pendientes actuales (no solo los de la página visible).
    ids: list[int] | None = None


RESUMEN_VACIO = {
    "solicitudes_nuevas": 0,
    "solicitudes_existentes": 0,
    "clientes_nuevos": 0,
    "plantas_nuevas": 0,
    "productos_aplicados": 0,
    "resultados": 0,
    "filas_omitidas": 0,
    "pendientes_revision": 0,
}


@router.get("/pendientes")
def listar_pendientes(pagina: int = Query(1, ge=1), tamano: int = Query(50, ge=1, le=200)) -> dict[str, Any]:
    offset = (pagina - 1) * tamano
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT count(*) AS total FROM pendiente_revision")
        total = cur.fetchone()["total"]
        cur.execute(
            "SELECT id, origen, fila, motivos, creado_en FROM pendiente_revision ORDER BY id DESC LIMIT %s OFFSET %s",
            (tamano, offset),
        )
        filas = cur.fetchall()
    return {"filas": filas, "total": total, "pagina": pagina, "tamano": tamano}


@router.post("/pendientes/{pendiente_id}/aprobar")
def aprobar_pendiente(pendiente_id: int, payload: AprobarPendienteIn) -> dict[str, Any]:
    """Inserta la fila ya revisada -tal cual quedó guardada, o con las
    correcciones que mande el frontend-. Se salta el chequeo de catálogo:
    un humano ya la miró, así que si el valor sigue siendo "nuevo" es porque
    de verdad es nuevo (cliente recién onboarded, etc.), no un error."""
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            cur.execute("SELECT origen, fila FROM pendiente_revision WHERE id = %s", (pendiente_id,))
            pendiente = cur.fetchone()
            if not pendiente:
                raise HTTPException(status_code=404, detail="Ese pendiente ya no existe")
            resultado = _procesar_filas(
                cur,
                [pendiente["fila"]],
                escribir=True,
                origen=pendiente["origen"],
                saltar_catalogo=True,
                overrides=payload.correcciones,
            )
            cur.execute("DELETE FROM pendiente_revision WHERE id = %s", (pendiente_id,))
    return resultado


@router.post("/pendientes/{pendiente_id}/descartar")
def descartar_pendiente(pendiente_id: int) -> dict[str, Any]:
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM pendiente_revision WHERE id = %s RETURNING id", (pendiente_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Ese pendiente ya no existe")
    return {"ok": True}


@router.post("/pendientes/aprobar-lote")
def aprobar_lote(payload: LotePendientesIn) -> dict[str, Any]:
    """Aprueba muchos pendientes de una sola vez (típico después de una carga
    masiva contra un catálogo recién partido de cero, donde todo queda
    pendiente aunque sean datos reales y correctos). Sin ids = todos."""
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            if payload.ids is not None:
                cur.execute(
                    "SELECT id, origen, fila FROM pendiente_revision WHERE id = ANY(%s) ORDER BY id",
                    (payload.ids,),
                )
            else:
                cur.execute("SELECT id, origen, fila FROM pendiente_revision ORDER BY id")
            pendientes = cur.fetchall()
            if not pendientes:
                return {"aprobados": 0, "resumen": dict(RESUMEN_VACIO)}

            # _procesar_filas toma un solo origen por llamada: se agrupa por si
            # el lote mezcla filas de ingest y converter.
            por_origen: dict[str, list[dict[str, Any]]] = {}
            for p in pendientes:
                por_origen.setdefault(p["origen"], []).append(p["fila"])

            resumen_total = dict(RESUMEN_VACIO)
            for origen, filas in por_origen.items():
                r = _procesar_filas(cur, filas, escribir=True, origen=origen, saltar_catalogo=True)
                for k in resumen_total:
                    resumen_total[k] += r["resumen"][k]

            ids_aprobados = [p["id"] for p in pendientes]
            cur.execute("DELETE FROM pendiente_revision WHERE id = ANY(%s)", (ids_aprobados,))

    return {"aprobados": len(ids_aprobados), "resumen": resumen_total}


@router.post("/pendientes/descartar-lote")
def descartar_lote(payload: LotePendientesIn) -> dict[str, Any]:
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        if payload.ids is not None:
            cur.execute("DELETE FROM pendiente_revision WHERE id = ANY(%s) RETURNING id", (payload.ids,))
        else:
            cur.execute("DELETE FROM pendiente_revision RETURNING id")
        borrados = cur.fetchall()
    return {"descartados": len(borrados)}
