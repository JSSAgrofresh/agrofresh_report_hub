"""
Mantenedor de Laboratorios: todo lo que se configura *dentro* de un
laboratorio. Los laboratorios en sí, sus analitos y sus categorías siguen
viviendo en `toma_muestras.py` -son los mismos datos que consume el
formulario de solicitud, y duplicarlos acá habría creado dos fuentes de
verdad-. Este módulo agrega las tres piezas que faltaban:

    Unidades   escalas de medida (ppm, mg/kg, mg/L…), antes texto libre
    Contactos  a quién le llega la solicitud y a quién los resultados
    Análisis   el servicio que vende el laboratorio, que agrupa analitos

`Análisis` es la capa que faltaba entre Laboratorio y Analito. Un
laboratorio no vende "Fludioxonil": vende un análisis multiresiduo donde el
cliente elige qué analitos quiere (modo `seleccionable`), o un panel
cerrado tipo FSSMA donde vienen todos sí o sí (modo `completo`).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import config_store, mail_templates

router = APIRouter(prefix="/api/laboratorios", tags=["laboratorios"])


def _leer_laboratorios() -> list[dict]:
    """Los laboratorios y sus analitos los define `toma_muestras` -son los
    mismos datos que consume el formulario de solicitud-. Se importa adentro
    de la función para no acoplar el orden de carga de los módulos, y se
    pasan sus valores por defecto para no leer una lista vacía cuando el
    mantenedor todavía no fue sembrado."""
    from . import toma_muestras

    return config_store.leer("laboratorios.json", toma_muestras.LABORATORIOS_DEFECTO)


def _leer_analitos() -> list[dict]:
    from . import toma_muestras

    return config_store.leer("analitos.json", toma_muestras.ANALITOS_DEFECTO)


def codigos_laboratorio() -> list[str]:
    """Códigos de laboratorio configurados. Se lee del mantenedor y no de una
    constante para que crear un laboratorio nuevo no requiera tocar código."""
    return [l["codigo"] for l in _leer_laboratorios()]


def _validar_laboratorio(codigo: str) -> None:
    if codigo not in codigos_laboratorio():
        raise HTTPException(400, f"Laboratorio desconocido: {codigo}")


# ---------------------------------------------------------------------------
# Unidades de medida
# ---------------------------------------------------------------------------


class Unidad(BaseModel):
    id: int
    simbolo: str
    nombre: str = ""
    activo: bool = True
    orden: int = 0


class UnidadIn(BaseModel):
    simbolo: str
    nombre: str = ""
    activo: bool = True
    orden: int = 0


# Se siembran las unidades que ya estaban escritas a mano en los analitos,
# para que el selector arranque con todo lo que el sistema usa hoy.
UNIDADES_DEFECTO: list[dict] = [
    {"id": 1, "simbolo": "ppm", "nombre": "Partes por millón", "activo": True, "orden": 1},
    {"id": 2, "simbolo": "mg/kg", "nombre": "Miligramo por kilogramo", "activo": True, "orden": 2},
    {"id": 3, "simbolo": "mg/L", "nombre": "Miligramo por litro", "activo": True, "orden": 3},
    {"id": 4, "simbolo": "µg/kg", "nombre": "Microgramo por kilogramo", "activo": True, "orden": 4},
    {"id": 5, "simbolo": "UFC/mL", "nombre": "Unidades formadoras de colonia por mililitro", "activo": True, "orden": 5},
    {"id": 6, "simbolo": "UFC/100mL", "nombre": "Unidades formadoras de colonia por 100 mililitros", "activo": True, "orden": 6},
    {"id": 7, "simbolo": "UFC/g", "nombre": "Unidades formadoras de colonia por gramo", "activo": True, "orden": 7},
    {"id": 8, "simbolo": "conidia/mL", "nombre": "Conidias por mililitro", "activo": True, "orden": 8},
    {"id": 9, "simbolo": "esporas/mL", "nombre": "Esporas por mililitro", "activo": True, "orden": 9},
    {"id": 10, "simbolo": "%", "nombre": "Porcentaje", "activo": True, "orden": 10},
    {"id": 11, "simbolo": "P/A", "nombre": "Presencia / Ausencia", "activo": True, "orden": 11},
]

config_store.crud_router(router, "/unidades", "unidades.json", Unidad, UnidadIn, UNIDADES_DEFECTO)


# ---------------------------------------------------------------------------
# Contactos: solicitudes y resultados comparten tabla porque son la misma
# entidad -una persona con correo asociada a un laboratorio- y solo cambia
# para qué se le escribe. Separarlos habría duplicado el CRUD entero.
# ---------------------------------------------------------------------------

TIPOS_CONTACTO = ("solicitud", "resultado_cliente", "resultado_interno")


class Contacto(BaseModel):
    id: int
    laboratorio: str
    nombre: str
    email: str
    cargo: str = ""
    # solicitud          → recibe la solicitud de análisis
    # resultado_cliente  → el laboratorio le manda los resultados al cliente
    # resultado_interno  → copia que nos llega a nosotros
    tipo: str = "solicitud"
    activo: bool = True
    orden: int = 0


class ContactoIn(BaseModel):
    laboratorio: str
    nombre: str
    email: str
    cargo: str = ""
    tipo: str = "solicitud"
    activo: bool = True
    orden: int = 0


config_store.crud_router(router, "/contactos", "contactos_laboratorio.json", Contacto, ContactoIn, [])


# ---------------------------------------------------------------------------
# Template del correo que acompaña PDF + Excel de cada solicitud
# ---------------------------------------------------------------------------


class TemplateMailIn(BaseModel):
    asunto: str
    cuerpo: str


@router.get("/{laboratorio}/template-mail")
def obtener_template_mail(laboratorio: str) -> dict:
    _validar_laboratorio(laboratorio)
    return mail_templates.obtener(laboratorio)


@router.put("/{laboratorio}/template-mail")
def guardar_template_mail(laboratorio: str, body: TemplateMailIn) -> dict:
    _validar_laboratorio(laboratorio)
    if not body.asunto.strip() or not body.cuerpo.strip():
        raise HTTPException(400, "El asunto y el cuerpo son obligatorios.")
    return mail_templates.guardar(laboratorio, body.asunto, body.cuerpo)


# ---------------------------------------------------------------------------
# Análisis
# ---------------------------------------------------------------------------

MODOS_ANALISIS = ("seleccionable", "completo")


class AnalitoDeAnalisis(BaseModel):
    """Un analito incluido en un análisis, con la unidad en que ese
    laboratorio lo informa. La unidad vive acá y no en el analito porque el
    mismo analito puede informarse en ppm en un análisis y en mg/kg en otro."""

    analito_id: int
    unidad: str = ""
    # En modo `seleccionable`, si viene marcado por defecto al armar la
    # solicitud. En modo `completo` se ignora: entran todos.
    preseleccionado: bool = True


class Analisis(BaseModel):
    id: int
    laboratorio: str
    nombre: str
    observaciones: str = ""
    modo: str = "seleccionable"
    analitos: list[AnalitoDeAnalisis] = []
    activo: bool = True
    orden: int = 0


class AnalisisIn(BaseModel):
    laboratorio: str
    nombre: str
    observaciones: str = ""
    modo: str = "seleccionable"
    analitos: list[AnalitoDeAnalisis] = []
    activo: bool = True
    orden: int = 0


config_store.crud_router(router, "/analisis", "analisis_laboratorio.json", Analisis, AnalisisIn, [])


# ---------------------------------------------------------------------------
# Resumen: alimenta la grilla de tarjetas del mantenedor en una sola llamada,
# en vez de que el frontend pida cuatro listas y las cruce para mostrar
# contadores.
# ---------------------------------------------------------------------------


class ResumenLaboratorio(BaseModel):
    codigo: str
    nombre: str
    descripcion: str | None = None
    activo: bool
    orden: int
    n_analisis: int
    n_contactos: int
    n_analitos: int


@router.get("/resumen")
def resumen_laboratorios() -> list[ResumenLaboratorio]:
    labs = _leer_laboratorios()
    analitos = _leer_analitos()
    analisis = config_store.leer("analisis_laboratorio.json", [])
    contactos = config_store.leer("contactos_laboratorio.json", [])

    def contar(items: list[dict], codigo: str) -> int:
        return sum(1 for i in items if i.get("laboratorio") == codigo)

    salida = [
        ResumenLaboratorio(
            codigo=l["codigo"],
            nombre=l["nombre"],
            descripcion=l.get("descripcion"),
            activo=l.get("activo", True),
            orden=l.get("orden", 0),
            n_analisis=contar(analisis, l["codigo"]),
            n_contactos=contar(contactos, l["codigo"]),
            n_analitos=contar(analitos, l["codigo"]),
        )
        for l in labs
    ]
    return sorted(salida, key=lambda l: l.orden)
