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
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
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
        "planta_id", "semana_muestreo", "mes", "temporada", "vigente",
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
    "producto_aplicado", "analito_limite", "equipo_accutab", "lectura_accutab",
]
FKS_CLON = [
    ("planta", "cliente_id", "cliente", "id", "RESTRICT"),
    ("solicitud", "planta_id", "planta", "id", "RESTRICT"),
    ("resultado", "solicitud_id", "solicitud", "id", "CASCADE"),
    ("resultado", "analito_id", "analito", "id", "RESTRICT"),
    ("producto_aplicado", "solicitud_id", "solicitud", "id", "RESTRICT"),
    ("producto_aplicado", "analito_id", "analito", "id", "RESTRICT"),
    ("analito_limite", "analito_id", "analito", "id", "CASCADE"),
    ("equipo_accutab", "planta_id", "planta", "id", "RESTRICT"),
    ("lectura_accutab", "equipo_id", "equipo_accutab", "id", "RESTRICT"),
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


def _schema_activo(cur) -> str:
    """lab_staging si existe una copia de trabajo en curso; si no, lab (solo lectura)."""
    cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA_STAGING,))
    return SCHEMA_STAGING if cur.fetchone() else SCHEMA_PROD


class CorregirGrupoIn(BaseModel):
    tabla: str
    campo: str
    clave: str
    valor: str


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


@router.post("/corregir")
def corregir_grupo(payload: CorregirGrupoIn) -> dict[str, Any]:
    """Reescribe todas las variantes de un grupo de inconsistencia al valor
    elegido. Siempre sobre lab_staging: si no existe copia de trabajo, no se
    puede corregir nada (para eso está /staging/crear)."""
    if payload.tabla not in CAMPOS_HOMOGENIZAR_POR_TABLA or payload.campo not in CAMPOS_HOMOGENIZAR_POR_TABLA[payload.tabla]:
        raise HTTPException(status_code=400, detail="Campo no reconocido para corrección de homogenización")

    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA_STAGING,))
        if not cur.fetchone():
            raise HTTPException(
                status_code=400,
                detail="No hay una copia de trabajo activa. Crea una desde 'Crear copia de trabajo' antes de corregir.",
            )
        cur.execute(
            f"""
            UPDATE {SCHEMA_STAGING}.{payload.tabla}
            SET {payload.campo} = %s
            WHERE lower(trim({payload.campo})) = %s AND {payload.campo} IS DISTINCT FROM %s
            """,
            (payload.valor, payload.clave, payload.valor),
        )
        filas_actualizadas = cur.rowcount

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        auditoria = _auditar(cur, SCHEMA_STAGING)

    return {"filas_actualizadas": filas_actualizadas, "auditoria": auditoria}


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

        respaldo = f"{SCHEMA_PROD}_backup_{datetime.now(timezone.utc):%Y%m%d_%H%M%S}"
        cur.execute(f"ALTER SCHEMA {SCHEMA_PROD} RENAME TO {respaldo}")
        cur.execute(f"ALTER SCHEMA {SCHEMA_STAGING} RENAME TO {SCHEMA_PROD}")

    return {"ok": True, "respaldo": respaldo}
