"""
Verificaciones diarias del laboratorio de cromatografía .

Reemplaza el libro Excel con macros que el laboratorio llenaba cada mañana.
Ahí el ingreso del día vivía en una hoja, los criterios en otra, y una macro
copiaba los datos a siete hojas de histórico. Acá el ingreso y el histórico
son la MISMA fila: no hay traspaso que se pueda olvidar ni quedar a medias.

Seis secciones, en el mismo orden en que se hacen en el mesón:

    1. Micropipetas   3 pesadas por equipo, corregidas por el factor Z del
                      agua a la temperatura del día.
    2. Balanza        3 lecturas por pesa patrón.
    3. Temperatura    sala, refrigerador y congelador.
    4. Gases          presión de contenido y de trabajo por cilindro, más la
                      pregunta de fugas -que es una sola para el día-.
    5. Inyector       limpieza y estado de la aguja, cambio de septa.
    6. Detector       voltaje de la perla, método cargado y output.

Los criterios NO están escritos en este archivo: viven en los catálogos
(`verif_micropipeta`, `verif_pesa_patron`, `verif_punto_temperatura`) y en
`verif_parametro`, y se editan desde la aplicación. Cambiar una tolerancia
no debería requerir un despliegue.

Quién decide el resultado es el servidor. La pantalla calcula lo mismo
mientras se escribe -para eso está `src/features/verificaciones/lib/calculos.ts`-,
pero lo que queda guardado es lo que se recalcula acá al guardar el día.
"""
# Sin `from __future__ import annotations` a propósito: `_crud` arma cuatro
# CRUD iguales tomando el modelo como argumento, y FastAPI necesita que la
# anotación del cuerpo sea la clase de verdad y no el texto "modelo_in".
import io
import unicodedata
from datetime import date, datetime, timedelta
from decimal import Decimal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from psycopg2.errors import ForeignKeyViolation, UndefinedTable
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .auth import Usuario, solo_admin_general, solo_interno, usuario_actual
from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/verificaciones", tags=["verificaciones"])

ACEPTABLE = "Aceptable"
NO_ACEPTABLE = "No aceptable"
SIN_DATOS = "Sin datos"
# Una sección sin ninguna medición no dice nada: no es aceptable ni deja de
# serlo. Se distingue de "No aceptable" a propósito -mezclarlas haría que un
# día a medio llenar se viera como un día con un problema-.
SIN_MEDIR = ""

SI = "Sí"
NO = "No"
NA = "N.A."

EMAIL_SUPERADMIN_VERIFICACIONES = "jorge.sandoval@agrofresh.com"


def _es_superadmin_verificaciones(usuario: Usuario) -> bool:
    return usuario.email.strip().lower() == EMAIL_SUPERADMIN_VERIFICACIONES


def _exigir_fecha_editable(usuario: Usuario, fecha: date, existe: bool) -> None:
    """La carga diaria se crea hoy y solo se corrige al día siguiente.

    La cuenta superadministradora puede intervenir cualquier fecha cuando sea
    necesario corregir un histórico; esta regla se aplica en el servidor para
    que no baste con alterar la URL del navegador.
    """
    if _es_superadmin_verificaciones(usuario):
        return
    fecha_permitida = date.today() - timedelta(days=1) if existe else date.today()
    if fecha != fecha_permitida:
        accion = "editar" if existe else "crear"
        raise HTTPException(403, f"No puedes {accion} verificaciones para esta fecha.")


# ---------------------------------------------------------------------------
# Cálculo — funciones puras, sin base de datos, para poder probarlas solas
# ---------------------------------------------------------------------------


def _num(valor) -> float | None:
    """Decimal de psycopg2, int, float o None -> float o None."""
    if valor is None:
        return None
    if isinstance(valor, Decimal):
        return float(valor)
    return float(valor)


def veredicto(cumple: bool) -> str:
    return ACEPTABLE if cumple else NO_ACEPTABLE


def factor_z(temperatura: float | None, tabla: dict[int, float]) -> float | None:
    """Factor de corrección Z del agua (µL/mg) a la temperatura del día.

    La tabla es por grado entero, así que la temperatura se redondea, igual
    que hacía la fórmula del Excel. Fuera del rango de la tabla no se
    inventa un valor: sin Z no hay volumen, y un volumen inventado sería
    peor que uno que falta.
    """
    if temperatura is None:
        return None
    return tabla.get(int(round(temperatura)))


def calcular_micropipeta(
    pesos: list[float | None], z: float | None, nominal: float, tolerancia: float
) -> dict:
    """Volumen medio = promedio de las 3 pesadas × 1000 × Z.
    Los pesos van en gramos; Z en µL/mg; el ×1000 convierte g→mg."""
    validos = [p for p in pesos if p is not None]
    if len(validos) < 3 or z is None:
        return {"volumen_medio": None, "desviacion": None, "error_pct": None, "resultado": SIN_MEDIR}
    volumen = sum(validos) / 3 * 1000 * z
    desviacion = abs(volumen - nominal)
    error_pct = (volumen - nominal) / nominal * 100 if nominal else None
    return {
        "volumen_medio": round(volumen, 4),
        "desviacion": round(desviacion, 4),
        "error_pct": round(error_pct, 4) if error_pct is not None else None,
        "resultado": veredicto(desviacion <= tolerancia),
    }


def calcular_balanza(lecturas: list[float | None], nominal: float, tolerancia: float) -> dict:
    """Promedio de las 3 lecturas contra el valor nominal de la pesa.

    En el Excel esta fórmula estaba rota: la celda de resultado apuntaba a
    `#REF!` -una columna que alguien borró- y por eso las tres filas de
    balanza salían siempre en error. Acá se compara lo que corresponde:
    cuánto se aleja el promedio del valor nominal. Las lecturas de la balanza
    llegan en gramos y el catálogo de pesas está en miligramos, por lo que se
    convierte el promedio antes de calcular el veredicto.
    """
    validos = [l for l in lecturas if l is not None]
    if len(validos) < 3:
        return {"promedio": None, "desviacion": None, "resultado": SIN_MEDIR}
    promedio = sum(validos) / 3 * 1000
    desviacion = abs(promedio - nominal)
    return {
        "promedio": round(promedio, 4),
        "desviacion": round(desviacion, 4),
        "resultado": veredicto(desviacion <= tolerancia),
    }


def calcular_temperatura(lectura: float | None, minimo: float, maximo: float) -> str:
    if lectura is None:
        return SIN_MEDIR
    return veredicto(minimo <= lectura <= maximo)


def calcular_gas(
    contenido: float | None,
    trabajo: float | None,
    contenido_min: float,
    trabajo_min: float,
    trabajo_max: float,
) -> str:
    if contenido is None and trabajo is None:
        return SIN_MEDIR
    if contenido is None or trabajo is None:
        # Media medición no alcanza para aprobar un cilindro.
        return SIN_MEDIR
    return veredicto(contenido >= contenido_min and trabajo_min <= trabajo <= trabajo_max)


def calcular_inyector(limpieza: str, danada: str, reemplazada: str) -> str:
    """Aceptable si se limpió la aguja y, además, la aguja está sana o fue
    reemplazada. Una aguja dañada que sigue puesta no es aceptable."""
    if not limpieza:
        return SIN_MEDIR
    return veredicto(limpieza == SI and (danada == NO or reemplazada == SI))


def calcular_detector(
    voltaje: float | None,
    metodo: str,
    output: float | None,
    voltaje_min: float,
    voltaje_max: float,
    output_min: float,
    output_max: float,
) -> dict:
    r_voltaje = SIN_MEDIR if voltaje is None else veredicto(voltaje_min <= voltaje <= voltaje_max)
    r_metodo = SIN_MEDIR if not metodo else ACEPTABLE
    r_output = SIN_MEDIR if output is None else veredicto(output_min <= output <= output_max)
    return {
        "resultado_voltaje": r_voltaje,
        "resultado_metodo": r_metodo,
        "resultado_output": r_output,
        "resultado": resumir([r_voltaje, r_metodo, r_output]),
    }


def calcular_fugas(respuesta: str) -> str:
    if not respuesta:
        return SIN_MEDIR
    return veredicto(respuesta == NO)


def resumir(resultados: list[str]) -> str:
    """Un «No aceptable» manda sobre todo lo demás; si no se midió nada, la
    sección queda sin resultado, no aprobada por omisión."""
    if NO_ACEPTABLE in resultados:
        return NO_ACEPTABLE
    if ACEPTABLE in resultados:
        return ACEPTABLE
    return SIN_MEDIR


def resultado_del_dia(por_seccion: list[str]) -> str:
    resumen = resumir(por_seccion)
    return SIN_DATOS if resumen == SIN_MEDIR else resumen


# ---------------------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------------------


class Micropipeta(BaseModel):
    id: int
    nombre: str
    codigo: str = ""
    volumen_nominal: float
    tolerancia: float
    orden: int = 0
    activo: bool = True


class MicropipetaIn(BaseModel):
    nombre: str
    codigo: str = ""
    volumen_nominal: float
    tolerancia: float
    orden: int = 0
    activo: bool = True


class PesaPatron(BaseModel):
    id: int
    nombre: str
    codigo: str = ""
    valor_nominal: float
    tolerancia: float
    orden: int = 0
    activo: bool = True


class PesaPatronIn(BaseModel):
    nombre: str
    codigo: str = ""
    valor_nominal: float
    tolerancia: float
    orden: int = 0
    activo: bool = True


class PuntoTemperatura(BaseModel):
    id: int
    nombre: str
    codigo: str = ""
    minimo: float
    maximo: float
    orden: int = 0
    activo: bool = True


class PuntoTemperaturaIn(BaseModel):
    nombre: str
    codigo: str = ""
    minimo: float
    maximo: float
    orden: int = 0
    activo: bool = True


class Gas(BaseModel):
    id: int
    nombre: str
    codigo: str = ""
    orden: int = 0
    activo: bool = True


class GasIn(BaseModel):
    nombre: str
    codigo: str = ""
    orden: int = 0
    activo: bool = True


class Metodo(BaseModel):
    id: int
    nombre: str
    orden: int = 0
    activo: bool = True


class MetodoIn(BaseModel):
    nombre: str
    orden: int = 0
    activo: bool = True


class Parametro(BaseModel):
    clave: str
    valor: float
    descripcion: str = ""
    unidad: str = ""
    orden: int = 0


class ParametroIn(BaseModel):
    valor: float


class FactorZ(BaseModel):
    temperatura: int
    factor: float


class ColumnaConfig(BaseModel):
    seccion: str
    clave: str
    etiqueta: str | None = None
    unidad: str | None = None
    visible: bool = True


class ColumnaConfigIn(BaseModel):
    etiqueta: str | None = None
    unidad: str | None = None
    visible: bool = True


class Config(BaseModel):
    """Todo lo que el formulario necesita para dibujarse, en una sola llamada.
    Son seis catálogos chicos: pedirlos por separado serían seis viajes para
    pintar una pantalla."""

    micropipetas: list[Micropipeta]
    pesas: list[PesaPatron]
    puntos_temperatura: list[PuntoTemperatura]
    gases: list[Gas]
    metodos: list[Metodo]
    parametros: list[Parametro]
    tabla_z: list[FactorZ]
    columnas_config: dict[str, list[ColumnaConfig]] = {}


class MicropipetaMedicionIn(BaseModel):
    micropipeta_id: int
    analista: str = ""
    peso_1: float | None = None
    peso_2: float | None = None
    peso_3: float | None = None
    observacion: str = ""


class MicropipetaMedicion(MicropipetaMedicionIn):
    nombre: str = ""
    volumen_nominal: float = 0
    tolerancia: float = 0
    volumen_medio: float | None = None
    desviacion: float | None = None
    error_pct: float | None = None
    resultado: str = SIN_MEDIR


class BalanzaMedicionIn(BaseModel):
    pesa_id: int
    analista: str = ""
    lectura_1: float | None = None
    lectura_2: float | None = None
    lectura_3: float | None = None
    observacion: str = ""


class BalanzaMedicion(BalanzaMedicionIn):
    nombre: str = ""
    valor_nominal: float = 0
    tolerancia: float = 0
    promedio: float | None = None
    desviacion: float | None = None
    resultado: str = SIN_MEDIR


class TemperaturaMedicionIn(BaseModel):
    punto_id: int
    analista: str = ""
    lectura: float | None = None
    observacion: str = ""


class TemperaturaMedicion(TemperaturaMedicionIn):
    nombre: str = ""
    minimo: float = 0
    maximo: float = 0
    resultado: str = SIN_MEDIR


class GasMedicionIn(BaseModel):
    gas_id: int
    analista: str = ""
    codigo_cilindro: str = ""
    presion_contenido: float | None = None
    presion_trabajo: float | None = None
    observacion: str = ""


class GasMedicion(GasMedicionIn):
    nombre: str = ""
    resultado: str = SIN_MEDIR


class InyectorIn(BaseModel):
    analista: str = ""
    limpieza_aguja: str = ""
    aguja_danada: str = ""
    aguja_reemplazada: str = ""
    cambio_septa: str = ""
    observaciones: str = ""
    metodo_nombre: str = ""
    observacion: str = ""


class Inyector(InyectorIn):
    resultado: str = SIN_MEDIR


class DetectorIn(BaseModel):
    analista: str = ""
    voltaje_perla: float | None = None
    metodo_correcto: str = ""
    metodo_nombre: str = ""
    output_detector: float | None = None
    observacion: str = ""


class Detector(DetectorIn):
    resultado_voltaje: str = SIN_MEDIR
    resultado_metodo: str = SIN_MEDIR
    resultado_output: str = SIN_MEDIR
    resultado: str = SIN_MEDIR


class RegistroIn(BaseModel):
    temperatura_agua: float | None = None
    fugas_visibles: str = ""
    fugas_observacion: str = ""
    observaciones: str = ""
    revisado_por: str = ""
    analista: str = ""
    observacion_edicion: str = ""
    micropipetas: list[MicropipetaMedicionIn] = []
    balanza: list[BalanzaMedicionIn] = []
    temperaturas: list[TemperaturaMedicionIn] = []
    gases: list[GasMedicionIn] = []
    inyector: InyectorIn = InyectorIn()
    detector: DetectorIn = DetectorIn()


class Registro(BaseModel):
    fecha: date
    temperatura_agua: float | None = None
    factor_z: float | None = None
    fugas_visibles: str = ""
    fugas_observacion: str = ""
    resultado_fugas: str = SIN_MEDIR
    observaciones: str = ""
    revisado_por: str = ""
    analista: str = ""
    editado_por: str | None = None
    editado_en: datetime | None = None
    observacion_edicion: str = ""
    creado_por: str = ""
    actualizado_en: datetime | None = None
    micropipetas: list[MicropipetaMedicion] = []
    balanza: list[BalanzaMedicion] = []
    temperaturas: list[TemperaturaMedicion] = []
    gases: list[GasMedicion] = []
    inyector: Inyector = Inyector()
    detector: Detector = Detector()
    resultados_seccion: dict[str, str] = {}
    resultado: str = SIN_DATOS


class ResumenDia(BaseModel):
    """Una fila del Resumen_Diario: el día y cómo salió cada sección."""

    fecha: date
    micropipetas: str = SIN_MEDIR
    balanza: str = SIN_MEDIR
    temperatura: str = SIN_MEDIR
    gases: str = SIN_MEDIR
    inyector: str = SIN_MEDIR
    detector: str = SIN_MEDIR
    resultado: str = SIN_DATOS
    observaciones: str = ""
    revisado_por: str = ""


# ---------------------------------------------------------------------------
# Lectura de catálogos
# ---------------------------------------------------------------------------

SECCIONES = ("micropipetas", "balanza", "temperatura", "gases", "inyector", "detector")


def _leer_config(cur) -> dict:
    cur.execute("SELECT * FROM verif_micropipeta ORDER BY orden, nombre, volumen_nominal")
    micropipetas = [dict(f) for f in cur.fetchall()]
    cur.execute("SELECT * FROM verif_pesa_patron ORDER BY orden, valor_nominal")
    pesas = [dict(f) for f in cur.fetchall()]
    cur.execute("SELECT * FROM verif_punto_temperatura ORDER BY orden, nombre")
    puntos = [dict(f) for f in cur.fetchall()]
    cur.execute("SELECT * FROM verif_gas ORDER BY orden, nombre")
    gases = [dict(f) for f in cur.fetchall()]
    cur.execute("SELECT * FROM verif_metodo ORDER BY orden, nombre")
    metodos = [dict(f) for f in cur.fetchall()]
    cur.execute("SELECT * FROM verif_parametro ORDER BY orden, clave")
    parametros = [dict(f) for f in cur.fetchall()]
    cur.execute("SELECT temperatura, factor FROM verif_agua_z ORDER BY temperatura")
    tabla_z = [dict(f) for f in cur.fetchall()]
    for coleccion, campos in (
        (micropipetas, ("volumen_nominal", "tolerancia")),
        (pesas, ("valor_nominal", "tolerancia")),
        (puntos, ("minimo", "maximo")),
        (parametros, ("valor",)),
        (tabla_z, ("factor",)),
    ):
        for fila in coleccion:
            for campo in campos:
                fila[campo] = _num(fila[campo])
    try:
        cur.execute("SELECT * FROM verif_columna_config ORDER BY seccion, clave")
        col_filas = [dict(f) for f in cur.fetchall()]
    except Exception:
        col_filas = []
    col_config: dict[str, list] = {}
    for f in col_filas:
        col_config.setdefault(f["seccion"], []).append(f)
    return {
        "micropipetas": micropipetas,
        "pesas": pesas,
        "puntos_temperatura": puntos,
        "gases": gases,
        "metodos": metodos,
        "parametros": parametros,
        "tabla_z": tabla_z,
        "columnas_config": col_config,
    }


def _indexar(config: dict) -> dict:
    """Los catálogos por id y los parámetros por clave, que es como los usa el
    cálculo."""
    return {
        "micropipetas": {m["id"]: m for m in config["micropipetas"]},
        "pesas": {p["id"]: p for p in config["pesas"]},
        "puntos": {p["id"]: p for p in config["puntos_temperatura"]},
        "gases": {g["id"]: g for g in config["gases"]},
        "parametros": {p["clave"]: p["valor"] for p in config["parametros"]},
        "tabla_z": {int(f["temperatura"]): f["factor"] for f in config["tabla_z"]},
    }


def _param(indice: dict, clave: str, por_defecto: float) -> float:
    """Un parámetro borrado a mano de la tabla no debe tumbar el guardado del
    día: se cae al valor con que se sembró la migración."""
    valor = indice["parametros"].get(clave)
    return por_defecto if valor is None else valor


# ---------------------------------------------------------------------------
# Config: leer y mantener
# ---------------------------------------------------------------------------


@router.get("/config", response_model=Config)
def obtener_config() -> Config:
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            return Config(**_leer_config(cur))
    except UndefinedTable:
        # El código está y la base no: falta correr la migración en el
        # servidor. Sin este mensaje sale un 500 con "relation ... does not
        # exist", que no le dice a nadie qué hacer.
        raise HTTPException(
            500,
            "Las tablas de Verificaciones diarias no existen todavía. Falta correr la "
            "migración en el servidor: scripts/migrar.py 0026_verificaciones_diarias.sql",
        )


def _crud(ruta: str, tabla: str, modelo, modelo_in, columnas: tuple[str, ...]) -> None:
    """Los cuatro catálogos son la misma pantalla con distintas columnas.
    Escribir cuatro veces el mismo CRUD a mano es cuatro veces la misma
    posibilidad de equivocarse en una."""

    lista = ", ".join(columnas)
    marcadores = ", ".join(["%s"] * len(columnas))
    asignaciones = ", ".join(f"{c} = %s" for c in columnas)

    @router.get(ruta, response_model=list[modelo], name=f"listar_{tabla}")
    def listar():  # type: ignore[misc]
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(f"SELECT * FROM {tabla} ORDER BY orden, id")
            return [modelo(**_normalizar(dict(f))) for f in cur.fetchall()]

    @router.post(ruta, response_model=modelo, name=f"crear_{tabla}")
    def crear(datos: modelo_in, _: Usuario = Depends(solo_interno)):  # type: ignore[misc]
        valores = [getattr(datos, c) for c in columnas]
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                f"INSERT INTO {tabla} ({lista}) VALUES ({marcadores}) RETURNING *", valores
            )
            return modelo(**_normalizar(dict(cur.fetchone())))

    @router.put(f"{ruta}/{{id}}", response_model=modelo, name=f"actualizar_{tabla}")
    def actualizar(id: int, datos: modelo_in, _: Usuario = Depends(solo_interno)):  # type: ignore[misc]
        valores = [getattr(datos, c) for c in columnas]
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(f"UPDATE {tabla} SET {asignaciones} WHERE id = %s RETURNING *", [*valores, id])
            fila = cur.fetchone()
            if not fila:
                raise HTTPException(404, "No existe ese elemento del catálogo.")
            return modelo(**_normalizar(dict(fila)))

    @router.delete(f"{ruta}/{{id}}", name=f"eliminar_{tabla}")
    def eliminar(id: int, _: Usuario = Depends(solo_interno)) -> dict:  # type: ignore[misc]
        with conexion() as conn, cursor_dict(conn) as cur:
            try:
                cur.execute(f"DELETE FROM {tabla} WHERE id = %s", [id])
            except ForeignKeyViolation:
                # Tiene mediciones colgando (ON DELETE RESTRICT). Borrarlo
                # dejaría el histórico sin poder decir a qué equipo pertenecía.
                raise HTTPException(
                    409,
                    "Este elemento ya tiene verificaciones registradas: desactívalo "
                    "en vez de eliminarlo, así el histórico sigue completo.",
                )
        return {"estado": "eliminado"}


def _normalizar(fila: dict) -> dict:
    """psycopg2 devuelve NUMERIC como Decimal, y pydantic lo aceptaría, pero
    entonces el JSON saldría como string. Se pasa a float una sola vez acá."""
    return {k: (float(v) if isinstance(v, Decimal) else v) for k, v in fila.items()}


_crud(
    "/config/micropipetas",
    "verif_micropipeta",
    Micropipeta,
    MicropipetaIn,
    ("nombre", "codigo", "volumen_nominal", "tolerancia", "orden", "activo"),
)
_crud(
    "/config/pesas",
    "verif_pesa_patron",
    PesaPatron,
    PesaPatronIn,
    ("nombre", "codigo", "valor_nominal", "tolerancia", "orden", "activo"),
)
_crud(
    "/config/puntos-temperatura",
    "verif_punto_temperatura",
    PuntoTemperatura,
    PuntoTemperaturaIn,
    ("nombre", "codigo", "minimo", "maximo", "orden", "activo"),
)
_crud("/config/gases", "verif_gas", Gas, GasIn, ("nombre", "codigo", "orden", "activo"))
_crud("/config/metodos", "verif_metodo", Metodo, MetodoIn, ("nombre", "orden", "activo"))


@router.put("/config/columnas/{seccion}/{clave}", response_model=ColumnaConfig)
def actualizar_columna_config(
    seccion: str, clave: str, datos: ColumnaConfigIn, _: Usuario = Depends(solo_interno)
) -> ColumnaConfig:
    """Sobreescribe la etiqueta, la unidad o la visibilidad de una columna de
    un catálogo. NULL en etiqueta o unidad = volver al valor por defecto."""
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            """
            INSERT INTO verif_columna_config (seccion, clave, etiqueta, unidad, visible)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (seccion, clave) DO UPDATE
            SET etiqueta = EXCLUDED.etiqueta,
                unidad   = EXCLUDED.unidad,
                visible  = EXCLUDED.visible
            RETURNING *
            """,
            [seccion, clave, datos.etiqueta, datos.unidad, datos.visible],
        )
        return ColumnaConfig(**dict(cur.fetchone()))


@router.put("/config/parametros/{clave}", response_model=Parametro)
def actualizar_parametro(
    clave: str, datos: ParametroIn, _: Usuario = Depends(solo_interno)
) -> Parametro:
    """Los parámetros no se crean ni se borran: son un conjunto fijo que el
    cálculo conoce por nombre. Solo cambia su valor."""
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("UPDATE verif_parametro SET valor = %s WHERE clave = %s RETURNING *", [datos.valor, clave])
        fila = cur.fetchone()
        if not fila:
            raise HTTPException(404, f"No existe el parámetro {clave!r}.")
        return Parametro(**_normalizar(dict(fila)))


# ---------------------------------------------------------------------------
# El día
# ---------------------------------------------------------------------------


def _con_datos_micropipeta(m: MicropipetaMedicionIn) -> bool:
    return any(v is not None for v in (m.peso_1, m.peso_2, m.peso_3))


def _con_datos_balanza(m: BalanzaMedicionIn) -> bool:
    return any(v is not None for v in (m.lectura_1, m.lectura_2, m.lectura_3))


def _armar_registro(cur, fila_dia: dict, config: dict) -> Registro:
    """Toma la fila del día y sus mediciones y devuelve el registro completo,
    con los resultados recalculados. Recalcular al LEER -y no confiar en la
    columna guardada- es lo que hace que cambiar un criterio se refleje en el
    histórico sin tener que reprocesar nada."""
    indice = _indexar(config)
    registro_id = fila_dia["id"]
    temperatura = _num(fila_dia["temperatura_agua"])
    z = factor_z(temperatura, indice["tabla_z"])

    cur.execute(
        "SELECT * FROM verif_micropipeta_medicion WHERE registro_id = %s ORDER BY id", [registro_id]
    )
    micropipetas: list[MicropipetaMedicion] = []
    for f in cur.fetchall():
        equipo = indice["micropipetas"].get(f["micropipeta_id"])
        if not equipo:
            continue
        pesos = [_num(f["peso_1"]), _num(f["peso_2"]), _num(f["peso_3"])]
        calculo = calcular_micropipeta(pesos, z, equipo["volumen_nominal"], equipo["tolerancia"])
        micropipetas.append(
            MicropipetaMedicion(
                micropipeta_id=f["micropipeta_id"],
                analista=f["analista"],
                peso_1=pesos[0],
                peso_2=pesos[1],
                peso_3=pesos[2],
                observacion=f.get("observacion", "") or "",
                nombre=equipo["nombre"],
                volumen_nominal=equipo["volumen_nominal"],
                tolerancia=equipo["tolerancia"],
                **calculo,
            )
        )

    cur.execute("SELECT * FROM verif_balanza_medicion WHERE registro_id = %s ORDER BY id", [registro_id])
    balanza: list[BalanzaMedicion] = []
    for f in cur.fetchall():
        pesa = indice["pesas"].get(f["pesa_id"])
        if not pesa:
            continue
        lecturas = [_num(f["lectura_1"]), _num(f["lectura_2"]), _num(f["lectura_3"])]
        calculo = calcular_balanza(lecturas, pesa["valor_nominal"], pesa["tolerancia"])
        balanza.append(
            BalanzaMedicion(
                pesa_id=f["pesa_id"],
                analista=f["analista"],
                lectura_1=lecturas[0],
                lectura_2=lecturas[1],
                lectura_3=lecturas[2],
                observacion=f.get("observacion", "") or "",
                nombre=pesa["nombre"],
                valor_nominal=pesa["valor_nominal"],
                tolerancia=pesa["tolerancia"],
                **calculo,
            )
        )

    cur.execute(
        "SELECT * FROM verif_temperatura_medicion WHERE registro_id = %s ORDER BY id", [registro_id]
    )
    temperaturas: list[TemperaturaMedicion] = []
    for f in cur.fetchall():
        punto = indice["puntos"].get(f["punto_id"])
        if not punto:
            continue
        lectura = _num(f["lectura"])
        temperaturas.append(
            TemperaturaMedicion(
                punto_id=f["punto_id"],
                analista=f["analista"],
                lectura=lectura,
                observacion=f.get("observacion", "") or "",
                nombre=punto["nombre"],
                minimo=punto["minimo"],
                maximo=punto["maximo"],
                resultado=calcular_temperatura(lectura, punto["minimo"], punto["maximo"]),
            )
        )

    contenido_min = _param(indice, "gas_presion_contenido_min", 200)
    trabajo_min = _param(indice, "gas_presion_trabajo_min", 80)
    trabajo_max = _param(indice, "gas_presion_trabajo_max", 120)
    cur.execute("SELECT * FROM verif_gas_medicion WHERE registro_id = %s ORDER BY id", [registro_id])
    gases: list[GasMedicion] = []
    for f in cur.fetchall():
        gas = indice["gases"].get(f["gas_id"])
        if not gas:
            continue
        contenido, trabajo = _num(f["presion_contenido"]), _num(f["presion_trabajo"])
        gases.append(
            GasMedicion(
                gas_id=f["gas_id"],
                analista=f["analista"],
                codigo_cilindro=f["codigo_cilindro"],
                presion_contenido=contenido,
                presion_trabajo=trabajo,
                observacion=f.get("observacion", "") or "",
                nombre=gas["nombre"],
                resultado=calcular_gas(contenido, trabajo, contenido_min, trabajo_min, trabajo_max),
            )
        )

    cur.execute("SELECT * FROM verif_inyector WHERE registro_id = %s", [registro_id])
    f = cur.fetchone()
    inyector = Inyector(
        **{c: f[c] for c in ("analista", "limpieza_aguja", "aguja_danada", "aguja_reemplazada", "cambio_septa", "observaciones")},
        metodo_nombre=f.get("metodo_nombre", "") or "",
        observacion=f.get("observacion", "") or "",
        resultado=calcular_inyector(f["limpieza_aguja"], f["aguja_danada"], f["aguja_reemplazada"]),
    ) if f else Inyector()

    cur.execute("SELECT * FROM verif_detector WHERE registro_id = %s", [registro_id])
    f = cur.fetchone()
    if f:
        voltaje, output = _num(f["voltaje_perla"]), _num(f["output_detector"])
        metodo_nombre = f.get("metodo_nombre", "") or ""
        metodo_para_calculo = metodo_nombre or (SI if f.get("metodo_correcto") == SI else "")
        detector = Detector(
            analista=f["analista"],
            voltaje_perla=voltaje,
            metodo_correcto=f.get("metodo_correcto", ""),
            metodo_nombre=metodo_nombre,
            observacion=f.get("observacion", "") or "",
            output_detector=output,
            **calcular_detector(
                voltaje,
                metodo_para_calculo,
                output,
                _param(indice, "perla_voltaje_min", 0),
                _param(indice, "perla_voltaje_max", 1),
                _param(indice, "output_min", 19),
                _param(indice, "output_max", 22),
            ),
        )
    else:
        detector = Detector()

    resultado_fugas = calcular_fugas(fila_dia["fugas_visibles"])
    secciones = {
        "micropipetas": resumir([m.resultado for m in micropipetas]),
        "balanza": resumir([b.resultado for b in balanza]),
        "temperatura": resumir([t.resultado for t in temperaturas]),
        "gases": resumir([g.resultado for g in gases] + [resultado_fugas]),
        "inyector": inyector.resultado,
        "detector": detector.resultado,
    }

    return Registro(
        fecha=fila_dia["fecha"],
        temperatura_agua=temperatura,
        factor_z=z,
        fugas_visibles=fila_dia["fugas_visibles"],
        fugas_observacion=fila_dia.get("fugas_observacion", "") or "",
        resultado_fugas=resultado_fugas,
        observaciones=fila_dia["observaciones"],
        revisado_por=fila_dia["revisado_por"],
        analista=fila_dia.get("analista", "") or "",
        editado_por=fila_dia.get("editado_por"),
        editado_en=fila_dia.get("editado_en"),
        observacion_edicion=fila_dia.get("observacion_edicion", "") or "",
        creado_por=fila_dia["creado_por"],
        actualizado_en=fila_dia["actualizado_en"],
        micropipetas=micropipetas,
        balanza=balanza,
        temperaturas=temperaturas,
        gases=gases,
        inyector=inyector,
        detector=detector,
        resultados_seccion=secciones,
        resultado=resultado_del_dia(list(secciones.values())),
    )


@router.get("/registros", response_model=list[ResumenDia])
def listar_registros(desde: str | None = None, hasta: str | None = None) -> list[ResumenDia]:
    """El Resumen_Diario: un día por fila, con el veredicto de cada sección.

    Se arma recorriendo los días completos en vez de leer una columna
    `resultado` guardada, porque los criterios se pueden editar: el resumen
    tiene que decir cómo salió ese día CON los criterios de hoy, igual que
    hacían las fórmulas del Excel.
    """
    condiciones, valores = [], []
    if desde:
        condiciones.append("fecha >= %s")
        valores.append(desde)
    if hasta:
        condiciones.append("fecha <= %s")
        valores.append(hasta)
    donde = f"WHERE {' AND '.join(condiciones)}" if condiciones else ""

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        config = _leer_config(cur)
        cur.execute(f"SELECT * FROM verif_registro {donde} ORDER BY fecha DESC", valores)
        dias = [dict(f) for f in cur.fetchall()]
        resumen = []
        for dia in dias:
            registro = _armar_registro(cur, dia, config)
            resumen.append(
                ResumenDia(
                    fecha=registro.fecha,
                    **registro.resultados_seccion,
                    resultado=registro.resultado,
                    observaciones=registro.observaciones,
                    revisado_por=registro.revisado_por,
                )
            )
        return resumen


def _leer_dia(cur, fecha: date, config: dict) -> Registro | None:
    cur.execute("SELECT * FROM verif_registro WHERE fecha = %s", [fecha])
    fila = cur.fetchone()
    return _armar_registro(cur, dict(fila), config) if fila else None


@router.get("/registros/{fecha}", response_model=Registro)
def obtener_registro(fecha: date) -> Registro:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        registro = _leer_dia(cur, fecha, _leer_config(cur))
        if not registro:
            raise HTTPException(404, "Ese día todavía no tiene verificaciones registradas.")
        return registro


@router.put("/registros/{fecha}", response_model=Registro)
def guardar_registro(
    fecha: date, datos: RegistroIn, usuario: Usuario = Depends(usuario_actual)
) -> Registro:
    """Guarda el día entero de una vez.

    Es un reemplazo completo y no un parche campo por campo: el formulario
    manda siempre todo lo que tiene en pantalla, así que borrar una pesada y
    guardar tiene que dejarla borrada. Mandar solo lo cambiado obligaría a
    distinguir "vacío" de "no lo mandé", que es justo donde estos formularios
    se equivocan.
    """
    with conexion() as conn, cursor_dict(conn) as cur:
        nombre_usuario = usuario.nombre or usuario.email
        cur.execute("SELECT id, editado_por FROM verif_registro WHERE fecha = %s", [fecha])
        existente = cur.fetchone()
        es_edicion = existente is not None
        _exigir_fecha_editable(usuario, fecha, es_edicion)

        editado_por_nuevo = nombre_usuario if es_edicion else None
        editado_en_nuevo = "now()" if es_edicion else None

        if es_edicion:
            cur.execute(
                """
                UPDATE verif_registro
                   SET temperatura_agua     = %s,
                       fugas_visibles       = %s,
                       fugas_observacion    = %s,
                       observaciones        = %s,
                       revisado_por         = %s,
                       analista             = %s,
                       editado_por          = %s,
                       editado_en           = now(),
                       observacion_edicion  = %s,
                       actualizado_en       = now()
                 WHERE fecha = %s
                RETURNING id
                """,
                [
                    datos.temperatura_agua,
                    datos.fugas_visibles,
                    datos.fugas_observacion,
                    datos.observaciones,
                    datos.revisado_por,
                    datos.analista,
                    nombre_usuario,
                    datos.observacion_edicion,
                    fecha,
                ],
            )
        else:
            cur.execute(
                """
                INSERT INTO verif_registro (fecha, temperatura_agua, fugas_visibles, fugas_observacion,
                                            observaciones, revisado_por, analista, creado_por)
                     VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                  RETURNING id
                """,
                [
                    fecha,
                    datos.temperatura_agua,
                    datos.fugas_visibles,
                    datos.fugas_observacion,
                    datos.observaciones,
                    datos.revisado_por,
                    datos.analista,
                    nombre_usuario,
                ],
            )
        registro_id = cur.fetchone()["id"]

        # Se borra y se vuelve a escribir: es la forma más simple de que lo
        # guardado sea EXACTAMENTE lo que está en pantalla. Son unas pocas
        # decenas de filas por día, todo dentro de la misma transacción.
        for tabla in (
            "verif_micropipeta_medicion",
            "verif_balanza_medicion",
            "verif_temperatura_medicion",
            "verif_gas_medicion",
        ):
            cur.execute(f"DELETE FROM {tabla} WHERE registro_id = %s", [registro_id])

        for m in datos.micropipetas:
            if not _con_datos_micropipeta(m) and not m.analista and not m.observacion:
                continue
            cur.execute(
                """INSERT INTO verif_micropipeta_medicion
                          (registro_id, micropipeta_id, analista, peso_1, peso_2, peso_3, observacion)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                [registro_id, m.micropipeta_id, m.analista, m.peso_1, m.peso_2, m.peso_3, m.observacion],
            )
        for b in datos.balanza:
            if not _con_datos_balanza(b) and not b.analista and not b.observacion:
                continue
            cur.execute(
                """INSERT INTO verif_balanza_medicion
                          (registro_id, pesa_id, analista, lectura_1, lectura_2, lectura_3, observacion)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                [registro_id, b.pesa_id, b.analista, b.lectura_1, b.lectura_2, b.lectura_3, b.observacion],
            )
        for t in datos.temperaturas:
            if t.lectura is None and not t.analista and not t.observacion:
                continue
            cur.execute(
                """INSERT INTO verif_temperatura_medicion
                          (registro_id, punto_id, analista, lectura, observacion)
                   VALUES (%s, %s, %s, %s, %s)""",
                [registro_id, t.punto_id, t.analista, t.lectura, t.observacion],
            )
        for g in datos.gases:
            if g.presion_contenido is None and g.presion_trabajo is None and not g.codigo_cilindro and not g.analista and not g.observacion:
                continue
            cur.execute(
                """INSERT INTO verif_gas_medicion
                          (registro_id, gas_id, analista, codigo_cilindro, presion_contenido, presion_trabajo, observacion)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                [registro_id, g.gas_id, g.analista, g.codigo_cilindro, g.presion_contenido, g.presion_trabajo, g.observacion],
            )

        i = datos.inyector
        cur.execute(
            """INSERT INTO verif_inyector (registro_id, analista, limpieza_aguja, aguja_danada,
                                           aguja_reemplazada, cambio_septa, observaciones,
                                           metodo_nombre, observacion)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (registro_id) DO UPDATE
                      SET analista = EXCLUDED.analista,
                          limpieza_aguja = EXCLUDED.limpieza_aguja,
                          aguja_danada = EXCLUDED.aguja_danada,
                          aguja_reemplazada = EXCLUDED.aguja_reemplazada,
                          cambio_septa = EXCLUDED.cambio_septa,
                          observaciones = EXCLUDED.observaciones,
                          metodo_nombre = EXCLUDED.metodo_nombre,
                          observacion = EXCLUDED.observacion""",
            [registro_id, i.analista, i.limpieza_aguja, i.aguja_danada, i.aguja_reemplazada,
             i.cambio_septa, i.observaciones, i.metodo_nombre, i.observacion],
        )
        d = datos.detector
        cur.execute(
            """INSERT INTO verif_detector (registro_id, analista, voltaje_perla, metodo_correcto,
                                           metodo_nombre, output_detector, observacion)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (registro_id) DO UPDATE
                      SET analista = EXCLUDED.analista,
                          voltaje_perla = EXCLUDED.voltaje_perla,
                          metodo_correcto = EXCLUDED.metodo_correcto,
                          metodo_nombre = EXCLUDED.metodo_nombre,
                          output_detector = EXCLUDED.output_detector,
                          observacion = EXCLUDED.observacion""",
            [registro_id, d.analista, d.voltaje_perla, d.metodo_correcto,
             d.metodo_nombre, d.output_detector, d.observacion],
        )

        config = _leer_config(cur)
        cur.execute("SELECT * FROM verif_registro WHERE id = %s", [registro_id])
        registro = _armar_registro(cur, dict(cur.fetchone()), config)

        # Los resultados también se guardan, aunque al leer se recalculen: el
        # día que alguien mire la base directamente -o la respalde- tiene que
        # poder ver el veredicto sin volver a correr el cálculo.
        _guardar_resultados(cur, registro_id, registro)
        return registro


def _guardar_resultados(cur, registro_id: int, registro: Registro) -> None:
    for m in registro.micropipetas:
        cur.execute(
            """UPDATE verif_micropipeta_medicion
                  SET volumen_medio = %s, desviacion = %s, error_pct = %s, resultado = %s
                WHERE registro_id = %s AND micropipeta_id = %s""",
            [m.volumen_medio, m.desviacion, m.error_pct, m.resultado, registro_id, m.micropipeta_id],
        )
    for b in registro.balanza:
        cur.execute(
            """UPDATE verif_balanza_medicion SET promedio = %s, desviacion = %s, resultado = %s
                WHERE registro_id = %s AND pesa_id = %s""",
            [b.promedio, b.desviacion, b.resultado, registro_id, b.pesa_id],
        )
    for t in registro.temperaturas:
        cur.execute(
            "UPDATE verif_temperatura_medicion SET resultado = %s WHERE registro_id = %s AND punto_id = %s",
            [t.resultado, registro_id, t.punto_id],
        )
    for g in registro.gases:
        cur.execute(
            "UPDATE verif_gas_medicion SET resultado = %s WHERE registro_id = %s AND gas_id = %s",
            [g.resultado, registro_id, g.gas_id],
        )
    cur.execute(
        "UPDATE verif_inyector SET resultado = %s WHERE registro_id = %s",
        [registro.inyector.resultado, registro_id],
    )
    cur.execute(
        """UPDATE verif_detector
              SET resultado_voltaje = %s, resultado_metodo = %s, resultado_output = %s, resultado = %s
            WHERE registro_id = %s""",
        [
            registro.detector.resultado_voltaje,
            registro.detector.resultado_metodo,
            registro.detector.resultado_output,
            registro.detector.resultado,
            registro_id,
        ],
    )
    cur.execute(
        "UPDATE verif_registro SET factor_z = %s, resultado = %s WHERE id = %s",
        [registro.factor_z, registro.resultado, registro_id],
    )


@router.delete("/registros/{fecha}")
def eliminar_registro(fecha: date, _: Usuario = Depends(solo_admin_general)) -> dict:
    """Borrar un día es borrar un registro de calidad: queda solo para el
    administrador general, y se lleva sus mediciones por cascada."""
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM verif_registro WHERE fecha = %s RETURNING id", [fecha])
        if not cur.fetchone():
            raise HTTPException(404, "Ese día no tiene verificaciones registradas.")
    return {"estado": "eliminado"}


@router.get("/historico", response_model=list[Registro])
def historico(desde: str | None = None, hasta: str | None = None, limite: int = 120) -> list[Registro]:
    """Los días completos de un rango, del más antiguo al más nuevo.

    Es lo que necesitan las hojas de histórico y los gráficos de tendencia:
    en el Excel había que abrir siete hojas distintas para reconstruir esto.
    """
    condiciones, valores = [], []
    if desde:
        condiciones.append("fecha >= %s")
        valores.append(desde)
    if hasta:
        condiciones.append("fecha <= %s")
        valores.append(hasta)
    donde = f"WHERE {' AND '.join(condiciones)}" if condiciones else ""

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        config = _leer_config(cur)
        cur.execute(
            f"SELECT * FROM verif_registro {donde} ORDER BY fecha DESC LIMIT %s",
            [*valores, max(1, min(limite, 400))],
        )
        dias = [dict(f) for f in cur.fetchall()]
        return [_armar_registro(cur, d, config) for d in reversed(dias)]


# ---------------------------------------------------------------------------
# Exportar
# ---------------------------------------------------------------------------


def _disposicion(nombre: str) -> str:
    """Content-Disposition con un nombre que puede llevar tildes.

    Los encabezados HTTP no son UTF-8: mandar «histórico» tal cual llega al
    navegador como «histA³rico». La forma correcta es la de la RFC 5987 -un
    `filename*` codificado en porcentajes- con un `filename` sin tildes al
    lado, por si algo viejo no la entiende.
    """
    ascii_seguro = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode() or "descarga.xlsx"
    return f"attachment; filename=\"{ascii_seguro}\"; filename*=UTF-8''{quote(nombre)}"


def _descarga(wb, nombre: str) -> StreamingResponse:
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": _disposicion(nombre)},
    )


@router.get("/registros/{fecha}/excel", response_model=None)
def descargar_dia_excel(fecha: date) -> StreamingResponse:
    """El formulario del día, para imprimir y firmar. Es el reemplazo directo
    de la hoja «Formulario_Impresion» del Excel."""
    from .verificaciones_excel import libro_del_dia

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        registro = _leer_dia(cur, fecha, _leer_config(cur))
    if not registro:
        raise HTTPException(404, "Ese día todavía no tiene verificaciones registradas.")
    return _descarga(libro_del_dia(registro), f"verificaciones_diarias {fecha}.xlsx")


@router.get("/registros/{fecha}/pdf", response_model=None)
def descargar_dia_pdf(fecha: date) -> StreamingResponse:
    """El formulario del día en PDF, listo para imprimir y firmar."""
    from .verificaciones_pdf import pdf_del_dia

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        config = _leer_config(cur)
        registro = _leer_dia(cur, fecha, config)
    if not registro:
        raise HTTPException(404, "Ese día todavía no tiene verificaciones registradas.")
    nombre = f"verificaciones_diarias {fecha}.pdf"
    ascii_seguro = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode()
    disposicion = f"attachment; filename=\"{ascii_seguro}\"; filename*=UTF-8''{quote(nombre)}"
    return StreamingResponse(
        io.BytesIO(pdf_del_dia(registro, config)),
        media_type="application/pdf",
        headers={"Content-Disposition": disposicion},
    )


@router.get("/excel", response_model=None)
def descargar_historico_excel(desde: str | None = None, hasta: str | None = None) -> StreamingResponse:
    """El libro completo: resumen diario más una hoja por sección, como las
    hojas de histórico que había que mantener a mano."""
    from .verificaciones_excel import libro_historico

    registros = historico(desde=desde, hasta=hasta, limite=400)
    if not registros:
        raise HTTPException(404, "No hay verificaciones en ese rango.")
    rango = f"{registros[0].fecha} a {registros[-1].fecha}"
    return _descarga(libro_historico(registros), f"historico_verificaciones {rango}.xlsx")
