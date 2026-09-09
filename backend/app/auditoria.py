"""
Auditoría de la base de datos ya cargada (a diferencia de ingest.py, que valida
un archivo ANTES de insertarlo): detecta inconsistencias de homogenización
-mismo valor real escrito de más de una forma- para revisar y corregir desde
el módulo DataCore.

Las correcciones NUNCA tocan la base real en vivo directamente: se trabajan
sobre una copia ("lab_staging"), y solo se aplican a producción con /promover,
que requiere 0 inconsistencias pendientes. Como todas las consultas de la app
usan nombres de tabla sin prefijo de schema (search_path=lab,public), promover
es un simple renombre de schemas -sin downtime, sin reiniciar el backend-.
"""
import json
from datetime import datetime, timezone
from difflib import SequenceMatcher
from io import BytesIO
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel

from .db import conexion, cursor_dict
from .listados import clave_normalizada

router = APIRouter(prefix="/api/auditoria", tags=["auditoria"])

SCHEMA_PROD = "lab"
SCHEMA_STAGING = "lab_staging"

# Tablas navegables desde la vista "Tabla" y su set de columnas a mostrar
# (whitelist fija: nunca se arma SQL con nombres que vengan del cliente).
TABLAS: dict[str, list[str]] = {
    "solicitud": [
        "id", "nro_solicitud", "laboratorio", "fecha_muestreo", "fecha_entrada",
        "especie", "variedad", "tipo_servicio", "sold_to_raw", "ship_to_raw",
        "planta_id", "semana_muestreo", "mes", "temporada", "origen", "vigente",
    ],
    "resultado": ["id", "solicitud_id", "analito_id", "analito_raw", "valor_num", "valor_texto"],
    "producto_aplicado": [
        "id", "solicitud_id", "analito_id", "analito_raw", "producto_raw",
        "dosis", "tipo_aplicacion", "linea_proceso",
    ],
    "planta": ["id", "cliente_id", "nombre", "codigo_sap", "activo"],
    "cliente": ["id", "nombre", "codigo_sap", "activo"],
    "analito": [
        "id", "codigo", "nombre", "categoria", "laboratorio", "unidad",
        "limite_min", "limite_central", "limite_max", "limite_cuantificacion", "activo",
    ],
    "analito_limite": ["id", "analito_id", "especie", "tipo_servicio", "limite_min", "limite_central", "limite_max"],
}

# Orden de creación (no importa por FKs, que se agregan al final, pero mantiene
# el script legible de padres a hijos) + grafo de llaves foráneas a recrear
# manualmente: "LIKE ... INCLUDING ALL" no copia foreign keys (limitación de
# Postgres), así que hay que declararlas de nuevo apuntando a las tablas clon.
ORDEN_TABLAS_CLON = [
    "cliente", "analito", "planta", "solicitud", "resultado",
    "producto_aplicado", "analito_limite",
    "pendiente_revision",
]
TABLAS_AUX_SIN_ID = ["informe_config", "informe_folio", "informe_folio_anual"]
TABLAS_AUX_CON_ID = ["valor_lista", "mapeo_confirmado"]
FKS_CLON = [
    ("planta", "cliente_id", "cliente", "id", "RESTRICT"),
    ("solicitud", "planta_id", "planta", "id", "RESTRICT"),
    ("resultado", "solicitud_id", "solicitud", "id", "CASCADE"),
    ("resultado", "analito_id", "analito", "id", "RESTRICT"),
    ("producto_aplicado", "solicitud_id", "solicitud", "id", "RESTRICT"),
    ("producto_aplicado", "analito_id", "analito", "id", "RESTRICT"),
    ("analito_limite", "analito_id", "analito", "id", "CASCADE"),
]

# Campos de texto que deberían tener un único valor "real" por significado:
# si el mismo valor aparece con mayúsculas/minúsculas o espacios distintos,
# son variantes del mismo dato que hay que homogenizar.
CAMPOS_HOMOGENIZAR = [
    ("solicitud", "especie", "Especie"),
    ("solicitud", "variedad", "Variedad"),
    ("solicitud", "tipo_servicio", "Tipo de servicio"),
    ("solicitud", "laboratorio", "Laboratorio"),
    ("solicitud", "sold_to_raw", "Sold To (cliente)"),
    ("solicitud", "ship_to_raw", "Ship To (sucursal)"),
]

CAMPOS_HOMOGENIZAR_POR_TABLA: dict[str, set[str]] = {}
for _tabla, _campo, _et in CAMPOS_HOMOGENIZAR:
    CAMPOS_HOMOGENIZAR_POR_TABLA.setdefault(_tabla, set()).add(_campo)

# Columnas de texto "auditables a mano" desde la Vista de tabla (clic en el
# encabezado): más amplio que CAMPOS_HOMOGENIZAR -acá se listan TODOS los
# valores distintos de la columna, no solo los que difieren por mayúsculas-
# para poder unificar cualquier variante (abreviaciones, typos, etc.), no
# solo casing. Sigue siendo una whitelist fija por seguridad.
CAMPOS_AUDITABLES: dict[str, list[str]] = {
    "solicitud": [
        "especie", "variedad", "tipo_servicio", "laboratorio", "sold_to_raw", "ship_to_raw",
        "lote", "nro_camara", "nro_linea", "posicion_muestreo", "csg", "solicitante",
        "nombre_muestreador", "nro_orden", "tipo_muestra",
    ],
    "producto_aplicado": ["analito_raw", "producto_raw", "tipo_aplicacion", "linea_proceso"],
    "resultado": ["analito_raw"],
    "planta": ["nombre", "codigo_sap"],
    "cliente": ["nombre", "codigo_sap"],
    "analito": ["nombre", "categoria", "unidad", "matriz"],
}

# ---------------------------------------------------------------------------
# Segunda regla de auditoría: valores de Sold To/Ship To/Especie/Variedad que
# ya están escritos de forma consistente en la base (por eso la regla de
# homogenización de arriba no los detecta -exige >1 variante-) pero que no
# calzan con ningún valor vigente de Listados. Pasa, por ejemplo, cuando un
# estándar se renombra en Listados después de que estas filas ya se cargaron.
# Mismo motor de resolución (calce normalizado + sugerencia por similitud)
# que usa Ingest al recibir un archivo nuevo (ver `_resolver_listados` en
# ingest.py), aplicado acá retroactivamente sobre lo que ya está en la base.
# ---------------------------------------------------------------------------

_ETIQUETA_LISTADO = {
    "sold_to_raw": "Sold To (cliente)",
    "ship_to_raw": "Ship To (sucursal)",
    "especie": "Especie",
    "variedad": "Variedad",
}

# Palabras de puro "ruido" de razón social (SPA, LTDA, SA...) que se sacan
# del final del nombre para comparar el núcleo -mismo criterio que usa Ingest
# para Sold To/Ship To (ver `clave_normalizada_empresa` en ingest.py)-.
_PALABRAS_SUFIJO_EMPRESA = {
    "s", "p", "a", "sa", "spa", "ltda", "limitada", "eirl", "e", "i", "r",
    "cia", "compania", "sac", "srl", "inc", "corp", "llc", "co", "sociedad",
    "anonima", "hnos", "y",
}


def _clave_empresa(valor: str) -> str:
    palabras = clave_normalizada(valor).split(" ")
    while len(palabras) > 1 and palabras[-1] in _PALABRAS_SUFIJO_EMPRESA:
        palabras.pop()
    return " ".join(palabras)


UMBRAL_SUGERENCIA = 0.72
TOPE_SUGERENCIAS = 3


def _sugerencias_fuzzy(clave_buscada: str, candidatos: dict[str, str]) -> list[dict[str, Any]]:
    """Nunca se usan para asignar solas: son para mostrarle a la persona "che,
    esto se parece a tal otra cosa" y que decida ella -el sistema nunca
    homologa en silencio-."""
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


def _mapa_clientes(cur, schema: str) -> dict[str, tuple[str, int]]:
    """clave normalizada -> (nombre oficial, id)."""
    cur.execute(f"SELECT id, nombre FROM {schema}.cliente WHERE activo")
    return {_clave_empresa(r["nombre"]): (r["nombre"], r["id"]) for r in cur.fetchall()}


def _mapa_plantas(cur, schema: str) -> dict[int, dict[str, tuple[str, int]]]:
    """cliente_id -> {clave normalizada -> (nombre oficial, id)}."""
    cur.execute(
        f"SELECT p.id, p.cliente_id, p.nombre FROM {schema}.planta p "
        f"JOIN {schema}.cliente c ON c.id = p.cliente_id WHERE p.activo AND c.activo"
    )
    mapa: dict[int, dict[str, tuple[str, int]]] = {}
    for r in cur.fetchall():
        mapa.setdefault(r["cliente_id"], {})[_clave_empresa(r["nombre"])] = (r["nombre"], r["id"])
    return mapa


def _mapa_especies(cur, schema: str) -> dict[str, tuple[str, int]]:
    """clave normalizada -> (valor canónico, especie_id). Incluye tanto las
    especies estándar tal cual como los valores crudos ya homogenizados hacia
    una -en ese caso el canónico es el de la especie estándar-."""
    cur.execute(
        f"SELECT a.valor_normalizado AS clave, COALESCE(e.valor, a.valor) AS canonico, COALESCE(e.id, a.id) AS id "
        f"FROM {schema}.valor_lista a LEFT JOIN {schema}.valor_lista e ON e.id = a.fusionado_en_id "
        f"WHERE a.tipo = 'especie' AND (a.activo OR a.fusionado_en_id IS NOT NULL)"
    )
    return {r["clave"]: (r["canonico"], r["id"]) for r in cur.fetchall()}


def _mapa_variedades(cur, schema: str) -> dict[int, dict[str, str]]:
    """especie_id -> {clave normalizada -> valor canónico}."""
    cur.execute(
        f"SELECT a.especie_id, a.valor_normalizado AS clave, COALESCE(e.valor, a.valor) AS canonico "
        f"FROM {schema}.valor_lista a LEFT JOIN {schema}.valor_lista e ON e.id = a.fusionado_en_id "
        f"WHERE a.tipo = 'variedad' AND (a.activo OR a.fusionado_en_id IS NOT NULL)"
    )
    mapa: dict[int, dict[str, str]] = {}
    for r in cur.fetchall():
        mapa.setdefault(r["especie_id"], {})[r["clave"]] = r["canonico"]
    return mapa


def _auditar_fuera_de_listados(cur, schema: str) -> list[dict[str, Any]]:
    grupos: list[dict[str, Any]] = []

    clientes = _mapa_clientes(cur, schema)
    plantas = _mapa_plantas(cur, schema)
    especies = _mapa_especies(cur, schema)
    variedades = _mapa_variedades(cur, schema)

    # --- Sold To -------------------------------------------------------
    candidatos_clientes = {k: v[0] for k, v in clientes.items()}
    cur.execute(
        f"SELECT sold_to_raw AS valor, count(*)::int AS filas FROM {schema}.solicitud "
        f"WHERE sold_to_raw IS NOT NULL AND trim(sold_to_raw) <> '' GROUP BY sold_to_raw"
    )
    for fila in cur.fetchall():
        if _clave_empresa(fila["valor"]) in clientes:
            continue
        sugerencias = _sugerencias_fuzzy(_clave_empresa(fila["valor"]), candidatos_clientes)
        grupos.append({
            "regla": "fuera_de_listados", "tabla": "solicitud", "campo": "sold_to_raw",
            "etiqueta": _ETIQUETA_LISTADO["sold_to_raw"], "contexto": None,
            "valores": [fila["valor"]], "filas": fila["filas"],
            "sugerido": sugerencias[0]["valor"] if sugerencias else "",
            "sugerencias": sugerencias,
        })

    # --- Ship To (por cliente; se salta si el Sold To de esa fila ya está
    # marcado aparte, mismo criterio que Ingest) -------------------------
    cur.execute(
        f"SELECT sold_to_raw, ship_to_raw AS valor, count(*)::int AS filas FROM {schema}.solicitud "
        f"WHERE ship_to_raw IS NOT NULL AND trim(ship_to_raw) <> '' "
        f"AND sold_to_raw IS NOT NULL GROUP BY sold_to_raw, ship_to_raw"
    )
    for fila in cur.fetchall():
        cliente = clientes.get(_clave_empresa(fila["sold_to_raw"]))
        if not cliente:
            continue
        cliente_nombre, cliente_id = cliente
        plantas_del_cliente = plantas.get(cliente_id, {})
        if _clave_empresa(fila["valor"]) in plantas_del_cliente:
            continue
        candidatos = {k: v[0] for k, v in plantas_del_cliente.items()}
        sugerencias = _sugerencias_fuzzy(_clave_empresa(fila["valor"]), candidatos)
        grupos.append({
            "regla": "fuera_de_listados", "tabla": "solicitud", "campo": "ship_to_raw",
            "etiqueta": _ETIQUETA_LISTADO["ship_to_raw"], "contexto": cliente_nombre,
            "valores": [fila["valor"]], "filas": fila["filas"],
            "sugerido": sugerencias[0]["valor"] if sugerencias else "",
            "sugerencias": sugerencias,
        })

    # --- Especie ---------------------------------------------------------
    candidatos_especies = {k: v[0] for k, v in especies.items()}
    cur.execute(
        f"SELECT especie AS valor, count(*)::int AS filas FROM {schema}.solicitud "
        f"WHERE especie IS NOT NULL AND trim(especie) <> '' GROUP BY especie"
    )
    for fila in cur.fetchall():
        if clave_normalizada(fila["valor"]) in especies:
            continue
        sugerencias = _sugerencias_fuzzy(clave_normalizada(fila["valor"]), candidatos_especies)
        grupos.append({
            "regla": "fuera_de_listados", "tabla": "solicitud", "campo": "especie",
            "etiqueta": _ETIQUETA_LISTADO["especie"], "contexto": None,
            "valores": [fila["valor"]], "filas": fila["filas"],
            "sugerido": sugerencias[0]["valor"] if sugerencias else "",
            "sugerencias": sugerencias,
        })

    # --- Variedad (por especie; se salta si la Especie de esa fila ya está
    # marcada aparte) ------------------------------------------------------
    cur.execute(
        f"SELECT especie, variedad AS valor, count(*)::int AS filas FROM {schema}.solicitud "
        f"WHERE variedad IS NOT NULL AND trim(variedad) <> '' "
        f"AND especie IS NOT NULL GROUP BY especie, variedad"
    )
    for fila in cur.fetchall():
        resuelto = especies.get(clave_normalizada(fila["especie"]))
        if not resuelto:
            continue
        especie_nombre, especie_id = resuelto
        variedades_de_especie = variedades.get(especie_id, {})
        if clave_normalizada(fila["valor"]) in variedades_de_especie:
            continue
        sugerencias = _sugerencias_fuzzy(clave_normalizada(fila["valor"]), variedades_de_especie)
        grupos.append({
            "regla": "fuera_de_listados", "tabla": "solicitud", "campo": "variedad",
            "etiqueta": _ETIQUETA_LISTADO["variedad"], "contexto": especie_nombre,
            "valores": [fila["valor"]], "filas": fila["filas"],
            "sugerido": sugerencias[0]["valor"] if sugerencias else "",
            "sugerencias": sugerencias,
        })

    return grupos


def _schema_activo(cur) -> str:
    """lab_staging si existe una copia de trabajo en curso; si no, lab (solo lectura)."""
    cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA_STAGING,))
    return SCHEMA_STAGING if cur.fetchone() else SCHEMA_PROD


def _requiere_staging(cur) -> None:
    cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA_STAGING,))
    if not cur.fetchone():
        raise HTTPException(
            status_code=400,
            detail="No hay una copia de trabajo activa. Crea una desde 'Crear copia de trabajo' antes de corregir.",
        )


def reparar_tablas_omitidas_post_promocion() -> None:
    """Repara instalaciones afectadas por la versión antigua de /promover,
    que clonaba solo tablas transaccionales y dejaba Listados dentro del
    respaldo. No inventa datos: copia las tablas desde el respaldo más
    reciente que realmente las contenga."""
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name LIKE 'lab_backup_%' ORDER BY schema_name DESC"
        )
        respaldos = [r["schema_name"] for r in cur.fetchall()]
        reparadas: set[str] = set()
        for tabla in TABLAS_AUX_SIN_ID + TABLAS_AUX_CON_ID:
            cur.execute("SELECT to_regclass(%s) AS tabla", (f"lab.{tabla}",))
            if cur.fetchone()["tabla"]:
                continue
            origen = None
            for respaldo in respaldos:
                cur.execute("SELECT to_regclass(%s) AS tabla", (f"{respaldo}.{tabla}",))
                if cur.fetchone()["tabla"]:
                    origen = respaldo
                    break
            if not origen:
                continue
            cur.execute(f"CREATE TABLE lab.{tabla} (LIKE {origen}.{tabla} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)")
            if tabla in TABLAS_AUX_CON_ID:
                cur.execute(f"CREATE SEQUENCE lab.{tabla}_id_seq")
                cur.execute(f"ALTER TABLE lab.{tabla} ALTER COLUMN id SET DEFAULT nextval('lab.{tabla}_id_seq'::regclass)")
                cur.execute(f"ALTER SEQUENCE lab.{tabla}_id_seq OWNED BY lab.{tabla}.id")
            cur.execute(f"INSERT INTO lab.{tabla} SELECT * FROM {origen}.{tabla}")
            reparadas.add(tabla)
            if tabla in TABLAS_AUX_CON_ID:
                cur.execute(f"SELECT setval('lab.{tabla}_id_seq', COALESCE((SELECT max(id) FROM lab.{tabla}), 1))")
        # LIKE no copia llaves foráneas. Se restauran solo si las tablas existen.
        if "valor_lista" in reparadas:
            cur.execute("ALTER TABLE lab.valor_lista DROP CONSTRAINT IF EXISTS valor_lista_fusionado_en_id_fkey")
            cur.execute("ALTER TABLE lab.valor_lista DROP CONSTRAINT IF EXISTS valor_lista_especie_id_fkey")
            cur.execute("ALTER TABLE lab.valor_lista ADD CONSTRAINT valor_lista_fusionado_en_id_fkey FOREIGN KEY (fusionado_en_id) REFERENCES lab.valor_lista(id)")
            cur.execute("ALTER TABLE lab.valor_lista ADD CONSTRAINT valor_lista_especie_id_fkey FOREIGN KEY (especie_id) REFERENCES lab.valor_lista(id)")
        if "mapeo_confirmado" in reparadas:
            cur.execute("ALTER TABLE lab.mapeo_confirmado DROP CONSTRAINT IF EXISTS mapeo_confirmado_cliente_id_fkey")
            cur.execute("ALTER TABLE lab.mapeo_confirmado ADD CONSTRAINT mapeo_confirmado_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES lab.cliente(id)")


class CorregirGrupoIn(BaseModel):
    tabla: str
    campo: str
    clave: str
    valor: str


class CorregirValoresIn(BaseModel):
    tabla: str
    campo: str
    valores_origen: list[str]
    valor_destino: str


class DeshacerIn(BaseModel):
    historial_id: int


@router.get("/tablas")
def listar_tablas() -> list[dict[str, Any]]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        schema = _schema_activo(cur)
        salida = []
        for nombre, columnas in TABLAS.items():
            cur.execute(f"SELECT count(*) AS total FROM {schema}.{nombre}")
            salida.append({"nombre": nombre, "columnas": columnas, "total": cur.fetchone()["total"]})
    return salida


@router.get("/tabla/{nombre}")
def ver_tabla(
    nombre: str,
    pagina: int = Query(1, ge=1),
    tamano: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    if nombre not in TABLAS:
        raise HTTPException(status_code=404, detail=f"Tabla '{nombre}' no reconocida")
    columnas = TABLAS[nombre]
    offset = (pagina - 1) * tamano
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        schema = _schema_activo(cur)
        cur.execute(
            f"SELECT {', '.join(columnas)} FROM {schema}.{nombre} ORDER BY id DESC LIMIT %s OFFSET %s",
            (tamano, offset),
        )
        filas = cur.fetchall()
        cur.execute(f"SELECT count(*) AS total FROM {schema}.{nombre}")
        total = cur.fetchone()["total"]
    return {"filas": filas, "total": total, "pagina": pagina, "tamano": tamano, "columnas": columnas, "schema": schema}


def _auditar(cur, schema: str) -> dict[str, Any]:
    grupos: list[dict[str, Any]] = []
    for tabla, campo, etiqueta in CAMPOS_HOMOGENIZAR:
        cur.execute(
            f"""
            SELECT lower(trim({campo})) AS clave,
                   jsonb_object_agg({campo}, cnt ORDER BY {campo}) AS conteo_variantes,
                   sum(cnt)::int AS filas
            FROM (
                SELECT {campo}, count(*) AS cnt
                FROM {schema}.{tabla}
                WHERE {campo} IS NOT NULL AND trim({campo}) <> ''
                GROUP BY {campo}
            ) sub
            GROUP BY lower(trim({campo}))
            HAVING count(*) > 1
            ORDER BY sum(cnt) DESC
            """
        )
        for fila in cur.fetchall():
            conteo = fila["conteo_variantes"]
            sugerido = max(conteo, key=conteo.get)
            grupos.append(
                {
                    "regla": "homogenizacion",
                    "tabla": tabla,
                    "campo": campo,
                    "etiqueta": etiqueta,
                    "clave": fila["clave"],
                    "conteo_variantes": conteo,
                    "sugerido": sugerido,
                    "filas": fila["filas"],
                }
            )
    total_filas_afectadas = sum(g["filas"] for g in grupos)
    return {
        "schema": schema,
        "total_inconsistencias": len(grupos),
        "total_filas_afectadas": total_filas_afectadas,
        "grupos": sorted(grupos, key=lambda g: g["filas"], reverse=True),
    }


@router.get("/inconsistencias")
def auditar() -> dict[str, Any]:
    """Primera pasada de auditoría: variantes de un mismo valor por mayúsculas
    o espacios distintos dentro de un mismo campo. Si hay una copia de trabajo
    activa, audita esa copia; si no, audita la base en vivo (de solo lectura,
    no se puede corregir nada hasta crear la copia). Ver `/inconsistencias-listados`
    para la segunda regla: valores que no calzan con el catálogo de Listados."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        return _auditar(cur, _schema_activo(cur))


@router.get("/inconsistencias-listados")
def auditar_listados() -> dict[str, Any]:
    """El "chequeo de integridad" contra Listados: Sold To, Ship To, Especie y
    Variedad de `solicitud` que no calzan con ningún valor vigente de
    Listados -aunque estén escritos siempre igual dentro de la base, por eso
    `/inconsistencias` no los detecta-. Sirve tanto recién después de una
    ingesta (para revisar lo que se acaba de cargar) como en cualquier
    momento, para auditar lo que ya existe. No exige copia de trabajo para
    consultar -solo para corregir, ver `/corregir-listados`-."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        schema = _schema_activo(cur)
        grupos = _auditar_fuera_de_listados(cur, schema)
        return {
            "schema": schema,
            "en_copia_de_trabajo": schema == SCHEMA_STAGING,
            "total_inconsistencias": len(grupos),
            "total_filas_afectadas": sum(g["filas"] for g in grupos),
            "grupos": sorted(grupos, key=lambda g: g["filas"], reverse=True),
        }


# ---------------------------------------------------------------------------
# Copia de trabajo: todas las correcciones se hacen acá, nunca en vivo.
# ---------------------------------------------------------------------------


@router.get("/staging/estado")
def estado_staging() -> dict[str, Any]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA_STAGING,))
        if not cur.fetchone():
            return {"activo": False}
        cur.execute(f"SELECT creado_en FROM {SCHEMA_STAGING}._meta LIMIT 1")
        meta = cur.fetchone()
        return {"activo": True, "creado_en": meta["creado_en"] if meta else None}


@router.post("/staging/crear")
def crear_staging() -> dict[str, Any]:
    """(Re)crea lab_staging como una copia completa de lab. Si ya existía una
    copia de trabajo, la reemplaza por una nueva sincronizada con lo que hay
    en producción ahora mismo -se pierden las correcciones que no se hayan
    promovido todavía-."""
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute(f"DROP SCHEMA IF EXISTS {SCHEMA_STAGING} CASCADE")
        cur.execute(f"CREATE SCHEMA {SCHEMA_STAGING}")
        cur.execute(f"CREATE TABLE {SCHEMA_STAGING}._meta (creado_en timestamptz NOT NULL)")
        cur.execute(f"INSERT INTO {SCHEMA_STAGING}._meta (creado_en) VALUES (%s)", (datetime.now(timezone.utc),))
        cur.execute(
            f"""
            CREATE TABLE {SCHEMA_STAGING}._historial (
                id serial PRIMARY KEY,
                tabla text NOT NULL,
                campo text NOT NULL,
                etiqueta text NOT NULL,
                valor_nuevo text NOT NULL,
                filas jsonb NOT NULL,
                aplicado_en timestamptz NOT NULL DEFAULT now(),
                deshecho boolean NOT NULL DEFAULT false
            )
            """
        )

        for tabla in ORDEN_TABLAS_CLON:
            cur.execute(
                f"CREATE TABLE {SCHEMA_STAGING}.{tabla} "
                f"(LIKE {SCHEMA_PROD}.{tabla} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)"
            )

        for tabla in TABLAS_AUX_SIN_ID:
            cur.execute(f"CREATE TABLE {SCHEMA_STAGING}.{tabla} (LIKE {SCHEMA_PROD}.{tabla} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)")
            cur.execute(f"INSERT INTO {SCHEMA_STAGING}.{tabla} SELECT * FROM {SCHEMA_PROD}.{tabla}")

        for tabla in TABLAS_AUX_CON_ID:
            cur.execute(f"CREATE TABLE {SCHEMA_STAGING}.{tabla} (LIKE {SCHEMA_PROD}.{tabla} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)")
            cur.execute(f"CREATE SEQUENCE {SCHEMA_STAGING}.{tabla}_id_seq")
            cur.execute(f"ALTER TABLE {SCHEMA_STAGING}.{tabla} ALTER COLUMN id SET DEFAULT nextval('{SCHEMA_STAGING}.{tabla}_id_seq'::regclass)")
            cur.execute(f"ALTER SEQUENCE {SCHEMA_STAGING}.{tabla}_id_seq OWNED BY {SCHEMA_STAGING}.{tabla}.id")
            cur.execute(f"INSERT INTO {SCHEMA_STAGING}.{tabla} SELECT * FROM {SCHEMA_PROD}.{tabla}")
            cur.execute(f"SELECT setval('{SCHEMA_STAGING}.{tabla}_id_seq', COALESCE((SELECT max(id) FROM {SCHEMA_STAGING}.{tabla}), 1))")

        for tabla, columna, ref_tabla, ref_columna, on_delete in FKS_CLON:
            cur.execute(
                f"ALTER TABLE {SCHEMA_STAGING}.{tabla} "
                f"ADD FOREIGN KEY ({columna}) REFERENCES {SCHEMA_STAGING}.{ref_tabla}({ref_columna}) "
                f"ON DELETE {on_delete}"
            )
        cur.execute(f"ALTER TABLE {SCHEMA_STAGING}.valor_lista ADD FOREIGN KEY (fusionado_en_id) REFERENCES {SCHEMA_STAGING}.valor_lista(id)")
        cur.execute(f"ALTER TABLE {SCHEMA_STAGING}.valor_lista ADD FOREIGN KEY (especie_id) REFERENCES {SCHEMA_STAGING}.valor_lista(id)")
        cur.execute(f"ALTER TABLE {SCHEMA_STAGING}.mapeo_confirmado ADD FOREIGN KEY (cliente_id) REFERENCES {SCHEMA_STAGING}.cliente(id)")

    return estado_staging()


@router.post("/staging/descartar")
def descartar_staging() -> dict[str, Any]:
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute(f"DROP SCHEMA IF EXISTS {SCHEMA_STAGING} CASCADE")
    return {"activo": False}


def _registrar_y_aplicar(cur, tabla: str, campo: str, etiqueta: str, where_sql: str, where_params: tuple, valor_destino: str) -> int:
    """Guarda (id, valor_anterior) de cada fila que va a cambiar antes de
    aplicar el UPDATE, para poder deshacerlo después con /deshacer."""
    cur.execute(f"SELECT id, {campo} AS valor FROM {SCHEMA_STAGING}.{tabla} WHERE {where_sql}", where_params)
    filas_antes = cur.fetchall()
    if not filas_antes:
        return 0

    cur.execute(
        f"UPDATE {SCHEMA_STAGING}.{tabla} SET {campo} = %s WHERE {where_sql}",
        (valor_destino, *where_params),
    )

    cur.execute(
        f"""
        INSERT INTO {SCHEMA_STAGING}._historial (tabla, campo, etiqueta, valor_nuevo, filas)
        VALUES (%s, %s, %s, %s, %s::jsonb)
        """,
        (tabla, campo, etiqueta, valor_destino, json.dumps([{"id": f["id"], "valor": f["valor"]} for f in filas_antes])),
    )
    return len(filas_antes)


@router.post("/corregir")
def corregir_grupo(payload: CorregirGrupoIn) -> dict[str, Any]:
    """Reescribe todas las variantes de un grupo de inconsistencia al valor
    elegido. Siempre sobre lab_staging: si no existe copia de trabajo, no se
    puede corregir nada (para eso está /staging/crear)."""
    if payload.tabla not in CAMPOS_HOMOGENIZAR_POR_TABLA or payload.campo not in CAMPOS_HOMOGENIZAR_POR_TABLA[payload.tabla]:
        raise HTTPException(status_code=400, detail="Campo no reconocido para corrección de homogenización")
    etiqueta = next(et for t, c, et in CAMPOS_HOMOGENIZAR if t == payload.tabla and c == payload.campo)

    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        _requiere_staging(cur)
        filas_actualizadas = _registrar_y_aplicar(
            cur,
            payload.tabla,
            payload.campo,
            etiqueta,
            f"lower(trim({payload.campo})) = %s AND {payload.campo} IS DISTINCT FROM %s",
            (payload.clave, payload.valor),
            payload.valor,
        )

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        auditoria = _auditar(cur, SCHEMA_STAGING)

    return {"filas_actualizadas": filas_actualizadas, "auditoria": auditoria}


@router.post("/corregir-valores")
def corregir_valores(payload: CorregirValoresIn) -> dict[str, Any]:
    """Igual que /corregir, pero para la auditoría manual por columna: unifica
    una lista de valores elegidos a mano (no necesariamente variantes de
    mayúsculas entre sí) a un único valor destino."""
    if payload.tabla not in CAMPOS_AUDITABLES or payload.campo not in CAMPOS_AUDITABLES[payload.tabla]:
        raise HTTPException(status_code=400, detail="Campo no habilitado para auditoría manual")
    if not payload.valores_origen:
        raise HTTPException(status_code=400, detail="Selecciona al menos un valor para unificar")

    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        _requiere_staging(cur)
        filas_actualizadas = _registrar_y_aplicar(
            cur,
            payload.tabla,
            payload.campo,
            f"{payload.tabla}.{payload.campo} (manual)",
            f"{payload.campo} = ANY(%s) AND {payload.campo} IS DISTINCT FROM %s",
            (payload.valores_origen, payload.valor_destino),
            payload.valor_destino,
        )

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        auditoria = _auditar(cur, SCHEMA_STAGING)

    return {"filas_actualizadas": filas_actualizadas, "auditoria": auditoria}


@router.get("/staging/historial")
def historial_staging() -> list[dict[str, Any]]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA_STAGING,))
        if not cur.fetchone():
            return []
        cur.execute(
            f"""
            SELECT id, tabla, campo, etiqueta, valor_nuevo, jsonb_array_length(filas) AS filas, aplicado_en, deshecho
            FROM {SCHEMA_STAGING}._historial
            ORDER BY id DESC
            """
        )
        return cur.fetchall()


@router.post("/deshacer")
def deshacer(payload: DeshacerIn) -> dict[str, Any]:
    """Revierte una corrección puntual: restaura el valor anterior fila por
    fila (guardado en /corregir o /corregir-valores) y marca la entrada del
    historial como deshecha."""
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        _requiere_staging(cur)
        cur.execute(
            f"SELECT tabla, campo, filas, deshecho FROM {SCHEMA_STAGING}._historial WHERE id = %s",
            (payload.historial_id,),
        )
        entrada = cur.fetchone()
        if not entrada:
            raise HTTPException(status_code=404, detail="Esa corrección no existe en el historial de esta copia.")
        if entrada["deshecho"]:
            raise HTTPException(status_code=400, detail="Esa corrección ya estaba deshecha.")

        tabla, campo = entrada["tabla"], entrada["campo"]
        for fila in entrada["filas"]:
            cur.execute(
                f"UPDATE {SCHEMA_STAGING}.{tabla} SET {campo} = %s WHERE id = %s",
                (fila["valor"], fila["id"]),
            )
        cur.execute(f"UPDATE {SCHEMA_STAGING}._historial SET deshecho = true WHERE id = %s", (payload.historial_id,))
        filas_restauradas = len(entrada["filas"])

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        auditoria = _auditar(cur, SCHEMA_STAGING)

    return {"filas_restauradas": filas_restauradas, "auditoria": auditoria}


# ---------------------------------------------------------------------------
# Auditoría manual por columna: clic en un encabezado de la Vista de tabla.
# ---------------------------------------------------------------------------


@router.get("/columna/{tabla}/{campo}")
def valores_columna(tabla: str, campo: str) -> dict[str, Any]:
    if tabla not in CAMPOS_AUDITABLES or campo not in CAMPOS_AUDITABLES[tabla]:
        raise HTTPException(status_code=400, detail="Campo no habilitado para auditoría manual")
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        schema = _schema_activo(cur)
        cur.execute(
            f"""
            SELECT {campo} AS valor, count(*)::int AS filas
            FROM {schema}.{tabla}
            WHERE {campo} IS NOT NULL AND trim({campo}) <> ''
            GROUP BY {campo}
            ORDER BY count(*) DESC
            LIMIT 500
            """
        )
        return {"tabla": tabla, "campo": campo, "schema": schema, "valores": cur.fetchall()}


# ---------------------------------------------------------------------------
# Exportar a Excel
# ---------------------------------------------------------------------------


@router.get("/exportar")
def exportar():
    wb = Workbook()
    wb.remove(wb.active)
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        schema = _schema_activo(cur)
        for tabla, columnas in TABLAS.items():
            cur.execute(f"SELECT {', '.join(columnas)} FROM {schema}.{tabla} ORDER BY id")
            filas = cur.fetchall()
            hoja = wb.create_sheet(tabla[:31])
            hoja.append(columnas)
            for fila in filas:
                hoja.append([str(fila[c]) if fila[c] is not None else None for c in columnas])

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    nombre = f"agrofresh_{schema}_{datetime.now(timezone.utc):%Y%m%d_%H%M}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.post("/promover")
def promover() -> dict[str, Any]:
    """Reemplaza la base en vivo por la copia de trabajo: requiere que la copia
    tenga 0 inconsistencias pendientes. Es un renombre de schemas (no una
    reescritura fila por fila), así que es prácticamente instantáneo y no
    necesita reiniciar el backend -las consultas usan nombres sin prefijo de
    schema, así que empiezan a resolver contra el nuevo 'lab' de inmediato-.
    La base anterior se conserva como respaldo con el nombre lab_backup_<fecha>."""
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA_STAGING,))
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="No hay una copia de trabajo activa para promover.")

        auditoria = _auditar(cur, SCHEMA_STAGING)
        if auditoria["total_inconsistencias"] > 0:
            raise HTTPException(
                status_code=400,
                detail=f"La copia de trabajo todavía tiene {auditoria['total_inconsistencias']} inconsistencias. "
                "Corrígelas todas antes de aplicar a producción.",
            )

        # _meta / _historial son control interno de la copia de trabajo: no
        # deben quedar dando vueltas dentro de lo que va a ser "lab" en producción.
        cur.execute(f"DROP TABLE IF EXISTS {SCHEMA_STAGING}._historial")
        cur.execute(f"DROP TABLE IF EXISTS {SCHEMA_STAGING}._meta")

        respaldo = f"{SCHEMA_PROD}_backup_{datetime.now(timezone.utc):%Y%m%d_%H%M%S}"
        cur.execute(f"ALTER SCHEMA {SCHEMA_PROD} RENAME TO {respaldo}")
        cur.execute(f"ALTER SCHEMA {SCHEMA_STAGING} RENAME TO {SCHEMA_PROD}")

    return {"ok": True, "respaldo": respaldo}
