"""
El índice de solicitudes: dónde está cada una y qué dice, sin abrir R2.

R2 guarda el archivo —el Excel que la gente descarga— y eso está bien: es un
almacén de archivos y es lo que hace bien. Lo que no sabe hacer es responder
"¿cuántas hay?", "dame las de Agricom" o "dame el siguiente folio sin
repetir". Para eso hay que abrir todas las cajas, y eso es lo que hacía
`leer_todas_las_solicitudes()` en cada request.

Este módulo es el cuaderno: una fila por solicitud, con sus datos completos
en `datos` para que listar no toque R2 en absoluto. Se baja el archivo solo
cuando alguien pide ese documento en particular.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import psycopg2.errors
from psycopg2.extras import Json

from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

# Columnas que se extraen de `datos` para poder filtrar y ordenar con un
# índice. El resto vive en el jsonb.
_COLUMNAS = (
    "numero_solicitud", "laboratorio", "sold_to", "ship_to",
    "especie", "fecha_solicitud", "fecha_muestreo", "creado_en",
)
# Las que la tabla declara como DATE: un texto vacío no es una fecha, y
# psycopg2 lo mandaría tal cual y Postgres lo rechazaría.
_FECHAS = {"fecha_solicitud", "fecha_muestreo"}


def _valor(datos: dict, columna: str) -> Any:
    valor = datos.get(columna)
    if columna in _FECHAS and not (valor or "").strip():
        return None
    return valor


def guardar(cur, archivo: str, datos: dict, r2_key: str | None = None) -> None:
    """Anota (o vuelve a anotar) una solicitud en el índice.

    Es idempotente por `archivo`: volver a indexar la misma solicitud
    actualiza su fila en vez de duplicarla. Eso es lo que permite correr el
    script de indexación las veces que haga falta sin dejar basura.
    """
    columnas = ", ".join(_COLUMNAS)
    marcadores = ", ".join(["%s"] * len(_COLUMNAS))
    asignaciones = ", ".join(f"{c} = EXCLUDED.{c}" for c in _COLUMNAS)
    cur.execute(
        f"""
        INSERT INTO solicitud_archivo (archivo, r2_key, {columnas}, datos)
        VALUES (%s, %s, {marcadores}, %s)
        ON CONFLICT (archivo) DO UPDATE SET
            r2_key = EXCLUDED.r2_key, {asignaciones},
            datos = EXCLUDED.datos, indexado_en = now()
        """,
        (archivo, r2_key, *(_valor(datos, c) for c in _COLUMNAS), Json(datos)),
    )


def _fila_a_par(fila: dict) -> tuple[str, dict]:
    """(nombre_archivo, datos) — la misma forma que devolvía leer_todas_las_solicitudes,
    para que quien la consumía no tenga que cambiar.

    El código de muestra se suma acá y no vive en el jsonb: se asigna después
    de crear la solicitud y se puede corregir, así que es una columna propia
    -con su índice único- y no un campo enterrado en el documento.
    """
    datos = fila["datos"]
    datos = json.loads(datos) if isinstance(datos, str) else dict(datos)
    datos["codigo_muestra"] = fila.get("codigo_muestra")
    # El momento del cruce ES el momento en que la muestra llegó al mesón:
    # se escanea la solicitud, se escanea el tubo y se cruzan ahí mismo. Por
    # eso la recepción no se pregunta en ninguna parte, se lee de acá.
    cruzado_en = fila.get("cruzado_en")
    datos["recepcion_en"] = cruzado_en.isoformat() if cruzado_en else None
    # Peso de la muestra (obligatorio desde migración 0033)
    datos["peso_muestra"] = fila.get("peso_muestra")
    datos["unidad_peso"] = fila.get("unidad_peso") or "kg"
    datos["cruzado_por"] = fila.get("cruzado_por")
    datos["cruzado_por_nombre"] = fila.get("cruzado_por_nombre")
    return fila["archivo"], datos


_COLUMNAS_CRUCE = (
    "archivo", "datos", "codigo_muestra", "cruzado_en",
    "peso_muestra", "unidad_peso", "cruzado_por", "cruzado_por_nombre",
)
_SELECT_CRUCE = ", ".join(_COLUMNAS_CRUCE)


def listar(laboratorio: str | None = None) -> list[tuple[str, dict]]:
    """Todas las solicitudes, o las de un laboratorio. Una consulta, sin R2.

    El orden sale de la base y no de Python: `creado_en` tiene índice, así
    que ordenar 10 solicitudes cuesta lo mismo que ordenar 10.000.
    """
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        if laboratorio is None:
            cur.execute(
                f"SELECT {_SELECT_CRUCE} FROM solicitud_archivo"
                " ORDER BY creado_en DESC"
            )
        else:
            cur.execute(
                f"SELECT {_SELECT_CRUCE} FROM solicitud_archivo"
                " WHERE laboratorio = %s ORDER BY creado_en DESC",
                (laboratorio,),
            )
        return [_fila_a_par(f) for f in cur.fetchall()]


def buscar(archivo: str) -> dict | None:
    """Los datos de una solicitud, o None si no está indexada."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            f"SELECT {_SELECT_CRUCE} FROM solicitud_archivo WHERE archivo = %s",
            (archivo,),
        )
        fila = cur.fetchone()
        return _fila_a_par(fila)[1] if fila else None


def esta_poblado() -> bool:
    """¿Se puede usar el índice?

    False mientras esté vacío -o mientras la tabla ni siquiera exista-, y en
    ese caso los listados siguen leyendo los archivos como antes.

    Que la tabla falte no es un caso raro: pasa entre actualizar el código y
    correr la migración, que son dos pasos separados y en ese orden. Sin este
    `except`, esa ventana dejaba a todos con error 500 al abrir Toma de
    muestras. Se atrapa solo `UndefinedTable`: cualquier otro problema de base
    de datos tiene que salir a la luz, no quedar tapado detrás de una lectura
    silenciosa de R2.
    """
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT EXISTS (SELECT 1 FROM solicitud_archivo) AS hay")
            return bool(cur.fetchone()["hay"])
    except psycopg2.errors.UndefinedTable:
        return False


def olvidar(cur, archivo: str) -> None:
    """Saca una solicitud del índice, cuando se borró su archivo.

    Si quedara anotada, el listado seguiría mostrando una solicitud cuyo
    Excel ya no existe, y abrirla daría 404 sin explicación.
    """
    cur.execute("DELETE FROM solicitud_archivo WHERE archivo = %s", (archivo,))


def anotar(archivo: str, datos: dict, r2_key: str | None = None) -> None:
    """Guarda una solicitud recién creada, abriendo su propia conexión.

    Si el índice todavía no existe -código actualizado, migración sin
    correr-, no hace nada: el archivo ya quedó guardado, que es lo que
    importa, y la fila la va a poner `scripts/indexar_solicitudes.py` cuando
    se corra. Crear una solicitud no puede fallar por un índice que aún no
    está.
    """
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            guardar(cur, archivo, datos, r2_key)
    except psycopg2.errors.UndefinedTable:
        pass


def olvidar_archivo(archivo: str) -> None:
    """Saca del índice una solicitud borrada. Tolera que el índice no exista,
    por lo mismo que `anotar`."""
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            olvidar(cur, archivo)
    except psycopg2.errors.UndefinedTable:
        pass


class MuestraYaUsada(Exception):
    """Ese número de muestra ya está cruzado con otra solicitud."""

    def __init__(self, archivo: str):
        self.archivo = archivo
        super().__init__(f"El número de muestra ya está cruzado con {archivo}.")


def cruzar(archivo: str, codigo_muestra: str | None) -> None:
    """Deja anotado con qué muestra física corresponde una solicitud.

    `None` deshace el cruce. Un mismo número no puede quedar en dos
    solicitudes: un vial es un tubo, y si estuviera en dos, el resultado del
    GC no sabría a cuál de las dos pertenece.

    Este método se mantiene para compatibilidad con código existente y para
    el caso de deshacer un cruce (codigo_muestra=None). Para hacer un cruce
    nuevo completo (con foto y peso obligatorios) usar `cruzar_completo`.
    """
    codigo = (codigo_muestra or "").strip() or None
    with conexion() as conn, cursor_dict(conn) as cur:
        if codigo is not None:
            cur.execute(
                "SELECT archivo FROM solicitud_archivo WHERE codigo_muestra = %s AND archivo <> %s",
                (codigo, archivo),
            )
            fila = cur.fetchone()
            if fila:
                raise MuestraYaUsada(fila["archivo"])
        cur.execute(
            """
            UPDATE solicitud_archivo
            SET codigo_muestra = %s,
                cruzado_en = CASE WHEN %s IS NULL THEN NULL ELSE now() END,
                peso_muestra = CASE WHEN %s IS NULL THEN NULL ELSE peso_muestra END,
                cruzado_por = CASE WHEN %s IS NULL THEN NULL ELSE cruzado_por END,
                cruzado_por_nombre = CASE WHEN %s IS NULL THEN NULL ELSE cruzado_por_nombre END
            WHERE archivo = %s
            """,
            (codigo, codigo, codigo, codigo, codigo, archivo),
        )
        if cur.rowcount == 0:
            raise KeyError(archivo)


def cruzar_completo(
    archivo: str,
    codigo_muestra: str,
    peso_muestra: float,
    unidad_peso: str,
    r2_key_foto: str,
    content_type_foto: str,
    usuario_email: str,
    usuario_nombre: str,
    numero_solicitud: str | None = None,
    tipo_muestra: str | None = None,
    detalle_actividad: dict | None = None,
) -> None:
    """Cruza la solicitud con foto y peso obligatorios, y registra la actividad.

    Se ejecuta en una sola transacción: o todo entra o nada entra. La foto ya
    fue subida a R2 antes de llamar acá; si la transacción falla, la foto
    queda huérfana en R2 (aceptable: no hay inconsistencia en la base).
    """
    codigo = codigo_muestra.strip()
    if not codigo:
        raise ValueError("El código de muestra no puede estar vacío.")

    with conexion() as conn, cursor_dict(conn) as cur:
        # Unicidad: el mismo código de muestra no puede estar en dos solicitudes
        cur.execute(
            "SELECT archivo FROM solicitud_archivo WHERE codigo_muestra = %s AND archivo <> %s",
            (codigo, archivo),
        )
        fila = cur.fetchone()
        if fila:
            raise MuestraYaUsada(fila["archivo"])

        # Actualizar la solicitud con todos los datos del cruce
        cur.execute(
            """
            UPDATE solicitud_archivo
            SET codigo_muestra    = %s,
                cruzado_en        = now(),
                peso_muestra      = %s,
                unidad_peso       = %s,
                cruzado_por       = %s,
                cruzado_por_nombre = %s
            WHERE archivo = %s
            """,
            (codigo, peso_muestra, unidad_peso, usuario_email, usuario_nombre, archivo),
        )
        if cur.rowcount == 0:
            raise KeyError(archivo)

        # Desactivar foto anterior si la hay (el cruce se reemplazó)
        cur.execute(
            "UPDATE cruce_foto SET activa = false WHERE archivo = %s AND activa = true",
            (archivo,),
        )

        # Registrar la foto activa del cruce
        cur.execute(
            """
            INSERT INTO cruce_foto
                (archivo, r2_key, content_type, usuario_email, usuario_nombre, activa)
            VALUES (%s, %s, %s, %s, %s, true)
            """,
            (archivo, r2_key_foto, content_type_foto, usuario_email, usuario_nombre),
        )

        # Historial de actividad permanente
        cur.execute(
            """
            INSERT INTO lab_actividad
                (accion, archivo, numero_solicitud, codigo_muestra, tipo_muestra,
                 peso_muestra, unidad_peso, r2_key_foto,
                 usuario_email, usuario_nombre, detalle, resultado)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'ok')
            """,
            (
                "cruce",
                archivo,
                numero_solicitud,
                codigo,
                tipo_muestra,
                peso_muestra,
                unidad_peso,
                r2_key_foto,
                usuario_email,
                usuario_nombre,
                Json(detalle_actividad or {}),
            ),
        )


def registrar_actividad(
    accion: str,
    usuario_email: str,
    usuario_nombre: str,
    archivo: str | None = None,
    numero_solicitud: str | None = None,
    codigo_muestra: str | None = None,
    tipo_muestra: str | None = None,
    peso_muestra: float | None = None,
    unidad_peso: str | None = None,
    r2_key_foto: str | None = None,
    resultado: str = "ok",
    mensaje: str | None = None,
    detalle: dict | None = None,
) -> None:
    """Registra una acción en el historial de actividad del lab.

    Best-effort: una falla de BD acá no interrumpe el flujo principal.
    """
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                """
                INSERT INTO lab_actividad
                    (accion, archivo, numero_solicitud, codigo_muestra, tipo_muestra,
                     peso_muestra, unidad_peso, r2_key_foto,
                     usuario_email, usuario_nombre, detalle, resultado, mensaje)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    accion, archivo, numero_solicitud, codigo_muestra, tipo_muestra,
                    peso_muestra, unidad_peso, r2_key_foto,
                    usuario_email, usuario_nombre,
                    Json(detalle or {}), resultado, mensaje,
                ),
            )
    except Exception:
        logger.exception("No se pudo registrar actividad de lab (accion=%s, archivo=%s)", accion, archivo)


def listar_actividad(
    limite: int = 100,
    offset: int = 0,
    archivo: str | None = None,
    usuario_email: str | None = None,
) -> list[dict]:
    """Historial de actividad del lab, más reciente primero."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        condiciones = []
        params: list[Any] = []
        if archivo:
            condiciones.append("archivo = %s")
            params.append(archivo)
        if usuario_email:
            condiciones.append("usuario_email = %s")
            params.append(usuario_email)
        where = ("WHERE " + " AND ".join(condiciones)) if condiciones else ""
        params.extend([limite, offset])
        cur.execute(
            f"SELECT * FROM lab_actividad {where} ORDER BY creado_en DESC LIMIT %s OFFSET %s",
            params,
        )
        filas = cur.fetchall()
        resultado = []
        for f in filas:
            fila = dict(f)
            if fila.get("creado_en"):
                fila["creado_en"] = fila["creado_en"].isoformat()
            if fila.get("peso_muestra") is not None:
                fila["peso_muestra"] = float(fila["peso_muestra"])
            resultado.append(fila)
        return resultado


def foto_de_cruce(archivo: str) -> dict | None:
    """Datos de la foto activa del cruce, o None si no tiene."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT * FROM cruce_foto WHERE archivo = %s AND activa = true ORDER BY subida_en DESC LIMIT 1",
            (archivo,),
        )
        fila = cur.fetchone()
        if not fila:
            return None
        d = dict(fila)
        if d.get("subida_en"):
            d["subida_en"] = d["subida_en"].isoformat()
        return d
