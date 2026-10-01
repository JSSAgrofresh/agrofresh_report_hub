"""
Informes en Storage: una copia de cada informe PDF, ordenada para encontrarla.

    informes/<PLANTA>/<FECHA>/<ANÁLISIS>/<LABORATORIO>/<archivo>.pdf

- PLANTA: el Ship To. Si dos clientes tienen un Ship To con el mismo nombre
  («CHILLAN», «REQUINOA»…) se le agrega el cliente -«CHILLAN (EXPORTADORA
  PRIZE S.A)»- para no mezclar informes de clientes distintos: esta carpeta es
  la que algún día se le muestra a cada cliente.
- FECHA: la de muestreo, en ISO (AAAA-MM-DD); Storage la muestra como DD-MM-AAAA.
- ANÁLISIS: el tipo de servicio (Actimist, Línea de proceso…).
- LABORATORIO: quien emitió el informe.

El PDF se sube con su nombre: volver a pasar un informe ya guardado lo
reemplaza en su sitio, no lo duplica (se vuelven a pasar todos por Converter).
Es independiente de Auditoría interna (`r2_auditoria`): son dos copias con dos
usos y ninguna depende de la otra.
"""
from __future__ import annotations

import logging
import re

from . import r2
from .db import conexion, cursor_dict
from .r2_auditoria import segmento_seguro

logger = logging.getLogger(__name__)

RAIZ = "informes"

_FECHA_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
_FECHA_CL = re.compile(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})")


def fecha_iso(valor: str | None) -> str | None:
    """«2026-09-30», «2026-09-30T…» o «30-09-2026» -> «2026-09-30»; otra cosa, None."""
    texto = (valor or "").strip()
    m = _FECHA_ISO.match(texto)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = _FECHA_CL.match(texto)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def laboratorio_visible(laboratorio: str | None) -> str:
    """El laboratorio propio llega como «Agrofresh» o «AGROFRESH»: una sola carpeta."""
    lab = (laboratorio or "").strip()
    return "AgroFresh" if lab.casefold() == "agrofresh" else lab


def _clientes_con_planta(ship_to: str) -> int:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT COUNT(DISTINCT cliente_id) AS n FROM planta WHERE lower(btrim(nombre)) = lower(btrim(%s))",
            (ship_to,),
        )
        return int(cur.fetchone()["n"])


def carpeta_planta(ship_to: str | None, sold_to: str | None) -> str:
    """Nombre de la carpeta de la planta (ver el docstring del módulo)."""
    planta = (ship_to or "").strip()
    cliente = (sold_to or "").strip()
    if not planta:
        return "Sin planta"
    if cliente:
        try:
            if _clientes_con_planta(planta) > 1:
                return segmento_seguro(f"{planta} ({cliente})", "Sin planta")
        except Exception:
            logger.exception("No se pudo revisar si el Ship To %r se repite entre clientes", planta)
    return segmento_seguro(planta, "Sin planta")


def ruta_informe(
    planta: str, fecha: str | None, analisis: str | None, laboratorio: str | None, nombre: str
) -> str:
    """Clave en R2. `planta` es el nombre de carpeta ya resuelto (`carpeta_planta`)."""
    partes = [
        RAIZ,
        segmento_seguro(planta, "Sin planta"),
        fecha_iso(fecha) or "Sin fecha",
        segmento_seguro(analisis, "Sin tipo de análisis"),
        segmento_seguro(laboratorio_visible(laboratorio), "Sin laboratorio"),
        segmento_seguro(nombre, "informe.pdf"),
    ]
    return "/".join(partes)


def guardar(
    pdf: bytes,
    nombre: str,
    *,
    ship_to: str | None,
    sold_to: str | None,
    fecha: str | None,
    analisis: str | None,
    laboratorio: str | None,
) -> str | None:
    """Sube el PDF a su carpeta y devuelve la clave, o None si R2 no está
    configurado. Los errores de R2 se propagan: quien llama decide si le cuestan
    algo al usuario."""
    if not r2.disponible():
        return None
    key = ruta_informe(carpeta_planta(ship_to, sold_to), fecha, analisis, laboratorio, nombre)
    r2.subir(key, pdf, "application/pdf")
    return key
