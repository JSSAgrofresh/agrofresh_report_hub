"""
El informe de cada solicitud de Toma de muestras, para el listado de
Solicitudes: cuáles ya tienen informe, su N° y el PDF para verlo en pantalla.

Una solicitud (OT-…) llega a su informe por dos caminos:

  1. `informe_auditoria`: el PDF que se subió por Converter con su OT elegida
     (`archivo_solicitud`; las más viejas solo traen `numero_solicitud`). Trae
     el N° de informe del laboratorio (Quiteca «2026-1885-PC», ALS…).
  2. Report (`solicitud`): los resultados cuya `referencia` es el OT. Así
     llegan los informes propios de AgroFresh («Subir a la base», un registro
     por vial) y los de laboratorio cuando el OT vino en el informe. Su PDF se
     busca como en la ficha de Report (`ficha_informe._buscar_pdf`).

No se adivina por parecido (fecha + planta): acá se muestra un N° de informe
al lado de una solicitud, y uno equivocado es peor que ninguno.

Solo personal interno, y un muestreador solo ve los informes de SUS
solicitudes (la misma regla del listado, `_es_propia`). Sin las migraciones
(0044 o la base de Report) devuelve lo que pueda: el listado nunca se cae por
esto.
"""
from __future__ import annotations

import logging
from typing import Any, Iterable

import psycopg2.errors
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from . import r2
from . import r2_auditoria as r2a
from .auditoria_interna import _exigir_r2, errores_r2
from .auth import Usuario, solo_interno
from .db import conexion, cursor_dict
from .ficha_informe import _buscar_pdf, _disposicion_inline, _solicitud

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/toma-muestras", tags=["toma-muestras"])


def _limpio(valor: Any) -> str:
    return str(valor or "").strip()


def asociar(
    solicitudes: Iterable[tuple[str, str]],
    auditoria: list[dict],
    report: list[dict],
) -> dict[str, dict]:
    """{archivo: informe} para las solicitudes (archivo, numero_solicitud) que
    tienen informe. Lógica pura: las filas ya vienen de la base.

    `auditoria`: filas de informe_auditoria (id, archivo_solicitud,
    numero_solicitud, nro_informe, nombre_archivo, subido_en).
    `report`: filas de solicitud (id, nro_solicitud, referencia).
    """
    aud_por_archivo: dict[str, dict] = {}
    aud_por_numero: dict[str, dict] = {}
    # La más reciente gana: las filas vienen ordenadas de la más vieja a la más nueva.
    for fila in auditoria:
        if _limpio(fila.get("archivo_solicitud")):
            aud_por_archivo[_limpio(fila["archivo_solicitud"])] = fila
        elif _limpio(fila.get("numero_solicitud")):
            aud_por_numero[_limpio(fila["numero_solicitud"]).upper()] = fila

    rep_por_ot: dict[str, list[dict]] = {}
    for fila in report:
        ot = _limpio(fila.get("referencia")).upper()
        if ot:
            rep_por_ot.setdefault(ot, []).append(fila)

    salida: dict[str, dict] = {}
    for archivo, numero in solicitudes:
        ot = _limpio(numero).upper()
        aud = aud_por_archivo.get(archivo) or (aud_por_numero.get(ot) if ot else None)
        rep = rep_por_ot.get(ot, []) if ot else []
        if aud is None and not rep:
            continue

        numeros: list[str] = []
        if aud is not None and _limpio(aud.get("nro_informe")):
            numeros.append(_limpio(aud["nro_informe"]))
        for fila in rep:
            n = _limpio(fila.get("nro_solicitud"))
            if n and n not in numeros:
                numeros.append(n)

        salida[archivo] = {
            "nro_informe": numeros[0] if numeros else None,
            "numeros": numeros,
            # Con PDF de Converter es seguro que hay PDF; solo con Report se
            # busca al abrirlo (puede no haber).
            "pdf_guardado": aud is not None,
            "en_report": bool(rep),
        }
    return salida


def _filas(cur, sql: str) -> list[dict]:
    """Una consulta que tolera que su tabla no exista todavía en el servidor."""
    try:
        cur.execute("SAVEPOINT informes_solicitud")
        cur.execute(sql)
        filas = cur.fetchall()
        cur.execute("RELEASE SAVEPOINT informes_solicitud")
        return filas
    except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
        cur.execute("ROLLBACK TO SAVEPOINT informes_solicitud")
        return []


_SQL_AUDITORIA = (
    "SELECT id, archivo_solicitud, numero_solicitud, nro_informe, nombre_archivo, r2_key, subido_en"
    " FROM informe_auditoria ORDER BY subido_en ASC, id ASC"
)
_SQL_REPORT = (
    "SELECT id, nro_solicitud, referencia FROM solicitud"
    " WHERE referencia IS NOT NULL AND btrim(referencia) <> '' ORDER BY id ASC"
)


def _solicitudes_visibles(usuario: Usuario) -> list[tuple[str, str]]:
    # Importado acá: toma_muestras es grande y no depende de este módulo.
    from .toma_muestras import _es_propia, leer_todas_las_solicitudes

    return [
        (nombre, _limpio(datos.get("numero_solicitud")))
        for nombre, datos in leer_todas_las_solicitudes()
        if _es_propia(usuario, datos)
    ]


@router.get("/solicitudes-informes")
def informes_de_solicitudes(usuario: Usuario = Depends(solo_interno)) -> dict[str, dict]:
    """{archivo: {nro_informe, numeros, pdf_guardado, en_report}} de las
    solicitudes visibles que ya tienen informe."""
    visibles = _solicitudes_visibles(usuario)
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        auditoria = _filas(cur, _SQL_AUDITORIA)
        report = _filas(cur, _SQL_REPORT)
    return asociar(visibles, auditoria, report)


@router.get("/solicitudes/{archivo}/informe/pdf")
def pdf_informe_de_solicitud(archivo: str, usuario: Usuario = Depends(solo_interno)) -> Response:
    visibles = dict(_solicitudes_visibles(usuario))
    if archivo not in visibles:
        raise HTTPException(404, "Solicitud no encontrada.")
    numero = visibles[archivo]

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        auditoria = _filas(cur, _SQL_AUDITORIA)
        report = _filas(cur, _SQL_REPORT)
        if archivo not in asociar([(archivo, numero)], auditoria, report):
            raise HTTPException(404, "Esta solicitud todavía no tiene informe.")

        # 1. El PDF que se subió por Converter con esta OT.
        aud = None
        for fila in auditoria:
            if _limpio(fila.get("archivo_solicitud")) == archivo or (
                not _limpio(fila.get("archivo_solicitud"))
                and numero and _limpio(fila.get("numero_solicitud")).upper() == numero.upper()
            ):
                aud = fila  # la más reciente queda al final
        pdf = {"origen": "auditoria", "nombre": aud["nombre_archivo"], "clave": aud["r2_key"]} if aud else None

        # 2. Si no, el de los resultados en Report (como la ficha de Report).
        if pdf is None:
            for fila in report:
                if _limpio(fila.get("referencia")).upper() != numero.upper():
                    continue
                sol = _solicitud(cur, fila["id"])
                pdf = _buscar_pdf(cur, sol) if sol else None
                if pdf:
                    break

    if pdf is None:
        raise HTTPException(404, "El informe está en Report, pero no tiene un PDF guardado.")
    if pdf["origen"] == "auditoria":
        _exigir_r2()
    with errores_r2():
        datos = r2a.descargar(pdf["clave"]) if pdf["origen"] == "auditoria" else r2.descargar(pdf["clave"])
    if datos is None:
        raise HTTPException(404, "El PDF ya no está en el almacenamiento.")
    return Response(
        content=datos,
        media_type="application/pdf",
        headers={"Content-Disposition": _disposicion_inline(pdf["nombre"]), "Cache-Control": "private, max-age=300"},
    )
