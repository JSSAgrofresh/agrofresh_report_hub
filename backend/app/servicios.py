"""
Tipo de servicio de una solicitud: Línea de proceso o Actimist.

Cada servicio tiene su propio listado de Sold To / Ship To y su propia lista de
distribución. Todo lo que existía antes de separarlos es de **Línea de
proceso**, y por eso Línea de proceso es el valor por defecto: un contacto sin
`servicio`, una solicitud sin «Tipo Aplicación» o una RYD siguen exactamente
como antes.

| Servicio          | Listado (tablas)                     | Contactos (`servicio`) |
|-------------------|--------------------------------------|------------------------|
| Línea de proceso  | `cliente` · `planta`                 | vacío (los de siempre) |
| Actimist          | `cliente_actimist` · `planta_actimist` (0049) | `"actimist"`  |

Ingesta, Converter y Report siguen leyendo SOLO `cliente`/`planta`: el listado
de Actimist lo usa por ahora únicamente el formulario de la solicitud.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

LINEA_PROCESO = ""
ACTIMIST = "actimist"
SERVICIOS = (LINEA_PROCESO, ACTIMIST)
ETIQUETA = {LINEA_PROCESO: "Línea de proceso", ACTIMIST: "Actimist"}

# Tablas del listado de cada servicio. Son nombres fijos (nunca vienen del
# usuario), así que se pueden poner en el SQL sin riesgo.
TABLAS: dict[str, tuple[str, str]] = {
    LINEA_PROCESO: ("cliente", "planta"),
    ACTIMIST: ("cliente_actimist", "planta_actimist"),
}

# Actimist: quién recibe SIEMPRE. Sin lista del cliente, Para = estos dos
# (en vez de Jorge y Claudia de Línea de proceso).
PARA_SIN_LISTA_ACTIMIST = ["JORGE.SANDOVAL@AGROFRESH.COM", "AGROFRESHREPORTHUB@GMAIL.COM"]
# Referentes de producto de Actimist: van en toda solicitud Actimist real
# (las de prueba no) y en copia de sus resultados.
PERMANENTES_ACTIMIST = ["CJIMENEZ@AGROFRESH.COM", "CVALENZUELA@AGROFRESH.COM"]


def _norm(texto: Any) -> str:
    t = unicodedata.normalize("NFKD", str(texto or ""))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip().casefold()


def clave_servicio(valor: Any) -> str:
    """«Actimist», «ACTIMIST », «actimist» → `actimist`. Todo lo demás
    (vacío, «Línea de proceso», «RYD», un valor desconocido) → Línea de
    proceso, que es lo que regía antes de separar los servicios."""
    return ACTIMIST if _norm(valor) == ACTIMIST else LINEA_PROCESO


def servicio_de_datos(datos: dict | None) -> str:
    """El servicio de una solicitud, por su «Tipo Aplicación»."""
    datos = datos or {}
    campos = datos.get("campos_laboratorio") or {}
    tipo = campos.get("Tipo Aplicación") if isinstance(campos, dict) else None
    return clave_servicio(tipo or datos.get("tipo_aplicacion") or "")


def es_del_servicio(contacto: dict, servicio: str) -> bool:
    """¿Este contacto es de ese servicio? Sin `servicio` = Línea de proceso."""
    return clave_servicio(contacto.get("servicio")) == clave_servicio(servicio)


def tablas(servicio: Any) -> tuple[str, str]:
    """(tabla de clientes, tabla de plantas) del listado de ese servicio."""
    return TABLAS[clave_servicio(servicio)]
