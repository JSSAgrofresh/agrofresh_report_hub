"""
«Aceptar» un informe de la bandeja de Ingreso de Informes (etapa 2).

Aceptar es la ÚNICA puerta por la que un informe que llegó por correo entra a la base de resultados, y hace
exactamente lo mismo que hace el Converter con un PDF de Quiteca:

  1. lee el PDF con el mismo lector (`quiteca_lectura`, port literal del `leerQuiteca` del Converter);
  2. revisa contra Listados (`ingest.preview`): si el Sold To, Ship To, especie o variedad no calzan, NO carga
     nada y dice qué falta (el Converter los deja en «Filas pendientes»; acá se prefiere frenar y que alguien decida);
  3. carga la fila (`ingest.confirmar`: queda su carga registrada, con «Deshacer», origen «correo»);
  4. guarda el PDF en Storage → Informes y en las carpetas de auditoría (`auditoria_interna.subir_informe`), con la
     fecha en que el informe llegó al correo como su fecha de envío;
  5. marca la solicitud como «enviada al cliente» con esa misma fecha, salvo que el correo haya salido a quien no
     correspondía (rojo): ese informe NO llegó a su cliente y no se marca hasta que llegue la copia correcta.

Un informe que ya estaba en el sistema (los de AgroFresh, y lo cargado antes con el Converter) NO se vuelve a cargar:
«Aceptar» solo lo marca como revisado y, si todavía no tenía un envío al cliente anotado, anota el de este correo.
Nunca pisa una fecha de envío que ya existía.
"""
from __future__ import annotations

import asyncio
import io
import logging
from datetime import datetime
from typing import Any

from fastapi import HTTPException, UploadFile

from . import correo_informes_homogeneo as homogeneo, ingest, quiteca_lectura
from .auth import Usuario
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)


def _409(texto: str) -> HTTPException:
    return HTTPException(409, texto)


def _envio_ya_anotado(cur, archivo: str) -> bool:
    """¿Esta solicitud ya tiene un envío al cliente anotado (a mano o por «Envío de informes» en producción)?"""
    for sql in (
        "SELECT 1 FROM envio_cliente_manual WHERE archivo = %s LIMIT 1",
        "SELECT 1 FROM envio_informe_log WHERE archivo_solicitud = %s AND modo = 'produccion' AND exitoso LIMIT 1",
    ):
        try:
            cur.execute("SAVEPOINT envio_previo")
            cur.execute(sql, (archivo,))
            hay = cur.fetchone() is not None
            cur.execute("RELEASE SAVEPOINT envio_previo")
        except Exception:  # noqa: BLE001 — falta una tabla: se sigue con la otra fuente
            cur.execute("ROLLBACK TO SAVEPOINT envio_previo")
            continue
        if hay:
            return True
    return False


def _marcar_enviado(archivo: str | None, estado: str, llegada: datetime | None, usuario: Usuario) -> str:
    """Anota «enviado al cliente» con la fecha en que el informe llegó al correo. Devuelve qué pasó, para el aviso."""
    if not archivo:
        return "sin_solicitud"
    if estado == "rojo":
        return "salio_mal"
    from . import envio_cliente

    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            if _envio_ya_anotado(cur, archivo):
                return "ya_tenia"
            envio_cliente.marcar(cur, [archivo], usuario, "correo", llegada)
        return "marcado"
    except Exception:  # noqa: BLE001 — falta la migración 0058: el informe igual se acepta
        logger.exception("No se pudo marcar %s como enviado al cliente", archivo)
        return "sin_tabla"


def _guardar_pdf(datos: bytes, nombre: str, fila: dict, lectura: dict, usuario: Usuario, llegada: datetime | None,
                 enviado_cliente: bool) -> dict[str, Any]:
    """El mismo guardado del Converter: Storage → Informes y carpetas de auditoría."""
    from . import auditoria_interna

    d = lectura["datos"]
    archivo = UploadFile(file=io.BytesIO(datos), filename=nombre)
    return asyncio.run(auditoria_interna.subir_informe(
        archivo=archivo,
        laboratorio=d.get("Laboratorio") or fila["laboratorio"] or "",
        ship_to=d.get("Ship To") or fila.get("ship_to") or "",
        sold_to=d.get("Sold To") or fila.get("sold_to") or "",
        nro_informe=d.get("N° Solicitud") or fila.get("nro_informe") or "",
        archivo_solicitud=fila.get("archivo_solicitud") or "",
        ot_informe=d.get("OT") or fila.get("ot") or "",
        fecha_envio=llegada.isoformat() if llegada else "",
        fecha=quiteca_lectura.a_iso(d.get("Fecha Muestreo")) or "",
        analisis=d.get("Tipo de servicio") or "",
        enviado_cliente="1" if enviado_cliente else "",
        usuario=usuario,
    ))


def aceptar(informe_id: int, usuario: Usuario, correcciones: dict[str, str] | None = None) -> dict[str, Any]:
    """Acepta un informe de la bandeja. Lanza 404/409 con el motivo si no se puede; si se pudo, devuelve el resumen."""
    from . import correo_informes, r2

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT id, laboratorio, soportado, nro_informe, ot, sold_to, ship_to, estado, decision, r2_key, pdf_nombre,"
            " llegada_en, archivo_solicitud FROM correo_informe WHERE id = %s", (informe_id,))
        fila = cur.fetchone()
    if not fila:
        raise HTTPException(404, "Ese informe no está en la bandeja.")
    if fila["decision"] == "aceptado":
        raise _409("Este informe ya estaba aceptado.")
    if fila["decision"] == "rechazado":
        raise _409("Este informe está rechazado: vuelve a pendiente antes de aceptarlo.")

    avisos: list[str] = []
    ya_cargado = correo_informes._ya_cargado({"nro_informe": fila["nro_informe"], "ot": fila["ot"]})
    carga_id: int | None = None
    pdf_guardado = False

    if ya_cargado:
        resultado = "revisado"
    else:
        if fila["laboratorio"] != "Quiteca":
            if fila["laboratorio"] == "AgroFresh":
                raise _409("Este informe de AgroFresh no está cargado en el sistema: se carga desde Ingreso al laboratorio.")
            raise _409(f"Todavía no hay carga automática para {fila['laboratorio'] or 'este laboratorio'}: usa el Converter.")
        if not fila["r2_key"]:
            raise _409("El PDF de este informe no se guardó: no se puede leer.")
        datos_pdf = r2.descargar(fila["r2_key"])
        if datos_pdf is None:
            raise _409("El PDF ya no está en el almacenamiento.")
        listo = homogeneo.preparar(datos_pdf, correcciones)
        lectura, faltan = listo["lectura"], [m for m in listo["motivos"] if m.startswith("Falta: ")]
        if faltan:
            raise _409("Al informe le falta información para cargarlo: " + "; ".join(faltan) + ". Cárgalo con el Converter.")
        if lectura["sueltos"]:
            nombres = ", ".join(n for n, _ in lectura["sueltos"])
            raise _409(f"El informe trae analitos que el sistema no conoce ({nombres}). Cárgalo con el Converter para decidir qué hacer con ellos.")
        if listo["motivos"]:
            raise _409("Hay que homogeneizar el informe antes de cargarlo: " + "; ".join(listo["motivos"][:4]))
        carga = ingest.CargaRequest(filas=[listo["fila"]], origen="correo", archivo=fila["pdf_nombre"])
        previa = listo["previa"]
        if any(d.get("ya_existia") for d in previa["detalle"]):
            ya_cargado = True          # alguien lo cargó entre la llegada y ahora: solo se marca revisado
            resultado = "revisado"
        else:
            hecho = ingest.confirmar(carga, usuario)
            carga_id = hecho.get("carga_id")
            if correcciones:
                homogeneo.aprender(correcciones, listo["leidos"], listo["campos"], fila["pdf_nombre"], usuario)
            resultado = "cargado"
            avisos += [a for a in lectura["avisos"] if a not in faltan]
            try:
                _guardar_pdf(datos_pdf, fila["pdf_nombre"], fila, lectura, usuario, fila["llegada_en"], fila["estado"] != "rojo")
                pdf_guardado = True
            except Exception as exc:  # noqa: BLE001 — los resultados ya están cargados: se avisa y no se deshace
                logger.exception("No se pudo guardar el PDF de %s", fila["nro_informe"])
                avisos.append(f"Los resultados se cargaron, pero no se pudo guardar el PDF en Informes y auditoría: {exc}")

    envio = "ya_tenia"
    if resultado == "revisado" or not pdf_guardado:
        envio = _marcar_enviado(fila["archivo_solicitud"], fila["estado"], fila["llegada_en"], usuario)
    elif fila["estado"] == "rojo":
        envio = "salio_mal"
    else:
        envio = "marcado" if fila["archivo_solicitud"] else "sin_solicitud"
    if envio == "salio_mal":
        avisos.append("El correo de este informe salió a destinatarios incorrectos: NO se marcó como enviado al cliente. "
                      "Se marcará cuando acepte la copia que llegue bien.")
    if envio == "sin_solicitud":
        avisos.append("El informe no está amarrado a una solicitud: no se pudo anotar su envío al cliente.")

    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "UPDATE correo_informe SET decision = 'aceptado', decidido_en = now(), decidido_por = %s, carga_id = %s,"
            " ya_cargado = TRUE WHERE id = %s", (usuario.email, carga_id, informe_id))
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("UPDATE correo_informe SET homogeneo = TRUE WHERE id = %s", (informe_id,))
    except Exception:  # noqa: BLE001 — falta la 0067: no es lo esencial
        pass
    return {"id": informe_id, "resultado": resultado, "carga_id": carga_id, "envio_al_cliente": envio, "avisos": avisos}


def aceptar_varios(ids: list[int], usuario: Usuario) -> dict[str, Any]:
    """Acepta uno por uno: si uno no se puede, los demás igual se aceptan y ese vuelve con su motivo."""
    aceptados: list[dict[str, Any]] = []
    errores: list[dict[str, Any]] = []
    for i in ids:
        try:
            aceptados.append(aceptar(i, usuario))
        except HTTPException as exc:
            errores.append({"id": i, "motivo": exc.detail})
        except Exception as exc:  # noqa: BLE001 — un informe malo no frena a los demás
            logger.exception("No se pudo aceptar el informe %s", i)
            errores.append({"id": i, "motivo": f"Error inesperado: {exc}"})
    return {"aceptados": aceptados, "errores": errores}


def deshacer(informe_id: int, usuario: Usuario) -> dict[str, Any]:
    """Deshace la aceptación: si el informe se cargó por «Aceptar», borra esa carga (la misma que «Deshacer» del
    historial de cargas) y vuelve a pendiente. Un informe que solo se marcó revisado vuelve a pendiente sin tocar la base."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT id, decision, carga_id FROM correo_informe WHERE id = %s", (informe_id,))
        fila = cur.fetchone()
    if not fila:
        raise HTTPException(404, "Ese informe no está en la bandeja.")
    if fila["decision"] != "aceptado":
        raise _409("Este informe no está aceptado.")
    if fila["carga_id"]:
        ingest.deshacer_carga(fila["carga_id"], usuario)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "UPDATE correo_informe SET decision = 'pendiente', decidido_en = NULL, decidido_por = NULL, carga_id = NULL,"
            " ya_cargado = EXISTS (SELECT 1 FROM informe_auditoria i WHERE i.nro_informe = correo_informe.nro_informe) WHERE id = %s",
            (informe_id,))
    return {"id": informe_id, "carga_deshecha": fila["carga_id"]}
