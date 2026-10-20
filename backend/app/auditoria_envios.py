"""Auditoría de los informes que salieron hacia los clientes (Panel de control interno).

Junta dos fuentes en una sola lista, la más reciente primero:

  · `envio_informe_log` (AgroFresh Lab → Envío de informes): cada envío, de producción o de prueba, exitoso o no, con quién
    lo envió, a quién se pidió y a quién salió de verdad. Los de prueba salen solo a Paz y Jorge aunque se pida a clientes.
  · `envio_cliente_manual`: los informes marcados «enviado al cliente» a mano (Converter o Solicitudes e informes).

Cada fuente se lee aparte y sin lanzar: si falta una tabla o una migración (0054 amarra el envío a su solicitud), esa
fuente queda vacía o sin amarre y la otra sigue.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

LIMITE = 500

_COLUMNAS_LOG = """l.id, l.creado_en, l.usuario_nombre, l.usuario_email, l.modo, l.laboratorio, l.sold_to, l.ship_to,
       l.especie, l.asunto, l.para, l.enviado_to, l.enviado_cc, l.enviado_bcc, l.exitoso, l.error"""

# Con la 0054 el envío trae su solicitud (OT); sin ella, queda sin amarre.
_SQL_LOG_CON_SOLICITUD = f"""
    SELECT {_COLUMNAS_LOG}, l.archivo_solicitud, sa.numero_solicitud
    FROM envio_informe_log l
    LEFT JOIN solicitud_archivo sa ON sa.archivo = l.archivo_solicitud
    ORDER BY l.creado_en DESC LIMIT {LIMITE}
"""
_SQL_LOG_SIN_SOLICITUD = f"""
    SELECT {_COLUMNAS_LOG}, NULL::text AS archivo_solicitud, NULL::text AS numero_solicitud
    FROM envio_informe_log l
    ORDER BY l.creado_en DESC LIMIT {LIMITE}
"""
_SQL_MANUALES = f"""
    SELECT m.archivo, m.enviado_en, m.marcado_por, m.origen,
           sa.numero_solicitud, sa.laboratorio, sa.sold_to, sa.ship_to, sa.especie
    FROM envio_cliente_manual m
    LEFT JOIN solicitud_archivo sa ON sa.archivo = m.archivo
    ORDER BY m.enviado_en DESC LIMIT {LIMITE}
"""


def _iso(valor: Any) -> str | None:
    return valor.isoformat() if isinstance(valor, datetime) else (str(valor) if valor else None)


def _lista(valor: Any) -> list[str]:
    return [str(x) for x in valor] if isinstance(valor, list) else []


def _sin_repetir(*listas: list[str]) -> list[str]:
    vistos: set[str] = set()
    salida: list[str] = []
    for lista in listas:
        for correo in lista:
            clave = correo.strip().casefold()
            if clave and clave not in vistos:
                vistos.add(clave)
                salida.append(correo.strip())
    return salida


def fila_de_envio(f: dict[str, Any]) -> dict[str, Any]:
    """Un renglón de `envio_informe_log`: tipo «real» (producción) o «prueba»."""
    return {
        "id": f"envio-{f['id']}",
        "fecha": _iso(f["creado_en"]),
        "tipo": "prueba" if f["modo"] == "prueba" else "real",
        "exitoso": bool(f["exitoso"]),
        "error": f.get("error") or None,
        "solicitud": f.get("numero_solicitud") or None,
        "informe": f.get("asunto") or None,
        "laboratorio": f.get("laboratorio") or None,
        "sold_to": f.get("sold_to") or None,
        "ship_to": f.get("ship_to") or None,
        "especie": f.get("especie") or None,
        "pedido_a": _lista(f.get("para")),
        "enviado_a": _sin_repetir(_lista(f.get("enviado_to")), _lista(f.get("enviado_cc")), _lista(f.get("enviado_bcc"))),
        "enviado_por": f.get("usuario_nombre") or f.get("usuario_email") or None,
        "origen": "Envío de informes",
    }


def fila_manual(f: dict[str, Any]) -> dict[str, Any]:
    """Un informe marcado «enviado al cliente» a mano: no se sabe a quién ni con qué asunto, solo quién lo marcó y cuándo."""
    origen = "Converter" if f.get("origen") == "converter" else "Solicitudes e informes"
    return {
        "id": f"manual-{f['archivo']}",
        "fecha": _iso(f["enviado_en"]),
        "tipo": "manual",
        "exitoso": True,
        "error": None,
        "solicitud": f.get("numero_solicitud") or None,
        "informe": None,
        "laboratorio": f.get("laboratorio") or None,
        "sold_to": f.get("sold_to") or None,
        "ship_to": f.get("ship_to") or None,
        "especie": f.get("especie") or None,
        "pedido_a": [],
        "enviado_a": [],
        "enviado_por": f.get("marcado_por") or None,
        "origen": origen,
    }


def _leer(sqls: tuple[str, ...], nombre: str) -> list[dict[str, Any]]:
    """Prueba cada consulta en orden y devuelve la primera que funciona; si ninguna, vacío (y queda en el log)."""
    for sql in sqls:
        try:
            with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
                cur.execute(sql)
                return list(cur.fetchall())
        except Exception:
            logger.warning("No se pudo leer %s para la auditoría de envíos.", nombre, exc_info=True)
    return []


def listar_envios() -> list[dict[str, Any]]:
    """Todos los envíos hacia clientes (reales, de prueba y marcados a mano), el más reciente primero."""
    filas = [fila_de_envio(f) for f in _leer((_SQL_LOG_CON_SOLICITUD, _SQL_LOG_SIN_SOLICITUD), "envio_informe_log")]
    filas += [fila_manual(f) for f in _leer((_SQL_MANUALES,), "envio_cliente_manual")]
    filas.sort(key=lambda x: x["fecha"] or "", reverse=True)
    return filas
