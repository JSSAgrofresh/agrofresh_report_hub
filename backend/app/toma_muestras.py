"""
Toma de muestras — listado y creación de solicitudes de muestreo. No hay
tabla en base de datos todavía (igual que Storage): cada solicitud se
guarda como un archivo en disco, reutilizando el mismo mecanismo de
almacenamiento que storage.py.

El documento maestro de cada solicitud es un Excel (.xlsx, ver
`solicitud_excel.py`): la hoja "Solicitud" es legible/imprimible y una hoja
oculta "_data" guarda el JSON completo para poder reconstruirla sin
depender de parsear la hoja bonita. Las solicitudes creadas antes de este
cambio quedaron como .json — se siguen leyendo igual (retrocompatibilidad),
solo que las nuevas se guardan como .xlsx.

Estructura de carpetas dentro de Storage:

    solicitudes/
        QUITECA/
        AGROFRESH/
        ALS/
        DIAGNOFRUIT/
        _config/            (mantenedores, no es un laboratorio)

Cada laboratorio tiene su propia carpeta; el N° de solicitud (folio
"SOL-NNNN") es correlativo y único across todas las carpetas.
"""
import io
import json
import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel

from . import config
from .solicitud_excel import construir_workbook, leer_datos_workbook
from .toma_muestras_pdf import generar_pdf_solicitud

router = APIRouter(prefix="/api/toma-muestras", tags=["toma-muestras"])

_CARPETA_RAIZ = "solicitudes"
LABORATORIOS = ("QUITECA", "AGROFRESH", "ALS", "DIAGNOFRUIT")
_PAT_NUMERO = re.compile(r"^SOL-(\d+)$")


def _carpeta_raiz() -> str:
    ruta = os.path.join(config.STORAGE_DIR, _CARPETA_RAIZ)
    os.makedirs(ruta, exist_ok=True)
    return ruta


def _carpeta_laboratorio(laboratorio: str) -> str:
    if laboratorio not in LABORATORIOS:
        raise HTTPException(400, f"Laboratorio inválido: {laboratorio}")
    ruta = os.path.join(_carpeta_raiz(), laboratorio)
    os.makedirs(ruta, exist_ok=True)
    return ruta


def _ruta_archivo(archivo: str) -> str:
    # os.path.basename descarta cualquier componente de ruta ("../etc") -
    # cada carpeta de laboratorio es plana, así que basta con esto para no
    # salir de "solicitudes/<LABORATORIO>/".
    nombre = os.path.basename(archivo)
    for laboratorio in LABORATORIOS:
        ruta = os.path.join(_carpeta_raiz(), laboratorio, nombre)
        if os.path.isfile(ruta):
            return ruta
    raise HTTPException(404, "Solicitud no encontrada.")


def _leer_solicitud_archivo(ruta: str) -> dict:
    """Lee los datos de una solicitud desde su archivo: .xlsx (formato
    actual, hoja oculta "_data") o .json (formato legado, retrocompatible)."""
    if ruta.endswith(".xlsx"):
        return leer_datos_workbook(ruta)
    if ruta.endswith(".json"):
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    raise HTTPException(400, "Formato de solicitud no reconocido.")


def _siguiente_numero() -> str:
    """Folio correlativo único entre las 4 carpetas de laboratorio."""
    maximo = 0
    for laboratorio in LABORATORIOS:
        carpeta = os.path.join(_carpeta_raiz(), laboratorio)
        if not os.path.isdir(carpeta):
            continue
        for nombre in os.listdir(carpeta):
            m = _PAT_NUMERO.match(os.path.splitext(nombre)[0])
            if m:
                maximo = max(maximo, int(m.group(1)))
    return f"SOL-{maximo + 1:04d}"


class SolicitudIn(BaseModel):
    laboratorio: str
    solicitante: str
    sold_to: str
    ship_to: str | None = None
    especie: str | None = None
    variedad: str | None = None
    linea_proceso: str | None = None
    csg: str | None = None
    lote: str | None = None
    posicion_muestreo: str | None = None
    numero_camara: str | None = None
    numero_orden: str | None = None
    kilos_procesados: float | None = None
    producto_utilizado: str | None = None
    tipo_muestra: str | None = None
    fecha_muestreo: str | None = None
    hora_muestreo: str | None = None
    nombre_muestreador: str | None = None
    generado_por: str
    email_solicitante: str | None = None
    email_laboratorio: str | None = None
    observacion: str | None = None
    # Campos propios del laboratorio elegido (etiqueta -> valor). Solo debe
    # traer los campos aplicables al `laboratorio` de esta solicitud.
    campos_laboratorio: dict[str, str] = {}


class Solicitud(SolicitudIn):
    archivo: str
    numero_solicitud: str
    fecha_solicitud: str
    creado_en: str


@router.get("/solicitudes")
def listar_solicitudes() -> list[Solicitud]:
    solicitudes = []
    for laboratorio in LABORATORIOS:
        carpeta = os.path.join(_carpeta_raiz(), laboratorio)
        if not os.path.isdir(carpeta):
            continue
        for nombre in os.listdir(carpeta):
            if not nombre.endswith((".xlsx", ".json")):
                continue
            datos = _leer_solicitud_archivo(os.path.join(carpeta, nombre))
            solicitudes.append(Solicitud(archivo=nombre, **datos))
    solicitudes.sort(key=lambda s: s.creado_en, reverse=True)
    return solicitudes


@router.get("/solicitudes/{archivo}")
def obtener_solicitud(archivo: str) -> Solicitud:
    ruta = _ruta_archivo(archivo)
    datos = _leer_solicitud_archivo(ruta)
    return Solicitud(archivo=os.path.basename(ruta), **datos)


@router.post("/solicitudes")
def crear_solicitud(body: SolicitudIn) -> Solicitud:
    carpeta_lab = _carpeta_laboratorio(body.laboratorio)
    numero = _siguiente_numero()
    ahora = datetime.now(timezone.utc)
    datos = body.model_dump()
    datos.update(
        numero_solicitud=numero,
        fecha_solicitud=ahora.date().isoformat(),
        creado_en=ahora.isoformat(),
    )
    nombre_archivo = f"{numero}.xlsx"
    wb = construir_workbook(datos)
    wb.save(os.path.join(carpeta_lab, nombre_archivo))
    return Solicitud(archivo=nombre_archivo, **datos)


@router.delete("/solicitudes/{archivo}")
def eliminar_solicitud(archivo: str) -> dict[str, str]:
    ruta = _ruta_archivo(archivo)
    os.remove(ruta)
    return {"estado": "eliminado"}


@router.get("/solicitudes/{archivo}/excel", response_model=None)
def descargar_solicitud_excel(archivo: str) -> FileResponse | StreamingResponse:
    """El documento Excel es el original guardado al crear la solicitud. Para
    solicitudes legadas (.json, de antes de este cambio) se genera al vuelo
    con el mismo formato, para que la descarga sea consistente."""
    ruta = _ruta_archivo(archivo)
    numero = os.path.splitext(os.path.basename(ruta))[0]
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if ruta.endswith(".xlsx"):
        return FileResponse(ruta, filename=f"{numero}.xlsx", media_type=media_type)
    # Solicitud legada (.json): se genera el Excel al vuelo, en memoria, con
    # el mismo formato que las solicitudes nuevas -sin dejar archivos
    # temporales en disco.
    datos = _leer_solicitud_archivo(ruta)
    buffer = io.BytesIO()
    construir_workbook(datos).save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{numero}.xlsx"'},
    )


@router.get("/solicitudes/{archivo}/pdf")
def descargar_solicitud_pdf(archivo: str) -> Response:
    ruta = _ruta_archivo(archivo)
    numero = os.path.splitext(os.path.basename(ruta))[0]
    datos = _leer_solicitud_archivo(ruta)
    pdf_bytes = generar_pdf_solicitud(datos)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{numero}.pdf"'},
    )


# ---------------------------------------------------------------------------
# Configuración (mantenedores): igual que las solicitudes, se guarda como
# JSON en disco (no hay tabla en base de datos) dentro de
# "solicitudes/_config/". El objetivo es que el administrador pueda
# activar/desactivar y marcar requerido/opcional los campos generales, y
# mantener las listas de tipos de aplicación, líneas de proceso y analitos
# por laboratorio, sin tocar código fuente.
# ---------------------------------------------------------------------------

_CARPETA_CONFIG = "_config"


def _ruta_config(nombre_archivo: str) -> str:
    carpeta = os.path.join(_carpeta_raiz(), _CARPETA_CONFIG)
    os.makedirs(carpeta, exist_ok=True)
    return os.path.join(carpeta, nombre_archivo)


def _leer_config(nombre_archivo: str, valores_defecto: list[dict]) -> list[dict]:
    ruta = _ruta_config(nombre_archivo)
    if not os.path.isfile(ruta):
        _escribir_config(nombre_archivo, valores_defecto)
        return valores_defecto
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def _escribir_config(nombre_archivo: str, datos: list[dict]) -> None:
    with open(_ruta_config(nombre_archivo), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)


class CampoConfig(BaseModel):
    """Metadatos de un campo general del formulario: el conjunto de claves
    es fijo (ver General Fields §3), pero etiqueta/requerido/activo/orden
    son editables por el administrador."""

    clave: str
    etiqueta: str
    tipo: str
    requerido: bool
    activo: bool
    orden: int


# N° Solicitud, Fecha Solicitud, Laboratorio y Generado Por son
# estructurales (el sistema los completa o son el eje de todo el
# formulario) y no forman parte de este mantenedor.
_CAMPOS_GENERALES_DEFECTO: list[dict] = [
    {"clave": "solicitante", "etiqueta": "Solicitante", "tipo": "text", "requerido": True, "activo": True, "orden": 1},
    {"clave": "sold_to", "etiqueta": "Sold To", "tipo": "select", "requerido": True, "activo": True, "orden": 2},
    {"clave": "ship_to", "etiqueta": "Ship To", "tipo": "select", "requerido": False, "activo": True, "orden": 3},
    {"clave": "especie", "etiqueta": "Especie", "tipo": "text", "requerido": False, "activo": True, "orden": 4},
    {"clave": "variedad", "etiqueta": "Variedad", "tipo": "text", "requerido": False, "activo": True, "orden": 5},
    {"clave": "linea_proceso", "etiqueta": "Línea Proceso", "tipo": "select", "requerido": False, "activo": True, "orden": 6},
    {"clave": "csg", "etiqueta": "CSG", "tipo": "text", "requerido": False, "activo": True, "orden": 7},
    {"clave": "lote", "etiqueta": "Lote", "tipo": "text", "requerido": False, "activo": True, "orden": 8},
    {"clave": "posicion_muestreo", "etiqueta": "Posición Muestreo", "tipo": "text", "requerido": False, "activo": True, "orden": 9},
    {"clave": "numero_camara", "etiqueta": "N° Cámara", "tipo": "text", "requerido": False, "activo": True, "orden": 10},
    {"clave": "numero_orden", "etiqueta": "N° Orden", "tipo": "text", "requerido": False, "activo": True, "orden": 11},
    {"clave": "kilos_procesados", "etiqueta": "Kilos Procesados (KG)", "tipo": "number", "requerido": False, "activo": True, "orden": 12},
    {"clave": "producto_utilizado", "etiqueta": "Producto Utilizado", "tipo": "text", "requerido": False, "activo": True, "orden": 13},
    {"clave": "tipo_muestra", "etiqueta": "Tipo Muestra", "tipo": "text", "requerido": False, "activo": True, "orden": 14},
    {"clave": "fecha_muestreo", "etiqueta": "Fecha Muestreo", "tipo": "date", "requerido": False, "activo": True, "orden": 15},
    {"clave": "hora_muestreo", "etiqueta": "Hora Muestreo", "tipo": "time", "requerido": False, "activo": True, "orden": 16},
    {"clave": "nombre_muestreador", "etiqueta": "Nombre Muestreador", "tipo": "text", "requerido": False, "activo": True, "orden": 17},
    {"clave": "email_solicitante", "etiqueta": "Email Solicitante", "tipo": "email", "requerido": False, "activo": True, "orden": 18},
    {"clave": "email_laboratorio", "etiqueta": "Email Laboratorio", "tipo": "email", "requerido": False, "activo": True, "orden": 19},
    {"clave": "observacion", "etiqueta": "Observación", "tipo": "textarea", "requerido": False, "activo": True, "orden": 20},
]


@router.get("/config/campos")
def listar_campos_config() -> list[CampoConfig]:
    return [CampoConfig(**c) for c in _leer_config("campos_generales.json", _CAMPOS_GENERALES_DEFECTO)]


@router.put("/config/campos")
def guardar_campos_config(campos: list[CampoConfig]) -> list[CampoConfig]:
    claves_validas = {c["clave"] for c in _CAMPOS_GENERALES_DEFECTO}
    claves_recibidas = {c.clave for c in campos}
    if claves_recibidas != claves_validas:
        raise HTTPException(400, "La lista de campos no coincide con los campos generales del sistema.")
    _escribir_config("campos_generales.json", [c.model_dump() for c in campos])
    return campos


class OpcionConfig(BaseModel):
    """Opción simple de un mantenedor (tipos de aplicación, líneas de
    proceso): nombre + orden + activo/inactivo."""

    id: int
    nombre: str
    activo: bool = True
    orden: int = 0


class OpcionIn(BaseModel):
    nombre: str
    activo: bool = True
    orden: int = 0


def _siguiente_id(items: list[dict]) -> int:
    return (max((i["id"] for i in items), default=0)) + 1


def _crud_opciones(nombre_archivo: str, defecto: list[dict]):
    """Fábrica de los 4 endpoints CRUD de un mantenedor simple tipo
    OpcionConfig (tipos de aplicación / líneas de proceso comparten
    exactamente la misma forma)."""

    def listar() -> list[OpcionConfig]:
        return [OpcionConfig(**o) for o in _leer_config(nombre_archivo, defecto)]

    def crear(body: OpcionIn) -> OpcionConfig:
        items = _leer_config(nombre_archivo, defecto)
        nuevo = OpcionConfig(id=_siguiente_id(items), **body.model_dump())
        items.append(nuevo.model_dump())
        _escribir_config(nombre_archivo, items)
        return nuevo

    def editar(item_id: int, body: OpcionIn) -> OpcionConfig:
        items = _leer_config(nombre_archivo, defecto)
        idx = next((i for i, it in enumerate(items) if it["id"] == item_id), None)
        if idx is None:
            raise HTTPException(404, "No encontrado.")
        actualizado = OpcionConfig(id=item_id, **body.model_dump())
        items[idx] = actualizado.model_dump()
        _escribir_config(nombre_archivo, items)
        return actualizado

    def eliminar(item_id: int) -> dict[str, str]:
        items = _leer_config(nombre_archivo, defecto)
        restantes = [i for i in items if i["id"] != item_id]
        if len(restantes) == len(items):
            raise HTTPException(404, "No encontrado.")
        _escribir_config(nombre_archivo, restantes)
        return {"estado": "eliminado"}

    return listar, crear, editar, eliminar


_TIPOS_APLICACION_DEFECTO: list[dict] = [
    {"id": 1, "nombre": "Foliar", "activo": True, "orden": 1},
    {"id": 2, "nombre": "Suelo", "activo": True, "orden": 2},
    {"id": 3, "nombre": "Poscosecha", "activo": True, "orden": 3},
]
_listar_tipos, _crear_tipo, _editar_tipo, _eliminar_tipo = _crud_opciones(
    "tipos_aplicacion.json", _TIPOS_APLICACION_DEFECTO
)
router.get("/config/tipos-aplicacion")(_listar_tipos)
router.post("/config/tipos-aplicacion")(_crear_tipo)
router.put("/config/tipos-aplicacion/{item_id}")(_editar_tipo)
router.delete("/config/tipos-aplicacion/{item_id}")(_eliminar_tipo)


_LINEAS_PROCESO_DEFECTO: list[dict] = [
    {"id": 1, "nombre": "Línea 1", "activo": True, "orden": 1},
    {"id": 2, "nombre": "Línea 2", "activo": True, "orden": 2},
]
_listar_lineas, _crear_linea, _editar_linea, _eliminar_linea = _crud_opciones(
    "lineas_proceso.json", _LINEAS_PROCESO_DEFECTO
)
router.get("/config/lineas-proceso")(_listar_lineas)
router.post("/config/lineas-proceso")(_crear_linea)
router.put("/config/lineas-proceso/{item_id}")(_editar_linea)
router.delete("/config/lineas-proceso/{item_id}")(_eliminar_linea)


class AnalitoConfig(BaseModel):
    """Un análisis disponible para un laboratorio. `dosis_aplicable`
    distingue los analitos de cromatografía (QUITECA/AGROFRESH), que
    llevan una dosis aplicada asociada, de los analitos de resultado
    directo (DIAGNOFRUIT/ALS)."""

    id: int
    laboratorio: str
    codigo: str
    nombre: str
    unidad: str | None = None
    tipo: str = "numero"
    dosis_aplicable: bool = False
    requerido: bool = False
    activo: bool = True
    orden: int = 0


class AnalitoIn(BaseModel):
    laboratorio: str
    codigo: str
    nombre: str
    unidad: str | None = None
    tipo: str = "numero"
    dosis_aplicable: bool = False
    requerido: bool = False
    activo: bool = True
    orden: int = 0


_ANALITOS_DEFECTO: list[dict] = [
    # QUITECA / AGROFRESH — cromatografía, con dosis aplicada.
    {"id": 1, "laboratorio": "QUITECA", "codigo": "FDL", "nombre": "Fludioxonil", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 1},
    {"id": 2, "laboratorio": "QUITECA", "codigo": "IMZ", "nombre": "Imazalil", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 2},
    {"id": 3, "laboratorio": "QUITECA", "codigo": "PYR", "nombre": "Pirimetanil", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 3},
    {"id": 4, "laboratorio": "QUITECA", "codigo": "TEBU", "nombre": "Tebuconazol", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 4},
    {"id": 5, "laboratorio": "QUITECA", "codigo": "AZOX", "nombre": "Azoxistrobina", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 5},
    {"id": 6, "laboratorio": "QUITECA", "codigo": "TBZ", "nombre": "Tiabendazol", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 6},
    {"id": 7, "laboratorio": "QUITECA", "codigo": "DPA", "nombre": "Difenilamina", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 7},
    {"id": 8, "laboratorio": "AGROFRESH", "codigo": "FDL", "nombre": "Fludioxonil", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 1},
    {"id": 9, "laboratorio": "AGROFRESH", "codigo": "IMZ", "nombre": "Imazalil", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 2},
    {"id": 10, "laboratorio": "AGROFRESH", "codigo": "PYR", "nombre": "Pirimetanil", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 3},
    {"id": 11, "laboratorio": "AGROFRESH", "codigo": "TEBU", "nombre": "Tebuconazol", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 4},
    {"id": 12, "laboratorio": "AGROFRESH", "codigo": "AZOX", "nombre": "Azoxistrobina", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 5},
    {"id": 13, "laboratorio": "AGROFRESH", "codigo": "TBZ", "nombre": "Tiabendazol", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 6},
    {"id": 14, "laboratorio": "AGROFRESH", "codigo": "DPA", "nombre": "Difenilamina", "unidad": "ppm", "tipo": "numero", "dosis_aplicable": True, "requerido": False, "activo": True, "orden": 7},
    # DIAGNOFRUIT — cuantificación de patógenos, resultado directo.
    {"id": 15, "laboratorio": "DIAGNOFRUIT", "codigo": "LEV", "nombre": "Levaduras", "unidad": "UFC/mL", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 1},
    {"id": 16, "laboratorio": "DIAGNOFRUIT", "codigo": "BOT", "nombre": "Botrytis", "unidad": "conidia/mL", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 2},
    {"id": 17, "laboratorio": "DIAGNOFRUIT", "codigo": "ALT", "nombre": "Alternaria", "unidad": "conidia/mL", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 3},
    {"id": 18, "laboratorio": "DIAGNOFRUIT", "codigo": "GEO", "nombre": "Geotrichum", "unidad": "esporas/mL", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 4},
    {"id": 19, "laboratorio": "DIAGNOFRUIT", "codigo": "PEN", "nombre": "Penicillium", "unidad": "conidia/mL", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 5},
    # ALS — microbiología / metales / plaguicidas.
    {"id": 20, "laboratorio": "ALS", "codigo": "ECOLI100", "nombre": "E. Coli", "unidad": "UFC/100mL", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 1},
    {"id": 21, "laboratorio": "ALS", "codigo": "COLIF100", "nombre": "Coliformes Totales", "unidad": "UFC/100mL", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 2},
    {"id": 22, "laboratorio": "ALS", "codigo": "PB", "nombre": "Plomo", "unidad": "mg/kg", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 3},
    {"id": 23, "laboratorio": "ALS", "codigo": "HG", "nombre": "Mercurio", "unidad": "mg/kg", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 4},
    {"id": 24, "laboratorio": "ALS", "codigo": "AS", "nombre": "Arsénico", "unidad": "mg/kg", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 5},
    {"id": 25, "laboratorio": "ALS", "codigo": "CD", "nombre": "Cadmio", "unidad": "mg/kg", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 6},
    {"id": 26, "laboratorio": "ALS", "codigo": "AL", "nombre": "Aluminio", "unidad": "mg/kg", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 7},
    {"id": 27, "laboratorio": "ALS", "codigo": "HONGOS", "nombre": "Hongos", "unidad": "UFC/g", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 8},
    {"id": 28, "laboratorio": "ALS", "codigo": "LEVG", "nombre": "Levaduras", "unidad": "UFC/g", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 9},
    {"id": 29, "laboratorio": "ALS", "codigo": "COLIFG", "nombre": "Coliformes Totales", "unidad": "UFC/g", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 10},
    {"id": 30, "laboratorio": "ALS", "codigo": "ECOLIG", "nombre": "Escherichia coli", "unidad": "UFC/g", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 11},
    {"id": 31, "laboratorio": "ALS", "codigo": "ENTERO", "nombre": "Recuento Enterobacterias", "unidad": "UFC/g", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 12},
    {"id": 32, "laboratorio": "ALS", "codigo": "SALM", "nombre": "Salmonella 25g", "unidad": "P/A", "tipo": "texto", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 13},
    {"id": 33, "laboratorio": "ALS", "codigo": "CENIZAS", "nombre": "Cenizas Insolubles en Ácido", "unidad": "%", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 14},
    {"id": 34, "laboratorio": "ALS", "codigo": "AFLAT", "nombre": "Aflatoxinas Totales B1+B2+G1+G2", "unidad": "µg/kg", "tipo": "numero", "dosis_aplicable": False, "requerido": False, "activo": True, "orden": 15},
]


@router.get("/config/analitos")
def listar_analitos_config(laboratorio: str | None = None) -> list[AnalitoConfig]:
    items = [AnalitoConfig(**a) for a in _leer_config("analitos.json", _ANALITOS_DEFECTO)]
    if laboratorio:
        items = [a for a in items if a.laboratorio == laboratorio]
    return sorted(items, key=lambda a: (a.laboratorio, a.orden))


@router.post("/config/analitos")
def crear_analito_config(body: AnalitoIn) -> AnalitoConfig:
    items = _leer_config("analitos.json", _ANALITOS_DEFECTO)
    nuevo = AnalitoConfig(id=_siguiente_id(items), **body.model_dump())
    items.append(nuevo.model_dump())
    _escribir_config("analitos.json", items)
    return nuevo


@router.put("/config/analitos/{item_id}")
def editar_analito_config(item_id: int, body: AnalitoIn) -> AnalitoConfig:
    items = _leer_config("analitos.json", _ANALITOS_DEFECTO)
    idx = next((i for i, it in enumerate(items) if it["id"] == item_id), None)
    if idx is None:
        raise HTTPException(404, "No encontrado.")
    actualizado = AnalitoConfig(id=item_id, **body.model_dump())
    items[idx] = actualizado.model_dump()
    _escribir_config("analitos.json", items)
    return actualizado


@router.delete("/config/analitos/{item_id}")
def eliminar_analito_config(item_id: int) -> dict[str, str]:
    items = _leer_config("analitos.json", _ANALITOS_DEFECTO)
    restantes = [i for i in items if i["id"] != item_id]
    if len(restantes) == len(items):
        raise HTTPException(404, "No encontrado.")
    _escribir_config("analitos.json", restantes)
    return {"estado": "eliminado"}
