"""
Endpoint que alimenta el panel analítico del administrador.

Agrega en una sola llamada datos de los módulos más activos del sistema
para que el panel muestre el estado real en tiempo real (el frontend
lo refresca cada 30 segundos):

  - Usuarios con sesión activa en la última hora.
  - Últimas cargas que esperan revisión en Converter (pendiente_revision).
  - Últimas cargas AccuTab/Trace (carpetas del sistema de archivos).
  - Últimas solicitudes ingresadas al laboratorio (solicitud).
  - Últimas verificaciones diarias guardadas (verif_registro).
  - Métricas globales: total solicitudes, esta semana, pendientes Converter.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

from fastapi import APIRouter, Query

from . import config
from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_PATRON_CARPETA = re.compile(r"^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$")


def _trace_recientes(limite: int) -> list[dict]:
    """Las últimas cargas AccuTab del sistema de archivos."""
    raiz = os.path.normpath(os.path.join(config.STORAGE_DIR, "Accutab"))
    if not os.path.isdir(raiz):
        return []
    carpetas = sorted(
        (n for n in os.listdir(raiz) if _PATRON_CARPETA.match(n) and
         os.path.isfile(os.path.join(raiz, n, "registro.json"))),
        reverse=True,
    )[:limite]
    resultado = []
    for nombre in carpetas:
        try:
            with open(os.path.join(raiz, nombre, "registro.json"), encoding="utf-8") as f:
                reg = json.load(f)
            resultado.append({
                "carpeta": nombre,
                "cliente": reg.get("cliente") or "—",
                "equipo": reg.get("equipo") or "—",
                "responsable": reg.get("responsable") or "—",
                "tiene_pdf": os.path.isfile(os.path.join(raiz, nombre, "informe.pdf")),
            })
        except (OSError, json.JSONDecodeError):
            continue
    return resultado


@router.get("/actividad")
def actividad() -> dict[str, Any]:
    """Snapshot analítico del sistema para el panel del administrador."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        # Usuarios con sesión activa en la última hora (uno por cuenta).
        cur.execute("""
            SELECT DISTINCT ON (u.id)
                   u.nombre, u.area, u.tipo_acceso,
                   s.ultimo_uso
            FROM sesion s
            JOIN usuario u ON u.id = s.usuario_id
            WHERE s.ultimo_uso > now() - INTERVAL '1 hour'
              AND s.expira_en > now()
              AND u.tipo_acceso != 'cliente'
            ORDER BY u.id, s.ultimo_uso DESC
        """)
        usuarios_activos = [
            {
                "nombre": r["nombre"],
                "area": r["area"],
                "tipo_acceso": r["tipo_acceso"],
                "ultimo_uso": r["ultimo_uso"].isoformat() if r["ultimo_uso"] else None,
            }
            for r in cur.fetchall()
        ]

        # Últimas cargas Converter (pendiente_revision).
        cur.execute("""
            SELECT id, origen, creado_en,
                   jsonb_array_length(motivos) AS n_motivos
            FROM pendiente_revision
            ORDER BY id DESC
            LIMIT 8
        """)
        converter_recientes = [
            {
                "id": r["id"],
                "origen": r["origen"] or "Excel",
                "creado_en": r["creado_en"].isoformat() if r["creado_en"] else None,
                "n_motivos": r["n_motivos"] or 0,
            }
            for r in cur.fetchall()
        ]

        # Últimas solicitudes de laboratorio.
        cur.execute("""
            SELECT s.id, s.nro_solicitud, s.fecha_entrada,
                   s.especie, s.variedad, s.laboratorio,
                   c.nombre AS cliente, p.nombre AS planta
            FROM solicitud s
            LEFT JOIN planta p   ON p.id = s.planta_id
            LEFT JOIN cliente c  ON c.id = p.cliente_id
            WHERE s.vigente
            ORDER BY s.fecha_entrada DESC NULLS LAST, s.id DESC
            LIMIT 6
        """)
        solicitudes_recientes = [
            {
                "id": r["id"],
                "nro_solicitud": r["nro_solicitud"],
                "fecha_entrada": r["fecha_entrada"].isoformat() if r["fecha_entrada"] else None,
                "especie": r["especie"] or "—",
                "variedad": r["variedad"] or "—",
                "laboratorio": r["laboratorio"] or "—",
                "cliente": r["cliente"] or "—",
                "planta": r["planta"] or "—",
            }
            for r in cur.fetchall()
        ]

        # Últimas verificaciones diarias guardadas.
        cur.execute("""
            SELECT fecha, resultado, actualizado_en
            FROM verif_registro
            ORDER BY fecha DESC
            LIMIT 5
        """)
        verificaciones_recientes = [
            {
                "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                "resultado": r["resultado"] or "Sin datos",
                "actualizado_en": r["actualizado_en"].isoformat() if r["actualizado_en"] else None,
            }
            for r in cur.fetchall()
        ]

        # Métricas globales.
        cur.execute("SELECT count(*) AS total FROM solicitud WHERE vigente")
        total_solicitudes = cur.fetchone()["total"]

        cur.execute("""
            SELECT count(*) AS total FROM solicitud
            WHERE vigente AND fecha_entrada >= CURRENT_DATE - INTERVAL '7 days'
        """)
        esta_semana = cur.fetchone()["total"]

        cur.execute("SELECT count(*) AS total FROM pendiente_revision")
        pendientes_converter = cur.fetchone()["total"]

        cur.execute("""
            SELECT count(*) AS total FROM verif_registro
            WHERE fecha = CURRENT_DATE
        """)
        verificacion_hoy = cur.fetchone()["total"] > 0

    return {
        "usuarios_activos": usuarios_activos,
        "converter_recientes": converter_recientes,
        "trace_recientes": _trace_recientes(5),
        "solicitudes_recientes": solicitudes_recientes,
        "verificaciones_recientes": verificaciones_recientes,
        "metricas": {
            "total_solicitudes": total_solicitudes,
            "esta_semana": esta_semana,
            "pendientes_converter": pendientes_converter,
            "verificacion_hoy": verificacion_hoy,
        },
    }


@router.get("/actividad-area")
def actividad_area(area: str = Query(..., description="'cromatografia' o 'postventa'")) -> dict[str, Any]:
    """Snapshot de actividad específico para el panel de un admin de área.

    Cromatografía: solicitudes (total, esta semana, lista reciente con quién
    envió el correo) + verificaciones diarias (última semana, con analistas).

    Post Venta: lecturas AccuTab (total, última semana) + verificaciones.
    """
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        # ── Métricas comunes ──────────────────────────────────────────
        cur.execute("SELECT count(*) AS total FROM solicitud WHERE vigente")
        total_solicitudes = cur.fetchone()["total"]

        cur.execute("""
            SELECT count(*) AS total FROM solicitud
            WHERE vigente AND fecha_entrada >= CURRENT_DATE - INTERVAL '7 days'
        """)
        solicitudes_semana = cur.fetchone()["total"]

        cur.execute("""
            SELECT count(*) AS total FROM verif_registro
            WHERE fecha >= CURRENT_DATE - INTERVAL '7 days'
        """)
        verificaciones_semana = cur.fetchone()["total"]

        cur.execute("""
            SELECT count(*) AS total FROM verif_registro WHERE fecha = CURRENT_DATE
        """)
        verificacion_hoy = cur.fetchone()["total"] > 0

        # ── Solicitudes recientes con quién las envió ─────────────────
        cur.execute("""
            SELECT
                s.id,
                s.nro_solicitud,
                s.fecha_entrada,
                s.especie,
                s.variedad,
                c.nombre AS cliente,
                p.nombre AS planta,
                (
                    SELECT DISTINCT ON (e.archivo)
                           e.usuario_nombre
                    FROM envio_solicitud_log e
                    WHERE e.numero_solicitud = s.nro_solicitud
                      AND e.exitoso = TRUE
                    ORDER BY e.archivo, e.creado_en DESC
                    LIMIT 1
                ) AS enviado_por
            FROM solicitud s
            LEFT JOIN planta  p ON p.id = s.planta_id
            LEFT JOIN cliente c ON c.id = p.cliente_id
            WHERE s.vigente
              AND s.fecha_entrada >= CURRENT_DATE - INTERVAL '14 days'
            ORDER BY s.fecha_entrada DESC, s.id DESC
            LIMIT 10
        """)
        solicitudes_recientes = [
            {
                "id": r["id"],
                "nro_solicitud": r["nro_solicitud"],
                "fecha_entrada": r["fecha_entrada"].isoformat() if r["fecha_entrada"] else None,
                "especie": r["especie"] or "—",
                "variedad": r["variedad"] or "—",
                "cliente": r["cliente"] or "—",
                "planta": r["planta"] or "—",
                "enviado_por": r["enviado_por"],
            }
            for r in cur.fetchall()
        ]

        # ── Verificaciones de la última semana con analistas ──────────
        cur.execute("""
            SELECT
                vr.fecha,
                vr.resultado,
                vr.creado_por,
                vr.revisado_por,
                vr.actualizado_en
            FROM verif_registro vr
            WHERE vr.fecha >= CURRENT_DATE - INTERVAL '14 days'
            ORDER BY vr.fecha DESC
            LIMIT 10
        """)
        verificaciones_recientes = [
            {
                "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                "resultado": r["resultado"] or "Sin datos",
                "creado_por": r["creado_por"] or None,
                "revisado_por": r["revisado_por"] or None,
                "actualizado_en": r["actualizado_en"].isoformat() if r["actualizado_en"] else None,
            }
            for r in cur.fetchall()
        ]

    # ── AccuTab (para Post Venta) ─────────────────────────────────────
    trace_recientes = _trace_recientes(8)

    return {
        "area": area,
        "metricas": {
            "total_solicitudes": total_solicitudes,
            "solicitudes_semana": solicitudes_semana,
            "verificaciones_semana": verificaciones_semana,
            "verificacion_hoy": verificacion_hoy,
        },
        "solicitudes_recientes": solicitudes_recientes,
        "verificaciones_recientes": verificaciones_recientes,
        "trace_recientes": trace_recientes,
    }
