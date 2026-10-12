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
# RYD tiene su PROPIA lista de distribución (contactos con `servicio: "ryd"`), pero
# comparte el listado de Sold To / Ship To de Línea de proceso. Por eso hay dos
# preguntas distintas: `clave_servicio` (¿qué listado?) y `clave_lista` (¿qué lista
# de distribución?). Una RYD usa su lista solo si lleva la marca `respaldo_ryd`.
RYD = "ryd"
# Jorge y el sistema (Report Hub) van SIEMPRE en copia en Actimist, Ecofog y RYD.
COPIA_FIJA = ["JORGE.SANDOVAL@AGROFRESH.COM", "AGROFRESHREPORTHUB@GMAIL.COM"]


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


def clave_lista(valor: Any) -> str:
    """La lista de distribución de un valor: `actimist`, `ecofog`, `ryd` o vacío
    (Línea de proceso). A diferencia de `clave_servicio`, reconoce RYD."""
    n = _norm(valor)
    return n if n in (ACTIMIST, ECOFOG, RYD) else LINEA_PROCESO


def lista_de_datos(datos: dict | None) -> str:
    """La lista de distribución de una solicitud: la de su servicio, o la de RYD si
    es RYD con la marca `respaldo_ryd` (las RYD anteriores siguen en Línea de proceso)."""
    return RYD if usa_respaldo_ryd(datos) else servicio_de_datos(datos)


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
    """¿Este contacto es de esa lista? Sin `servicio` = Línea de proceso."""
    return clave_lista(contacto.get("servicio")) == clave_lista(servicio)


def tablas(servicio: Any) -> tuple[str, str]:
    """(tabla de clientes, tabla de plantas) del listado de ese servicio."""
    return TABLAS[clave_servicio(servicio)]


# Los fijos que trae el sistema. El administrador general puede cambiarlos desde Administración
# General → Listas de distribución; lo que guarda queda en `ARCHIVO_FIJOS` y manda sobre estos.
ARCHIVO_FIJOS = "listas_fijos.json"
_SEGUNDOS_CACHE = 15.0
_cache_fijos: dict[str, Any] = {"clave": None, "hasta": 0.0, "datos": {}}


def fijos_originales(lista: Any) -> dict[str, list[str]]:
    """Los fijos de fábrica: Actimist y Ecofog → Para Carlos y Cristian; RYD → Para Carla y Fran; en
    las tres, Jorge y el Report Hub en Copia. Línea de proceso no tiene (su respaldo solo rige cuando
    la planta no tiene lista del cliente)."""
    l = clave_lista(lista)
    if l == RYD:
        return {"para": list(RYD_COPIAS), "cc": list(COPIA_FIJA)}
    if l in PERMANENTES_SERVICIO:
        return {"para": list(PERMANENTES_SERVICIO[l]), "cc": list(COPIA_FIJA)}
    return {"para": [], "cc": []}


def tiene_fijos(lista: Any) -> bool:
    """¿Esta lista tiene destinatarios fijos que se puedan editar? (Línea de proceso no.)"""
    return clave_lista(lista) != LINEA_PROCESO


def _sin_repetidos(correos: Any) -> list[str]:
    salida: list[str] = []
    vistos: set[str] = set()
    for c in correos if isinstance(correos, list) else []:
        email = str(c or "").strip()
        if email and email.casefold() not in vistos:
            vistos.add(email.casefold())
            salida.append(email)
    return salida


def _guardados() -> dict[str, Any]:
    """Lo que el administrador cambió. Se lee con una memoria de pocos segundos: estas reglas se
    consultan por cada solicitud y la configuración viene de R2 (no leerla dentro de un bucle)."""
    import time

    from . import config, config_store, r2

    clave = (config.STORAGE_DIR, bool(r2.disponible()))
    ahora = time.monotonic()
    if _cache_fijos["clave"] == clave and ahora < _cache_fijos["hasta"]:
        return _cache_fijos["datos"]
    try:
        datos = config_store.leer(ARCHIVO_FIJOS, {})  # type: ignore[arg-type]
        datos = datos if isinstance(datos, dict) else {}
        vigencia = _SEGUNDOS_CACHE
    except Exception:  # un fallo de R2 no puede tumbar el correo de una solicitud: rigen los de fábrica
        datos, vigencia = {}, 3.0
    _cache_fijos.update(clave=clave, hasta=ahora + vigencia, datos=datos)
    return datos


def invalidar_fijos() -> None:
    _cache_fijos.update(clave=None, hasta=0.0, datos={})


def fijos_personalizados(lista: Any) -> bool:
    """¿Esta lista tiene fijos guardados a mano (distintos de los de fábrica)?"""
    l = clave_lista(lista)
    g = _guardados().get(l)
    return tiene_fijos(l) and isinstance(g, dict) and fijos_de_lista(l) != fijos_originales(l)


def fijos_de_lista(lista: Any) -> dict[str, list[str]]:
    """Quién recibe SIEMPRE en esa lista, tenga o no plantas cargadas. Son los de fábrica
    (`fijos_originales`) salvo que el administrador general los haya cambiado."""
    l = clave_lista(lista)
    if not tiene_fijos(l):
        return {"para": [], "cc": []}
    g = _guardados().get(l)
    if isinstance(g, dict) and isinstance(g.get("para"), list) and isinstance(g.get("cc"), list):
        para = _sin_repetidos(g["para"])
        if para:  # sin nadie en Para no hay «siempre reciben»: se cae a los de fábrica
            return {"para": para, "cc": _sin_repetidos(g["cc"])}
    return fijos_originales(l)


def guardar_fijos(lista: Any, para: list[str], cc: list[str]) -> dict[str, list[str]]:
    """Guarda los fijos de una lista (el que llama ya validó los correos). Devuelve lo vigente."""
    from . import config_store

    l = clave_lista(lista)
    if not tiene_fijos(l):
        raise ValueError("Línea de proceso no tiene destinatarios fijos.")
    datos = dict(config_store.leer(ARCHIVO_FIJOS, {}))  # type: ignore[arg-type]
    datos[l] = {"para": _sin_repetidos(para), "cc": _sin_repetidos(cc)}
    config_store.escribir(ARCHIVO_FIJOS, datos)  # type: ignore[arg-type]
    invalidar_fijos()
    return fijos_de_lista(l)


def restaurar_fijos(lista: Any) -> dict[str, list[str]]:
    """Vuelve a los fijos de fábrica de esa lista."""
    from . import config_store

    l = clave_lista(lista)
    datos = dict(config_store.leer(ARCHIVO_FIJOS, {}))  # type: ignore[arg-type]
    if l in datos:
        datos.pop(l)
        config_store.escribir(ARCHIVO_FIJOS, datos)  # type: ignore[arg-type]
    invalidar_fijos()
    return fijos_de_lista(l)
