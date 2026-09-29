"""
Historial de correcciones del Converter.

Cuando el Converter no reconoce un Sold To, Ship To, Especie o Variedad, la
persona elige a mano el valor oficial. Acá se guarda esa elección: la próxima
vez que llegue el mismo texto, el Converter la aplica solo. Además es lo que se
revisa en Auditoría interna.

Quién puede qué:
  - Leer las asociaciones (para que el Converter las aplique), guardar una
    corrección y contar un uso: cualquier cuenta interna (es lo que hace
    quien carga informes).
  - Ver el historial completo y olvidar una asociación: solo el admin general
    (es el módulo Administración General; si el sistema aprendió algo mal, hay
    que poder deshacerlo).

Una asociación jamás se aplica a ciegas: el Converter solo la usa si el valor
oficial sigue siendo válido para ESE informe (p. ej. la planta sigue existiendo
bajo el Sold To de ese informe).
"""
import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import Usuario, solo_admin_general, usuario_actual
from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/correcciones", tags=["correcciones"])

CAMPOS = ("sold_to", "ship_to", "especie", "variedad")


def normalizar(texto: str | None) -> str:
    """Misma idea que `plano()` del Converter: sin tildes, sin mayúsculas, con
    los espacios colapsados. Dos escrituras del mismo texto comparten clave."""
    t = unicodedata.normalize("NFKD", texto or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip().lower()


class CorreccionIn(BaseModel):
    campo: str
    contexto: str = ""
    valor_crudo: str
    valor_oficial: str
    archivo: str | None = None


class UsoIn(BaseModel):
    campo: str
    contexto: str = ""
    valor_crudo: str


def _validar(campo: str, contexto: str) -> str:
    if campo not in CAMPOS:
        raise HTTPException(400, f"Campo desconocido: {campo!r}")
    # Sold To y Especie no tienen contexto: si llega uno, se ignora para que
    # dos escrituras de la misma corrección no queden como asociaciones distintas.
    return contexto.strip() if campo in ("ship_to", "variedad") else ""


def _iso(v):
    return v.isoformat() if v is not None else None


@router.get("/alias")
def alias_para_el_converter(_: Usuario = Depends(usuario_actual)) -> list[dict]:
    """Todas las asociaciones guardadas, en lo mínimo que el Converter necesita."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT campo, contexto, valor_crudo, valor_oficial FROM correccion_converter")
        return cur.fetchall()


@router.post("")
def guardar_correccion(body: CorreccionIn, usuario: Usuario = Depends(usuario_actual)) -> dict:
    contexto = _validar(body.campo, body.contexto)
    crudo, oficial = body.valor_crudo.strip(), body.valor_oficial.strip()
    if not crudo or not oficial:
        raise HTTPException(400, "Faltan el valor original o el valor corregido.")
    if normalizar(crudo) == normalizar(oficial):
        raise HTTPException(400, "El valor original y el corregido son el mismo: no hay nada que recordar.")
    if body.campo in ("ship_to", "variedad") and not contexto:
        raise HTTPException(400, "Falta el Sold To (o la Especie): sin él la asociación no tiene sentido.")

    with conexion() as conn, cursor_dict(conn) as cur:
        # Solo se aprende hacia valores que existen: un typo en el destino
        # dejaría una asociación que apunta a la nada.
        if body.campo == "sold_to":
            cur.execute("SELECT 1 FROM cliente WHERE nombre = %s", (oficial,))
        elif body.campo == "ship_to":
            cur.execute(
                "SELECT 1 FROM planta p JOIN cliente c ON c.id = p.cliente_id WHERE p.nombre = %s AND c.nombre = %s",
                (oficial, contexto),
            )
        else:
            cur.execute("SELECT 1")
        if cur.fetchone() is None:
            raise HTTPException(400, f"«{oficial}» no existe en Listados{f' para {contexto}' if contexto else ''}.")

        cur.execute(
            """
            INSERT INTO correccion_converter
                (campo, contexto, contexto_norm, valor_crudo, valor_crudo_norm, valor_oficial,
                 archivo_origen, creado_por_email, creado_por_nombre, actualizado_por_nombre)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (campo, contexto_norm, valor_crudo_norm) DO UPDATE SET
                revisiones = correccion_converter.revisiones
                    + CASE WHEN correccion_converter.valor_oficial <> EXCLUDED.valor_oficial THEN 1 ELSE 0 END,
                valor_oficial = EXCLUDED.valor_oficial,
                archivo_origen = COALESCE(EXCLUDED.archivo_origen, correccion_converter.archivo_origen),
                actualizado_por_nombre = EXCLUDED.actualizado_por_nombre,
                actualizado_en = now()
            RETURNING id, campo, contexto, valor_crudo, valor_oficial, revisiones
            """,
            (body.campo, contexto, normalizar(contexto), crudo, normalizar(crudo), oficial,
             body.archivo, usuario.email, usuario.nombre, usuario.nombre),
        )
        return cur.fetchone()


@router.post("/usos")
def contar_usos(usos: list[UsoIn], _: Usuario = Depends(usuario_actual)) -> dict:
    """El Converter avisa cuántas veces aplicó solo una asociación (al subir)."""
    contados = 0
    with conexion() as conn, cursor_dict(conn) as cur:
        for u in usos[:500]:
            if u.campo not in CAMPOS:
                continue
            cur.execute(
                "UPDATE correccion_converter SET usos = usos + 1, ultimo_uso = now()"
                " WHERE campo = %s AND contexto_norm = %s AND valor_crudo_norm = %s",
                (u.campo, normalizar(u.contexto) if u.campo in ("ship_to", "variedad") else "", normalizar(u.valor_crudo)),
            )
            contados += cur.rowcount
    return {"contados": contados}


@router.get("")
def historial(_: Usuario = Depends(solo_admin_general)) -> list[dict]:
    """El historial completo, lo más reciente primero."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            """
            SELECT id, campo, contexto, valor_crudo, valor_oficial, archivo_origen,
                   creado_por_nombre, creado_por_email, creado_en,
                   actualizado_por_nombre, actualizado_en, usos, ultimo_uso, revisiones
            FROM correccion_converter
            ORDER BY actualizado_en DESC, id DESC
            """
        )
        filas = cur.fetchall()
    for f in filas:
        for k in ("creado_en", "actualizado_en", "ultimo_uso"):
            f[k] = _iso(f[k])
    return filas


@router.delete("/{correccion_id}")
def olvidar(correccion_id: int, _: Usuario = Depends(solo_admin_general)) -> dict:
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM correccion_converter WHERE id = %s RETURNING id", (correccion_id,))
        if cur.fetchone() is None:
            raise HTTPException(404, "Esa asociación ya no existe.")
    return {"ok": True}
