"""
Auditoría de la base de datos ya cargada (a diferencia de ingest.py, que valida
un archivo ANTES de insertarlo): detecta inconsistencias de homogenización
-mismo valor real escrito de más de una forma- para revisar y corregir desde
el módulo DataCore.
"""
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/auditoria", tags=["auditoria"])

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


@router.get("/tablas")
def listar_tablas() -> list[dict[str, Any]]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        salida = []
        for nombre, columnas in TABLAS.items():
            cur.execute(f"SELECT count(*) AS total FROM {nombre}")
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
        cur.execute(f"SELECT {', '.join(columnas)} FROM {nombre} ORDER BY id DESC LIMIT %s OFFSET %s", (tamano, offset))
        filas = cur.fetchall()
        cur.execute(f"SELECT count(*) AS total FROM {nombre}")
        total = cur.fetchone()["total"]
    return {"filas": filas, "total": total, "pagina": pagina, "tamano": tamano, "columnas": columnas}


@router.get("/inconsistencias")
def auditar() -> dict[str, Any]:
    """Primera pasada de auditoría: variantes de un mismo valor por mayúsculas
    o espacios distintos dentro de un mismo campo. No compara todavía contra
    el catálogo real de Sold To / Ship To (pendiente: falta esa lista de
    referencia) — eso será una segunda regla, aparte de esta."""
    grupos: list[dict[str, Any]] = []
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        for tabla, campo, etiqueta in CAMPOS_HOMOGENIZAR:
            cur.execute(
                f"""
                SELECT lower(trim({campo})) AS clave,
                       array_agg(DISTINCT {campo} ORDER BY {campo}) AS variantes,
                       count(*) AS filas
                FROM {tabla}
                WHERE {campo} IS NOT NULL AND trim({campo}) <> ''
                GROUP BY lower(trim({campo}))
                HAVING count(DISTINCT {campo}) > 1
                ORDER BY count(*) DESC
                """
            )
            for fila in cur.fetchall():
                grupos.append(
                    {
                        "regla": "homogenizacion",
                        "tabla": tabla,
                        "campo": campo,
                        "etiqueta": etiqueta,
                        "clave": fila["clave"],
                        "variantes": fila["variantes"],
                        "filas": fila["filas"],
                    }
                )

    total_filas_afectadas = sum(g["filas"] for g in grupos)
    return {
        "total_inconsistencias": len(grupos),
        "total_filas_afectadas": total_filas_afectadas,
        "grupos": sorted(grupos, key=lambda g: g["filas"], reverse=True),
    }
