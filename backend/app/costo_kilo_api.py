"""
API de costo por kilo (equipo C&M-500): subir el CSV, guardarlo, listarlo y bajar su informe en PDF o Excel.

Cada carga queda en su carpeta de STORAGE_DIR/CostoKilo, nombrada con la fecha y hora del guardado (igual que las
de Accu-Tab en `postventa.py`):

    Storage/CostoKilo/2026-11-02_09-15-30/
        registro.json   <- quién es, el resumen diario y las lecturas (ya numéricas)
        informe.pdf     <- el informe, con el formato del de Accu-Tab
        original/       <- el CSV tal cual lo mandó el equipo

Subirlo es solo del personal de AgroFresh que escribe (`router`); el cliente (y el comercial) solo lo ve acotado a
SU Sold To y Ship To (`router_cliente`), igual que los informes de Accu-Tab.
"""
from __future__ import annotations

import base64
import binascii
import json
import logging
import os
import re
import shutil
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from . import accutab_informe, config, costo_kilo, costo_kilo_informe
from .auth import Usuario, alcance_de_datos, con_lista_de_accesos, planta_permitida, solo_escribiente, usuario_actual
from .postventa import _clave

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/costo-kilo", tags=["costo-kilo"])
router_cliente = APIRouter(prefix="/api/costo-kilo/cliente", tags=["costo-kilo-cliente"])

CARPETA = "CostoKilo"
ARCHIVO_REGISTRO = "registro.json"
ARCHIVO_PDF = "informe.pdf"
CARPETA_ORIGINAL = "original"
RAIZ_R2 = "costo_kilo/"
MAX_BYTES = 25 * 1024 * 1024
_PATRON_CARPETA = re.compile(r"^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$")
_NOMBRE_INVALIDO = re.compile(r'[\\/:*?"<>|]')
_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _raiz() -> str:
    ruta = os.path.normpath(os.path.join(config.STORAGE_DIR, CARPETA))
    os.makedirs(ruta, exist_ok=True)
    return ruta


def _carpeta(carpeta: str) -> str:
    """Valida el nombre contra el patrón de fecha (nada de salir de la carpeta) y devuelve su ruta."""
    if not _PATRON_CARPETA.match(carpeta or ""):
        raise HTTPException(400, "Identificador de informe inválido.")
    ruta = os.path.join(_raiz(), carpeta)
    if not os.path.isdir(ruta):
        raise HTTPException(404, "Ese informe no existe.")
    return ruta


def _leer(carpeta: str) -> dict[str, Any]:
    ruta = os.path.join(_carpeta(carpeta), ARCHIVO_REGISTRO)
    if not os.path.isfile(ruta):
        raise HTTPException(404, "Ese informe no tiene datos guardados.")
    with open(ruta, encoding="utf-8") as f:
        return _al_dia(json.load(f))


def _al_dia(r: dict[str, Any]) -> dict[str, Any]:
    """Un informe guardado antes de que se registraran los valores de cierre del día se recalcula con sus propias
    lecturas (el CSV original queda guardado en el informe): así no hay que volver a subirlo."""
    dias = (r.get("resumen") or {}).get("dias") or []
    if dias and "kg_cierre" not in dias[0] and r.get("lecturas"):
        try:
            r["resumen"] = costo_kilo.resumen_diario(r["lecturas"])
        except Exception:  # noqa: BLE001
            log.exception("No se pudo recalcular el resumen diario de un informe de costo por kilo")
    return r


def _rehacer_si_es_viejo(carpeta: str) -> None:
    """Si el informe se guardó antes de los valores de cierre, deja al día su registro y rehace su PDF (una sola vez)."""
    ruta = os.path.join(_carpeta(carpeta), ARCHIVO_REGISTRO)
    try:
        with open(ruta, encoding="utf-8") as f:
            crudo = json.load(f)
        dias = (crudo.get("resumen") or {}).get("dias") or []
        if not dias or "kg_cierre" in dias[0] or not crudo.get("lecturas"):
            return
        r = _al_dia(crudo)
        pdf = costo_kilo_informe.generar_pdf(r)
        with open(os.path.join(os.path.dirname(ruta), ARCHIVO_PDF), "wb") as f:
            f.write(pdf)
        r["tiene_pdf"] = True
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(r, f, ensure_ascii=False)
    except Exception:  # noqa: BLE001
        log.exception("No se pudo rehacer el informe de costo por kilo %s", carpeta)


def _resumen(carpeta: str, r: dict[str, Any]) -> dict[str, Any]:
    """Lo justo para pintar una fila de la lista, sin las lecturas."""
    res = r.get("resumen") or {}
    tot = res.get("totales") or {}
    return {
        "carpeta": carpeta,
        "guardado_en": r.get("guardado_en"),
        "cliente": r.get("cliente"),
        "planta": r.get("planta"),
        "linea": r.get("linea"),
        "equipo": r.get("equipo"),
        "origen": r.get("origen") or "manual",
        "desde": res.get("desde"),
        "hasta": res.get("hasta"),
        "semanas": costo_kilo.semanas_iso(res["desde"], res["hasta"]) if res.get("desde") else None,
        "dias": len(res.get("dias") or []),
        "lecturas": res.get("lecturas"),
        "kg_total": tot.get("kg"),
        "litros": tot.get("activos") or {},
        "ml_por_kg": tot.get("ml_por_kg") or {},
        "codigos": res.get("codigos") or [],
        "nombres": r.get("nombres") or {},
    }


def _detalle(carpeta: str, r: dict[str, Any], interno: bool) -> dict[str, Any]:
    """El informe completo para pintar sus gráficos; sin las lecturas (van en el Excel) ni, para un cliente, el técnico."""
    salida = {**_resumen(carpeta, r), "resumen": r.get("resumen"), "archivo": r.get("archivo")}
    if interno:
        salida["responsable"] = r.get("responsable")
    return salida


def nombres_del_catalogo() -> dict[str, str]:
    """El nombre de cada ingrediente activo según el catálogo de analitos (código → nombre). Nunca lanza: sin base, {}."""
    try:
        from .db import conexion, cursor_dict

        with conexion(escribir=False) as conn:
            with cursor_dict(conn) as cur:
                cur.execute("SELECT codigo, nombre FROM analito WHERE nombre IS NOT NULL ORDER BY (activo IS NOT TRUE), laboratorio, id")
                salida: dict[str, str] = {}
                for fila in cur.fetchall():
                    cod = str(fila["codigo"] or "").strip().upper()
                    if cod and cod not in salida:
                        salida[cod] = str(fila["nombre"]).strip()
                return salida
    except Exception:  # noqa: BLE001
        return {}


def _decodificar(b64: str) -> bytes:
    try:
        datos = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "El archivo no llegó bien (base64 inválido).") from None
    if len(datos) > MAX_BYTES:
        raise HTTPException(413, "El archivo es demasiado grande (máximo 25 MB).")
    return datos


def _analizar(contenido: bytes) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    try:
        lecturas = costo_kilo.leer_csv(contenido)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    return lecturas, costo_kilo.resumen_diario(lecturas)


def _archivar_en_r2(registro: dict[str, Any], marca: str, pdf: bytes | None, original: tuple[str, bytes]) -> list[str]:
    """Sube el informe y el CSV original a costo_kilo/<cliente>/<fecha>/. Nunca lanza (R2 caído no pierde la carga)."""
    claves: list[str] = []
    try:
        from . import r2

        if not r2.disponible():
            return claves
        fecha, hora = marca.split("_", 1)
        base = f"{RAIZ_R2}{accutab_informe.sanitizar_nombre(registro.get('cliente') or '')}/{fecha}/"
        if pdf:
            clave = f"{base}Informe {hora}.pdf"
            r2.subir(clave, pdf, "application/pdf")
            claves.append(clave)
        clave = f"{base}Datos {hora}/{original[0]}"
        r2.subir(clave, original[1], "text/csv")
        claves.append(clave)
    except Exception:  # noqa: BLE001
        log.exception("No se pudo archivar el informe de costo por kilo %s en R2", marca)
    return claves


def guardar_informe(*, cliente: str, planta: str | None, linea: str | None, equipo: str | None, responsable: str | None,
                    nombre_archivo: str, contenido: bytes, origen: str = "manual") -> tuple[str, dict[str, Any]]:
    """Lee el CSV, calcula el valor diario y guarda la carga con su informe PDF. Lo usan la subida a mano y, cuando
    exista la matriz de asuntos, la recepción por correo. Devuelve (carpeta, resumen)."""
    if not (cliente or "").strip():
        raise HTTPException(400, "Falta el cliente del informe.")
    lecturas, resumen = _analizar(contenido)
    catalogo = nombres_del_catalogo()
    nombre = _NOMBRE_INVALIDO.sub("_", os.path.basename(nombre_archivo or "").strip()) or "cm500.csv"
    meta = {
        "guardado_en": datetime.now(tz=timezone.utc).isoformat(),
        "cliente": cliente.strip(), "planta": (planta or "").strip() or None, "linea": (linea or "").strip() or None,
        "equipo": (equipo or "").strip() or "C&M-500", "responsable": (responsable or "").strip() or None,
        "origen": origen, "archivo": nombre,
    }
    registro = costo_kilo_informe.registro_para_informe(resumen, lecturas, meta, catalogo)

    raiz = _raiz()
    momento = datetime.now()
    for _ in range(60):
        marca = momento.strftime("%Y-%m-%d_%H-%M-%S")
        try:
            os.makedirs(os.path.join(raiz, marca))
            break
        except FileExistsError:
            momento += timedelta(seconds=1)
    else:
        raise HTTPException(409, "No se pudo reservar una carpeta para este informe, reintenta.")
    destino = os.path.join(raiz, marca)
    try:
        os.makedirs(os.path.join(destino, CARPETA_ORIGINAL))
        with open(os.path.join(destino, CARPETA_ORIGINAL, nombre), "wb") as f:
            f.write(contenido)
        pdf: bytes | None = None
        try:
            pdf = costo_kilo_informe.generar_pdf(registro)
        except Exception:  # noqa: BLE001
            log.exception("No se pudo generar el informe PDF de costo por kilo %s", marca)
        if pdf:
            with open(os.path.join(destino, ARCHIVO_PDF), "wb") as f:
                f.write(pdf)
        registro["tiene_pdf"] = bool(pdf)
        registro["r2_claves"] = _archivar_en_r2(registro, marca, pdf, (nombre, contenido))
        with open(os.path.join(destino, ARCHIVO_REGISTRO), "w", encoding="utf-8") as f:
            json.dump(registro, f, ensure_ascii=False)
    except Exception:
        shutil.rmtree(destino, ignore_errors=True)  # una carga a medio escribir confundiría a las listas
        raise
    return marca, _resumen(marca, registro)


def recibir_por_correo(asunto: str, adjuntos: list[tuple[str, bytes]], marca_correo: str) -> dict[str, Any]:
    """Un correo con un CSV del C&M-500. **A la espera de la matriz de asuntos** (asunto → cliente, planta y línea):
    mientras no exista, o si el asunto no calza, el CSV queda guardado tal cual en R2 (`costo_kilo/por_clasificar/`)
    y NO se genera informe. Cuando la matriz esté, el mismo CSV genera su informe aquí. Devuelve el estado."""
    csvs = [(n, d) for n, d in adjuntos if n.lower().endswith(".csv") and costo_kilo.es_costo_kilo(d)]
    datos = costo_kilo.interpretar_asunto(asunto)
    if datos is None or not datos.get("cliente"):
        guardados = []
        try:
            from . import r2

            if r2.disponible():
                for nombre, data in csvs:
                    clave = f"{RAIZ_R2}por_clasificar/{marca_correo}/{nombre}"
                    r2.subir(clave, data, "text/csv")
                    guardados.append(clave)
        except Exception:  # noqa: BLE001
            log.exception("No se pudo guardar en R2 el CSV de costo por kilo recibido por correo")
        return {"estado": "a_la_espera_de_la_matriz", "asunto": asunto, "archivos": guardados}
    carpetas = []
    for nombre, data in csvs:
        carpeta, _ = guardar_informe(
            cliente=datos["cliente"], planta=datos.get("planta"), linea=datos.get("linea"), equipo=datos.get("equipo"),
            responsable=None, nombre_archivo=nombre, contenido=data, origen="email")
        carpetas.append(carpeta)
    return {"estado": "informe_generado", "asunto": asunto, "carpetas": carpetas}


# ── Personal de AgroFresh ────────────────────────────────────────────────────────────────────────────

class ArchivoIn(BaseModel):
    nombre: str
    contenido_b64: str


class GuardarIn(ArchivoIn):
    cliente: str
    planta: str | None = None
    linea: str | None = None
    equipo: str | None = None
    responsable: str | None = None


@router.post("/previsualizar")
def previsualizar(datos: ArchivoIn) -> dict[str, Any]:
    """Lee el CSV y devuelve el valor diario, sin guardar nada (para ver el informe antes de «Guardar»)."""
    _, resumen = _analizar(_decodificar(datos.contenido_b64))
    return {
        "archivo": datos.nombre, "resumen": resumen,
        "nombres": costo_kilo.nombres_de_activos(resumen["codigos"], nombres_del_catalogo()),
        "semanas": costo_kilo.semanas_iso(resumen["desde"], resumen["hasta"]),
    }


@router.post("/registros")
def guardar(datos: GuardarIn, usuario: Usuario = Depends(solo_escribiente)) -> dict[str, Any]:
    carpeta, resumen = guardar_informe(
        cliente=datos.cliente, planta=datos.planta, linea=datos.linea, equipo=datos.equipo,
        responsable=datos.responsable or usuario.nombre, nombre_archivo=datos.nombre,
        contenido=_decodificar(datos.contenido_b64), origen="manual")
    return {"carpeta": carpeta, "resumen": resumen}


def listar() -> list[dict[str, Any]]:
    salida = []
    for nombre in os.listdir(_raiz()):
        if not _PATRON_CARPETA.match(nombre):
            continue
        ruta = os.path.join(_raiz(), nombre, ARCHIVO_REGISTRO)
        if not os.path.isfile(ruta):
            continue
        try:
            with open(ruta, encoding="utf-8") as f:
                salida.append(_resumen(nombre, _al_dia(json.load(f))))
        except (OSError, json.JSONDecodeError, KeyError):
            continue  # una carpeta corrupta no tumba la lista
    salida.sort(key=lambda r: r["carpeta"], reverse=True)
    return salida


@router.get("/registros")
def listar_registros() -> list[dict[str, Any]]:
    return listar()


@router.get("/registros/{carpeta}")
def ver_registro(carpeta: str) -> dict[str, Any]:
    return _detalle(carpeta, _leer(carpeta), interno=True)


@router.get("/registros/{carpeta}/pdf")
def pdf_registro(carpeta: str) -> FileResponse:
    _rehacer_si_es_viejo(carpeta)
    ruta = os.path.join(_carpeta(carpeta), ARCHIVO_PDF)
    if not os.path.isfile(ruta):
        raise HTTPException(404, "Ese informe no tiene PDF.")
    return FileResponse(ruta, media_type="application/pdf", filename=f"Costo_por_kilo_{carpeta}.pdf")


@router.get("/registros/{carpeta}/excel")
def excel_registro(carpeta: str) -> Response:
    return _excel(carpeta, _leer(carpeta))


@router.delete("/registros/{carpeta}")
def eliminar(carpeta: str, usuario: Usuario = Depends(solo_escribiente)) -> dict[str, bool]:
    ruta = _carpeta(carpeta)
    claves: list[str] = []
    try:
        with open(os.path.join(ruta, ARCHIVO_REGISTRO), encoding="utf-8") as f:
            claves = list(json.load(f).get("r2_claves") or [])
    except (OSError, json.JSONDecodeError):
        pass
    shutil.rmtree(ruta)
    try:
        from . import r2

        if r2.disponible():
            for k in claves:
                if k.startswith(RAIZ_R2):
                    r2.eliminar(k)
    except Exception:  # noqa: BLE001
        log.exception("No se pudo borrar de R2 el informe de costo por kilo")
    return {"ok": True}


def _excel(carpeta: str, registro: dict[str, Any]) -> Response:
    contenido = costo_kilo_informe.generar_excel(registro)
    return Response(contenido, media_type=_XLSX, headers={"Content-Disposition": f'attachment; filename="Costo_por_kilo_{carpeta}.xlsx"'})


# ── Cliente y comercial: solo lo de su alcance ──────────────────────────────────────────────────────

def _informes_de(usuario: Usuario) -> list[dict[str, Any]]:
    """Los informes que esta cuenta puede ver. Un cliente sin cliente asignado no ve nada (nunca «todo»); un comercial
    (o un cliente con lista de accesos) solo las plantas que se le asignaron. Lo que pida el navegador no cuenta."""
    cliente, planta = alcance_de_datos(usuario, None, None)
    if usuario.tipoAcceso == "cliente" and con_lista_de_accesos(usuario):
        cliente = planta = None
    elif usuario.tipoAcceso == "cliente" and not cliente:
        return []
    salida = []
    for r in listar():
        if cliente and _clave(r["cliente"]) != _clave(cliente):
            continue
        if planta and _clave(r["planta"]) != _clave(planta):
            continue
        if con_lista_de_accesos(usuario) and not planta_permitida(usuario, r["cliente"], r["planta"]):
            continue
        salida.append(r)
    return salida


def _del_alcance(carpeta: str, usuario: Usuario) -> dict[str, Any]:
    if carpeta not in {r["carpeta"] for r in _informes_de(usuario)}:
        raise HTTPException(404, "Ese informe no existe.")
    return _leer(carpeta)


@router_cliente.get("/informes")
def informes_del_cliente(usuario: Usuario = Depends(usuario_actual)) -> list[dict[str, Any]]:
    return _informes_de(usuario)


@router_cliente.get("/informes/{carpeta}")
def detalle_del_cliente(carpeta: str, usuario: Usuario = Depends(usuario_actual)) -> dict[str, Any]:
    return _detalle(carpeta, _del_alcance(carpeta, usuario), interno=False)


@router_cliente.get("/informes/{carpeta}/pdf")
def pdf_del_cliente(carpeta: str, usuario: Usuario = Depends(usuario_actual)) -> FileResponse:
    _del_alcance(carpeta, usuario)
    _rehacer_si_es_viejo(carpeta)
    ruta = os.path.join(_carpeta(carpeta), ARCHIVO_PDF)
    if not os.path.isfile(ruta):
        raise HTTPException(404, "Ese informe no tiene PDF.")
    return FileResponse(ruta, media_type="application/pdf", filename=f"Costo_por_kilo_{carpeta}.pdf")


@router_cliente.get("/informes/{carpeta}/excel")
def excel_del_cliente(carpeta: str, usuario: Usuario = Depends(usuario_actual)) -> Response:
    return _excel(carpeta, _del_alcance(carpeta, usuario))
