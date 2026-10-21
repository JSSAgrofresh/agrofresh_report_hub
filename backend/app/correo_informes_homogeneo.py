"""
Homogeneización de un informe del correo contra Listados: lo MISMO que revisa el Converter antes de subir.

Lee el PDF (Quiteca) con `quiteca_lectura`, aplica lo que el sistema ya aprendió de correcciones a mano
(`correccion_converter`, igual que el Converter) y pregunta a `ingest.preview` si Sold To, Ship To, Especie y Variedad
calzan con Listados. Si calzan, el informe puede aceptarse tal cual; si no, se corrigen a mano (`correcciones`) y se
acepta con esos valores (lo corregido queda aprendido para la próxima).
"""
from __future__ import annotations

import logging
from typing import Any

from psycopg2.extras import Json

from . import correcciones, homogenizar_converter, ingest, quiteca_lectura, servicios
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

# campo → clave en `leer_quiteca()["datos"]`
CAMPOS = {"sold_to": "Sold To", "ship_to": "Ship To", "especie": "Especie", "variedad": "Variedad"}
CODIGO = "no_homogeneo"


def _aprendido(campos: dict[str, str]) -> tuple[dict[str, str], list[dict[str, str]]]:
    """Aplica las asociaciones guardadas («texto del informe → valor oficial»), con el contexto de cada campo."""
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT campo, contexto_norm, valor_crudo_norm, valor_oficial FROM correccion_converter")
            filas = cur.fetchall()
    except Exception:  # noqa: BLE001 — sin la 0045 el Converter tampoco aprende
        return dict(campos), []
    tabla = {(f["campo"], f["contexto_norm"], f["valor_crudo_norm"]): f["valor_oficial"] for f in filas}
    n = correcciones.normalizar
    final = dict(campos)
    aplicadas: list[dict[str, str]] = []
    for campo in ("sold_to", "especie", "ship_to", "variedad"):     # el contexto del Ship To es su Sold To ya corregido
        contexto = n(final["sold_to"]) if campo == "ship_to" else n(final["especie"]) if campo == "variedad" else ""
        oficial = tabla.get((campo, contexto, n(final[campo])))
        if oficial and oficial != final[campo]:
            aplicadas.append({"campo": campo, "antes": final[campo], "despues": oficial})
            final[campo] = oficial
    return final, aplicadas


def preparar(contenido: bytes, correcciones_manuales: dict[str, str] | None = None) -> dict[str, Any]:
    """Lee el PDF y lo revisa contra Listados. No escribe nada."""
    from .informe_lectura import texto_quiteca

    lectura = quiteca_lectura.leer_quiteca(texto_quiteca(contenido))
    d = lectura["datos"]
    leidos = {c: (d.get(n) or "").strip() for c, n in CAMPOS.items()}
    campos, aprendidos = _aprendido(leidos)
    # Lo mismo que hace el Converter solo: nombre abreviado, sin tildes, alias conocidos («cereza» → «Cerezas»)
    try:
        servicio = servicios.clave_servicio(d.get("Tipo Aplicación"))
        campos, automaticos = homogenizar_converter.homogenizar_campos(campos, opciones(servicio))
    except Exception:  # noqa: BLE001 — sin listados legibles queda como antes (a mano)
        logger.exception("No se pudo homogeneizar solo")
        automaticos = []
    aprendidos = aprendidos + automaticos
    for c, v in (correcciones_manuales or {}).items():
        if c in CAMPOS and v is not None:
            campos[c] = v.strip()
    for c, n in CAMPOS.items():
        d[n] = campos[c]
    faltan = [a for a in lectura["avisos"] if a.startswith("Sin dato para") or a.startswith("No se encontró ningún resultado")]
    sueltos = [n for n, _ in lectura["sueltos"]]
    fila = quiteca_lectura.fila_cruda(lectura)
    previa = ingest.preview(ingest.CargaRequest(filas=[fila], origen="correo"))
    detalle = previa["detalle"][0] if previa.get("detalle") else {}
    motivos: list[str] = []
    if previa["resumen"].get("pendientes_revision"):
        motivos += detalle.get("motivos", []) or ["No calza con Listados."]
    motivos += [f"Falta: {f}" for f in faltan]
    if sueltos:
        motivos.append("Analitos que el sistema no conoce: " + ", ".join(sueltos))
    return {
        "lectura": lectura, "fila": fila, "previa": previa, "campos": campos, "leidos": leidos,
        "aprendidos": aprendidos, "motivos": motivos, "ok": not motivos,
        "ya_existia": bool(detalle.get("ya_existia")),
    }


def aprender(correcciones_manuales: dict[str, str], leidos: dict[str, str], campos: dict[str, str], archivo: str, usuario) -> None:
    """Lo que se corrigió a mano queda recordado (igual que en el Converter). Nunca frena la aceptación."""
    for campo in ("sold_to", "especie", "ship_to", "variedad"):
        nuevo, crudo = campos.get(campo, ""), leidos.get(campo, "")
        if campo not in correcciones_manuales or not crudo or not nuevo or correcciones.normalizar(crudo) == correcciones.normalizar(nuevo):
            continue
        contexto = campos["sold_to"] if campo == "ship_to" else campos["especie"] if campo == "variedad" else ""
        try:
            correcciones.guardar_correccion(
                correcciones.CorreccionIn(campo=campo, contexto=contexto, valor_crudo=crudo, valor_oficial=nuevo, archivo=archivo),
                usuario)
        except Exception:  # noqa: BLE001
            logger.exception("No se pudo recordar la corrección de %s", campo)


def con_resultado(hallazgos: list[dict[str, str]], motivos: list[str], ok: bool) -> list[dict[str, str]]:
    """Los hallazgos del informe con (o sin) el aviso de «hay que homogeneizar»."""
    limpios = [h for h in hallazgos if h.get("codigo") != CODIGO]
    if not ok:
        limpios.append({"nivel": "amarillo", "codigo": CODIGO,
                        "texto": "Hay que homogeneizar antes de cargarlo: " + "; ".join(motivos[:3])})
    return limpios


def completar_fila(fila: dict[str, Any], contenido: bytes) -> None:
    """Para un informe nuevo del correo: calcula si se puede cargar tal cual y lo deja en la fila (antes de guardarla)."""
    from . import correo_informes_lectura as lectura

    if fila.get("laboratorio") != "Quiteca" or fila.get("ya_cargado"):
        return
    try:
        r = preparar(contenido)
    except Exception:  # noqa: BLE001 — un PDF raro no frena la revisión del buzón
        logger.exception("No se pudo revisar la homogeneización de %s", fila.get("nro_informe"))
        return
    fila["homogeneo"] = r["ok"]
    fila["homogeneo_motivos"] = r["motivos"]
    fila["hallazgos"] = con_resultado(fila["hallazgos"], r["motivos"], r["ok"])
    fila["estado"] = lectura.estado_de(fila["hallazgos"])


def completar_pendientes(limite: int = 15) -> int:
    """Revisa los informes ya guardados que aún no tienen su homogeneización (los de antes de la 0067)."""
    from . import correo_informes_lectura as lectura, r2

    hechos = 0
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(
                "SELECT id, r2_key, hallazgos FROM correo_informe WHERE decision = 'pendiente' AND laboratorio = 'Quiteca'"
                " AND NOT ya_cargado AND homogeneo IS NULL AND r2_key IS NOT NULL ORDER BY llegada_en DESC LIMIT %s", (limite,))
            filas = cur.fetchall()
    except Exception:  # noqa: BLE001 — falta la 0067
        return 0
    for f in filas:
        try:
            datos = r2.descargar(f["r2_key"])
            if datos is None:
                continue
            r = preparar(datos)
        except Exception:  # noqa: BLE001
            logger.exception("No se pudo revisar la homogeneización del informe %s", f["id"])
            continue
        hallazgos = con_resultado(f["hallazgos"] or [], r["motivos"], r["ok"])
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                "UPDATE correo_informe SET homogeneo = %s, homogeneo_motivos = %s, hallazgos = %s, estado = %s WHERE id = %s",
                (r["ok"], Json(r["motivos"]), Json(hallazgos), lectura.estado_de(hallazgos), f["id"]))
        hechos += 1
    return hechos


def opciones(servicio: str) -> dict[str, Any]:
    """Los valores de Listados para corregir a mano, del listado del tipo de servicio del informe."""
    from . import servicios

    tabla_cliente, tabla_planta = servicios.tablas(servicio)      # nombres fijos de tabla, no del usuario
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(f"SELECT c.nombre AS cliente, p.nombre AS planta FROM {tabla_cliente} c "
                    f"LEFT JOIN {tabla_planta} p ON p.cliente_id = c.id AND p.activo WHERE c.activo ORDER BY c.nombre, p.nombre")
        sold_to: list[str] = []
        ship_to: dict[str, list[str]] = {}
        for f in cur.fetchall():
            if f["cliente"] not in ship_to:
                sold_to.append(f["cliente"])
                ship_to[f["cliente"]] = []
            if f["planta"]:
                ship_to[f["cliente"]].append(f["planta"])
        cur.execute("SELECT e.valor AS especie, v.valor AS variedad FROM valor_lista e "
                    "LEFT JOIN valor_lista v ON v.especie_id = e.id AND v.tipo = 'variedad' AND v.activo AND v.fusionado_en_id IS NULL "
                    "WHERE e.tipo = 'especie' AND e.activo AND e.fusionado_en_id IS NULL ORDER BY e.valor, v.valor")
        especie: list[str] = []
        variedad: dict[str, list[str]] = {}
        for f in cur.fetchall():
            if f["especie"] not in variedad:
                especie.append(f["especie"])
                variedad[f["especie"]] = []
            if f["variedad"]:
                variedad[f["especie"]].append(f["variedad"])
    return {"sold_to": sold_to, "ship_to": ship_to, "especie": especie, "variedad": variedad}
