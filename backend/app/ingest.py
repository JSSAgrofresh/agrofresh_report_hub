import gc
import json
from difflib import SequenceMatcher
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from psycopg2.extras import execute_values
from pydantic import BaseModel

from . import mapeo
from .auditoria import CAMPOS_HOMOGENIZAR
from .db import conexion, cursor_dict
from .listados import clave_normalizada

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

# Sold To, Ship To, Especie y Variedad son los 4 campos con una fuente de
# verdad real y administrada (cliente/planta y valor_lista -ver catalogo.py y
# listados.py-): toda fila nueva SIEMPRE pasa por ahí antes de insertarse.
# Si calza -exacto, o es un valor crudo ya homogenizado hacia una variedad
# estándar- se reescribe al valor CANÓNICO antes de guardar. Si no calza con
# nada, la fila entera se manda a pendiente_revision -nunca se autocrea un
# cliente, planta, especie o variedad nuevos solo porque vinieron en un
# archivo-: alguien tiene que asignarlo o escribirlo a mano desde
# Listados/Pendientes. tipo_servicio y laboratorio no tienen ese maestro
# todavía, así que siguen con la regla más laxa de antes (solo se avisa si es
# una variante de mayúsculas/espacios de algo ya cargado; un valor
# genuinamente nuevo entra directo).
CAMPOS_LISTADOS = ("sold_to_raw", "ship_to_raw", "especie", "variedad")
CAMPOS_CATALOGO = [
    (campo, etiqueta) for _tabla, campo, etiqueta in CAMPOS_HOMOGENIZAR if campo not in CAMPOS_LISTADOS
]

# Algunos archivos traen la especie pegada al nombre de la variedad, en inglés
# ("Apples - Cripps Pink", "Blueberries Duke", "Pears Packham"). El prefijo no
# es parte del nombre real de la variedad: es la especie, repetida. Se saca
# antes de buscar en Listados, PERO solo si coincide con la Especie que ya se
# resolvió para esa misma fila -si el archivo dice Especie=Manzana y la
# variedad viene con prefijo "Blueberries", eso es una contradicción real y la
# fila tiene que ir a revisión, no adivinarse-.
_PREFIJO_VARIEDAD_A_ESPECIE = {
    "apple": "Manzana",
    "apples": "Manzana",
    "pear": "Pera",
    "pears": "Pera",
    "blueberry": "Arándano",
    "blueberries": "Arándano",
    "cherry": "Cerezas",
    "cherries": "Cerezas",
    "plum": "Ciruela",
    "plums": "Ciruela",
    "grape": "Uva",
    "grapes": "Uva",
    "nectarine": "Nectarina",
    "nectarines": "Nectarina",
    "peach": "Durazno",
    "peaches": "Durazno",
    "kiwi": "Kiwi",
    "kiwis": "Kiwi",
    "orange": "Naranja",
    "oranges": "Naranja",
    "lemon": "Limón",
    "lemons": "Limón",
    "mandarin": "Mandarina",
    "mandarins": "Mandarina",
    "clementine": "Clementina",
    "clementines": "Clementina",
    "avocado": "Palta",
    "avocados": "Palta",
    "pomegranate": "Granada",
    "grapefruit": "Pomelo",
}


def clave_variedad_sin_prefijo(clave: str, especie_canonica: str) -> str | None:
    """'apples cripps pink' -> 'cripps pink' cuando la Especie ya resuelta de
    esa fila es Manzana. Devuelve None si no hay prefijo conocido, si el
    prefijo contradice la especie, o si al sacarlo no queda nada."""
    partes = clave.split(" ")
    if len(partes) < 2:
        return None
    especie_del_prefijo = _PREFIJO_VARIEDAD_A_ESPECIE.get(partes[0])
    if not especie_del_prefijo:
        return None
    if clave_normalizada(especie_del_prefijo) != clave_normalizada(especie_canonica):
        return None
    return " ".join(partes[1:]) or None


class CargaRequest(BaseModel):
    filas: list[dict[str, Any]]
    origen: str = "ingest"


def _cliente_id(cur, nombre: str, escribir: bool) -> tuple[int | None, bool]:
    cur.execute("SELECT id FROM cliente WHERE nombre = %s", (nombre,))
    row = cur.fetchone()
    if row:
        return row["id"], False
    if not escribir:
        return None, True
    cur.execute("INSERT INTO cliente (nombre) VALUES (%s) RETURNING id", (nombre,))
    return cur.fetchone()["id"], True


def _planta_id(cur, cliente_id: int | None, nombre: str, escribir: bool) -> tuple[int | None, bool]:
    if cliente_id is None:
        return None, False
    cur.execute("SELECT id FROM planta WHERE cliente_id = %s AND nombre = %s", (cliente_id, nombre))
    row = cur.fetchone()
    if row:
        return row["id"], False
    if not escribir:
        return None, True
    cur.execute("INSERT INTO planta (cliente_id, nombre) VALUES (%s, %s) RETURNING id", (cliente_id, nombre))
    return cur.fetchone()["id"], True


def _cargar_analitos(cur) -> dict[tuple[str, str], tuple[int, str]]:
    """(codigo, laboratorio) -> (id, laboratorio). Pre-cargado una vez para evitar
    una query por analito por fila durante el procesamiento masivo."""
    cur.execute("SELECT id, codigo, laboratorio FROM analito")
    mapa: dict[tuple[str, str], tuple[int, str]] = {}
    primero: dict[str, tuple[int, str]] = {}
    for r in cur.fetchall():
        key = (r["codigo"], r["laboratorio"])
        mapa[key] = (r["id"], r["laboratorio"])
        if r["codigo"] not in primero:
            primero[r["codigo"]] = (r["id"], r["laboratorio"])
    return mapa, primero


def _analito_id_cache(
    mapa: dict[tuple[str, str], tuple[int, str]],
    primero: dict[str, tuple[int, str]],
    codigo: str,
    laboratorio: str | None,
) -> tuple[int | None, str | None]:
    if laboratorio:
        entry = mapa.get((codigo, laboratorio))
        if entry:
            return entry[0], None
    fallback = primero.get(codigo)
    if fallback:
        return fallback[0], f"Analito {codigo}: el laboratorio '{laboratorio}' no calzó exacto, se usó el catálogo de '{fallback[1]}'"
    return None, f"Analito {codigo} no está en el catálogo todavía, se guardó en analito_raw"


def _cargar_catalogos(cur) -> dict[str, dict[str, set[str]]]:
    """Catálogo laxo para tipo_servicio/laboratorio -sin maestro real todavía,
    así que se compara contra lo que ya hay cargado en solicitud, guardando
    tanto los valores exactos como su forma normalizada para distinguir "es
    nuevo de verdad" de "es la misma palabra pero mal tipeada"."""
    catalogos: dict[str, dict[str, set[str]]] = {}
    for campo, _etiqueta in CAMPOS_CATALOGO:
        cur.execute(f"SELECT DISTINCT {campo} FROM solicitud WHERE {campo} IS NOT NULL")
        valores = {r[campo] for r in cur.fetchall()}
        catalogos[campo] = {
            "exactos": valores,
            "normalizados": {v.strip().lower() for v in valores},
        }
    return catalogos


def _fuera_de_catalogo(sol: dict[str, Any], catalogos: dict[str, dict[str, set[str]]]) -> list[dict[str, str]]:
    """Solo marca un valor si es variante de mayúsculas/espacios de algo que
    YA existe (probable error de tipeo) — un valor genuinamente nuevo (que no
    se parece a nada cargado antes, ni siquiera normalizado) entra directo,
    sin pedir revisión: no es un error, es un dato nuevo legítimo. Aplica
    solo a tipo_servicio/laboratorio -Sold To, Ship To, Especie y Variedad
    usan la regla estricta de _resolver_listados-."""
    motivos = []
    for campo, etiqueta in CAMPOS_CATALOGO:
        valor = sol.get(campo)
        if not valor:
            continue
        cat = catalogos[campo]
        if valor in cat["exactos"]:
            continue
        if valor.strip().lower() in cat["normalizados"]:
            motivos.append({"campo": campo, "etiqueta": etiqueta, "valor": valor})
    return motivos


_ETIQUETA_LISTADO = {
    "sold_to_raw": "Sold To (cliente)",
    "ship_to_raw": "Ship To (sucursal)",
    "especie": "Especie",
    "variedad": "Variedad",
}

# Palabras que son puro "ruido" de razón social -SPA, S.P.A., LTDA, SA...-,
# no dicen nada sobre a qué cliente real se refiere el nombre. Se sacan solo
# desde el FINAL del nombre (nunca del medio, para no comerse una palabra real
# que casualmente coincida) hasta encontrar una palabra que no sea ruido.
# "AGROFRESH CHILE LTDA" y "Agrofresh Chile" terminan en la misma clave.
_PALABRAS_SUFIJO_EMPRESA = {
    "s", "p", "a", "sa", "spa", "ltda", "limitada", "eirl", "e", "i", "r",
    "cia", "compania", "sac", "srl", "inc", "corp", "llc", "co", "sociedad",
    "anonima", "hnos", "y",
}


def clave_normalizada_empresa(valor: str) -> str:
    """clave_normalizada + saca los sufijos de razón social del final -para
    Sold To/Ship To únicamente, nunca para Especie/Variedad-."""
    palabras = clave_normalizada(valor).split(" ")
    while len(palabras) > 1 and palabras[-1] in _PALABRAS_SUFIJO_EMPRESA:
        palabras.pop()
    return " ".join(palabras)


UMBRAL_SUGERENCIA = 0.72
TOPE_SUGERENCIAS = 3


def _sugerencias_fuzzy(clave_buscada: str, candidatos: dict[str, str]) -> list[dict[str, Any]]:
    """Nunca se usan para asignar solas -eso sería justo el "match silencioso
    e incierto" que no queremos-: son para mostrarle al administrador en Data
    Core "che, esto se parece a tal otra cosa", y que decida él."""
    if not clave_buscada:
        return []
    puntuadas = []
    vistos: set[str] = set()
    for clave_candidata, valor_oficial in candidatos.items():
        if valor_oficial in vistos:
            continue
        ratio = SequenceMatcher(None, clave_buscada, clave_candidata).ratio()
        if ratio >= UMBRAL_SUGERENCIA:
            puntuadas.append({"valor": valor_oficial, "confianza": round(ratio, 2)})
            vistos.add(valor_oficial)
    puntuadas.sort(key=lambda s: -s["confianza"])
    return puntuadas[:TOPE_SUGERENCIAS]


def _mapa_mapeos_confirmados(cur, entidad: str) -> dict[tuple[Any, str], int]:
    """(cliente_id o None, clave_crudo_normalizada) -> destino_id (cliente.id
    o planta.id según `entidad`). Es la memoria de correcciones ya
    confirmadas a mano desde Data Core -ver aprobar_pendiente-."""
    cur.execute(
        "SELECT cliente_id, valor_crudo_normalizado, destino_id FROM mapeo_confirmado WHERE entidad = %s",
        (entidad,),
    )
    return {(r["cliente_id"], r["valor_crudo_normalizado"]): r["destino_id"] for r in cur.fetchall()}


def _mapa_clientes(cur) -> dict[str, tuple[str, int]]:
    """clave normalizada -> (nombre oficial, id)."""
    cur.execute("SELECT id, nombre FROM cliente WHERE activo")
    return {clave_normalizada_empresa(r["nombre"]): (r["nombre"], r["id"]) for r in cur.fetchall()}


def _mapa_plantas(cur) -> dict[int, dict[str, tuple[str, int]]]:
    """cliente_id -> {clave normalizada -> (nombre oficial, id)}."""
    cur.execute(
        "SELECT p.id, p.cliente_id, p.nombre FROM planta p "
        "JOIN cliente c ON c.id = p.cliente_id WHERE p.activo AND c.activo"
    )
    mapa: dict[int, dict[str, tuple[str, int]]] = {}
    for r in cur.fetchall():
        mapa.setdefault(r["cliente_id"], {})[clave_normalizada_empresa(r["nombre"])] = (r["nombre"], r["id"])
    return mapa


def _mapa_especies(cur) -> dict[str, tuple[str, int]]:
    """clave normalizada -> (valor canónico, especie_id). Incluye tanto las
    especies activas tal cual, como los valores crudos ya homogenizados hacia
    una -en ese caso el canónico es el de la especie estándar, no el texto
    crudo que vino en el archivo-."""
    cur.execute(
        "SELECT a.valor_normalizado AS clave, COALESCE(e.valor, a.valor) AS canonico, COALESCE(e.id, a.id) AS id "
        "FROM valor_lista a LEFT JOIN valor_lista e ON e.id = a.fusionado_en_id "
        "WHERE a.tipo = 'especie' AND (a.activo OR a.fusionado_en_id IS NOT NULL)"
    )
    return {r["clave"]: (r["canonico"], r["id"]) for r in cur.fetchall()}


def _mapa_variedades(cur) -> dict[int, dict[str, str]]:
    """especie_id -> {clave normalizada -> valor canónico}. Mismo criterio de
    homogenización que _mapa_especies."""
    cur.execute(
        "SELECT a.especie_id, a.valor_normalizado AS clave, COALESCE(e.valor, a.valor) AS canonico "
        "FROM valor_lista a LEFT JOIN valor_lista e ON e.id = a.fusionado_en_id "
        "WHERE a.tipo = 'variedad' AND (a.activo OR a.fusionado_en_id IS NOT NULL)"
    )
    mapa: dict[int, dict[str, str]] = {}
    for r in cur.fetchall():
        mapa.setdefault(r["especie_id"], {})[r["clave"]] = r["canonico"]
    return mapa


def _mapa_variedades_huerfanas(cur) -> dict[str, tuple[str, int]]:
    """clave normalizada -> (valor, id) de las variedades que están en Listados
    pero SIN especie asignada.

    La hoja "ESPECIE VARIEDAD" del Excel maestro trae dos columnas
    independientes -19 especies por un lado, ~500 variedades por otro, sin
    parear fila a fila-, así que al importarla ninguna variedad queda
    vinculada a su especie. Como _mapa_variedades agrupa por especie_id, esas
    quedan bajo la llave None y _resolver_listados nunca las encuentra: son
    entradas muertas que garantizan que la fila caiga en pendientes aunque el
    nombre esté bien escrito y sí exista en el maestro. Se usan como último
    recurso -ver _resolver_listados-, adoptándolas hacia la especie con la que
    aparecen por primera vez."""
    cur.execute(
        "SELECT id, valor, valor_normalizado FROM valor_lista "
        "WHERE tipo = 'variedad' AND especie_id IS NULL AND activo AND fusionado_en_id IS NULL"
    )
    return {r["valor_normalizado"]: (r["valor"], r["id"]) for r in cur.fetchall()}


def _cargar_mapas_listados(cur) -> dict[str, Any]:
    return {
        "clientes": _mapa_clientes(cur),
        "plantas": _mapa_plantas(cur),
        "especies": _mapa_especies(cur),
        "variedades": _mapa_variedades(cur),
        "variedades_huerfanas": _mapa_variedades_huerfanas(cur),
        "mapeos_sold_to": _mapa_mapeos_confirmados(cur, "sold_to"),
        "mapeos_ship_to": _mapa_mapeos_confirmados(cur, "ship_to"),
    }


def _resolver_listados(
    sol: dict[str, Any], mapas: dict[str, Any], adopciones: list[dict[str, Any]] | None = None
) -> list[dict[str, str]]:
    """Reescribe sold_to_raw/ship_to_raw/especie/variedad de `sol` a su valor
    CANÓNICO cuando calzan con Listados: primero un mapeo ya confirmado a
    mano antes (memoria), después calce exacto/normalizado. Lo que no calza
    con nada NO se reescribe ni se deja pasar: se devuelve como motivo para
    mandar la fila entera a pendiente_revision -con sugerencias por
    similitud si las hay, pero NUNCA asignadas solas, son solo para que el
    administrador decida en Data Core-.

    `adopciones` recolecta las variedades huérfanas que hubo que vincular a
    una especie para poder resolver la fila. Acá no se escribe nada -esta
    función no toca la base-: la persiste _procesar_filas, y solo cuando la
    carga es real (nunca en preview)."""
    motivos: list[dict[str, Any]] = []
    if adopciones is None:
        adopciones = []

    sold_to = sol.get("sold_to_raw")
    sold_to_resuelto = False
    cliente_id: int | None = None
    especie_id: int | None = None
    if sold_to:
        clave = clave_normalizada_empresa(sold_to)
        clientes_por_id = {c_id: (nombre, c_id) for nombre, c_id in mapas["clientes"].values()}
        destino_id = mapas["mapeos_sold_to"].get((None, clave))
        if destino_id is not None and destino_id in clientes_por_id:
            sol["sold_to_raw"], cliente_id = clientes_por_id[destino_id]
            sold_to_resuelto = True
        else:
            resuelto = mapas["clientes"].get(clave)
            if resuelto:
                sol["sold_to_raw"], cliente_id = resuelto
                sold_to_resuelto = True
            else:
                candidatos = {k: v[0] for k, v in mapas["clientes"].items()}
                motivos.append(
                    {
                        "campo": "sold_to_raw",
                        "etiqueta": _ETIQUETA_LISTADO["sold_to_raw"],
                        "valor": sold_to,
                        "sugerencias": _sugerencias_fuzzy(clave, candidatos),
                    }
                )

    ship_to = sol.get("ship_to_raw")
    if ship_to and sold_to_resuelto:
        # Si el Sold To no calzó, tampoco tiene sentido buscar su Ship To -la
        # fila ya va a pendiente_revision por el Sold To de todos modos-, y
        # las plantas de otro cliente ni siquiera son candidatas: la
        # jerarquía Sold To → Ship To del maestro se respeta acá.
        clave = clave_normalizada_empresa(ship_to)
        plantas_del_cliente = mapas["plantas"].get(cliente_id, {})
        destino_id = mapas["mapeos_ship_to"].get((cliente_id, clave))
        plantas_por_id = {p_id: (nombre, p_id) for nombre, p_id in plantas_del_cliente.values()}
        if destino_id is not None and destino_id in plantas_por_id:
            sol["ship_to_raw"] = plantas_por_id[destino_id][0]
        else:
            resuelto = plantas_del_cliente.get(clave)
            if resuelto:
                sol["ship_to_raw"] = resuelto[0]
            else:
                candidatos = {k: v[0] for k, v in plantas_del_cliente.items()}
                motivos.append(
                    {
                        "campo": "ship_to_raw",
                        "etiqueta": _ETIQUETA_LISTADO["ship_to_raw"],
                        "valor": ship_to,
                        "sugerencias": _sugerencias_fuzzy(clave, candidatos),
                    }
                )

    especie = sol.get("especie")
    if especie:
        clave = clave_normalizada(especie)
        resuelto = mapas["especies"].get(clave)
        if resuelto:
            sol["especie"], especie_id = resuelto
        else:
            candidatos = {k: v[0] for k, v in mapas["especies"].items()}
            motivos.append(
                {
                    "campo": "especie",
                    "etiqueta": _ETIQUETA_LISTADO["especie"],
                    "valor": especie,
                    "sugerencias": _sugerencias_fuzzy(clave, candidatos),
                }
            )

    variedad = sol.get("variedad")
    if variedad and especie_id is not None:
        clave = clave_normalizada(variedad)
        variedades_de_especie = mapas["variedades"].get(especie_id, {})
        canonico_variedad = variedades_de_especie.get(clave)

        # "Apples - Cripps Pink" con Especie=Manzana es la MISMA variedad que
        # "Cripps Pink": se saca el prefijo de especie y se busca de nuevo.
        if not canonico_variedad:
            clave_sin_prefijo = clave_variedad_sin_prefijo(clave, sol["especie"])
            if clave_sin_prefijo:
                canonico_variedad = variedades_de_especie.get(clave_sin_prefijo)
                if canonico_variedad:
                    clave = clave_sin_prefijo

        if canonico_variedad:
            sol["variedad"] = canonico_variedad
        else:
            # Último recurso antes de mandar la fila a revisión: la variedad
            # puede existir en Listados pero sin especie asignada (ver
            # _mapa_variedades_huerfanas). El nombre calza exacto con el
            # maestro -no es un invento ni una similitud-, así que se adopta
            # hacia esta especie en vez de pedir revisión por algo que ya
            # estaba en la lista. Queda registrado como advertencia visible.
            clave_huerfana = clave
            huerfana = mapas["variedades_huerfanas"].get(clave_huerfana)
            if not huerfana:
                alterna = clave_variedad_sin_prefijo(clave, sol["especie"])
                if alterna:
                    huerfana = mapas["variedades_huerfanas"].get(alterna)
                    if huerfana:
                        clave_huerfana = alterna
            if huerfana:
                valor_huerfano, id_huerfano = huerfana
                sol["variedad"] = valor_huerfano
                # Se refleja de inmediato en los mapas en memoria para que el
                # resto del lote la vea ya vinculada y no la adopte dos veces.
                mapas["variedades"].setdefault(especie_id, {})[clave_huerfana] = valor_huerfano
                del mapas["variedades_huerfanas"][clave_huerfana]
                adopciones.append(
                    {
                        "valor_lista_id": id_huerfano,
                        "especie_id": especie_id,
                        "variedad": valor_huerfano,
                        "especie": sol["especie"],
                    }
                )
            else:
                motivos.append(
                    {
                        "campo": "variedad",
                        "etiqueta": _ETIQUETA_LISTADO["variedad"],
                        "valor": variedad,
                        "sugerencias": _sugerencias_fuzzy(clave, variedades_de_especie),
                    }
                )

    return motivos


def _procesar_filas(
    cur,
    filas: list[dict[str, Any]],
    escribir: bool,
    origen: str = "ingest",
    saltar_catalogo: bool = False,
    overrides: dict[str, Any] | None = None,
    acumular_detalle: bool = True,
) -> dict[str, Any]:
    # En operaciones de lote masivo (aprobar/reintentar 13.000+ pendientes) solo
    # se usa el resumen: acumular un dict de detalle y un string de advertencia
    # por fila hace que el contenedor se quede sin memoria (512 MB en Render free).
    resumen = {
        "solicitudes_nuevas": 0,
        "solicitudes_existentes": 0,
        "clientes_nuevos": 0,
        "plantas_nuevas": 0,
        "productos_aplicados": 0,
        "resultados": 0,
        "filas_omitidas": 0,
        "pendientes_revision": 0,
    }
    catalogos = _cargar_catalogos(cur)
    mapas_listados = _cargar_mapas_listados(cur)
    analitos_mapa, analitos_primero = _cargar_analitos(cur)

    # Pre-carga todas las solicitudes existentes en memoria para evitar una query
    # por fila del Excel (4000+ filas = 4000+ round-trips a Neon, muy lento).
    cur.execute("SELECT nro_solicitud, id, sold_to_raw, ship_to_raw, planta_id FROM solicitud")
    solicitudes_existentes: dict[str, dict] = {r["nro_solicitud"]: r for r in cur.fetchall()}

    detalle: list[dict[str, Any]] = []
    advertencias: list[str] = []

    # En preview (escribir=False) nada se inserta de verdad — cada fila del lote
    # "ve" la base tal como estaba antes de empezar, así que sin esta caché, un
    # mismo cliente/planta repetido 50 veces en el Excel se contaría como 50
    # clientes nuevos en vez de 1. La caché recuerda, dentro de este mismo lote,
    # qué cliente/planta ya se resolvió antes (nuevo o existente).
    clientes_cache: dict[str, int | None] = {}
    plantas_cache: dict[tuple[str, str], int | None] = {}

    # Acumuladores para batch insert al final del loop (evita N round-trips a la BD).
    productos_batch: list[tuple] = []
    resultados_batch: list[tuple] = []

    # Nuevas solicitudes: se acumulan durante el loop y se insertan en un solo
    # execute_values al final (evita N INSERT individuales con RETURNING id).
    nuevas_solic_pending: list[dict] = []
    nuevas_solic_nros: set[str] = set()
    nuevas_solic_productos: dict[str, list[tuple]] = {}
    nuevas_solic_resultados: dict[str, list[tuple]] = {}

    for i, fila_cruda in enumerate(filas):
        n_fila = i + 2  # misma numeración que usa Ingest en el frontend (fila 1 = encabezado)
        # Encabezados del Excel con espacios de más (ej. " FDL FINAL ") no calzan con
        # los nombres exactos que espera el mapeo — se normalizan acá, una sola vez,
        # antes de que cualquier función de mapeo los use.
        fila = {str(k).strip(): v for k, v in fila_cruda.items()}
        sol = mapeo.mapear_solicitud(fila)
        if overrides:
            sol.update(overrides)
        motivos: list[str] = []

        if not sol["nro_solicitud"]:
            resumen["filas_omitidas"] += 1
            if acumular_detalle:
                detalle.append({"fila": n_fila, "omitida": True, "motivos": ["Sin N° de solicitud (Informe)"]})
            continue
        if not sol["laboratorio"]:
            # laboratorio es NOT NULL en la tabla solicitud: en vez de perder la fila
            # completa por este dato faltante, se guarda con un valor de relleno para
            # no perder el resto (kg, fechas, resultados, etc.) — homogenización
            # pendiente se encarga después de decidir el laboratorio real.
            sol["laboratorio"] = "Sin definir"
            motivos.append("Sin Laboratorio: se guardó como 'Sin definir', revisar y corregir después")

        existente = solicitudes_existentes.get(sol["nro_solicitud"])
        ya_existe = existente is not None

        # _resolver_listados reescribe sold_to_raw/ship_to_raw/especie/variedad a su
        # valor CANÓNICO cuando calzan con Listados -para fila nueva o existente por
        # igual-, y devuelve como motivo lo que no calzó con nada. Se llama siempre
        # -no solo para filas nuevas- para que una solicitud que ya existe (típico:
        # la creó primero un Converter que no trae Sold To/Ship To) pueda completar
        # después esos datos con el mismo rigor que una fila nueva, en vez de
        # quedarse en NULL para siempre o -peor- crear un cliente/sucursal nuevo a
        # partir de texto crudo sin pasar por Listados.
        adopciones: list[dict[str, Any]] = []
        motivos_listados = _resolver_listados(sol, mapas_listados, adopciones)
        campos_no_resueltos = {m["campo"] for m in motivos_listados}

        # Vincular la variedad huérfana a su especie es un cambio de maestro, no
        # de esta fila: se escribe una sola vez, solo en carga real, y se avisa
        # para que quede a la vista en Data Core -es reversible desde Listados-.
        for a in adopciones:
            if escribir:
                cur.execute(
                    "UPDATE valor_lista SET especie_id = %s WHERE id = %s AND especie_id IS NULL",
                    (a["especie_id"], a["valor_lista_id"]),
                )
            motivos.append(
                f"Variedad \"{a['variedad']}\" estaba en Listados sin especie asignada: "
                f"se vinculó a {a['especie']}. Revísalo en Listados si no corresponde."
            )

        # Antes de tocar nada más -y sobre todo antes de que _cliente_id/_planta_id
        # autocreen un cliente o sucursal nuevo sin avisar-: si esta es una solicitud
        # nueva y trae algún valor que no calza EXACTO con el catálogo real (ya
        # cargado en la base), no se inserta directo. Se guarda entera en
        # pendiente_revision para aprobar, corregir o descartar desde DataCore.
        if not ya_existe and not saltar_catalogo:
            fuera_de_catalogo = motivos_listados + _fuera_de_catalogo(sol, catalogos)
            if fuera_de_catalogo:
                resumen["pendientes_revision"] += 1
                if escribir:
                    cur.execute(
                        "INSERT INTO pendiente_revision (origen, fila, motivos) VALUES (%s, %s::jsonb, %s::jsonb)",
                        (origen, json.dumps(fila), json.dumps(fuera_de_catalogo)),
                    )
                if acumular_detalle:
                    detalle.append(
                        {
                            "fila": n_fila,
                            "nro_solicitud": sol["nro_solicitud"],
                            "pendiente_revision": True,
                            "motivos": [
                                f"{m['etiqueta']}: '{m['valor']}' no está en el catálogo" for m in fuera_de_catalogo
                            ],
                        }
                    )
                continue

        # Para una solicitud que YA existe (fuera del flujo de aprobación manual,
        # donde saltar_catalogo=True y se confía en lo que decidió el administrador),
        # un Sold To/Ship To que no calzó con Listados NUNCA crea un cliente o
        # sucursal nuevo a partir de texto crudo: se deja como estaba, y se avisa.
        permitir_resolver_cliente = saltar_catalogo or not ya_existe or "sold_to_raw" not in campos_no_resueltos
        if ya_existe and "sold_to_raw" in campos_no_resueltos and existente["sold_to_raw"] is None and sol["sold_to_raw"]:
            motivos.append(
                f"Sold To \"{sol['sold_to_raw']}\" no calza con Listados: no se pudo completar el dato "
                "faltante de esta solicitud, corrígelo a mano desde Data Core."
            )
        if ya_existe and "ship_to_raw" in campos_no_resueltos and existente["ship_to_raw"] is None and sol["ship_to_raw"]:
            motivos.append(
                f"Ship To \"{sol['ship_to_raw']}\" no calza con Listados: no se pudo completar el dato "
                "faltante de esta solicitud, corrígelo a mano desde Data Core."
            )

        cliente_id = None
        nombre_cliente = sol["sold_to_raw"]
        if nombre_cliente and permitir_resolver_cliente:
            if nombre_cliente in clientes_cache:
                cliente_id = clientes_cache[nombre_cliente]
            else:
                cliente_id, cliente_es_nuevo = _cliente_id(cur, nombre_cliente, escribir)
                clientes_cache[nombre_cliente] = cliente_id
                if cliente_es_nuevo:
                    resumen["clientes_nuevos"] += 1

        planta_id = None
        if sol["ship_to_raw"] and nombre_cliente and permitir_resolver_cliente:
            clave_planta = (nombre_cliente, sol["ship_to_raw"])
            if clave_planta in plantas_cache:
                planta_id = plantas_cache[clave_planta]
            else:
                if cliente_id is not None:
                    planta_id, nueva_planta = _planta_id(cur, cliente_id, sol["ship_to_raw"], escribir)
                else:
                    # Solo puede pasar en preview: el cliente todavía no existe en la base
                    # (nunca se inserta de verdad), así que tampoco hay id para buscar la
                    # planta — pero como el cliente es nuevo, esta combinación también lo es.
                    nueva_planta = True
                plantas_cache[clave_planta] = planta_id
                if nueva_planta:
                    resumen["plantas_nuevas"] += 1

        if ya_existe:
            resumen["solicitudes_existentes"] += 1
            motivos.append(
                f"La solicitud {sol['nro_solicitud']} ya existe: no se crea de nuevo, "
                "solo se completan analitos que le falten (nunca se sobreescribe lo que ya tiene)"
            )

        productos = mapeo.mapear_productos_aplicados(fila)
        resultados = mapeo.mapear_resultados(fila)

        productos_resueltos = []
        for p in productos:
            analito_id, adv = _analito_id_cache(analitos_mapa, analitos_primero, p["analito_codigo"], sol["laboratorio"])
            if adv:
                motivos.append(adv)
            productos_resueltos.append({**p, "analito_id": analito_id})

        resultados_resueltos = []
        for r in resultados:
            analito_id, adv = _analito_id_cache(analitos_mapa, analitos_primero, r["analito_codigo"], sol["laboratorio"])
            if adv:
                motivos.append(adv)
            resultados_resueltos.append({**r, "analito_id": analito_id})

        solicitud_id = existente["id"] if ya_existe else None
        if escribir:
            if not ya_existe:
                # Diferir INSERT: acumular y hacer un solo execute_values al
                # final del loop en vez de N INSERTs individuales con RETURNING.
                datos = {**sol, "planta_id": planta_id, "origen": origen}
                nro = sol["nro_solicitud"]
                if nro not in nuevas_solic_nros:
                    nuevas_solic_pending.append(datos)
                    nuevas_solic_nros.add(nro)
                # Acumular productos/resultados de esta solicitud nueva.
                for p in productos_resueltos:
                    nuevas_solic_productos.setdefault(nro, []).append((
                        p["analito_id"],
                        None if p["analito_id"] else p["analito_codigo"],
                        p["producto_raw"], p["dosis"], p["tipo_aplicacion"], p["linea_proceso"],
                    ))
                for r in resultados_resueltos:
                    nuevas_solic_resultados.setdefault(nro, []).append((
                        r["analito_id"],
                        None if r["analito_id"] else r["analito_codigo"],
                        r["valor_num"], r["valor_texto"],
                    ))
            else:
                if existente["sold_to_raw"] is None or existente["ship_to_raw"] is None or existente["planta_id"] is None:
                    # Solicitud que ya existe pero le faltaba Sold To/Ship To/planta_id
                    # -típico: la creó primero un Converter que no trae esos datos-.
                    # COALESCE completa solo lo que está NULL hoy: un dato que ya
                    # tenía valor nunca se pisa con lo que trae esta fila.
                    cur.execute(
                        "UPDATE solicitud SET sold_to_raw = COALESCE(sold_to_raw, %s), "
                        "ship_to_raw = COALESCE(ship_to_raw, %s), planta_id = COALESCE(planta_id, %s) WHERE id = %s",
                        (
                            sol["sold_to_raw"] if "sold_to_raw" not in campos_no_resueltos else None,
                            sol["ship_to_raw"] if "ship_to_raw" not in campos_no_resueltos else None,
                            planta_id,
                            solicitud_id,
                        ),
                    )
                # Acumular para batch insert (solicitudes existentes ya tienen ID real).
                for p in productos_resueltos:
                    productos_batch.append((
                        solicitud_id, p["analito_id"],
                        None if p["analito_id"] else p["analito_codigo"],
                        p["producto_raw"], p["dosis"], p["tipo_aplicacion"], p["linea_proceso"],
                    ))
                for r in resultados_resueltos:
                    resultados_batch.append((
                        solicitud_id, r["analito_id"],
                        None if r["analito_id"] else r["analito_codigo"],
                        r["valor_num"], r["valor_texto"],
                    ))

        if not ya_existe:
            resumen["solicitudes_nuevas"] += 1
        resumen["productos_aplicados"] += len(productos_resueltos)
        resumen["resultados"] += len(resultados_resueltos)

        if acumular_detalle:
            motivos = list(dict.fromkeys(motivos))
            detalle.append(
                {
                    "fila": n_fila,
                    "nro_solicitud": sol["nro_solicitud"],
                    "solicitud_id": solicitud_id,
                    "cliente": sol["sold_to_raw"],
                    "planta": sol["ship_to_raw"],
                    "productos_aplicados": len(productos_resueltos),
                    "resultados": len(resultados_resueltos),
                    "ya_existia": ya_existe,
                    "motivos": motivos,
                }
            )
            advertencias.extend(f"Fila {n_fila}: {m}" for m in motivos)

    # Batch INSERT de solicitudes nuevas: un solo execute_values reemplaza N INSERTs
    # individuales con RETURNING id (principal causa del timeout en Render free tier).
    if escribir and nuevas_solic_pending:
        columnas = list(nuevas_solic_pending[0].keys())
        valores = [tuple(d[c] for c in columnas) for d in nuevas_solic_pending]
        retornados = execute_values(
            cur,
            f"INSERT INTO solicitud ({', '.join(columnas)}) VALUES %s RETURNING nro_solicitud, id",
            valores,
            fetch=True,
            page_size=500,
        )
        nro_a_id = {r["nro_solicitud"]: r["id"] for r in retornados}
        for nro, sol_id in nro_a_id.items():
            for pt in nuevas_solic_productos.get(nro, []):
                productos_batch.append((sol_id, *pt))
            for rt in nuevas_solic_resultados.get(nro, []):
                resultados_batch.append((sol_id, *rt))

    # Batch insert de productos y resultados: reemplaza N*M execute() individuales
    # por 2 llamadas únicas, eliminando la mayor parte del tiempo de escritura.
    if escribir:
        if productos_batch:
            execute_values(
                cur,
                """INSERT INTO producto_aplicado
                   (solicitud_id, analito_id, analito_raw, producto_raw, dosis, tipo_aplicacion, linea_proceso)
                   VALUES %s
                   ON CONFLICT (solicitud_id, analito_id) DO NOTHING""",
                productos_batch,
                page_size=500,
            )
        if resultados_batch:
            execute_values(
                cur,
                """INSERT INTO resultado (solicitud_id, analito_id, analito_raw, valor_num, valor_texto)
                   VALUES %s
                   ON CONFLICT (solicitud_id, analito_id) DO NOTHING""",
                resultados_batch,
                page_size=500,
            )

    return {"resumen": resumen, "detalle": detalle, "advertencias": advertencias}


@router.post("/preview")
def preview(payload: CargaRequest) -> dict[str, Any]:
    """Solo lecturas: nunca escribe en la base, sin importar lo que pase."""
    with conexion(escribir=False) as conn:
        with cursor_dict(conn) as cur:
            resultado = _procesar_filas(cur, payload.filas, escribir=False, origen=payload.origen)
    resultado["modo"] = "preview"
    return resultado


@router.post("/confirmar")
def confirmar(payload: CargaRequest) -> dict[str, Any]:
    """Escritura real, en una sola transacción: si algo falla, no queda nada a medias."""
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            resultado = _procesar_filas(cur, payload.filas, escribir=True, origen=payload.origen)
    resultado["modo"] = "confirmado"
    return resultado


# ---------------------------------------------------------------------------
# Pendientes de revisión: filas de Ingest/Converter que trajeron algo fuera
# del catálogo real y no se insertaron directo (ver _fuera_de_catalogo).
# Vive en DataCore, pero acá está la lógica porque reutiliza _procesar_filas.
# ---------------------------------------------------------------------------


class AprobarPendienteIn(BaseModel):
    # Correcciones por campo YA MAPEADO de solicitud (ej. "especie", "sold_to_raw"),
    # no por columna cruda del Excel/Converter -evita tener que saber de qué
    # columna original venía cada uno, que varía según el origen-.
    correcciones: dict[str, str] | None = None


class LotePendientesIn(BaseModel):
    # None = todos los pendientes actuales (no solo los de la página visible).
    ids: list[int] | None = None


def _recordar_valor_lista(cur, tipo: str, valor_crudo: str, valor_oficial: str, especie_id: int | None) -> None:
    """Guarda -reusando valor_lista, el mismo mecanismo que ya homogeniza
    Especie/Variedad desde Listados- que `valor_crudo` corresponde a la
    variedad/especie estándar `valor_oficial`. Si `valor_oficial` no es una
    variedad estándar real, no se guarda nada -no se puede "recordar" un
    alias hacia algo que no existe-."""
    clave_crudo = clave_normalizada(valor_crudo)
    clave_oficial = clave_normalizada(valor_oficial)
    if not clave_crudo or clave_crudo == clave_oficial:
        return
    if tipo == "especie":
        cur.execute("SELECT id FROM valor_lista WHERE tipo = 'especie' AND valor_normalizado = %s AND es_estandar = true", (clave_oficial,))
    else:
        cur.execute(
            "SELECT id FROM valor_lista WHERE tipo = 'variedad' AND especie_id = %s AND valor_normalizado = %s AND es_estandar = true",
            (especie_id, clave_oficial),
        )
    estandar = cur.fetchone()
    if not estandar:
        return

    if tipo == "especie":
        cur.execute("SELECT id FROM valor_lista WHERE tipo = 'especie' AND valor_normalizado = %s", (clave_crudo,))
    else:
        cur.execute("SELECT id FROM valor_lista WHERE tipo = 'variedad' AND especie_id = %s AND valor_normalizado = %s", (especie_id, clave_crudo))
    existente = cur.fetchone()
    if existente:
        cur.execute(
            "UPDATE valor_lista SET fusionado_en_id = %s, activo = false WHERE id = %s",
            (estandar["id"], existente["id"]),
        )
    elif tipo == "especie":
        cur.execute(
            "INSERT INTO valor_lista (tipo, valor, valor_normalizado, activo, fusionado_en_id) VALUES ('especie', %s, %s, false, %s)",
            (valor_crudo.strip(), clave_crudo, estandar["id"]),
        )
    else:
        cur.execute(
            "INSERT INTO valor_lista (tipo, valor, valor_normalizado, activo, especie_id, fusionado_en_id) "
            "VALUES ('variedad', %s, %s, false, %s, %s)",
            (valor_crudo.strip(), clave_crudo, especie_id, estandar["id"]),
        )


def _recordar_correcciones(cur, fila_original: dict[str, Any], correcciones: dict[str, str]) -> None:
    """Convierte una corrección manual confirmada en Data Core en una
    memoria reusable, para que la próxima vez que llegue el mismo texto
    crudo el sistema lo resuelva solo. Sold To/Ship To se guardan en
    mapeo_confirmado; Especie/Variedad reusan valor_lista -ver
    _recordar_valor_lista-. Nunca falla la aprobación si algo no calza acá:
    en el peor caso, simplemente no se aprende nada de esa fila."""
    sol = mapeo.mapear_solicitud({str(k).strip(): v for k, v in fila_original.items()})

    if correcciones.get("sold_to_raw"):
        crudo = sol.get("sold_to_raw")
        clave = clave_normalizada_empresa(crudo) if crudo else ""
        if crudo and clave and clave != clave_normalizada_empresa(correcciones["sold_to_raw"]):
            cur.execute("SELECT id FROM cliente WHERE nombre = %s", (correcciones["sold_to_raw"],))
            cliente = cur.fetchone()
            if cliente:
                cur.execute(
                    "INSERT INTO mapeo_confirmado (entidad, cliente_id, valor_crudo, valor_crudo_normalizado, destino_id) "
                    "VALUES ('sold_to', NULL, %s, %s, %s) ON CONFLICT (entidad, cliente_id, valor_crudo_normalizado) DO NOTHING",
                    (crudo, clave, cliente["id"]),
                )

    if correcciones.get("ship_to_raw"):
        crudo = sol.get("ship_to_raw")
        sold_to_oficial = correcciones.get("sold_to_raw") or sol.get("sold_to_raw")
        clave = clave_normalizada_empresa(crudo) if crudo else ""
        if crudo and clave and sold_to_oficial and clave != clave_normalizada_empresa(correcciones["ship_to_raw"]):
            cur.execute("SELECT id FROM cliente WHERE nombre = %s", (sold_to_oficial,))
            cliente = cur.fetchone()
            if cliente:
                cur.execute(
                    "SELECT id FROM planta WHERE cliente_id = %s AND nombre = %s",
                    (cliente["id"], correcciones["ship_to_raw"]),
                )
                planta = cur.fetchone()
                if planta:
                    cur.execute(
                        "INSERT INTO mapeo_confirmado (entidad, cliente_id, valor_crudo, valor_crudo_normalizado, destino_id) "
                        "VALUES ('ship_to', %s, %s, %s, %s) ON CONFLICT (entidad, cliente_id, valor_crudo_normalizado) DO NOTHING",
                        (cliente["id"], crudo, clave, planta["id"]),
                    )

    especie_oficial = correcciones.get("especie") or sol.get("especie")
    especie_id: int | None = None
    if especie_oficial:
        cur.execute(
            "SELECT id FROM valor_lista WHERE tipo = 'especie' AND valor_normalizado = %s AND es_estandar = true",
            (clave_normalizada(especie_oficial),),
        )
        fila_especie = cur.fetchone()
        especie_id = fila_especie["id"] if fila_especie else None

    if correcciones.get("especie") and sol.get("especie"):
        _recordar_valor_lista(cur, "especie", sol["especie"], correcciones["especie"], especie_id=None)

    if correcciones.get("variedad") and sol.get("variedad") and especie_id is not None:
        _recordar_valor_lista(cur, "variedad", sol["variedad"], correcciones["variedad"], especie_id=especie_id)


# Las operaciones de lote se procesan de a trozos: traer las 13.000+ filas jsonb
# de golpe (62 columnas cada una) agota la memoria del contenedor antes de
# insertar nada. Con este tamaño cada vuelta ocupa unos pocos MB.
CHUNK_PENDIENTES = 500


def _procesar_pendientes_en_chunks(
    cur, ids_por_origen: dict[str, list[int]], saltar_catalogo: bool
) -> dict[str, int]:
    """Reprocesa pendientes trozo a trozo, borrando cada trozo apenas se procesa.
    Devuelve el resumen acumulado (el detalle por fila se descarta: en un lote de
    miles de filas no se muestra en pantalla y solo consume memoria)."""
    resumen_total = dict(RESUMEN_VACIO)
    for origen, ids in ids_por_origen.items():
        for i in range(0, len(ids), CHUNK_PENDIENTES):
            trozo = ids[i : i + CHUNK_PENDIENTES]
            cur.execute("SELECT fila FROM pendiente_revision WHERE id = ANY(%s) ORDER BY id", (trozo,))
            filas = [r["fila"] for r in cur.fetchall()]
            # Borrar antes de reprocesar: si la fila sigue sin calzar,
            # _procesar_filas la vuelve a insertar con motivos frescos.
            cur.execute("DELETE FROM pendiente_revision WHERE id = ANY(%s)", (trozo,))
            r = _procesar_filas(
                cur,
                filas,
                escribir=True,
                origen=origen,
                saltar_catalogo=saltar_catalogo,
                acumular_detalle=False,
            )
            for k in resumen_total:
                resumen_total[k] += r["resumen"][k]
            del filas, r
            gc.collect()
    return resumen_total


RESUMEN_VACIO = {
    "solicitudes_nuevas": 0,
    "solicitudes_existentes": 0,
    "clientes_nuevos": 0,
    "plantas_nuevas": 0,
    "productos_aplicados": 0,
    "resultados": 0,
    "filas_omitidas": 0,
    "pendientes_revision": 0,
}


@router.get("/pendientes")
def listar_pendientes(pagina: int = Query(1, ge=1), tamano: int = Query(50, ge=1, le=200)) -> dict[str, Any]:
    offset = (pagina - 1) * tamano
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT count(*) AS total FROM pendiente_revision")
        total = cur.fetchone()["total"]
        cur.execute(
            "SELECT id, origen, fila, motivos, creado_en FROM pendiente_revision ORDER BY id DESC LIMIT %s OFFSET %s",
            (tamano, offset),
        )
        filas = cur.fetchall()
    return {"filas": filas, "total": total, "pagina": pagina, "tamano": tamano}


@router.post("/pendientes/{pendiente_id}/aprobar")
def aprobar_pendiente(pendiente_id: int, payload: AprobarPendienteIn) -> dict[str, Any]:
    """Inserta la fila ya revisada -tal cual quedó guardada, o con las
    correcciones que mande el frontend-. Se salta el chequeo de catálogo:
    un humano ya la miró, así que si el valor sigue siendo "nuevo" es porque
    de verdad es nuevo (cliente recién onboarded, etc.), no un error."""
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            cur.execute("SELECT origen, fila FROM pendiente_revision WHERE id = %s", (pendiente_id,))
            pendiente = cur.fetchone()
            if not pendiente:
                raise HTTPException(status_code=404, detail="Ese pendiente ya no existe")
            resultado = _procesar_filas(
                cur,
                [pendiente["fila"]],
                escribir=True,
                origen=pendiente["origen"],
                saltar_catalogo=True,
                overrides=payload.correcciones,
            )
            if payload.correcciones:
                _recordar_correcciones(cur, pendiente["fila"], payload.correcciones)
            cur.execute("DELETE FROM pendiente_revision WHERE id = %s", (pendiente_id,))
    return resultado


@router.post("/pendientes/{pendiente_id}/descartar")
def descartar_pendiente(pendiente_id: int) -> dict[str, Any]:
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM pendiente_revision WHERE id = %s RETURNING id", (pendiente_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Ese pendiente ya no existe")
    return {"ok": True}


@router.post("/pendientes/aprobar-lote")
def aprobar_lote(payload: LotePendientesIn) -> dict[str, Any]:
    """Aprueba muchos pendientes de una sola vez (típico después de una carga
    masiva contra un catálogo recién partido de cero, donde todo queda
    pendiente aunque sean datos reales y correctos). Sin ids = todos."""
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            # Solo id+origen acá: la columna `fila` (el Excel completo de cada
            # pendiente) se trae después, de a trozos, para no cargar miles de
            # documentos jsonb en memoria a la vez.
            if payload.ids is not None:
                cur.execute(
                    "SELECT id, origen FROM pendiente_revision WHERE id = ANY(%s) ORDER BY id",
                    (payload.ids,),
                )
            else:
                cur.execute("SELECT id, origen FROM pendiente_revision ORDER BY id")
            metas = cur.fetchall()
            if not metas:
                return {"aprobados": 0, "resumen": dict(RESUMEN_VACIO)}

            # _procesar_filas toma un solo origen por llamada: se agrupa por si
            # el lote mezcla filas de ingest y converter.
            ids_por_origen: dict[str, list[int]] = {}
            for m in metas:
                ids_por_origen.setdefault(m["origen"], []).append(m["id"])
            total = len(metas)
            del metas

            resumen_total = _procesar_pendientes_en_chunks(cur, ids_por_origen, saltar_catalogo=True)

    return {"aprobados": total, "resumen": resumen_total}


@router.post("/pendientes/descartar-lote")
def descartar_lote(payload: LotePendientesIn) -> dict[str, Any]:
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        if payload.ids is not None:
            cur.execute("DELETE FROM pendiente_revision WHERE id = ANY(%s) RETURNING id", (payload.ids,))
        else:
            cur.execute("DELETE FROM pendiente_revision RETURNING id")
        borrados = cur.fetchall()
    return {"descartados": len(borrados)}


@router.post("/pendientes/reintentar")
def reintentar_pendientes(payload: LotePendientesIn) -> dict[str, Any]:
    """Vuelve a evaluar pendientes ya existentes contra el catálogo/Listados
    actual -sin que un humano tenga que corregir fila por fila-. Útil después
    de mejorar el maestro (agregar un alias, una nueva variedad estándar,
    etc.): las filas que ahora sí calzan se insertan solas, con sus valores
    ya canónicos; las que todavía no calzan quedan pendientes de nuevo, con
    el motivo/sugerencia recalculado. Sin ids = reintenta todos."""
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            # Igual que aprobar-lote: la columna `fila` se trae por trozo, no toda
            # de una vez (ver _procesar_pendientes_en_chunks).
            if payload.ids is not None:
                cur.execute(
                    "SELECT id, origen FROM pendiente_revision WHERE id = ANY(%s) ORDER BY id",
                    (payload.ids,),
                )
            else:
                cur.execute("SELECT id, origen FROM pendiente_revision ORDER BY id")
            metas = cur.fetchall()
            if not metas:
                return {"reintentados": 0, "resumen": dict(RESUMEN_VACIO)}

            ids_por_origen: dict[str, list[int]] = {}
            for m in metas:
                ids_por_origen.setdefault(m["origen"], []).append(m["id"])
            total = len(metas)
            del metas

            resumen_total = _procesar_pendientes_en_chunks(cur, ids_por_origen, saltar_catalogo=False)

    resueltos = total - resumen_total["pendientes_revision"]
    return {"reintentados": total, "resueltos": resueltos, "resumen": resumen_total}
