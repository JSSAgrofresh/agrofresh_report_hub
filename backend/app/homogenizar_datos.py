"""
Homogenización de los datos ya cargados, desde Data Core.

Data Core corrige lo que viene entrando (`pendiente_revision`, antes de que
llegue a la base). Esto es lo otro: arreglar lo que YA está guardado, cuando
uno se da cuenta tarde de que "DOLE CHILE S.A", "Dole San Fernando" y "DOLE
CHILE SA" son el mismo cliente y hay que dejarlos con un solo nombre.

La operación es siempre la misma: se eligen varios valores y se dice a cuál
deben quedar todos. La diferencia está en qué significa "el valor" según el
campo:

- Especie, Variedad, Tipo de Servicio y Laboratorio son texto en `solicitud`.
  Homogenizarlos es reescribir esa columna.

- Sold To y Ship To se muestran como COALESCE(cliente.nombre, sold_to_raw):
  el nombre del catálogo gana sobre el texto crudo cuando la solicitud quedó
  enlazada a una planta. Por eso no basta con reescribir el texto -si hay
  enlace, no se vería el cambio-: también hay que reapuntar la solicitud al
  cliente/planta de destino, creándolo si no existía. Eso mantiene sano el
  modelo relacional en vez de dejar el enlace colgando.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/homogenizar", tags=["homogenizar"])

# Campo -> (etiqueta, columna de `solicitud`). Los dos primeros además tocan
# el catálogo; el resto es solo texto.
CAMPOS: dict[str, tuple[str, str]] = {
    "sold_to": ("Cliente (Sold To)", "sold_to_raw"),
    "ship_to": ("Sucursal (Ship To)", "ship_to_raw"),
    "especie": ("Especie", "especie"),
    "variedad": ("Variedad", "variedad"),
    "tipo_servicio": ("Tipo de Servicio", "tipo_servicio"),
    "laboratorio": ("Laboratorio", "laboratorio"),
}

# Cómo se calcula el valor que se muestra, igual que en el reporte.
_EXPR_VALOR = {
    "sold_to": "COALESCE(c.nombre, s.sold_to_raw)",
    "ship_to": "COALESCE(p.nombre, s.ship_to_raw)",
}

_JOINS = """
    LEFT JOIN planta p ON p.id = s.planta_id
    LEFT JOIN cliente c ON c.id = p.cliente_id
"""


def _validar(campo: str) -> tuple[str, str]:
    if campo not in CAMPOS:
        raise HTTPException(404, f"Campo '{campo}' no se puede homogenizar. Opciones: {', '.join(CAMPOS)}")
    return CAMPOS[campo]


def _expr(campo: str) -> str:
    return _EXPR_VALOR.get(campo, f"s.{CAMPOS[campo][1]}")


class ValorFila(BaseModel):
    valor: str
    filas: int


@router.get("/campos")
def listar_campos() -> list[dict[str, str]]:
    return [{"campo": c, "etiqueta": e} for c, (e, _) in CAMPOS.items()]


@router.get("/{campo}")
def listar_valores(campo: str, buscar: str = "") -> list[ValorFila]:
    """Valores distintos del campo con cuántas solicitudes usa cada uno.

    `buscar` filtra sin distinguir mayúsculas ni acentos, que es como uno
    busca de verdad: escribir "dole" tiene que encontrar "DOLE CHILE S.A.".
    """
    _validar(campo)
    expr = _expr(campo)
    filtro = ""
    params: list[Any] = []
    if buscar.strip():
        filtro = f"AND unaccent(lower({expr})) LIKE unaccent(lower(%s))"
        params.append(f"%{buscar.strip()}%")
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        # `unaccent` es una extensión y puede no estar instalada. Si falta, se
        # cae a una comparación sin acentos-insensibles antes que fallar.
        try:
            cur.execute(
                f"""
                SELECT {expr} AS valor, count(*) AS filas
                FROM solicitud s {_JOINS}
                WHERE s.vigente AND nullif(btrim({expr}), '') IS NOT NULL {filtro}
                GROUP BY 1 ORDER BY 2 DESC, 1
                """,
                params,
            )
        except Exception:
            conn.rollback()
            filtro_simple = f"AND lower({expr}) LIKE lower(%s)" if buscar.strip() else ""
            cur.execute(
                f"""
                SELECT {expr} AS valor, count(*) AS filas
                FROM solicitud s {_JOINS}
                WHERE s.vigente AND nullif(btrim({expr}), '') IS NOT NULL {filtro_simple}
                GROUP BY 1 ORDER BY 2 DESC, 1
                """,
                params,
            )
        return [ValorFila(valor=f["valor"], filas=f["filas"]) for f in cur.fetchall()]


class HomogenizarIn(BaseModel):
    # Valores tal como se muestran hoy; todos pasarán a llamarse `destino`.
    valores: list[str] = Field(min_length=1)
    destino: str = Field(min_length=1)


def _cliente_id(cur, nombre: str) -> int:
    cur.execute("SELECT id FROM cliente WHERE nombre = %s", (nombre,))
    fila = cur.fetchone()
    if fila:
        return fila["id"]
    cur.execute("INSERT INTO cliente (nombre) VALUES (%s) RETURNING id", (nombre,))
    return cur.fetchone()["id"]


def _planta_id(cur, cliente_id: int, nombre: str) -> int:
    cur.execute("SELECT id FROM planta WHERE cliente_id = %s AND nombre = %s", (cliente_id, nombre))
    fila = cur.fetchone()
    if fila:
        return fila["id"]
    cur.execute("INSERT INTO planta (cliente_id, nombre) VALUES (%s, %s) RETURNING id", (cliente_id, nombre))
    return cur.fetchone()["id"]


@router.post("/{campo}")
def homogenizar(campo: str, body: HomogenizarIn) -> dict[str, Any]:
    """Deja todas las solicitudes que hoy muestran cualquiera de `valores`
    mostrando `destino`. Devuelve cuántas cambiaron."""
    _etiqueta, columna = _validar(campo)
    destino = body.destino.strip()
    if not destino:
        raise HTTPException(400, "El valor de destino no puede estar vacío.")
    # Un valor que ya es el destino no es un cambio; sacarlo evita reportar
    # como "actualizadas" filas que quedaron igual.
    origenes = [v for v in dict.fromkeys(v.strip() for v in body.valores if v.strip()) if v != destino]
    if not origenes:
        return {"actualizadas": 0, "destino": destino}

    expr = _expr(campo)
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        if campo == "sold_to":
            # El cliente de destino manda: las solicitudes se reapuntan a él.
            # Su planta se recrea con el mismo nombre bajo el cliente nuevo
            # para no perder la sucursal al cambiar de dueño.
            cur.execute(
                f"""
                SELECT s.id, COALESCE(p.nombre, s.ship_to_raw) AS sucursal
                FROM solicitud s {_JOINS}
                WHERE s.vigente AND {expr} = ANY(%s)
                """,
                (origenes,),
            )
            afectadas = cur.fetchall()
            if not afectadas:
                return {"actualizadas": 0, "destino": destino}
            nuevo_cliente = _cliente_id(cur, destino)
            plantas: dict[str, int] = {}
            for fila in afectadas:
                sucursal = (fila["sucursal"] or "").strip()
                planta = None
                if sucursal:
                    if sucursal not in plantas:
                        plantas[sucursal] = _planta_id(cur, nuevo_cliente, sucursal)
                    planta = plantas[sucursal]
                cur.execute(
                    "UPDATE solicitud SET sold_to_raw = %s, planta_id = %s WHERE id = %s",
                    (destino, planta, fila["id"]),
                )
            return {"actualizadas": len(afectadas), "destino": destino}

        if campo == "ship_to":
            # La sucursal solo identifica dentro de su cliente, así que cada
            # solicitud se reapunta a una planta con el nombre de destino bajo
            # SU PROPIO cliente, no bajo uno compartido.
            cur.execute(
                f"""
                SELECT s.id, p.cliente_id
                FROM solicitud s {_JOINS}
                WHERE s.vigente AND {expr} = ANY(%s)
                """,
                (origenes,),
            )
            afectadas = cur.fetchall()
            if not afectadas:
                return {"actualizadas": 0, "destino": destino}
            plantas: dict[int, int] = {}
            for fila in afectadas:
                cliente_id = fila["cliente_id"]
                planta = None
                if cliente_id is not None:
                    if cliente_id not in plantas:
                        plantas[cliente_id] = _planta_id(cur, cliente_id, destino)
                    planta = plantas[cliente_id]
                cur.execute(
                    "UPDATE solicitud SET ship_to_raw = %s, planta_id = %s WHERE id = %s",
                    (destino, planta, fila["id"]),
                )
            return {"actualizadas": len(afectadas), "destino": destino}

        cur.execute(
            f"UPDATE solicitud SET {columna} = %s WHERE vigente AND {columna} = ANY(%s)",
            (destino, origenes),
        )
        return {"actualizadas": cur.rowcount, "destino": destino}
