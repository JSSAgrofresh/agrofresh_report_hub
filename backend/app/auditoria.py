"""
Auditoría de la base de datos ya cargada (a diferencia de ingest.py, que valida
un archivo ANTES de insertarlo): detecta inconsistencias de homogenización
-mismo valor real escrito de más de una forma- para revisar y corregir desde
el módulo DataCore.

Las correcciones NUNCA tocan la base real en vivo directamente: se trabajan
sobre una copia ("lab_staging"), y solo se aplican a producción con /promover,
que requiere 0 inconsistencias pendientes. Como todas las consultas de la app
usan nombres de tabla sin prefijo de schema (search_path=lab,public), promover
es un simple renombre de schemas -sin downtime, sin reiniciar el backend-.
"""
import json
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel

from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/auditoria", tags=["auditoria"])

SCHEMA_PROD = "lab"
SCHEMA_STAGING = "lab_staging"

# Tablas navegables desde la vista "Tabla" y su set de columnas a mostrar
# (whitelist fija: nunca se arma SQL con nombres que vengan del cliente).
TABLAS: dict[str, list[str]] = {
    "solicitud": [
        "id", "nro_solicitud", "laboratorio", "fecha_muestreo", "fecha_entrada",
        "especie", "variedad", "tipo_servicio", "sold_to_raw", "ship_to_raw",
        "planta_id", "semana_muestreo", "mes", "temporada", "origen", "vigente",
    ],
    "resultado": ["id", "solicitud_id", "analito_id", "analito_raw", "valor_num", "valor_texto"],
    "producto_aplicado": [
        "id", "solicitud_id", "analito_id", "analito_raw", "producto_raw",
        "dosis", "tipo_aplicacion", "linea_proceso",
    ],
    "planta": ["id", "cliente_id", "nombre", "codigo_sap", "activo"],
    "cliente": ["id", "nombre", "codigo_sap", "activo"],
    "analito": [
        "id", "codigo", "nombre", "categoria", "laboratorio", "unidad",
        "limite_min", "limite_central", "limite_max", "limite_cuantificacion", "activo",
    ],
    "analito_limite": ["id", "analito_id", "especie", "tipo_servicio", "limite_min", "limite_central", "limite_max"],
}

# Orden de creación (no importa por FKs, que se agregan al final, pero mantiene
# el script legible de padres a hijos) + grafo de llaves foráneas a recrear
# manualmente: "LIKE ... INCLUDING ALL" no copia foreign keys (limitación de
# Postgres), así que hay que declararlas de nuevo apuntando a las tablas clon.
ORDEN_TABLAS_CLON = [
    "cliente", "analito", "planta", "solicitud", "resultado",
    "producto_aplicado", "analito_limite",
    "pendiente_revision",
]
FKS_CLON = [
    ("planta", "cliente_id", "cliente", "id", "RESTRICT"),
    ("solicitud", "planta_id", "planta", "id", "RESTRICT"),
    ("resultado", "solicitud_id", "solicitud", "id", "CASCADE"),
    ("resultado", "analito_id", "analito", "id", "RESTRICT"),
    ("producto_aplicado", "solicitud_id", "solicitud", "id", "RESTRICT"),
    ("producto_aplicado", "analito_id", "analito", "id", "RESTRICT"),
    ("analito_limite", "analito_id", "analito", "id", "CASCADE"),
]

# Campos de texto que deberían tener un único valor "real" por significado:
# si el mismo valor aparece con mayúsculas/minúsculas o espacios distintos,
# son variantes del mismo dato que hay que homogenizar.
CAMPOS_HOMOGENIZAR = [
    ("solicitud", "especie", "Especie"),
    ("solicitud", "variedad", "Variedad"),
    ("solicitud", "tipo_servicio", "Tipo de servicio"),
    ("solicitud", "laboratorio", "Laboratorio"),
    ("solicitud", "sold_to_raw", "Sold To (cliente)"),
    ("solicitud", "ship_to_raw", "Ship To (sucursal)"),
]

CAMPOS_HOMOGENIZAR_POR_TABLA: dict[str, set[str]] = {}
for _tabla, _campo, _et in CAMPOS_HOMOGENIZAR:
    CAMPOS_HOMOGENIZAR_POR_TABLA.setdefault(_tabla, set()).add(_campo)

# Columnas de texto "auditables a mano" desde la Vista de tabla (clic en el
# encabezado): más amplio que CAMPOS_HOMOGENIZAR -acá se listan TODOS los
# valores distintos de la columna, no solo los que difieren por mayúsculas-
# para poder unificar cualquier variante (abreviaciones, typos, etc.), no
# solo casing. Sigue siendo una whitelist fija por seguridad.
CAMPOS_AUDITABLES: dict[str, list[str]] = {
    "solicitud": [
        "especie", "variedad", "tipo_servicio", "laboratorio", "sold_to_raw", "ship_to_raw",
        "lote", "nro_camara", "nro_linea", "posicion_muestreo", "csg", "solicitante",
        "nombre_muestreador", "nro_orden", "tipo_muestra",
    ],
    "producto_aplicado": ["analito_raw", "producto_raw", "tipo_aplicacion", "linea_proceso"],
    "resultado": ["analito_raw"],
    "planta": ["nombre", "codigo_sap"],
    "cliente": ["nombre", "codigo_sap"],
    "analito": ["nombre", "categoria", "unidad", "matriz"],
}


def _schema_activo(cur) -> str:
    """lab_staging si existe una copia de trabajo en curso; si no, lab (solo lectura)."""
    cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA_STAGING,))
    return SCHEMA_STAGING if cur.fetchone() else SCHEMA_PROD


def _requiere_staging(cur) -> None:
    cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA_STAGING,))
    if not cur.fetchone():
        raise HTTPException(
            status_code=400,
            detail="No hay una copia de trabajo activa. Crea una desde 'Crear copia de trabajo' antes de corregir.",
        )


class CorregirGrupoIn(BaseModel):
    tabla: str
    campo: str
    clave: str
    valor: str


class CorregirValoresIn(BaseModel):
    tabla: str
    campo: str
    valores_origen: list[str]
    valor_destino: str


class DeshacerIn(BaseModel):
    historial_id: int


@router.get("/tablas")
def listar_tablas() -> list[dict[str, Any]]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        schema = _schema_activo(cur)
        salida = []
        for nombre, columnas in TABLAS.items():
            cur.execute(f"SELECT count(*) AS total FROM {schema}.{nombre}")
            salida.append({"nombre": nombre, "columnas": columnas, "total": cur.fetchone()["total"]})
    return salida


@router.get("/tabla/{nombre}")
def ver_tabla(
    nombre: str,
    pagina: int = Query(1, ge=1),
    tamano: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    if nombre not in TABLAS:
        raise HTTPException(status_code=404, detail=f"Tabla '{nombre}' no reconocida")
    columnas = TABLAS[nombre]
    offset = (pagina - 1) * tamano
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        schema = _schema_activo(cur)
        cur.execute(
            f"SELECT {', '.join(columnas)} FROM {schema}.{nombre} ORDER BY id DESC LIMIT %s OFFSET %s",
            (tamano, offset),
        )
        filas = cur.fetchall()
        cur.execute(f"SELECT count(*) AS total FROM {schema}.{nombre}")
        total = cur.fetchone()["total"]
    return {"filas": filas, "total": total, "pagina": pagina, "tamano": tamano, "columnas": columnas, "schema": schema}


def _auditar(cur, schema: str) -> dict[str, Any]:
    grupos: list[dict[str, Any]] = []
    for tabla, campo, etiqueta in CAMPOS_HOMOGENIZAR:
        cur.execute(
            f"""
            SELECT lower(trim({campo})) AS clave,
                   jsonb_object_agg({campo}, cnt ORDER BY {campo}) AS conteo_variantes,
                   sum(cnt)::int AS filas
            FROM (
                SELECT {campo}, count(*) AS cnt
                FROM {schema}.{tabla}
                WHERE {campo} IS NOT NULL AND trim({campo}) <> ''
                GROUP BY {campo}
            ) sub
            GROUP BY lower(trim({campo}))
            HAVING count(*) > 1
            ORDER BY sum(cnt) DESC
            """
        )
        for fila in cur.fetchall():
            conteo = fila["conteo_variantes"]
            sugerido = max(conteo, key=conteo.get)
            grupos.append(
                {
                    "regla": "homogenizacion",
                    "tabla": tabla,
                    "campo": campo,
                    "etiqueta": etiqueta,
                    "clave": fila["clave"],
                    "conteo_variantes": conteo,
                    "sugerido": sugerido,
                    "filas": fila["filas"],
                }
            )
    total_filas_afectadas = sum(g["filas"] for g in grupos)
    return {
        "schema": schema,
        "total_inconsistencias": len(grupos),
        "total_filas_afectadas": total_filas_afectadas,
        "grupos": sorted(grupos, key=lambda g: g["filas"], reverse=True),
    }


@router.get("/inconsistencias")
def auditar() -> dict[str, Any]:
    """Primera pasada de auditoría: variantes de un mismo valor por mayúsculas
    o espacios distintos dentro de un mismo campo. No compara todavía contra
    el catálogo real de Sold To / Ship To (pendiente: falta esa lista de
    referencia) — eso será una segunda regla, aparte de esta. Si hay una
    copia de trabajo activa, audita esa copia; si no, audita la base en vivo
    (de solo lectura, no se puede corregir nada hasta crear la copia)."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        return _auditar(cur, _schema_activo(cur))


# ---------------------------------------------------------------------------
# Copia de trabajo: todas las correcciones se hacen acá, nunca en vivo.
# ---------------------------------------------------------------------------


@router.get("/staging/estado")
def estado_staging() -> dict[str, Any]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA_STAGING,))
        if not cur.fetchone():
            return {"activo": False}
        cur.execute(f"SELECT creado_en FROM {SCHEMA_STAGING}._meta LIMIT 1")
        meta = cur.fetchone()
        return {"activo": True, "creado_en": meta["creado_en"] if meta else None}


@router.post("/staging/crear")
def crear_staging() -> dict[str, Any]:
    """(Re)crea lab_staging como una copia completa de lab. Si ya existía una
    copia de trabajo, la reemplaza por una nueva sincronizada con lo que hay
    en producción ahora mismo -se pierden las correcciones que no se hayan
    promovido todavía-."""
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute(f"DROP SCHEMA IF EXISTS {SCHEMA_STAGING} CASCADE")
        cur.execute(f"CREATE SCHEMA {SCHEMA_STAGING}")
        cur.execute(f"CREATE TABLE {SCHEMA_STAGING}._meta (creado_en timestamptz NOT NULL)")
        cur.execute(f"INSERT INTO {SCHEMA_STAGING}._meta (creado_en) VALUES (%s)", (datetime.now(timezone.utc),))
        cur.execute(
            f"""
            CREATE TABLE {SCHEMA_STAGING}._historial (
                id serial PRIMARY KEY,
                tabla text NOT NULL,
                campo text NOT NULL,
                etiqueta text NOT NULL,
                valor_nuevo text NOT NULL,
                filas jsonb NOT NULL,
                aplicado_en timestamptz NOT NULL DEFAULT now(),
                deshecho boolean NOT NULL DEFAULT false
            )
            """
        )

        for tabla in ORDEN_TABLAS_CLON:
            cur.execute(
                f"CREATE TABLE {SCHEMA_STAGING}.{tabla} "
                f"(LIKE {SCHEMA_PROD}.{tabla} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)"
            )
            # El id serial de la tabla clonada apunta por defecto a la secuencia
            # de PRODUCCIÓN (INCLUDING DEFAULTS copia la expresión tal cual):
            # se reemplaza por una secuencia propia para no interferir con
            # producción mientras se trabaja en la copia.
            cur.execute(f"CREATE SEQUENCE {SCHEMA_STAGING}.{tabla}_id_seq")
            cur.execute(
                f"ALTER TABLE {SCHEMA_STAGING}.{tabla} "
                f"ALTER COLUMN id SET DEFAULT nextval('{SCHEMA_STAGING}.{tabla}_id_seq'::regclass)"
            )
            cur.execute(f"ALTER SEQUENCE {SCHEMA_STAGING}.{tabla}_id_seq OWNED BY {SCHEMA_STAGING}.{tabla}.id")
            cur.execute(f"INSERT INTO {SCHEMA_STAGING}.{tabla} SELECT * FROM {SCHEMA_PROD}.{tabla}")
            cur.execute(
                f"SELECT setval('{SCHEMA_STAGING}.{tabla}_id_seq', "
                f"COALESCE((SELECT max(id) FROM {SCHEMA_STAGING}.{tabla}), 1))"
            )

        for tabla, columna, ref_tabla, ref_columna, on_delete in FKS_CLON:
            cur.execute(
                f"ALTER TABLE {SCHEMA_STAGING}.{tabla} "
                f"ADD FOREIGN KEY ({columna}) REFERENCES {SCHEMA_STAGING}.{ref_tabla}({ref_columna}) "
                f"ON DELETE {on_delete}"
            )

    return estado_staging()


@router.post("/staging/descartar")
def descartar_staging() -> dict[str, Any]:
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute(f"DROP SCHEMA IF EXISTS {SCHEMA_STAGING} CASCADE")
    return {"activo": False}


def _registrar_y_aplicar(cur, tabla: str, campo: str, etiqueta: str, where_sql: str, where_params: tuple, valor_destino: str) -> int:
    """Guarda (id, valor_anterior) de cada fila que va a cambiar antes de
    aplicar el UPDATE, para poder deshacerlo después con /deshacer."""
    cur.execute(f"SELECT id, {campo} AS valor FROM {SCHEMA_STAGING}.{tabla} WHERE {where_sql}", where_params)
    filas_antes = cur.fetchall()
    if not filas_antes:
        return 0

    cur.execute(
        f"UPDATE {SCHEMA_STAGING}.{tabla} SET {campo} = %s WHERE {where_sql}",
        (valor_destino, *where_params),
    )

    cur.execute(
        f"""
        INSERT INTO {SCHEMA_STAGING}._historial (tabla, campo, etiqueta, valor_nuevo, filas)
        VALUES (%s, %s, %s, %s, %s::jsonb)
        """,
        (tabla, campo, etiqueta, valor_destino, json.dumps([{"id": f["id"], "valor": f["valor"]} for f in filas_antes])),
    )
    return len(filas_antes)


@router.post("/corregir")
def corregir_grupo(payload: CorregirGrupoIn) -> dict[str, Any]:
    """Reescribe todas las variantes de un grupo de inconsistencia al valor
    elegido. Siempre sobre lab_staging: si no existe copia de trabajo, no se
    puede corregir nada (para eso está /staging/crear)."""
    if payload.tabla not in CAMPOS_HOMOGENIZAR_POR_TABLA or payload.campo not in CAMPOS_HOMOGENIZAR_POR_TABLA[payload.tabla]:
        raise HTTPException(status_code=400, detail="Campo no reconocido para corrección de homogenización")
    etiqueta = next(et for t, c, et in CAMPOS_HOMOGENIZAR if t == payload.tabla and c == payload.campo)

    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        _requiere_staging(cur)
        filas_actualizadas = _registrar_y_aplicar(
            cur,
            payload.tabla,
            payload.campo,
            etiqueta,
            f"lower(trim({payload.campo})) = %s AND {payload.campo} IS DISTINCT FROM %s",
            (payload.clave, payload.valor),
            payload.valor,
        )

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        auditoria = _auditar(cur, SCHEMA_STAGING)

    return {"filas_actualizadas": filas_actualizadas, "auditoria": auditoria}


@router.post("/corregir-valores")
def corregir_valores(payload: CorregirValoresIn) -> dict[str, Any]:
    """Igual que /corregir, pero para la auditoría manual por columna: unifica
    una lista de valores elegidos a mano (no necesariamente variantes de
    mayúsculas entre sí) a un único valor destino."""
    if payload.tabla not in CAMPOS_AUDITABLES or payload.campo not in CAMPOS_AUDITABLES[payload.tabla]:
        raise HTTPException(status_code=400, detail="Campo no habilitado para auditoría manual")
    if not payload.valores_origen:
        raise HTTPException(status_code=400, detail="Selecciona al menos un valor para unificar")

    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        _requiere_staging(cur)
        filas_actualizadas = _registrar_y_aplicar(
            cur,
            payload.tabla,
            payload.campo,
            f"{payload.tabla}.{payload.campo} (manual)",
            f"{payload.campo} = ANY(%s) AND {payload.campo} IS DISTINCT FROM %s",
            (payload.valores_origen, payload.valor_destino),
            payload.valor_destino,
        )

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        auditoria = _auditar(cur, SCHEMA_STAGING)

    return {"filas_actualizadas": filas_actualizadas, "auditoria": auditoria}


@router.get("/staging/historial")
def historial_staging() -> list[dict[str, Any]]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA_STAGING,))
        if not cur.fetchone():
            return []
        cur.execute(
            f"""
            SELECT id, tabla, campo, etiqueta, valor_nuevo, jsonb_array_length(filas) AS filas, aplicado_en, deshecho
            FROM {SCHEMA_STAGING}._historial
            ORDER BY id DESC
            """
        )
        return cur.fetchall()


@router.post("/deshacer")
def deshacer(payload: DeshacerIn) -> dict[str, Any]:
    """Revierte una corrección puntual: restaura el valor anterior fila por
    fila (guardado en /corregir o /corregir-valores) y marca la entrada del
    historial como deshecha."""
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        _requiere_staging(cur)
        cur.execute(
            f"SELECT tabla, campo, filas, deshecho FROM {SCHEMA_STAGING}._historial WHERE id = %s",
            (payload.historial_id,),
        )
        entrada = cur.fetchone()
        if not entrada:
            raise HTTPException(status_code=404, detail="Esa corrección no existe en el historial de esta copia.")
        if entrada["deshecho"]:
            raise HTTPException(status_code=400, detail="Esa corrección ya estaba deshecha.")

        tabla, campo = entrada["tabla"], entrada["campo"]
        for fila in entrada["filas"]:
            cur.execute(
                f"UPDATE {SCHEMA_STAGING}.{tabla} SET {campo} = %s WHERE id = %s",
                (fila["valor"], fila["id"]),
            )
        cur.execute(f"UPDATE {SCHEMA_STAGING}._historial SET deshecho = true WHERE id = %s", (payload.historial_id,))
        filas_restauradas = len(entrada["filas"])

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        auditoria = _auditar(cur, SCHEMA_STAGING)

    return {"filas_restauradas": filas_restauradas, "auditoria": auditoria}


# ---------------------------------------------------------------------------
# Auditoría manual por columna: clic en un encabezado de la Vista de tabla.
# ---------------------------------------------------------------------------


@router.get("/columna/{tabla}/{campo}")
def valores_columna(tabla: str, campo: str) -> dict[str, Any]:
    if tabla not in CAMPOS_AUDITABLES or campo not in CAMPOS_AUDITABLES[tabla]:
        raise HTTPException(status_code=400, detail="Campo no habilitado para auditoría manual")
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        schema = _schema_activo(cur)
        cur.execute(
            f"""
            SELECT {campo} AS valor, count(*)::int AS filas
            FROM {schema}.{tabla}
            WHERE {campo} IS NOT NULL AND trim({campo}) <> ''
            GROUP BY {campo}
            ORDER BY count(*) DESC
            LIMIT 500
            """
        )
        return {"tabla": tabla, "campo": campo, "schema": schema, "valores": cur.fetchall()}


# ---------------------------------------------------------------------------
# Exportar a Excel
# ---------------------------------------------------------------------------


@router.get("/exportar")
def exportar():
    wb = Workbook()
    wb.remove(wb.active)
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        schema = _schema_activo(cur)
        for tabla, columnas in TABLAS.items():
            cur.execute(f"SELECT {', '.join(columnas)} FROM {schema}.{tabla} ORDER BY id")
            filas = cur.fetchall()
            hoja = wb.create_sheet(tabla[:31])
            hoja.append(columnas)
            for fila in filas:
                hoja.append([str(fila[c]) if fila[c] is not None else None for c in columnas])

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    nombre = f"agrofresh_{schema}_{datetime.now(timezone.utc):%Y%m%d_%H%M}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.post("/promover")
def promover() -> dict[str, Any]:
    """Reemplaza la base en vivo por la copia de trabajo: requiere que la copia
    tenga 0 inconsistencias pendientes. Es un renombre de schemas (no una
    reescritura fila por fila), así que es prácticamente instantáneo y no
    necesita reiniciar el backend -las consultas usan nombres sin prefijo de
    schema, así que empiezan a resolver contra el nuevo 'lab' de inmediato-.
    La base anterior se conserva como respaldo con el nombre lab_backup_<fecha>."""
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA_STAGING,))
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="No hay una copia de trabajo activa para promover.")

        auditoria = _auditar(cur, SCHEMA_STAGING)
        if auditoria["total_inconsistencias"] > 0:
            raise HTTPException(
                status_code=400,
                detail=f"La copia de trabajo todavía tiene {auditoria['total_inconsistencias']} inconsistencias. "
                "Corrígelas todas antes de aplicar a producción.",
            )

        # _meta / _historial son control interno de la copia de trabajo: no
        # deben quedar dando vueltas dentro de lo que va a ser "lab" en producción.
        cur.execute(f"DROP TABLE IF EXISTS {SCHEMA_STAGING}._historial")
        cur.execute(f"DROP TABLE IF EXISTS {SCHEMA_STAGING}._meta")

        respaldo = f"{SCHEMA_PROD}_backup_{datetime.now(timezone.utc):%Y%m%d_%H%M%S}"
        cur.execute(f"ALTER SCHEMA {SCHEMA_PROD} RENAME TO {respaldo}")
        cur.execute(f"ALTER SCHEMA {SCHEMA_STAGING} RENAME TO {SCHEMA_PROD}")

    return {"ok": True, "respaldo": respaldo}
