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
    informes_en_report: set[str] | None = None,
) -> dict[str, dict]:
    """{archivo: informe} para las solicitudes (archivo, numero_solicitud) que
    tienen informe. Lógica pura: las filas ya vienen de la base.

    `auditoria`: filas de informe_auditoria (id, archivo_solicitud,
    numero_solicitud, nro_informe, nombre_archivo, subido_en).
    `report`: filas de solicitud (id, nro_solicitud, referencia).
    `informes_en_report`: los N° de informe (en mayúsculas) que ya están en
    Report como `solicitud.nro_solicitud`. Es como Quiteca llega a Report: con
    SU N° de informe y, en los informes viejos, sin el OT en `referencia`.
    Auditoría interna usa la misma regla.
    """
    informes_en_report = informes_en_report or set()
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
            "en_report": bool(rep) or (
                aud is not None and _limpio(aud.get("nro_informe")).upper() in informes_en_report
            ),
        }
    return salida


def _comparable(valor: Any) -> str:
    """Para comparar planta, especie y fecha: sin tildes, mayúsculas ni espacios de más."""
    import unicodedata

    t = unicodedata.normalize("NFKD", _limpio(valor)).encode("ascii", "ignore").decode()
    return " ".join(t.upper().split())


def verificar(ot: str, datos_ot: dict, numeros: list[str], report_por_nro: dict[str, list[dict]]) -> dict:
    """¿Está bien cruzado el informe con ESTA OT? El informe trae su OT impresa
    («N° Solicitud: OT-…» en Quiteca; el OT de origen en los de AgroFresh) y
    queda en Report como `referencia`. Además planta, especie y fecha de
    muestreo del informe tienen que ser las de la OT.

    Devuelve {estado, motivos}:
      «confirmada»    el informe dice esta OT y todo calza.
      «revisar»       el informe dice OTRA OT, o no calza planta/especie/fecha.
      «sin_confirmar» el informe no trae OT (o aún no está en Report): no se
                      puede comprobar, quedó por la elección en Converter.
    """
    motivos_revisar: list[str] = []
    motivos_sin: list[str] = []
    for n in numeros:
        filas = report_por_nro.get(_limpio(n).upper(), [])
        if not filas:
            motivos_sin.append(f"{n}: aún sin resultados en Report para comprobar la OT")
            continue
        refs = {_limpio(f.get("referencia")).upper() for f in filas} - {""}
        if _limpio(ot).upper() not in refs:
            if refs:
                motivos_revisar.append(f"{n}: el informe dice {', '.join(sorted(refs))}")
            else:
                motivos_sin.append(f"{n}: el informe no trae la OT")
        f = filas[0]
        for campo_ot, campo_inf, nombre in (("ship_to", "planta", "planta"), ("especie", "especie", "especie")):
            a, b = _comparable(datos_ot.get(campo_ot)), _comparable(f.get(campo_inf))
            if a and b and a != b:
                motivos_revisar.append(f"{n}: {nombre} distinta ({f.get(campo_inf)})")
        fa, fb = _limpio(datos_ot.get("fecha_muestreo"))[:10], _limpio(f.get("fecha_muestreo"))[:10]
        if fa and fb and fa != fb:
            motivos_revisar.append(f"{n}: fecha de muestreo distinta ({fb})")
    if motivos_revisar:
        return {"estado": "revisar", "motivos": motivos_revisar + motivos_sin}
    if motivos_sin:
        return {"estado": "sin_confirmar", "motivos": motivos_sin}
    return {"estado": "confirmada", "motivos": []}


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
    "SELECT id, archivo_solicitud, numero_solicitud, nro_informe, nombre_archivo, r2_key, subido_en, laboratorio"
    " FROM informe_auditoria ORDER BY subido_en ASC, id ASC"
)
# Los N° de informe de Converter que ya tienen resultados en Report.
_SQL_INFORMES_EN_REPORT = (
    "SELECT DISTINCT upper(btrim(i.nro_informe)) AS nro FROM informe_auditoria i"
    " JOIN solicitud s ON upper(btrim(s.nro_solicitud)) = upper(btrim(i.nro_informe))"
    " WHERE i.nro_informe IS NOT NULL"
)
# Lo que dice cada informe en Report (su OT impresa y su planta, especie y
# fecha), para comprobar el cruce. Solo los informes que tienen algo que ver
# con una OT: los de Converter y los que traen referencia.
_SQL_REPORT_DETALLE = (
    "SELECT s.nro_solicitud, s.referencia, s.especie, s.fecha_muestreo,"
    " COALESCE(p.nombre, s.ship_to_raw) AS planta"
    " FROM solicitud s LEFT JOIN planta p ON p.id = s.planta_id"
    " WHERE (s.referencia IS NOT NULL AND btrim(s.referencia) <> '')"
    " OR upper(btrim(s.nro_solicitud)) IN"
    " (SELECT upper(btrim(nro_informe)) FROM informe_auditoria WHERE nro_informe IS NOT NULL)"
)
_SQL_REPORT = (
    "SELECT id, nro_solicitud, referencia FROM solicitud"
    " WHERE referencia IS NOT NULL AND btrim(referencia) <> '' ORDER BY id ASC"
)


def _solicitudes_visibles_datos(usuario: Usuario) -> list[tuple[str, str, dict]]:
    # Importado acá: toma_muestras es grande y no depende de este módulo.
    from .toma_muestras import _es_propia, leer_todas_las_solicitudes

    return [
        (nombre, _limpio(datos.get("numero_solicitud")), datos)
        for nombre, datos in leer_todas_las_solicitudes()
        if _es_propia(usuario, datos)
    ]


def _solicitudes_visibles(usuario: Usuario) -> list[tuple[str, str]]:
    return [(a, n) for a, n, _ in _solicitudes_visibles_datos(usuario)]


@router.get("/solicitudes-informes")
def informes_de_solicitudes(usuario: Usuario = Depends(solo_interno)) -> dict[str, dict]:
    """{archivo: {nro_informe, numeros, pdf_guardado, en_report, verificacion}}
    de las solicitudes visibles que ya tienen informe."""
    visibles = _solicitudes_visibles_datos(usuario)
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        auditoria = _filas(cur, _SQL_AUDITORIA)
        report = _filas(cur, _SQL_REPORT)
        en_report = {f["nro"] for f in _filas(cur, _SQL_INFORMES_EN_REPORT)}
        detalle = _filas(cur, _SQL_REPORT_DETALLE)
    salida = asociar([(a, n) for a, n, _ in visibles], auditoria, report, en_report)
    # ¿Cada informe está bien cruzado con su OT? (lo que dice el propio informe)
    por_nro: dict[str, list[dict]] = {}
    for f in detalle:
        por_nro.setdefault(_limpio(f.get("nro_solicitud")).upper(), []).append(f)
    for archivo, numero, datos in visibles:
        if archivo in salida:
            salida[archivo]["verificacion"] = verificar(numero, datos, salida[archivo]["numeros"], por_nro)
    return salida


def _ubicar_pdf(cur, archivo: str, numero: str, auditoria: list[dict], report: list[dict]) -> dict | None:
    """Dónde está el PDF del informe de una solicitud: {origen, nombre, clave}."""
    # 1. El PDF que se subió por Converter con esta OT (la más reciente queda al final).
    aud = None
    for fila in auditoria:
        if _limpio(fila.get("archivo_solicitud")) == archivo or (
            not _limpio(fila.get("archivo_solicitud"))
            and numero and _limpio(fila.get("numero_solicitud")).upper() == numero.upper()
        ):
            aud = fila
    if aud:
        return {"origen": "auditoria", "nombre": aud["nombre_archivo"], "clave": aud["r2_key"]}
    # 2. Si no, el de los resultados en Report (como la ficha de Report).
    for fila in report:
        if not numero or _limpio(fila.get("referencia")).upper() != numero.upper():
            continue
        sol = _solicitud(cur, fila["id"])
        pdf = _buscar_pdf(cur, sol) if sol else None
        if pdf:
            return pdf
    return None


def _bajar_pdf(pdf: dict) -> bytes | None:
    if pdf["origen"] == "auditoria":
        return r2a.descargar(pdf["clave"]) if r2a.disponible() else None
    return r2.descargar(pdf["clave"])


def nombre_en_zip(numero: str, nro_informe: str | None, nombre_original: str) -> str:
    """«OT-QUI0047 - Informe 2026-1885-PC.pdf»: se reconoce de qué solicitud es."""
    seguro = lambda t: "".join("_" if c in '<>:"/\\|?*' else c for c in t).strip()  # noqa: E731
    base = seguro(numero) or "solicitud"
    if nro_informe:
        return f"{base} - Informe {seguro(nro_informe)}.pdf"
    return f"{base} - {seguro(nombre_original) or 'informe.pdf'}"


def informes_para_zip(pares: list[tuple[str, str]]) -> list[tuple[str, bytes]]:
    """Los PDF de informe de estas solicitudes (archivo, N° OT), como
    (nombre dentro del zip, bytes). Las que no tienen informe o cuyo PDF no
    está guardado se saltan. Nunca lanza: si la base o R2 fallan, el zip sale
    igual, solo con las solicitudes."""
    salida: list[tuple[str, bytes]] = []
    usados: set[str] = set()
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            auditoria = _filas(cur, _SQL_AUDITORIA)
            report = _filas(cur, _SQL_REPORT)
            asociados = asociar(pares, auditoria, report)
            for archivo, numero in pares:
                info = asociados.get(archivo)
                if not info:
                    continue
                try:
                    pdf = _ubicar_pdf(cur, archivo, numero, auditoria, report)
                    datos = _bajar_pdf(pdf) if pdf else None
                except Exception:
                    logger.exception("No se pudo bajar el informe de %s para el zip", archivo)
                    continue
                if not datos:
                    continue
                nombre = nombre_en_zip(numero, info.get("nro_informe"), pdf["nombre"])
                n = 2
                while nombre.lower() in usados:
                    nombre = nombre[:-4] + f" ({n}).pdf"
                    n += 1
                usados.add(nombre.lower())
                salida.append((nombre, datos))
    except Exception:
        logger.exception("No se pudieron agregar los informes al zip")
    return salida


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

        pdf = _ubicar_pdf(cur, archivo, numero, auditoria, report)

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
