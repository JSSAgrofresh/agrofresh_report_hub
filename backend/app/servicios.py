"""
Tipo de servicio de una solicitud: Línea de proceso, Actimist o Ecofog.

Cada servicio tiene su propio listado de Sold To / Ship To y su propia lista de
distribución. Todo lo que existía antes de separarlos es de **Línea de
proceso**, y por eso Línea de proceso es el valor por defecto: un contacto sin
`servicio`, una solicitud sin «Tipo Aplicación» o una RYD siguen exactamente
como antes.

| Servicio          | Listado (tablas)                     | Contactos (`servicio`) |
|-------------------|--------------------------------------|------------------------|
| Línea de proceso  | `cliente` · `planta`                 | vacío (los de siempre) |
| Actimist          | `cliente_actimist` · `planta_actimist` (0049) | `"actimist"`  |
| Ecofog            | `cliente_ecofog` · `planta_ecofog` (0050)     | `"ecofog"`    |

Ecofog es una copia de Actimist en todo (formulario, listado, lista de
distribución, respaldos y referentes): cada regla de Actimist se pregunta con
`es_servicio_con_listado`, y los datos propios de cada uno viven aparte.

Ingesta, Converter y Report siguen leyendo SOLO `cliente`/`planta`: el listado
de Actimist lo usa por ahora únicamente el formulario de la solicitud.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

LINEA_PROCESO = ""
ACTIMIST = "actimist"
ECOFOG = "ecofog"
SERVICIOS = (LINEA_PROCESO, ACTIMIST, ECOFOG)
ETIQUETA = {LINEA_PROCESO: "Línea de proceso", ACTIMIST: "Actimist", ECOFOG: "Ecofog"}

# Tablas del listado de cada servicio. Son nombres fijos (nunca vienen del
# usuario), así que se pueden poner en el SQL sin riesgo.
TABLAS: dict[str, tuple[str, str]] = {
    LINEA_PROCESO: ("cliente", "planta"),
    ACTIMIST: ("cliente_actimist", "planta_actimist"),
    ECOFOG: ("cliente_ecofog", "planta_ecofog"),
}

# Actimist: quién recibe SIEMPRE. Sin lista del cliente, Para = estos dos
# (en vez de Jorge y Claudia de Línea de proceso).
PARA_SIN_LISTA_ACTIMIST = ["JORGE.SANDOVAL@AGROFRESH.COM", "AGROFRESHREPORTHUB@GMAIL.COM"]
# Referentes de producto de Actimist: van en toda solicitud Actimist real
# (las de prueba no) y en copia de sus resultados.
PERMANENTES_ACTIMIST = ["CJIMENEZ@AGROFRESH.COM", "CVALENZUELA@AGROFRESH.COM"]
# Ecofog parte con los mismos respaldos y referentes que Actimist (copia).
PARA_SIN_LISTA_ECOFOG = list(PARA_SIN_LISTA_ACTIMIST)
PERMANENTES_ECOFOG = list(PERMANENTES_ACTIMIST)
PARA_SIN_LISTA_SERVICIO = {ACTIMIST: PARA_SIN_LISTA_ACTIMIST, ECOFOG: PARA_SIN_LISTA_ECOFOG}
PERMANENTES_SERVICIO = {ACTIMIST: PERMANENTES_ACTIMIST, ECOFOG: PERMANENTES_ECOFOG}


# RYD (ensayos de AgroFresh) no es un servicio con listado propio: usa el de
# Línea de proceso. Lo único distinto es el respaldo: donde Línea de proceso
# lleva a Claudia, RYD lleva a Carla y Fran (más Jorge, que va siempre).
# Solo vale para las solicitudes con la marca `respaldo_ryd` (las creadas desde
# este cambio): las RYD anteriores conservan a Claudia.
RYD_COPIAS = ["CCACERES@AGROFRESH.COM", "FGONZALEZ@AGROFRESH.COM"]
MARCA_RESPALDO_RYD = "respaldo_ryd"


def _norm(texto: Any) -> str:
    t = unicodedata.normalize("NFKD", str(texto or ""))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip().casefold()


def clave_servicio(valor: Any) -> str:
    """«Actimist», «ACTIMIST », «actimist» → `actimist`; «Ecofog» → `ecofog`.
    Todo lo demás (vacío, «Línea de proceso», «RYD», un valor desconocido) →
    Línea de proceso, que es lo que regía antes de separar los servicios."""
    n = _norm(valor)
    return n if n in (ACTIMIST, ECOFOG) else LINEA_PROCESO


def es_tipo_ryd(datos: dict | None) -> bool:
    """¿El «Tipo Aplicación» de la solicitud es RYD?"""
    datos = datos or {}
    campos = datos.get("campos_laboratorio") or {}
    tipo = campos.get("Tipo Aplicación") if isinstance(campos, dict) else None
    return _norm(tipo or datos.get("tipo_aplicacion") or "") == "ryd"


def usa_respaldo_ryd(datos: dict | None) -> bool:
    """¿Rige el respaldo de RYD (Carla y Fran)? Solo en RYD con la marca
    `respaldo_ryd`, puesta al crear: las anteriores siguen con Claudia."""
    return bool((datos or {}).get(MARCA_RESPALDO_RYD)) and es_tipo_ryd(datos)


def es_servicio_con_listado(servicio: Any) -> bool:
    """¿Es un servicio con listado y lista propios (todo menos Línea de
    proceso)? Actimist y Ecofog siguen las mismas reglas."""
    return clave_servicio(servicio) != LINEA_PROCESO


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
