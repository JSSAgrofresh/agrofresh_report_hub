"""
Toma de muestras — listado y creación de solicitudes de análisis. No hay
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
        <SOLD TO>/<AAAA-MM-DD>/OT-NNNN.xlsx    (las nuevas)
        <LABORATORIO>/SOL-NNNN.xlsx            (layout anterior, solo lectura)
        _config/                               (mantenedores, no es una solicitud)

Las solicitudes se agrupan por cliente y día porque así se buscan: "las de
este cliente, de tal fecha". Antes se agrupaban por laboratorio, y esas
carpetas se siguen leyendo tal cual -no se movió nada de lo ya guardado-, así
que conviven las dos formas. Por eso las búsquedas recorren `solicitudes/`
entero y filtran por el contenido de cada solicitud, no por su carpeta.

El folio (N° Solicitud / OT) es correlativo y único entre todas las carpetas.
Pasó de "SOL-NNNN" a "OT-NNNN"; el correlativo cuenta los dos prefijos para
que no se repita un número mientras queden folios viejos sin migrar.
"""
import io
import json
import logging
import os
import re
import zipfile
from datetime import datetime, timezone
from typing import Any

import psycopg2.errors
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field, model_validator

from . import actividad, auth, config, config_store, correo, indice_solicitudes, mail_templates, r2, seguridad
from .auth import Usuario, usuario_actual
from .db import conexion, cursor_dict
from .notificaciones import notificar
from .listados import clave_normalizada as _clave_esp
from .servicios import (
    PARA_SIN_LISTA_SERVICIO,
    PERMANENTES_SERVICIO,
    RYD_COPIAS,
    MARCA_RESPALDO_RYD,
    usa_respaldo_ryd,
    clave_servicio,
    es_del_servicio,
    es_servicio_con_listado,
    servicio_de_datos,
)
from .solicitud_excel import construir_workbook, construir_workbook_exportacion, leer_datos_workbook
from .toma_muestras_pdf import generar_pdf_solicitud

router = APIRouter(prefix="/api/toma-muestras", tags=["toma-muestras"])
logger = logging.getLogger(__name__)

_CARPETA_RAIZ = "solicitudes"
# Los mantenedores viven dentro de `solicitudes/` pero no son una solicitud:
# todo recorrido de solicitudes tiene que saltarse esta carpeta.
_CARPETA_CONFIG = "_config"

# Los cuatro laboratorios con los que nació el sistema. Ya no son la lista
# cerrada -el administrador puede crear más desde el mantenedor-, pero se
# siguen recorriendo siempre al buscar solicitudes: si alguno se desactiva o
# se renombra en la configuración, las solicitudes guardadas en su carpeta
# tienen que seguir apareciendo.
LABORATORIOS_BASE = ("QUITECA", "AGROFRESH", "ALS", "DIAGNOFRUIT")

# Un código de laboratorio termina siendo un nombre de carpeta (en disco y en
# R2), así que se restringe a mayúsculas, dígitos y guiones: nada que pueda
# escaparse del directorio de solicitudes.
_PAT_CODIGO_LAB = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,30}$")

# El folio pasó de SOL-NNNN a OT-NNNN. Se siguen reconociendo los dos: el
# correlativo se calcula sobre ambos para que no se reinicie ni choque con las
# solicitudes que todavía tengan el folio viejo.
PREFIJO_FOLIO = "OT"
# Las solicitudes de prueba llevan su propia serie (OTP-DIAG0001…), aparte del
# correlativo real: no gastan folios reales ni los mueven.
PREFIJO_FOLIO_PRUEBA = "OTP"
_PAT_NUMERO = re.compile(r"^(?:SOL|OT)-(\d+)$")


def LABORATORIOS() -> tuple[str, ...]:
    """Códigos sobre los que hay que buscar solicitudes: los configurados más
    los originales, sin repetir y en orden estable."""
    codigos = list(LABORATORIOS_BASE)
    try:
        for lab in _leer_config("laboratorios.json", LABORATORIOS_DEFECTO):
            codigo = lab.get("codigo")
            if codigo and codigo not in codigos:
                codigos.append(codigo)
    except (OSError, ValueError):
        # Si la configuración no se puede leer, los cuatro originales bastan
        # para que el módulo siga sirviendo las solicitudes existentes.
        pass
    return tuple(codigos)


def _carpeta_raiz() -> str:
    ruta = os.path.join(config.STORAGE_DIR, _CARPETA_RAIZ)
    os.makedirs(ruta, exist_ok=True)
    return ruta


def _carpeta_laboratorio(laboratorio: str) -> str:
    if laboratorio not in LABORATORIOS():
        raise HTTPException(400, f"Laboratorio inválido: {laboratorio}")
    ruta = os.path.join(_carpeta_raiz(), laboratorio)
    os.makedirs(ruta, exist_ok=True)
    return ruta


def _exigir_lab_activo(laboratorio: str) -> None:
    for lab in _leer_config("laboratorios.json", LABORATORIOS_DEFECTO):
        if lab.get("codigo") == laboratorio:
            if not lab.get("activo", True):
                raise HTTPException(
                    400,
                    f"El laboratorio {laboratorio} está inhabilitado temporalmente y no acepta solicitudes.",
                )
            return


# ---------------------------------------------------------------------------
# Claves R2: mirror de la estructura local de carpetas.
#
# Las solicitudes nuevas se guardan agrupadas por cliente, sucursal y día,
# cada una en su propia carpeta (para poder guardar junto al Excel las fotos
# de la etiqueta de la muestra, ver `_carpeta_fotos_r2`):
#
#     solicitudes/<SOLD TO>/<SHIP TO>/<AAAA-MM-DD>/<OT-NNNN>/<OT-NNNN>.xlsx
#     solicitudes/<SOLD TO>/<SHIP TO>/<AAAA-MM-DD>/<OT-NNNN>/fotos/<n>.jpg
#
# El layout viejo, `solicitudes/<LABORATORIO>/<SOL-NNNN>.xlsx`, y el
# intermedio, `solicitudes/<SOLD TO>/<AAAA-MM-DD>/<OT-NNNN>.xlsx` (sin Ship
# To ni carpeta propia), se siguen leyendo tal cual: las tres formas cuelgan
# de `solicitudes/`, así que buscar por el nombre del archivo bajo ese
# prefijo encuentra cualquiera de ellas y no hace falta mover nada de lo ya
# guardado.
# ---------------------------------------------------------------------------

# Un Sold To/Ship To es texto libre escrito por una persona y termina siendo
# un nombre de carpeta: se limpia todo lo que pueda romper una ruta o
# salirse de ella.
_PAT_SEGMENTO_INVALIDO = re.compile(r'[\\/:*?"<>|]+')


def _limpiar_segmento(valor: str | None, defecto: str) -> str:
    limpio = _PAT_SEGMENTO_INVALIDO.sub("_", (valor or "").strip())
    limpio = limpio.strip(". ").replace("..", "_")
    return limpio or defecto


def carpeta_de_cliente(sold_to: str | None) -> str:
    """Nombre de carpeta para un Sold To. Los que vengan vacíos caen en
    SIN_CLIENTE en vez de crear una carpeta con nombre vacío."""
    return _limpiar_segmento(sold_to, "SIN_CLIENTE")


def carpeta_de_sucursal(ship_to: str | None) -> str:
    """Nombre de carpeta para un Ship To. Los que vengan vacíos caen en
    SIN_SHIP_TO -no toda solicitud trae sucursal-."""
    return _limpiar_segmento(ship_to, "SIN_SHIP_TO")


def _r2_key_sol_nueva(sold_to: str | None, ship_to: str | None, fecha: str, nombre: str) -> str:
    folio = os.path.splitext(nombre)[0]
    return f"solicitudes/{carpeta_de_cliente(sold_to)}/{carpeta_de_sucursal(ship_to)}/{fecha}/{folio}/{nombre}"


def _carpeta_fotos_r2(archivo: str) -> str | None:
    """Prefijo `.../fotos/` de una solicitud, calculado a partir de dónde
    está guardado su Excel -sirve para cualquiera de los tres layouts, sin
    necesitar volver a armar la ruta desde Sold To/Ship To/fecha-. `None` si
    la solicitud no existe."""
    key = _buscar_key_solicitud(archivo)
    if key is None:
        return None
    carpeta = key.rsplit("/", 1)[0]
    return f"{carpeta}/fotos/"


def _r2_key_sol(laboratorio: str, nombre: str) -> str:
    """Clave del layout viejo, por laboratorio. Se conserva para leer y
    borrar lo que ya está guardado así."""
    return f"solicitudes/{laboratorio}/{nombre}"


def _r2_key_cfg(nombre: str) -> str:
    return f"solicitudes/_config/{nombre}"


def _buscar_key_solicitud(nombre: str) -> str | None:
    """Clave R2 de una solicitud por su nombre de archivo, sirva el layout
    viejo o el nuevo. Se busca por el último segmento de la clave porque el
    nombre del archivo -el folio- es lo único común a las dos formas."""
    basenom = os.path.basename(nombre)
    for key in r2.listar_keys("solicitudes/"):
        if key.split("/")[-1] == basenom and _CARPETA_CONFIG not in key.split("/"):
            return key
    return None


def _leer_solicitud_bytes(nombre: bytes | None, ext: str) -> dict:
    """Parsea bytes en dict de solicitud (.xlsx o .json)."""
    if nombre is None:
        raise HTTPException(404, "Solicitud no encontrada.")
    if ext == ".xlsx":
        return leer_datos_workbook(io.BytesIO(nombre))
    if ext == ".json":
        return json.loads(nombre.decode("utf-8"))
    raise HTTPException(400, "Formato de solicitud no reconocido.")


def _ruta_archivo(archivo: str) -> str:
    """Solo para modo disco local. Recorre el árbol completo para encontrar la
    solicitud sirva el layout viejo (por laboratorio) o el nuevo (Sold To)."""
    nombre = os.path.basename(archivo)
    for carpeta, archivo_encontrado, _base in _recorrer_solicitudes_en_disco():
        if archivo_encontrado == nombre:
            return os.path.join(carpeta, archivo_encontrado)
    raise HTTPException(404, "Solicitud no encontrada.")


def _descargar_solicitud_r2(nombre: str) -> tuple[bytes, str]:
    """Devuelve (bytes, extensión) de una solicitud, en cualquiera de los dos
    layouts de carpetas."""
    key = _buscar_key_solicitud(nombre)
    data = r2.descargar(key) if key else None
    if data is None:
        raise HTTPException(404, "Solicitud no encontrada.")
    return data, os.path.splitext(os.path.basename(nombre))[1]


def _leer_solicitud_archivo(ruta: str) -> dict:
    """Lee datos de solicitud desde disco local (.xlsx o .json)."""
    if ruta.endswith(".xlsx"):
        return leer_datos_workbook(ruta)
    if ruta.endswith(".json"):
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    raise HTTPException(400, "Formato de solicitud no reconocido.")


def _mayor_folio_en_archivos() -> int:
    """El folio más alto entre los archivos guardados. Cuenta tanto los OT
    como los SOL antiguos, así que migrar unos u otros no puede repetir un
    número."""
    maximo = 0
    if r2.disponible():
        for key in r2.listar_keys("solicitudes/"):
            m = _PAT_NUMERO.match(os.path.splitext(key.split("/")[-1])[0])
            if m:
                maximo = max(maximo, int(m.group(1)))
    else:
        for _carpeta, _nombre, base in _recorrer_solicitudes_en_disco():
            m = _PAT_NUMERO.match(base)
            if m:
                maximo = max(maximo, int(m.group(1)))
    return maximo


def _prefijo_de_laboratorio(laboratorio: str) -> str:
    """El prefijo de folio configurado para este laboratorio (ej. "AGF" para
    AGROFRESH → OT-AGF0001), o "" si todavía no se configuró uno -en ese caso
    el folio sale igual que antes, sin prefijo-."""
    for lab in _leer_config("laboratorios.json", LABORATORIOS_DEFECTO):
        if lab.get("codigo") == laboratorio:
            return str(lab.get("prefijo_solicitud") or "").strip().upper()
    return ""


def _siguiente_numero_global() -> str:
    """El correlativo compartido de siempre, sin prefijo -lo que usa
    cualquier laboratorio que todavía no tenga uno configurado-.

    Es DELIBERADO que sea uno solo, compartido entre todos esos laboratorios:
    si cada uno tuviera su propio contador aun sin prefijo, dos laboratorios
    sin configurar entregarían el mismo folio "OT-0001" -mismo nombre de
    archivo- y el segundo pisaría al primero en el índice. Compartir el
    correlativo es lo que evita ese choque.
    """
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT nextval('folio_solicitud') AS n")
        numero = cur.fetchone()["n"]
        # Red de seguridad: si la secuencia quedara atrasada respecto de lo ya
        # indexado -alguien la reinició a mano, se restauró un respaldo viejo-
        # se la adelanta al máximo real en vez de entregar un folio usado.
        cur.execute(
            "SELECT max(substring(numero_solicitud from '[0-9]+$')::bigint) AS tope"
            " FROM solicitud_archivo WHERE numero_solicitud ~ '[0-9]+$'"
            " AND numero_solicitud !~ '^OTP-'"
        )
        tope = cur.fetchone()["tope"] or 0
        if numero <= tope:
            cur.execute("SELECT setval('folio_solicitud', %s) + 1 AS n", (tope,))
            numero = cur.fetchone()["n"]
        return f"{PREFIJO_FOLIO}-{numero:04d}"


def _siguiente_numero(laboratorio: str) -> str:
    """Folio correlativo de una solicitud nueva.

    Un laboratorio CON prefijo configurado (ver `_prefijo_de_laboratorio`)
    numera aparte de los demás: AGROFRESH con "AGF" no comparte correlativo
    con QUITECA. Lo entrega la tabla `folio_solicitud_laboratorio` (una fila
    por laboratorio, incrementada de forma atómica -INSERT+UPDATE dentro de
    la misma transacción-, igual que `informe_folio_anual` en emitir.py).

    Un laboratorio SIN prefijo sigue compartiendo el correlativo global de
    siempre (`_siguiente_numero_global`) -eso es lo que evita que dos
    laboratorios sin prefijo choquen en el mismo folio "OT-0001"-. En cuanto
    alguien le configura un prefijo en Laboratorios, sus folios pasan a
    numerarse aparte, sin perder lo ya emitido -el contador nuevo arranca
    después del folio más alto que ese laboratorio ya tenga-.

    Mientras el índice esté vacío -o sea, mientras no se haya corrido
    `scripts/indexar_solicitudes.py`- se sigue contando sobre los archivos,
    sin prefijo: es la misma red de seguridad transicional que ya existía,
    y ese período ya quedó atrás en un servidor que lleva tiempo corriendo.
    """
    if not indice_solicitudes.esta_poblado():
        return f"{PREFIJO_FOLIO}-{_mayor_folio_en_archivos() + 1:04d}"

    prefijo = _prefijo_de_laboratorio(laboratorio)
    if not prefijo:
        return _siguiente_numero_global()

    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                "INSERT INTO folio_solicitud_laboratorio (laboratorio, siguiente) VALUES (%s, 1)"
                " ON CONFLICT (laboratorio) DO NOTHING",
                (laboratorio,),
            )
            cur.execute(
                "UPDATE folio_solicitud_laboratorio SET siguiente = siguiente + 1"
                " WHERE laboratorio = %s RETURNING siguiente",
                (laboratorio,),
            )
            numero = cur.fetchone()["siguiente"] - 1

            # Red de seguridad, igual que la que tenía la SEQUENCE global: si
            # el contador de este laboratorio quedara atrasado respecto de lo
            # ya indexado -se reinició a mano, se restauró un respaldo viejo,
            # o es la primera solicitud de un laboratorio que ya tenía folios
            # de antes de configurarle un prefijo- se lo adelanta al máximo
            # real en vez de entregar un folio repetido.
            cur.execute(
                "SELECT max(substring(numero_solicitud from '[0-9]+$')::bigint) AS tope"
                " FROM solicitud_archivo WHERE laboratorio = %s AND numero_solicitud ~ '[0-9]+$'"
                " AND numero_solicitud !~ '^OTP-'",
                (laboratorio,),
            )
            tope = cur.fetchone()["tope"] or 0
            if numero <= tope:
                cur.execute(
                    "UPDATE folio_solicitud_laboratorio SET siguiente = %s WHERE laboratorio = %s",
                    (tope + 2, laboratorio),
                )
                numero = tope + 1
            return f"{PREFIJO_FOLIO}-{prefijo}{numero:04d}"
    except psycopg2.errors.UndefinedTable:
        # Falta la migración 0023: el laboratorio tiene prefijo configurado
        # pero el folio va a salir SIN prefijo -antes esto se caía en
        # silencio y nadie se enteraba de por qué el prefijo "no aparecía en
        # ningún lado" (folio, correo, Excel, PDF: todos salen del mismo
        # numero_solicitud, así que el problema nunca estuvo repartido en
        # varios lugares, siempre fue este único punto)-.
        logger.warning(
            "El laboratorio %r tiene prefijo de solicitud (%r) pero falta la migración 0023 "
            "(tabla folio_solicitud_laboratorio): este folio sale sin prefijo. "
            "Corre: python scripts/migrar.py 0023_folio_solicitud_por_laboratorio.sql",
            laboratorio, prefijo,
        )

    # Falta la migración 0023 (tabla `folio_solicitud_laboratorio`): se cae al
    # correlativo global anterior, sin prefijo, para no dejar de poder crear
    # solicitudes mientras se actualiza el servidor. Postgres aborta la
    # transacción al fallar la consulta, así que esto necesita una conexión
    # nueva -no basta con reintentar en la misma-.
    return _siguiente_numero_global()


def _recorrer_solicitudes_en_disco():
    """(carpeta, nombre_archivo, nombre_sin_extensión) de cada solicitud en
    disco, recorriendo tanto las carpetas por laboratorio del layout viejo
    como las de Sold To/fecha del nuevo."""
    raiz = _carpeta_raiz()
    for actual, _dirs, archivos in os.walk(raiz):
        if _CARPETA_CONFIG in os.path.relpath(actual, raiz).split(os.sep):
            continue
        for nombre in sorted(archivos):
            if nombre.endswith((".xlsx", ".json")):
                yield actual, nombre, os.path.splitext(nombre)[0]


# Cuántos productos se muestran por su nombre antes de decir «MIXTO».
# Las solicitudes creadas desde el cambio llevan la marca `mixto_desde_2`: con
# 2 o más productos dicen MIXTO. Las anteriores (sin la marca) siguen con la
# regla con que se emitieron: hasta 2 por nombre, 3 o más MIXTO. Lo ya emitido
# no se reescribe.
MAX_PRODUCTOS_VISIBLES = 1
MAX_PRODUCTOS_VISIBLES_ANTES = 2
MARCA_MIXTO_DESDE_2 = "mixto_desde_2"
PRODUCTO_MIXTO = "MIXTO"


def normalizar_productos(
    producto_utilizado: str | None, lista: list[str], mixto_desde_2: bool = False,
) -> tuple[str | None, list[str]]:
    """Cuántos productos se ven en el Excel, el PDF, el JSON y el correo.

    Con `mixto_desde_2` (solicitudes nuevas): 1 producto se muestra tal cual y
    con 2 o más todo dice «MIXTO». Sin la marca (las de antes): hasta 2 tal
    cual y con 3 o más «MIXTO». La lista completa de lo que se eligió se
    conserva aparte (`productos_lista`) para poder editar la solicitud y para
    uso interno."""
    tope = MAX_PRODUCTOS_VISIBLES if mixto_desde_2 else MAX_PRODUCTOS_VISIBLES_ANTES
    if not lista and producto_utilizado:
        lista = producto_utilizado.split(",")
    limpia: list[str] = []
    for nombre in lista:
        nombre = str(nombre).strip()
        if nombre and nombre not in limpia:
            limpia.append(nombre)
    if not limpia:
        return producto_utilizado, []
    visible = PRODUCTO_MIXTO if len(limpia) > tope else ", ".join(limpia)
    return visible, limpia


def _aplicar_regla_mixto(datos: dict) -> None:
    """Recalcula el producto a la vista con la regla que le toca a ESTA
    solicitud (según su marca), sobre lo que va a quedar guardado."""
    datos["producto_utilizado"], datos["productos_lista"] = normalizar_productos(
        datos.get("producto_utilizado"), list(datos.get("productos_lista") or []),
        bool(datos.get(MARCA_MIXTO_DESDE_2)),
    )


class SolicitudIn(BaseModel):
    laboratorio: str
    solicitante: str
    sold_to: str
    ship_to: str | None = None
    especie: str | None = None
    variedad: str | None = None
    linea_proceso: str | None = None
    csg_productor: str | None = None
    csg_packing: str | None = None
    lote: str | None = None
    posicion_muestreo: str | None = None
    numero_camara: str | None = None
    numero_orden: str | None = None
    kilos_procesados: float | None = None
    producto_utilizado: str | None = None
    # Lo que realmente se eligió (uso interno). `producto_utilizado` dice MIXTO
    # cuando son más de dos.
    productos_lista: list[str] = []
    tipo_muestra: str | None = None
    fecha_muestreo: str | None = None
    hora_muestreo: str | None = None
    nombre_muestreador: str | None = None
    generado_por: str
    email_solicitante: str | None = None
    email_laboratorio: str | None = None
    observacion: str | None = Field(default=None, max_length=50)
    # Campos propios del laboratorio elegido (etiqueta -> valor). Solo debe
    # traer los campos aplicables al `laboratorio` de esta solicitud.
    campos_laboratorio: dict[str, str] = {}
    # Códigos de los analitos marcados como solicitados (ej. ["FDL", "PYR"]),
    # aparte de `campos_laboratorio` -permite identificar qué se pidió de
    # forma estructural (para cruzar con resultados de cromatografía) sin
    # tener que parsear las etiquetas humanas de `campos_laboratorio`.
    analitos_solicitados: list[str] = []

    @model_validator(mode="after")
    def _productos_visibles(self):
        # Al leer (`Solicitud`) manda la marca guardada; al recibir un formulario
        # no hay marca, y la regla definitiva se aplica al guardar.
        self.producto_utilizado, self.productos_lista = normalizar_productos(
            self.producto_utilizado, self.productos_lista, bool(getattr(self, "mixto_desde_2", False))
        )
        return self


class Solicitud(SolicitudIn):
    archivo: str
    # El tope de 50 caracteres rige al CREAR/EDITAR (SolicitudIn). Al LEER no se
    # vuelve a exigir: una solicitud ya guardada con una observacion mas larga
    # (la AGF0050 la tenia) dejaba de salir del listado, sin ningun aviso.
    observacion: str | None = None
    numero_solicitud: str
    fecha_solicitud: str
    creado_en: str
    # Con qué muestra física quedó cruzada. Es el mismo código que después
    # trae el archivo del GC, así que al subir los resultados cada vial
    # encuentra su solicitud sin volver a emparejar nada.
    codigo_muestra: str | None = None
    # Datos del cruce completo (migración 0033)
    peso_muestra: float | None = None
    # Segundo peso (muestra extraída, g), anotado en Ingreso al laboratorio.
    peso_muestra_extraido: float | None = None
    unidad_peso: str = "kg"
    cruzado_por: str | None = None
    cruzado_por_nombre: str | None = None
    # Una solicitud se puede editar en cualquier momento, incluso después de
    # enviada. Editar resetea `enviada` a False para que el reenvío automático
    # se dispare al guardar. Nace siempre en False -no se acepta en
    # SolicitudIn- y solo lo pone en True `enviar_solicitud_por_correo`,
    # después de que el correo salió de verdad.
    enviada: bool = False
    enviado_en: str | None = None
    # Reanálisis (migración 0038)
    tipo_solicitud: str = "CONVENCIONAL"
    solicitud_original_archivo: str | None = None
    motivo_reanalisis: str | None = None
    # Solicitud de prueba (ver `crear_solicitud_prueba`): folio del hueco que
    # dejaron las pruebas borradas, nunca se envía sola, "(PRUEBA)" en el
    # asunto y no aparece en el Ingreso al laboratorio ni en reanálisis. Vive
    # en `datos` (Excel `_data` + jsonb del índice): no necesita migración.
    es_prueba: bool = False
    # Con 2 o más productos dice «MIXTO» (solicitudes creadas desde ese
    # cambio). Sin la marca, la regla de antes: MIXTO desde 3. Ver
    # `normalizar_productos`.
    mixto_desde_2: bool = False
    # RYD: el respaldo (sin lista del cliente) es Carla y Fran en vez de Claudia.
    # Solo las solicitudes creadas desde ese cambio; ver `servicios.RYD_COPIAS`.
    respaldo_ryd: bool = False
    # ¿Los resultados de esta solicitud NO tienen lista de distribución al
    # cliente (para este Sold To, Ship To y especie)? Entonces rige la regla
    # de respaldo: Para = solo Jorge y Claudia. No se guarda: el listado lo
    # calcula con los contactos de hoy (`solicitud_sin_lista`).
    sin_lista_distribucion: bool | None = None


class CruceIn(BaseModel):
    """`None` o vacío deshace el cruce."""

    codigo_muestra: str | None = None


def _normalizar_correo(valor: str | None) -> str:
    """trim + minúsculas: para que un espacio de más o una mayúscula no
    hagan que dos direcciones que son la misma cuenta cuenten como
    distintas -ni al comparar propiedad, ni al armar TO/CC/BCC-."""
    return str(valor or "").strip().lower()


def _es_propia(usuario: Usuario, datos: dict) -> bool:
    """¿Esta sesión puede ver/gestionar esta solicitud?

    Un muestreador solo ve lo que él mismo creó -se compara contra
    `email_solicitante`, que `crear_solicitud` fuerza siempre al correo de la
    sesión que la crea cuando es un muestreador (ver más abajo): no es un
    dato que el cliente pueda torcer mandando otro valor en el request.
    Cualquier otra cuenta interna (admin_general, admin_area) sigue viendo
    todo, igual que antes.
    """
    if usuario.tipoAcceso != "muestreador":
        return True
    correo_creador = _normalizar_correo(datos.get("email_solicitante"))
    return correo_creador != "" and correo_creador == _normalizar_correo(usuario.email)


def _exigir_acceso(usuario: Usuario, datos: dict) -> None:
    if not _es_propia(usuario, datos):
        raise HTTPException(403, "Esta solicitud fue creada por otro muestreador: no puedes verla ni reenviarla.")


def _puede_crear_reanalisis(usuario: Usuario) -> bool:
    """Solo admin_general y admin_area (cualquier área) pueden crear reanálisis.

    Gerencia, analistas, clientes y muestreadores no tienen acceso: un
    reanálisis implica decisiones de laboratorio que esos roles no toman.
    """
    return usuario.tipoAcceso in ("admin_general", "admin_area")


def _exigir_puede_reanalisis(usuario: Usuario) -> None:
    if not _puede_crear_reanalisis(usuario):
        raise HTTPException(403, "Solo administradores pueden crear solicitudes de reanálisis.")


def _leer_todas_desde_archivos() -> list[tuple[str, dict]]:
    """Todas las solicitudes, bajando y parseando CADA archivo.

    Esto es lo que hacía el sistema en cada request, y es lo que el índice
    vino a reemplazar: el trabajo crece con la cantidad de solicitudes, y el
    parseo ocupa el proceso entero mientras dura. Hoy se usa una sola vez,
    desde `scripts/indexar_solicitudes.py`, y como respaldo mientras el
    índice todavía está vacío.

    Recorre `solicitudes/` entero en vez de carpeta por carpeta: así encuentra
    tanto el layout viejo (por laboratorio) como el nuevo (por Sold To y
    fecha) sin tener que saber cuál es cuál. Una solicitud ilegible se salta,
    no tumba el listado completo.
    """
    salida: list[tuple[str, dict]] = []
    if r2.disponible():
        for key in r2.listar_keys("solicitudes/"):
            partes = key.split("/")
            nombre = partes[-1]
            if not nombre.endswith((".xlsx", ".json")) or _CARPETA_CONFIG in partes:
                continue
            data = r2.descargar(key)
            if data is None:
                continue
            try:
                salida.append((nombre, _leer_solicitud_bytes(data, os.path.splitext(nombre)[1])))
            except (ValueError, KeyError, HTTPException):
                continue
    else:
        for carpeta, nombre, _base in _recorrer_solicitudes_en_disco():
            try:
                salida.append((nombre, _leer_solicitud_archivo(os.path.join(carpeta, nombre))))
            except (ValueError, KeyError, HTTPException):
                continue
    salida.sort(key=lambda par: par[0])
    return salida


def leer_todas_las_solicitudes() -> list[tuple[str, dict]]:
    """Todas las solicitudes guardadas, como (nombre_archivo, datos).

    Sale del índice: una consulta, sin tocar R2. El archivo se baja solo
    cuando alguien pide ese documento en particular.

    Si el índice está vacío se leen los archivos como antes. Eso cubre el rato
    entre actualizar el sistema y correr `scripts/indexar_solicitudes.py`: sin
    esta salida, actualizar dejaría a todos sin ver sus solicitudes.
    """
    if indice_solicitudes.esta_poblado():
        return indice_solicitudes.listar()
    return _leer_todas_desde_archivos()


def leer_solicitudes_de(laboratorio: str) -> list[tuple[str, dict]]:
    """Las solicitudes de un laboratorio. Se filtra por el campo `laboratorio`
    de cada solicitud y no por su carpeta: desde que las nuevas se agrupan por
    Sold To, la carpeta ya no dice a qué laboratorio pertenecen.

    Existe para que otros módulos -emitir.py- no tengan que repetir la
    decisión R2/disco: cuando el almacenamiento pasó a R2, la copia que vivía
    en emitir siguió leyendo solo del disco y dejó de encontrar solicitudes.
    """
    if indice_solicitudes.esta_poblado():
        # El filtro va en el SQL y no acá: traer todo para descartar la mayoría
        # es exactamente lo que hacía la versión anterior.
        return indice_solicitudes.listar(laboratorio)
    return [par for par in _leer_todas_desde_archivos() if par[1].get("laboratorio") == laboratorio]


@router.get("/solicitudes")
def listar_solicitudes(usuario: Usuario = Depends(usuario_actual)) -> list[Solicitud]:
    solicitudes = []
    # La configuración de contactos se lee UNA vez para todo el listado (viene
    # de R2: leerla por solicitud tardaba segundos), y el resultado se
    # reutiliza para las solicitudes de un mismo cliente, planta y especie.
    _sin_lista_cacheado = _calculador_sin_lista(_leer_config("contactos_laboratorio.json", []))
    for nombre, datos in leer_todas_las_solicitudes():
        if not _es_propia(usuario, datos):
            continue
        try:
            solicitud = Solicitud(archivo=nombre, **datos)
        except (ValueError, KeyError) as exc:
            # Antes se saltaba sin decir nada y la solicitud desaparecia del listado.
            logger.warning("Solicitud %s omitida del listado: datos invalidos (%s)", nombre, exc)
            continue
        solicitud.sin_lista_distribucion = _sin_lista_cacheado(datos)
        solicitudes.append(solicitud)
    solicitudes.sort(key=lambda s: s.creado_en, reverse=True)
    return solicitudes


@router.post("/solicitudes/organizar-r2")
def organizar_solicitudes_r2() -> dict[str, int]:
    """Migra solicitudes de los layouts antiguos (por laboratorio, o por
    cliente/fecha sin sucursal ni carpeta propia) al layout cliente/sucursal/
    fecha/carpeta-por-solicitud. Copia y verifica el destino antes de borrar
    el original; por eso es seguro repetir la operación."""
    if not r2.disponible():
        raise HTTPException(503, "R2 no está configurado en este servidor.")

    movidas = 0
    omitidas = 0
    for key in r2.listar_keys("solicitudes/"):
        partes = key.split("/")
        if len(partes) not in (3, 4) or partes[1] == _CARPETA_CONFIG:
            continue
        nombre = partes[-1]
        if not nombre.endswith((".xlsx", ".json")):
            continue
        contenido = r2.descargar(key)
        if contenido is None:
            omitidas += 1
            continue
        try:
            datos = _leer_solicitud_bytes(contenido, os.path.splitext(nombre)[1])
            destino = _r2_key_sol_nueva(
                datos.get("sold_to"), datos.get("ship_to"), datos.get("fecha_solicitud") or "SIN_FECHA", nombre
            )
        except (ValueError, KeyError, HTTPException):
            omitidas += 1
            continue
        if destino == key:
            continue
        existente = r2.descargar(destino)
        if existente is None:
            tipo = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if nombre.endswith(".xlsx") else "application/json"
            r2.subir(destino, contenido, tipo)
            existente = r2.descargar(destino)
        if existente == contenido:
            r2.eliminar(key)
            movidas += 1
        else:
            omitidas += 1
    return {"movidas": movidas, "omitidas": omitidas}


@router.get("/solicitudes/exportar-todo")
def exportar_todas_las_solicitudes(
    archivo: list[str] | None = None,
    usuario: Usuario = Depends(usuario_actual),
) -> StreamingResponse:
    """Un único Excel "ancho" (una fila por solicitud) con toda la
    información general + de muestra + una columna por cada analito activo
    configurado -refleja la configuración vigente, no una plantilla fija."""
    seleccion = set(archivo or [])
    solicitudes_dict = [
        datos for nombre, datos in leer_todas_las_solicitudes()
        if (not seleccion or nombre in seleccion) and _es_propia(usuario, datos)
    ]
    solicitudes_dict.sort(key=lambda d: d.get("creado_en") or "", reverse=True)

    analitos = _leer_config("analitos.json", ANALITOS_DEFECTO)
    wb = construir_workbook_exportacion(solicitudes_dict, analitos)
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    nombre_archivo = f"Solicitudes_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nombre_archivo}"'},
    )


MAX_PDF_ZIP = 200


class PdfZipIn(BaseModel):
    archivos: list[str] = Field(min_length=1)


@router.post("/solicitudes/pdf-zip")
def descargar_pdfs_zip(body: PdfZipIn, usuario: Usuario = Depends(usuario_actual)) -> Response:
    """Los PDF de varias solicitudes en un solo .zip. Respeta el acceso de cada
    una (las que la sesión no puede ver se omiten) y va en nombres únicos.
    Si alguna ya tiene informe del laboratorio, van en dos carpetas:
    Solicitudes/ y Informes/ (`informes_solicitud.informes_para_zip`)."""
    archivos = list(dict.fromkeys(body.archivos))
    if len(archivos) > MAX_PDF_ZIP:
        raise HTTPException(413, f"Son demasiadas solicitudes de una vez (máximo {MAX_PDF_ZIP}).")
    analitos_config = _leer_config("analitos.json", ANALITOS_DEFECTO)
    analisis_config = _leer_config("analisis_laboratorio.json", [])
    # PDF de cada solicitud: (archivo, N° de solicitud, nombre en el zip, bytes).
    pdfs: list[tuple[str, str, str, bytes]] = []
    for archivo in archivos:
        try:
            if r2.disponible():
                data, ext = _descargar_solicitud_r2(archivo)
                datos = _leer_solicitud_bytes(data, ext)
                numero = os.path.splitext(os.path.basename(archivo))[0]
            else:
                ruta = _ruta_archivo(archivo)
                numero = os.path.splitext(os.path.basename(ruta))[0]
                datos = _leer_solicitud_archivo(ruta)
            if not _es_propia(usuario, datos):
                continue
            datos_pdf = _datos_pdf_con_destinatarios_resultados(datos)
            pdfs.append((
                archivo,
                str(datos.get("numero_solicitud") or numero),
                f"{numero}.pdf",
                generar_pdf_solicitud(datos_pdf, analitos_config, analisis_config),
            ))
        except HTTPException:
            continue
    if not pdfs:
        raise HTTPException(404, "No se pudo generar ningún PDF de la selección.")

    # Si al menos una tiene informe del laboratorio, el zip lleva dos carpetas:
    # Solicitudes/ e Informes/. Si ninguna tiene, sale como siempre (plano).
    # Los informes son solo para personal interno.
    informes: list[tuple[str, bytes]] = []
    if usuario.tipoAcceso != "cliente":
        from .informes_solicitud import informes_para_zip

        informes = informes_para_zip([(archivo, numero) for archivo, numero, _, _ in pdfs])
    carpeta = "Solicitudes/" if informes else ""
    salida = io.BytesIO()
    with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED) as z:
        for _, _, nombre_pdf, contenido in pdfs:
            z.writestr(f"{carpeta}{nombre_pdf}", contenido)
        for nombre_informe, contenido in informes:
            z.writestr(f"Informes/{nombre_informe}", contenido)
    prefijo = "Solicitudes_e_informes" if informes else "Solicitudes_PDF"
    nombre = f"{prefijo}_{datetime.now().strftime('%Y%m%d_%H%M')}.zip"
    return Response(
        content=salida.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.get("/solicitudes/{archivo}")
def obtener_solicitud(archivo: str, usuario: Usuario = Depends(usuario_actual)) -> Solicitud:
    if r2.disponible():
        data, ext = _descargar_solicitud_r2(archivo)
        datos = _leer_solicitud_bytes(data, ext)
        _exigir_acceso(usuario, datos)
        return Solicitud(archivo=os.path.basename(archivo), **datos)
    ruta = _ruta_archivo(archivo)
    datos = _leer_solicitud_archivo(ruta)
    _exigir_acceso(usuario, datos)
    return Solicitud(archivo=os.path.basename(ruta), **datos)


def _leer_datos_actuales(archivo: str) -> dict:
    """Los datos guardados de una solicitud, sirva R2 o disco. Se usa antes
    de editarla o marcarla enviada -para saber si ya está enviada, y para
    conservar los campos que la API no deja tocar (folio, fechas)."""
    if r2.disponible():
        data, ext = _descargar_solicitud_r2(archivo)
        return _leer_solicitud_bytes(data, ext)
    return _leer_solicitud_archivo(_ruta_archivo(archivo))


def _regrabar_datos_solicitud(archivo: str, datos: dict) -> None:
    """Reescribe el Excel maestro de una solicitud YA EXISTENTE, en el mismo
    lugar donde vive (misma clave R2 o mismo archivo en disco), y reindexa.

    A diferencia de `crear_solicitud`, no recalcula dónde debería vivir el
    archivo según el Sold To/fecha actuales: sobrescribe donde ya está. Así
    editar una solicitud no puede dejar dos copias ni perder la que ya se
    había compartido por ese link/carpeta.
    """
    nombre_archivo = os.path.basename(archivo)
    analitos_config = _leer_config("analitos.json", ANALITOS_DEFECTO)
    wb = construir_workbook(datos, analitos_config)
    r2_key = None
    if r2.disponible():
        r2_key = _buscar_key_solicitud(archivo)
        if r2_key is None:
            raise HTTPException(404, "Solicitud no encontrada.")
        buf = io.BytesIO()
        wb.save(buf)
        r2.subir(r2_key, buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    else:
        wb.save(_ruta_archivo(archivo))
    indice_solicitudes.anotar(nombre_archivo, datos, r2_key)


# ── Solicitudes de prueba ───────────────────────────────────────────────
#
# Al borrar las solicitudes de prueba del arranque, el contador de cada
# laboratorio no volvió atrás: las reales empezaron en QUITECA 18 y AGF 50.
# Los folios de ese hueco (1..17, 1..49) se usan para solicitudes de prueba,
# que crea solo una cuenta (config.SOLICITUDES_PRUEBA_EMAIL). El límite no está
# escrito a mano: es el folio real más bajo del laboratorio, menos uno.


def _es_dueno_pruebas(usuario: Usuario) -> bool:
    return bool(config.SOLICITUDES_PRUEBA_EMAIL) and (
        _normalizar_correo(usuario.email) == config.SOLICITUDES_PRUEBA_EMAIL
    )


def _exigir_dueno_pruebas(usuario: Usuario) -> None:
    if not _es_dueno_pruebas(usuario):
        raise HTTPException(403, "Las solicitudes de prueba solo las puede crear su cuenta autorizada.")


def _siguiente_numero_prueba(laboratorio: str) -> str:
    """Folio de una solicitud de prueba: serie propia `OTP-<prefijo><NNNN>` (ej.
    OTP-DIAG0001), un correlativo por laboratorio que parte en 1 y no toca el
    contador real. Es el siguiente al más alto que ya tenga ese laboratorio."""
    prefijo = _prefijo_de_laboratorio(laboratorio)
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT max(substring(numero_solicitud from '[0-9]+$')::bigint) AS tope"
            " FROM solicitud_archivo WHERE laboratorio = %s AND numero_solicitud ~ '^OTP-.*[0-9]+$'",
            (laboratorio,),
        )
        tope = cur.fetchone()["tope"] or 0
    return f"{PREFIJO_FOLIO_PRUEBA}-{prefijo}{tope + 1:04d}"


@router.get("/solicitudes-prueba/estado")
def estado_solicitudes_prueba(usuario: Usuario = Depends(usuario_actual)) -> dict:
    """Si la cuenta puede crear solicitudes de prueba (solo ella ve el botón)."""
    return {"permitido": _es_dueno_pruebas(usuario)}


@router.post("/solicitudes-prueba")
def crear_solicitud_prueba(body: SolicitudIn, usuario: Usuario = Depends(usuario_actual)) -> Solicitud:
    """Como `crear_solicitud`, pero con folio de la serie de pruebas (OTP-…), la
    marca `es_prueba` y sin notificación. El envío por correo lo decide la
    pantalla: una prueba nunca se envía sola."""
    _exigir_dueno_pruebas(usuario)
    _validar_analitos(body)
    _exigir_lab_activo(body.laboratorio)
    return _guardar_solicitud_nueva(body, usuario, _siguiente_numero_prueba(body.laboratorio), es_prueba=True)


@router.put("/solicitudes/{archivo}")
def editar_solicitud(archivo: str, body: SolicitudIn, usuario: Usuario = Depends(usuario_actual)) -> Solicitud:
    """Actualiza una solicitud existente -mismo folio, mismo archivo-, nunca
    crea una nueva. El guardado resetea `enviada` a False para que el
    frontend pueda disparar el reenvío automático tras editar."""
    _validar_analitos(body)
    datos_actuales = _leer_datos_actuales(archivo)
    _exigir_acceso(usuario, datos_actuales)

    nombre_archivo = os.path.basename(archivo)
    datos = body.model_dump()
    datos.update(
        numero_solicitud=datos_actuales.get("numero_solicitud"),
        fecha_solicitud=datos_actuales.get("fecha_solicitud"),
        creado_en=datos_actuales.get("creado_en"),
        enviada=False,
        enviado_en=None,
    )
    # Editar no cambia el formato del PDF: una solicitud antigua sigue como era.
    if datos_actuales.get("pdf_solo_analisis"):
        datos["pdf_solo_analisis"] = True
    # Tampoco cambia la regla de MIXTO: una solicitud antigua sigue con la suya.
    if datos_actuales.get(MARCA_MIXTO_DESDE_2):
        datos[MARCA_MIXTO_DESDE_2] = True
    if datos_actuales.get(MARCA_RESPALDO_RYD):
        datos[MARCA_RESPALDO_RYD] = True
    _aplicar_regla_mixto(datos)
    if datos_actuales.get("es_prueba"):
        # Editar no le quita la marca: sigue siendo de prueba.
        datos["es_prueba"] = True
    _regrabar_datos_solicitud(archivo, datos)
    return Solicitud(archivo=nombre_archivo, **datos)


def _validar_analitos(body: SolicitudIn) -> None:
    if not body.analitos_solicitados:
        raise HTTPException(422, "Debes seleccionar al menos un analito.")


@router.post("/solicitudes")
def crear_solicitud(body: SolicitudIn, usuario: Usuario = Depends(usuario_actual)) -> Solicitud:
    _validar_analitos(body)
    _exigir_lab_activo(body.laboratorio)
    return _guardar_solicitud_nueva(body, usuario, _siguiente_numero(body.laboratorio))


def _guardar_solicitud_nueva(
    body: SolicitudIn, usuario: Usuario, numero: str, *, es_prueba: bool = False,
) -> Solicitud:
    ahora = datetime.now(timezone.utc)
    datos = body.model_dump()
    if usuario.tipoAcceso == "muestreador":
        # No confiar en lo que mande el cliente: un muestreador podría
        # escribir el correo de otra persona en `email_solicitante` y hacer
        # que la solicitud pareciera creada por ella. El dueño real de la
        # solicitud es siempre la sesión autenticada que la está creando.
        datos["email_solicitante"] = _normalizar_correo(usuario.email)
    # admin_general/admin_area pueden crear solicitudes en nombre de otra
    # persona (ej. cargando algo a pedido de un muestreador) — para esas
    # cuentas se respeta el flujo actual y se deja lo que mandó el formulario.
    datos.update(
        numero_solicitud=numero,
        fecha_solicitud=ahora.date().isoformat(),
        creado_en=ahora.isoformat(),
        enviada=False,
        enviado_en=None,
        # Solo las solicitudes creadas desde ahora usan el PDF «solo análisis» de
        # ALS y Diagnofruit; las anteriores (sin esta marca) conservan su tabla.
        pdf_solo_analisis=True,
        # Y dicen «MIXTO» desde 2 productos (las anteriores, desde 3).
        mixto_desde_2=True,
        # Y su respaldo, si es RYD, es Carla y Fran (no Claudia).
        respaldo_ryd=True,
    )
    _aplicar_regla_mixto(datos)
    if es_prueba:
        datos["es_prueba"] = True
    nombre_archivo = f"{numero}.xlsx"
    fecha = datos["fecha_solicitud"]
    analitos_config = _leer_config("analitos.json", ANALITOS_DEFECTO)
    wb = construir_workbook(datos, analitos_config)
    r2_key = None
    if r2.disponible():
        buf = io.BytesIO()
        wb.save(buf)
        r2_key = _r2_key_sol_nueva(body.sold_to, body.ship_to, fecha, nombre_archivo)
        r2.subir(
            r2_key,
            buf.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    else:
        # El laboratorio se valida igual aunque ya no dé el nombre de la
        # carpeta: sigue siendo un campo con lista cerrada.
        _carpeta_laboratorio(body.laboratorio)
        carpeta = os.path.join(
            _carpeta_raiz(),
            carpeta_de_cliente(body.sold_to),
            carpeta_de_sucursal(body.ship_to),
            fecha,
            numero,
        )
        os.makedirs(carpeta, exist_ok=True)
        wb.save(os.path.join(carpeta, nombre_archivo))

    # Al índice DESPUÉS de que el archivo quedó guardado: si se anotara antes
    # y la subida fallara, el listado mostraría una solicitud cuyo Excel no
    # existe. Al revés es recuperable — un archivo sin indexar se arregla
    # volviendo a correr scripts/indexar_solicitudes.py.
    indice_solicitudes.anotar(nombre_archivo, datos, r2_key)
    if es_prueba:
        # Una prueba no avisa a nadie: solo existe en Solicitudes.
        return Solicitud(archivo=nombre_archivo, **datos)
    nombre_quien = usuario.nombre or usuario.email
    ship_to = body.ship_to or "—"
    notificar(
        titulo=f"📋 Nueva solicitud N.º {numero} · {body.sold_to or '—'}",
        resumen=(
            f"{nombre_quien} creó una solicitud de análisis. "
            f"Solicitud: {numero} · Cliente: {body.sold_to or '—'} · Planta: {ship_to}."
        ),
        creado_por=nombre_quien,
        audiencia="todos",
        metadata={"tipo": "solicitud", "numero": numero, "archivo": nombre_archivo},
    )
    return Solicitud(archivo=nombre_archivo, **datos)


@router.put("/solicitudes/{archivo}/muestra", response_model=Solicitud)
def cruzar_con_muestra(
    archivo: str,
    body: CruceIn,
    usuario: Usuario = Depends(usuario_actual),
) -> Any:
    """Cruza o descruza una solicitud con el número de la muestra.

    Para deshacer el cruce: enviar codigo_muestra=null.
    Para un cruce nuevo con foto y peso obligatorios, usar POST /cruzar-completo.
    """
    try:
        datos_actuales = indice_solicitudes.buscar(archivo)
    except KeyError as e:
        raise HTTPException(
            404,
            "Esa solicitud no está en el índice. Corre scripts/indexar_solicitudes.py.",
        ) from e
    _exigir_acceso(usuario, datos_actuales)
    # Vacío o solo espacios también deshace el cruce (`indice_solicitudes.cruzar`
    # lo normaliza a None): la regla se mira sobre lo normalizado, si no, mandar
    # "" saltaba el resguardo.
    quita_la_muestra = not (body.codigo_muestra or "").strip()
    if quita_la_muestra and usuario.email.lower() != _SUPER_ADMIN_EMAIL:
        # Quitar la muestra de una solicitud es solo del administrador principal.
        raise HTTPException(403, "Solo el administrador principal puede quitar una muestra.")
    try:
        indice_solicitudes.cruzar(archivo, body.codigo_muestra)
    except indice_solicitudes.MuestraYaUsada as e:
        raise HTTPException(409, str(e)) from e
    except KeyError as e:
        raise HTTPException(
            404,
            "Esa solicitud no está en el índice. Corre scripts/indexar_solicitudes.py.",
        ) from e
    datos = indice_solicitudes.buscar(archivo)
    return Solicitud(archivo=archivo, **datos)


class PesoExtraidoIn(BaseModel):
    peso: float


@router.put("/solicitudes/{archivo}/peso-extraido", response_model=Solicitud)
def guardar_peso_extraido(
    archivo: str,
    body: PesoExtraidoIn,
    usuario: Usuario = Depends(usuario_actual),
) -> Any:
    """Anota el segundo peso (muestra extraída, en gramos) de una solicitud ya
    cruzada. Se puede corregir; el antes y el después quedan en el historial."""
    if not (body.peso > 0):
        raise HTTPException(400, "El peso debe ser mayor a cero.")
    datos_actuales = indice_solicitudes.buscar(archivo)
    if datos_actuales is None:
        raise HTTPException(404, "Esa solicitud no está en el índice. Corre scripts/indexar_solicitudes.py.")
    _exigir_acceso(usuario, datos_actuales)
    try:
        indice_solicitudes.guardar_peso_extraido(archivo, body.peso, usuario.email, usuario.nombre)
    except indice_solicitudes.SinCruce as e:
        raise HTTPException(409, "Esa solicitud todavía no tiene muestra: primero se cruza.") from e
    except indice_solicitudes.SinPesoExtraido as e:
        raise HTTPException(503, "Falta correr la migración 0048_peso_extraido.sql en el servidor.") from e
    except KeyError as e:
        raise HTTPException(404, "Esa solicitud no está en el índice. Corre scripts/indexar_solicitudes.py.") from e
    return Solicitud(archivo=archivo, **indice_solicitudes.buscar(archivo))


# Prefijo R2 para fotos del cruce (separado de las fotos de la solicitud)
def _prefijo_foto_cruce_r2(archivo: str, fecha: str) -> str:
    folio = os.path.splitext(os.path.basename(archivo))[0]
    return f"cruces/{fecha}/{folio}/"


def _carpeta_foto_cruce_disco(archivo: str, fecha: str) -> str:
    folio = os.path.splitext(os.path.basename(archivo))[0]
    carpeta = os.path.join(config.STORAGE_DIR, "cruces", fecha, folio)
    os.makedirs(carpeta, exist_ok=True)
    return carpeta


@router.post("/solicitudes/{archivo}/cruzar-completo", response_model=Solicitud)
async def cruzar_completo(
    archivo: str,
    codigo_muestra: str = Form(...),
    peso_muestra: float = Form(...),
    unidad_peso: str = Form(default="kg"),
    foto: UploadFile = File(...),
    usuario: Usuario = Depends(usuario_actual),
) -> Any:
    """Cruce completo con foto y peso obligatorios.

    Recibe la foto (JPEG/PNG/WEBP), el peso de la muestra y el código de la
    muestra física. Los guarda de forma atómica: si falla el guardado en BD,
    la foto queda en R2 huérfana (no hay inconsistencia en la base).

    Evita cruces duplicados: si el código ya está en otra solicitud se
    rechaza con 409.
    """
    # Validaciones del backend (no solo del frontend)
    codigo = codigo_muestra.strip()
    if not codigo:
        raise HTTPException(400, "El código de muestra no puede estar vacío.")
    if peso_muestra <= 0:
        raise HTTPException(400, "El peso debe ser mayor a cero.")
    if foto.content_type not in _EXTENSION_POR_TIPO:
        raise HTTPException(400, "Solo se aceptan fotos JPEG, PNG o WEBP.")
    contenido_foto = await foto.read()
    if not contenido_foto:
        raise HTTPException(400, "La foto llegó vacía.")

    datos = _leer_datos_actuales(archivo)
    _exigir_acceso(usuario, datos)

    extension = _EXTENSION_POR_TIPO[foto.content_type]
    fecha_hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    nombre_foto = f"cruce_{ts}{extension}"

    # Subir foto a R2 / disco antes de la transacción de BD
    if r2.disponible():
        prefijo = _prefijo_foto_cruce_r2(archivo, fecha_hoy)
        r2_key_foto = f"{prefijo}{nombre_foto}"
        r2.subir(r2_key_foto, contenido_foto, foto.content_type)
    else:
        carpeta = _carpeta_foto_cruce_disco(archivo, fecha_hoy)
        ruta_local = os.path.join(carpeta, nombre_foto)
        with open(ruta_local, "wb") as f:
            f.write(contenido_foto)
        r2_key_foto = f"cruces/{fecha_hoy}/{os.path.splitext(os.path.basename(archivo))[0]}/{nombre_foto}"

    # Cruce en la base (atómico: foto + peso + actividad en una sola tx)
    try:
        indice_solicitudes.cruzar_completo(
            archivo=archivo,
            codigo_muestra=codigo,
            peso_muestra=peso_muestra,
            unidad_peso=unidad_peso,
            r2_key_foto=r2_key_foto,
            content_type_foto=foto.content_type,
            usuario_email=usuario.email,
            usuario_nombre=usuario.nombre,
            numero_solicitud=datos.get("numero_solicitud"),
            tipo_muestra=datos.get("tipo_muestra"),
            detalle_actividad={
                "sold_to": datos.get("sold_to"),
                "ship_to": datos.get("ship_to"),
                "especie": datos.get("especie"),
                "variedad": datos.get("variedad"),
                "laboratorio": datos.get("laboratorio"),
                "unidad_peso": unidad_peso,
            },
        )
    except indice_solicitudes.MuestraYaUsada as e:
        raise HTTPException(409, str(e)) from e
    except KeyError as e:
        raise HTTPException(
            404,
            "Esa solicitud no está en el índice. Corre scripts/indexar_solicitudes.py.",
        ) from e

    datos_actualizados = indice_solicitudes.buscar(archivo)
    return Solicitud(archivo=archivo, **datos_actualizados)


def _guardar_foto_cruce(archivo: str, foto: UploadFile, contenido: bytes) -> dict:
    """Sube la foto del cruce (R2 o disco) y devuelve {r2_key, content_type}."""
    extension = _EXTENSION_POR_TIPO[foto.content_type]
    fecha_hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    nombre_foto = f"cruce_{ts}{extension}"
    folio = os.path.splitext(os.path.basename(archivo))[0]
    if r2.disponible():
        clave = f"{_prefijo_foto_cruce_r2(archivo, fecha_hoy)}{nombre_foto}"
        r2.subir(clave, contenido, foto.content_type)
    else:
        with open(os.path.join(_carpeta_foto_cruce_disco(archivo, fecha_hoy), nombre_foto), "wb") as f:
            f.write(contenido)
        clave = f"cruces/{fecha_hoy}/{folio}/{nombre_foto}"
    return {"r2_key": clave, "content_type": foto.content_type}


@router.patch("/solicitudes/{archivo}/cruce", response_model=Solicitud)
async def editar_cruce(
    archivo: str,
    codigo_muestra: str = Form(...),
    peso_muestra: float = Form(...),
    unidad_peso: str = Form(default="kg"),
    foto: UploadFile | None = File(default=None),
    usuario: Usuario = Depends(usuario_actual),
) -> Any:
    """Corrige un cruce ya hecho: N° de muestra, peso y (opcional) la foto.

    Sirve cuando alguien digitó mal el peso o el número. No cambia cuándo llegó
    la muestra ni quién la recibió; el antes y el después quedan en el
    historial. La foto anterior se conserva, solo deja de ser la activa.
    """
    codigo = codigo_muestra.strip()
    if not codigo:
        raise HTTPException(400, "El código de muestra no puede estar vacío.")
    if peso_muestra <= 0:
        raise HTTPException(400, "El peso debe ser mayor a cero.")
    contenido_foto = None
    if foto is not None and foto.filename:
        if foto.content_type not in _EXTENSION_POR_TIPO:
            raise HTTPException(400, "Solo se aceptan fotos JPEG, PNG o WEBP.")
        contenido_foto = await foto.read()
        if not contenido_foto:
            raise HTTPException(400, "La foto llegó vacía.")

    datos = _leer_datos_actuales(archivo)
    _exigir_acceso(usuario, datos)
    foto_guardada = _guardar_foto_cruce(archivo, foto, contenido_foto) if contenido_foto else None
    try:
        indice_solicitudes.editar_cruce(
            archivo=archivo,
            codigo_muestra=codigo,
            peso_muestra=peso_muestra,
            unidad_peso=unidad_peso,
            usuario_email=usuario.email,
            usuario_nombre=usuario.nombre,
            foto=foto_guardada,
            detalle={"laboratorio": datos.get("laboratorio")},
        )
    except indice_solicitudes.MuestraYaUsada as e:
        raise HTTPException(409, str(e)) from e
    except indice_solicitudes.SinCruce as e:
        raise HTTPException(409, "Esa solicitud todavía no tiene muestra: primero se cruza.") from e
    except KeyError as e:
        raise HTTPException(404, "Esa solicitud no está en el índice. Corre scripts/indexar_solicitudes.py.") from e
    return Solicitud(archivo=archivo, **indice_solicitudes.buscar(archivo))


class ActividadItem(BaseModel):
    id: int
    accion: str
    archivo: str | None = None
    numero_solicitud: str | None = None
    codigo_muestra: str | None = None
    tipo_muestra: str | None = None
    peso_muestra: float | None = None
    unidad_peso: str | None = None
    r2_key_foto: str | None = None
    usuario_email: str
    usuario_nombre: str
    detalle: dict = {}
    resultado: str
    mensaje: str | None = None
    creado_en: str


@router.get("/actividad", response_model=list[ActividadItem])
def listar_actividad(
    limite: int = 100,
    offset: int = 0,
    archivo: str | None = None,
    usuario: Usuario = Depends(usuario_actual),
) -> Any:
    """Historial de actividad del módulo de ingreso al laboratorio."""
    return indice_solicitudes.listar_actividad(
        limite=min(limite, 500),
        offset=offset,
        archivo=archivo,
    )


@router.get("/solicitudes/{archivo}/cruce-foto", response_model=None)
def descargar_foto_cruce(archivo: str, usuario: Usuario = Depends(usuario_actual)) -> Response:
    """Descarga la foto del cruce (la tomada al momento de cruzar la muestra)."""
    _exigir_acceso(usuario, _leer_datos_actuales(archivo))
    foto_info = indice_solicitudes.foto_de_cruce(archivo)
    if foto_info is None:
        raise HTTPException(404, "Esta solicitud no tiene foto de cruce.")
    r2_key = foto_info["r2_key"]
    content_type = foto_info.get("content_type", "image/jpeg")
    if r2.disponible():
        contenido = r2.descargar(r2_key)
        if contenido is None:
            raise HTTPException(404, "La foto de cruce ya no está disponible en el almacén.")
        return Response(content=contenido, media_type=content_type)
    # Modo disco: el r2_key es la ruta relativa desde STORAGE_DIR
    ruta = os.path.join(config.STORAGE_DIR, r2_key)
    if not os.path.isfile(ruta):
        raise HTTPException(404, "La foto de cruce ya no está disponible en disco.")
    with open(ruta, "rb") as f:
        return Response(content=f.read(), media_type=content_type)


_SUPER_ADMIN_EMAIL = "jorge.sandoval@agrofresh.com"


@router.delete("/solicitudes/{archivo}")
def eliminar_solicitud(
    archivo: str,
    usuario: auth.Usuario = Depends(auth.usuario_actual),
) -> dict[str, str]:
    if usuario.tipoAcceso != "admin_general" or usuario.email.lower() != _SUPER_ADMIN_EMAIL:
        raise HTTPException(403, "Solo el administrador principal puede eliminar solicitudes.")
    if r2.disponible():
        key = _buscar_key_solicitud(archivo)
        if key is None:
            raise HTTPException(404, "Solicitud no encontrada.")
        r2.eliminar(key)
    else:
        ruta = _ruta_archivo(archivo)
        os.remove(ruta)
    # Sacarla también del índice: si quedara anotada, el listado seguiría
    # mostrando una solicitud cuyo archivo ya no existe.
    indice_solicitudes.olvidar_archivo(os.path.basename(archivo))
    actividad.registrar(usuario.email, usuario.nombre, "sensible", "solicitud_eliminada",
                        f"eliminó la solicitud {os.path.basename(archivo)}", sensible=True)
    return {"estado": "eliminado"}


# ---------------------------------------------------------------------------
# Reanálisis: solicitudes derivadas de una convencional ya enviada.
# ---------------------------------------------------------------------------

class ReanalisisIn(BaseModel):
    """Datos exclusivos del reanálisis: el motivo y los campos de la
    solicitud a copiar (el laboratorio no se puede cambiar)."""

    motivo: str = Field(..., min_length=5, description="Motivo del reanálisis (obligatorio, mín. 5 caracteres).")
    # Los demás campos son los mismos que SolicitudIn, pero el laboratorio
    # se ignora: se toma siempre de la solicitud original.
    solicitante: str
    sold_to: str
    ship_to: str | None = None
    especie: str | None = None
    variedad: str | None = None
    linea_proceso: str | None = None
    csg_productor: str | None = None
    csg_packing: str | None = None
    lote: str | None = None
    posicion_muestreo: str | None = None
    numero_camara: str | None = None
    numero_orden: str | None = None
    kilos_procesados: float | None = None
    producto_utilizado: str | None = None
    # Lo que realmente se eligió (uso interno). `producto_utilizado` dice MIXTO
    # cuando son más de dos.
    productos_lista: list[str] = []
    tipo_muestra: str | None = None
    fecha_muestreo: str | None = None
    hora_muestreo: str | None = None
    nombre_muestreador: str | None = None
    generado_por: str
    email_solicitante: str | None = None
    email_laboratorio: str | None = None
    observacion: str | None = None
    campos_laboratorio: dict[str, str] = {}
    analitos_solicitados: list[str] = []

    @model_validator(mode="after")
    def _productos_visibles(self):
        # Al leer (`Solicitud`) manda la marca guardada; al recibir un formulario
        # no hay marca, y la regla definitiva se aplica al guardar.
        self.producto_utilizado, self.productos_lista = normalizar_productos(
            self.producto_utilizado, self.productos_lista, bool(getattr(self, "mixto_desde_2", False))
        )
        return self


@router.get("/solicitudes-elegibles-reanalisis")
def listar_solicitudes_elegibles_reanalisis(
    usuario: Usuario = Depends(usuario_actual),
) -> list[Solicitud]:
    """Solicitudes convencionales enviadas que aún no tienen reanálisis.

    Solo visible para usuarios que pueden crear reanálisis.
    """
    _exigir_puede_reanalisis(usuario)
    pares = indice_solicitudes.listar_elegibles_reanalisis()
    salida: list[Solicitud] = []
    for nombre, datos in pares:
        if datos.get("es_prueba"):
            continue
        try:
            salida.append(Solicitud(archivo=nombre, **datos))
        except (ValueError, KeyError):
            continue
    return salida


@router.post("/solicitudes/{archivo}/reanalisis")
def crear_reanalisis(
    archivo: str,
    body: ReanalisisIn,
    usuario: Usuario = Depends(usuario_actual),
) -> Solicitud:
    """Crea una solicitud de reanálisis a partir de la original.

    - El laboratorio se hereda de la original (no modificable).
    - El código sale con prefijo `R-`: `OT-QUI0045` → `R-OT-QUI0045`.
    - Solo se puede crear UN reanálisis por solicitud original (409 si ya
      existe).
    - La original debe estar enviada (`enviada=True`).
    """
    _exigir_puede_reanalisis(usuario)
    motivo = body.motivo.strip()
    if not motivo:
        raise HTTPException(422, "El motivo del reanálisis es obligatorio.")

    # 1. Leer la solicitud original
    if r2.disponible():
        data, ext = _descargar_solicitud_r2(archivo)
        datos_original = _leer_solicitud_bytes(data, ext)
    else:
        datos_original = _leer_solicitud_archivo(_ruta_archivo(archivo))

    archivo_base = os.path.basename(archivo)

    if datos_original.get("es_prueba"):
        raise HTTPException(400, "Una solicitud de prueba no admite reanálisis.")

    if not datos_original.get("enviada"):
        raise HTTPException(
            400,
            "Solo se puede solicitar reanálisis de una solicitud que ya fue enviada al laboratorio.",
        )

    # 2. Verificar que no exista ya un reanálisis para esta solicitud
    if indice_solicitudes.solicitud_tiene_reanalisis(archivo_base):
        raise HTTPException(
            409,
            f"Ya existe un reanálisis para la solicitud {archivo_base}. "
            "Solo se permite un reanálisis por solicitud.",
        )

    laboratorio = datos_original.get("laboratorio", "")
    numero_original = datos_original.get("numero_solicitud", os.path.splitext(archivo_base)[0])

    # 3. Generar el código del reanálisis: prefijo R- al folio original
    numero_reanalisis = f"R-{numero_original}"

    # Verificar que el archivo destino no exista ya (p. ej. índice inconsistente)
    nombre_archivo = f"{numero_reanalisis}.xlsx"
    if indice_solicitudes.buscar(nombre_archivo) is not None:
        raise HTTPException(
            409,
            f"Ya existe una solicitud con el código {numero_reanalisis}.",
        )

    ahora = datetime.now(timezone.utc)
    datos = body.model_dump(exclude={"motivo"})
    datos.update(
        laboratorio=laboratorio,
        numero_solicitud=numero_reanalisis,
        fecha_solicitud=ahora.date().isoformat(),
        creado_en=ahora.isoformat(),
        enviada=False,
        enviado_en=None,
        pdf_solo_analisis=True,
        mixto_desde_2=True,
        respaldo_ryd=True,
        tipo_solicitud="REANALISIS",
        solicitud_original_archivo=archivo_base,
        motivo_reanalisis=motivo,
    )
    _aplicar_regla_mixto(datos)

    # 4. Generar y guardar el Excel
    analitos_config = _leer_config("analitos.json", ANALITOS_DEFECTO)
    wb = construir_workbook(datos, analitos_config)
    r2_key = None
    if r2.disponible():
        buf = io.BytesIO()
        wb.save(buf)
        r2_key = _r2_key_sol_nueva(body.sold_to, body.ship_to, datos["fecha_solicitud"], nombre_archivo)
        r2.subir(r2_key, buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    else:
        _exigir_lab_activo(laboratorio)
        carpeta = os.path.join(
            _carpeta_raiz(),
            carpeta_de_cliente(body.sold_to),
            carpeta_de_sucursal(body.ship_to),
            datos["fecha_solicitud"],
            numero_reanalisis,
        )
        os.makedirs(carpeta, exist_ok=True)
        wb.save(os.path.join(carpeta, nombre_archivo))

    # 5. Indexar (guarda también las columnas de reanálisis)
    indice_solicitudes.anotar_reanalisis(
        nombre_archivo, datos, r2_key,
        solicitud_original_archivo=archivo_base,
        motivo_reanalisis=motivo,
    )

    nombre_quien = usuario.nombre or usuario.email
    notificar(
        titulo=f"🔄 Nuevo reanálisis {numero_reanalisis} · {body.sold_to or '—'}",
        resumen=(
            f"{nombre_quien} creó una solicitud de reanálisis. "
            f"Código: {numero_reanalisis} · Original: {numero_original}."
        ),
        creado_por=nombre_quien,
        audiencia="todos",
        metadata={"tipo": "reanalisis", "numero": numero_reanalisis, "archivo": nombre_archivo, "original": archivo_base},
    )
    return Solicitud(archivo=nombre_archivo, **datos)


# ---------------------------------------------------------------------------
# Fotos de la muestra: quedan en R2 (o disco) junto al Excel de la solicitud,
# nunca adjuntas a él -son fotos de referencia de la etiqueta escrita a mano
# para quien recibe la muestra físicamente, no un dato de la solicitud, así
# que no se listan como campo ni se agregan al documento maestro-.
# ---------------------------------------------------------------------------

MAX_FOTOS_SOLICITUD = 5
_TIPO_POR_EXTENSION = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
_EXTENSION_POR_TIPO = {tipo: ext for ext, tipo in _TIPO_POR_EXTENSION.items() if ext != ".jpeg"}


def _carpeta_fotos_disco(archivo: str) -> str:
    ruta = _ruta_archivo(archivo)
    carpeta = os.path.join(os.path.dirname(ruta), "fotos")
    os.makedirs(carpeta, exist_ok=True)
    return carpeta


@router.get("/solicitudes/{archivo}/fotos")
def listar_fotos_solicitud(archivo: str, usuario: Usuario = Depends(usuario_actual)) -> list[str]:
    """Nombres de las fotos de la muestra ya subidas para esta solicitud."""
    _exigir_acceso(usuario, _leer_datos_actuales(archivo))
    if r2.disponible():
        prefijo = _carpeta_fotos_r2(archivo)
        if prefijo is None:
            raise HTTPException(404, "Solicitud no encontrada.")
        return sorted(key.split("/")[-1] for key in r2.listar_keys(prefijo))
    return sorted(os.listdir(_carpeta_fotos_disco(archivo)))


@router.post("/solicitudes/{archivo}/fotos")
async def subir_foto_solicitud(
    archivo: str, foto: UploadFile = File(...), usuario: Usuario = Depends(usuario_actual)
) -> list[str]:
    """Sube una foto de la muestra tomada con la cámara. Devuelve el listado
    actualizado de fotos guardadas para que la pantalla refleje de inmediato
    cuántas van y pueda bloquear una sexta."""
    datos = _leer_datos_actuales(archivo)
    _exigir_acceso(usuario, datos)
    if foto.content_type not in _EXTENSION_POR_TIPO:
        raise HTTPException(400, "Solo se aceptan fotos JPEG, PNG o WEBP.")
    contenido = await foto.read()
    if not contenido:
        raise HTTPException(400, "La foto llegó vacía.")
    extension = _EXTENSION_POR_TIPO[foto.content_type]

    if r2.disponible():
        prefijo = _carpeta_fotos_r2(archivo)
        if prefijo is None:
            raise HTTPException(404, "Solicitud no encontrada.")
        existentes = sorted(key.split("/")[-1] for key in r2.listar_keys(prefijo))
        if len(existentes) >= MAX_FOTOS_SOLICITUD:
            raise HTTPException(400, f"Ya hay {MAX_FOTOS_SOLICITUD} fotos guardadas: es el máximo por solicitud.")
        nombre = f"foto_{len(existentes) + 1}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}{extension}"
        r2.subir(f"{prefijo}{nombre}", contenido, foto.content_type)
        return sorted(existentes + [nombre])

    carpeta = _carpeta_fotos_disco(archivo)
    existentes = sorted(os.listdir(carpeta))
    if len(existentes) >= MAX_FOTOS_SOLICITUD:
        raise HTTPException(400, f"Ya hay {MAX_FOTOS_SOLICITUD} fotos guardadas: es el máximo por solicitud.")
    nombre = f"foto_{len(existentes) + 1}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}{extension}"
    with open(os.path.join(carpeta, nombre), "wb") as f:
        f.write(contenido)
    return sorted(existentes + [nombre])


@router.delete("/solicitudes/{archivo}/fotos/{nombre}")
def eliminar_foto_solicitud(archivo: str, nombre: str, usuario: Usuario = Depends(usuario_actual)) -> list[str]:
    _exigir_acceso(usuario, _leer_datos_actuales(archivo))
    nombre = os.path.basename(nombre)
    if r2.disponible():
        prefijo = _carpeta_fotos_r2(archivo)
        if prefijo is None:
            raise HTTPException(404, "Solicitud no encontrada.")
        r2.eliminar(f"{prefijo}{nombre}")
        return sorted(key.split("/")[-1] for key in r2.listar_keys(prefijo))
    carpeta = _carpeta_fotos_disco(archivo)
    ruta = os.path.join(carpeta, nombre)
    if os.path.exists(ruta):
        os.remove(ruta)
    return sorted(os.listdir(carpeta))


@router.get("/solicitudes/{archivo}/fotos/{nombre}", response_model=None)
def descargar_foto_solicitud(archivo: str, nombre: str, usuario: Usuario = Depends(usuario_actual)) -> Response:
    _exigir_acceso(usuario, _leer_datos_actuales(archivo))
    nombre = os.path.basename(nombre)
    tipo = _TIPO_POR_EXTENSION.get(os.path.splitext(nombre)[1].lower(), "application/octet-stream")
    if r2.disponible():
        prefijo = _carpeta_fotos_r2(archivo)
        contenido = r2.descargar(f"{prefijo}{nombre}") if prefijo else None
        if contenido is None:
            raise HTTPException(404, "Foto no encontrada.")
        return Response(content=contenido, media_type=tipo)
    ruta = os.path.join(_carpeta_fotos_disco(archivo), nombre)
    if not os.path.isfile(ruta):
        raise HTTPException(404, "Foto no encontrada.")
    with open(ruta, "rb") as f:
        return Response(content=f.read(), media_type=tipo)


@router.get("/solicitudes/{archivo}/excel", response_model=None)
def descargar_solicitud_excel(archivo: str, usuario: Usuario = Depends(usuario_actual)) -> StreamingResponse:
    """Regenera el documento visible con el formato vigente.

    Los datos siempre se leen del archivo maestro guardado (XLSX o JSON), de
    modo que las solicitudes antiguas también descargan la tabla operativa
    actual sin modificar su contenido original.
    """
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if r2.disponible():
        data, ext = _descargar_solicitud_r2(archivo)
        nombre_base = os.path.splitext(os.path.basename(archivo))[0]
        datos = _leer_solicitud_bytes(data, ext)
        _exigir_acceso(usuario, datos)
        buf = io.BytesIO()
        analitos_config = _leer_config("analitos.json", ANALITOS_DEFECTO)
        construir_workbook(datos, analitos_config).save(buf)
        buf.seek(0)
        return StreamingResponse(buf, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{nombre_base}.xlsx"'})
    ruta = _ruta_archivo(archivo)
    numero = os.path.splitext(os.path.basename(ruta))[0]
    datos = _leer_solicitud_archivo(ruta)
    _exigir_acceso(usuario, datos)
    buffer = io.BytesIO()
    analitos_config = _leer_config("analitos.json", ANALITOS_DEFECTO)
    construir_workbook(datos, analitos_config).save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{numero}.xlsx"'},
    )


@router.get("/solicitudes/{archivo}/json", response_model=None)
def descargar_solicitud_json(archivo: str, usuario: Usuario = Depends(usuario_actual)) -> Response:
    """JSON adjunto de la solicitud (mismo que se envía por correo al laboratorio)."""
    if r2.disponible():
        data, ext = _descargar_solicitud_r2(archivo)
        datos = _leer_solicitud_bytes(data, ext)
        numero = os.path.splitext(os.path.basename(archivo))[0]
    else:
        ruta = _ruta_archivo(archivo)
        numero = os.path.splitext(os.path.basename(ruta))[0]
        datos = _leer_solicitud_archivo(ruta)
    _exigir_acceso(usuario, datos)
    json_bytes = _generar_json_solicitud(datos)
    nombre = f"{numero}.json"
    return Response(
        content=json_bytes,
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{nombre}; filename=\"{nombre}\"",
        },
    )


@router.get("/solicitudes/{archivo}/pdf")
def descargar_solicitud_pdf(archivo: str, usuario: Usuario = Depends(usuario_actual)) -> Response:
    if r2.disponible():
        data, ext = _descargar_solicitud_r2(archivo)
        datos = _leer_solicitud_bytes(data, ext)
        numero = os.path.splitext(os.path.basename(archivo))[0]
    else:
        ruta = _ruta_archivo(archivo)
        numero = os.path.splitext(os.path.basename(ruta))[0]
        datos = _leer_solicitud_archivo(ruta)
    _exigir_acceso(usuario, datos)
    analitos_config = _leer_config("analitos.json", ANALITOS_DEFECTO)
    analisis_config = _leer_config("analisis_laboratorio.json", [])
    datos_pdf = _datos_pdf_con_destinatarios_resultados(datos)
    pdf_bytes = generar_pdf_solicitud(datos_pdf, analitos_config, analisis_config)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{numero}.pdf"'},
    )


class EnvioSolicitudIn(BaseModel):
    # `destinatario` se conserva por compatibilidad. Los adicionales se suman
    # a la configuración vigente del laboratorio sólo para este envío.
    destinatario: str | None = None
    destinatarios_adicionales: list[str] = Field(default_factory=list)
    # Solo para solicitudes de PRUEBA: el correo va únicamente a quien se escribe
    # (o a quien aprieta «enviar» si no escribe a nadie), sin la lista real, sin
    # copias y sin marcar la solicitud como enviada. Una solicitud real lo rechaza.
    solo_a_estos: bool = False


def contactos_de_solicitud_por_envio(laboratorio: str) -> dict[str, list[str]]:
    """Correos activos que reciben las solicitudes de este laboratorio,
    separados en `to` / `cc` / `bcc` según cómo se configuró cada contacto
    en Laboratorios → Contacto laboratorio (campo `envio`). Un contacto sin
    `envio` -los de antes- va en `to`, como siempre."""
    contactos = _leer_config("contactos_laboratorio.json", [])
    salida: dict[str, list[str]] = {"to": [], "cc": [], "bcc": []}
    for c in sorted(contactos, key=lambda c: c.get("orden", 0)):
        if not (
            c.get("laboratorio") == laboratorio
            and c.get("tipo") == "solicitud"
            and c.get("activo", True)
            and c.get("email")
        ):
            continue
        envio = c.get("envio")
        salida[envio if envio in ("cc", "bcc") else "to"].append(c["email"])
    return salida


# Cuando el laboratorio no tiene lista de distribución de solicitudes, el
# correo va Para a estas dos personas y con copia a los técnicos y comerciales
# de la planta (los contactos internos de "Resultado a clientes").
DESTINATARIOS_SIN_LISTA = ["JORGE.SANDOVAL@AGROFRESH.COM", "CGUERRERO@AGROFRESH.COM"]


def _admins_de(contactos: list[dict]) -> list[str]:
    """Correos activos con cargo «Admin» (Admin Report Hub del Excel maestro)."""
    return [
        str(c["email"]).strip() for c in contactos
        if c.get("tipo") == "resultado_interno" and c.get("activo", True)
        and c.get("email") and str(c.get("cargo") or "").strip().casefold() == "admin"
    ]


def _para_sin_lista(admins: list[str], servicio: str = "") -> list[str]:
    """Para cuando no hay lista de distribución: Jorge y Claudia, más los admin
    del Report Hub. Con lista, esos mismos van en copia oculta; sin lista pasan
    de CCO a Para.

    Actimist tiene su propio respaldo: Jorge y el Report Hub (sin Claudia)."""
    base = PARA_SIN_LISTA_SERVICIO.get(clave_servicio(servicio), DESTINATARIOS_SIN_LISTA)
    salida: list[str] = []
    vistos: set[str] = set()
    for e in [*base, *admins]:
        if e.casefold() not in vistos:
            vistos.add(e.casefold())
            salida.append(e)
    return salida


def _con_destinatarios_ryd(
    para: list[str], cc: list[str], bcc: list[str], admins: list[str],
) -> tuple[list[str], list[str], list[str]]:
    """Quién recibe una solicitud (o sus resultados) RYD con el respaldo de RYD:
    Carla y Fran en Para (más lo que ya hubiera para el laboratorio o el cliente),
    Jorge en Copia, y NADIE más del equipo Admin (ni Claudia ni el Report Hub).
    Nadie va dos veces."""
    jorge = DESTINATARIOS_SIN_LISTA[0]
    fuera = {e.casefold() for e in (*DESTINATARIOS_SIN_LISTA, *admins)}
    vistos: set[str] = set()

    def limpiar(lista: list[str], inicio: list[str] = ()) -> list[str]:
        salida: list[str] = []
        for e in [*inicio, *(x for x in lista if str(x).casefold() not in fuera)]:
            clave = str(e).strip().casefold()
            if clave and clave not in vistos:
                vistos.add(clave)
                salida.append(str(e).strip())
        return salida

    return limpiar(para, RYD_COPIAS), limpiar(cc, [jorge]), limpiar(bcc)


def _solo_del_cliente(para: list[str], admins: list[str], servicio: str = "") -> list[str]:
    """El Para sin el respaldo: si es solo Jorge, Claudia y los admin (no hay lista
    del cliente), no queda nada; si hay lista del cliente, queda tal cual."""
    propios = {e.casefold() for e in _para_sin_lista(admins, servicio)}
    return [] if {e.casefold() for e in para} <= propios else list(para)


# Las solicitudes de prueba de Quiteca NUNCA van a los contactos reales del
# laboratorio: solo a estas dos direcciones (el portal de Quiteca y Jorge).
DESTINATARIOS_PRUEBA_QUITECA = ["agrofresh@portal.quiteca.cl", "jorge.sandoval@agrofresh.com"]


def solicitud_sin_lista(datos: dict, contactos: list[dict] | None = None) -> bool:
    """¿Los resultados de esta solicitud quedan SIN lista de distribución?

    Es cuando, para su Sold To, Ship To y especie, no hay ningún contacto
    activo de «Resultado a clientes» que no sea Jorge o Claudia: o no hay
    nadie (rige el respaldo, Para = Jorge y Claudia) o los únicos en Para son
    ellos mismos. Los técnicos y comerciales (internos) no cuentan: van en
    copia, no son la lista del cliente."""
    servicio = servicio_de_datos(datos)
    propios = {c.casefold() for c in DESTINATARIOS_SIN_LISTA}
    if usa_respaldo_ryd(datos):
        propios |= {c.casefold() for c in RYD_COPIAS}
    if es_servicio_con_listado(servicio):
        propios |= {c.casefold() for c in (*PARA_SIN_LISTA_SERVICIO[servicio], *PERMANENTES_SERVICIO[servicio])}
    for c in _contactos_resultado(
        str(datos.get("sold_to") or ""), str(datos.get("ship_to") or ""), str(datos.get("especie") or ""),
        contactos, servicio=servicio,
    ):
        email = str(c.get("email") or "").strip()
        if (
            c.get("tipo") == "resultado_cliente"
            and c.get("activo", True)
            and email
            and email.casefold() not in propios
        ):
            return False
    return True


def _calculador_sin_lista(contactos: list[dict]):
    """`solicitud_sin_lista` con los contactos ya leídos y memoria por
    (Sold To, Ship To, especie): cientos de solicitudes comparten pocas
    combinaciones."""
    memoria: dict[tuple[str, str, str, str, bool], bool] = {}

    def calcular(datos: dict) -> bool:
        clave = (
            str(datos.get("sold_to") or "").strip(),
            str(datos.get("ship_to") or "").strip(),
            _clave_esp(str(datos.get("especie") or "")),
            servicio_de_datos(datos),
            usa_respaldo_ryd(datos),
        )
        if clave not in memoria:
            memoria[clave] = solicitud_sin_lista(datos, contactos)
        return memoria[clave]

    return calcular


def contactos_de_solicitud_de(laboratorio: str, datos: dict) -> dict[str, list[str]]:
    """Quién recibe el correo de la solicitud: Para / Copia / Copia oculta.

    Los técnicos y comerciales de la planta (los contactos internos de
    «Resultado a clientes») SIEMPRE van: el comercial en Copia y el técnico en
    Copia oculta, tenga o no el laboratorio lista de distribución. Si el
    laboratorio no tiene a nadie en Para, además Para = Jorge y Claudia Guerrero.
    """
    if datos.get("es_prueba") and str(laboratorio).strip().upper() == "QUITECA":
        return {"to": list(DESTINATARIOS_PRUEBA_QUITECA), "cc": [], "bcc": []}
    por_envio = contactos_de_solicitud_por_envio(laboratorio)
    servicio = servicio_de_datos(datos)
    internos = [
        c for c in _contactos_resultado(
            str(datos.get("sold_to") or ""), str(datos.get("ship_to") or ""), str(datos.get("especie") or ""),
            servicio=servicio,
        )
        if c.get("tipo") == "resultado_interno" and c.get("activo", True) and c.get("email")
    ]
    internos.sort(key=lambda c: c.get("orden", 0))
    if es_servicio_con_listado(servicio):
        return _contactos_solicitud_actimist(por_envio, internos, datos)
    para = por_envio["to"] or _para_sin_lista(_admins_de(internos))
    en_para = {e.casefold() for e in para}
    salida = {
        "to": para,
        "cc": [*por_envio["cc"], *(c["email"] for c in internos if c.get("tipo_copia") != "bcc")],
        "bcc": [
            e for e in (*por_envio["bcc"], *(c["email"] for c in internos if c.get("tipo_copia") == "bcc"))
            if e.casefold() not in en_para
        ],
    }
    if usa_respaldo_ryd(datos):
        salida["to"], salida["cc"], salida["bcc"] = _con_destinatarios_ryd(
            por_envio["to"], salida["cc"], salida["bcc"], _admins_de(internos),
        )
    return salida


def _contactos_solicitud_actimist(
    por_envio: dict[str, list[str]], internos: list[dict], datos: dict
) -> dict[str, list[str]]:
    """El correo de una solicitud ACTIMIST (y ECOFOG, que es su copia).

    - El laboratorio recibe como siempre (sus contactos de solicitud).
    - Jorge y el Report Hub van siempre: en Para si el laboratorio no tiene
      lista; si la tiene, en copia oculta.
    - Carlos Jiménez y Cristian Valenzuela (referentes de Actimist) van en
      Para en toda solicitud real; en las de prueba no.
    - Técnicos y comerciales: los de la lista de distribución de ACTIMIST
      (hoy vacía). Nunca los de Línea de proceso.
    """
    servicio = servicio_de_datos(datos)
    para = list(por_envio["to"])
    ocultas = list(por_envio["bcc"])
    if para:
        ocultas.extend(PARA_SIN_LISTA_SERVICIO[servicio])
    else:
        para = list(PARA_SIN_LISTA_SERVICIO[servicio])
    if not datos.get("es_prueba"):
        para.extend(PERMANENTES_SERVICIO[servicio])
    copias = [*por_envio["cc"], *(c["email"] for c in internos if c.get("tipo_copia") != "bcc")]
    ocultas.extend(c["email"] for c in internos if c.get("tipo_copia") == "bcc")

    vistos: set[str] = set()

    def sin_repetir(lista: list[str]) -> list[str]:
        salida: list[str] = []
        for e in lista:
            clave = str(e or "").strip().casefold()
            if clave and clave not in vistos:
                vistos.add(clave)
                salida.append(str(e).strip())
        return salida

    para = sin_repetir(para)
    return {"to": para, "cc": sin_repetir(copias), "bcc": sin_repetir(ocultas)}


def contactos_de_solicitud(laboratorio: str) -> list[str]:
    """Los destinatarios directos (Para) de las solicitudes de este laboratorio."""
    return contactos_de_solicitud_por_envio(laboratorio)["to"]


def _contactos_resultado_nivel(
    sold_to: str, ship_to: str, especie: str, contactos: list[dict] | None = None
) -> list[dict]:
    """Contactos de resultado para una combinación (sold_to, ship_to, especie).

    La configuración es compartida entre todos los laboratorios y se determina
    por la combinación exacta. Si no existe, cae por la cadena:
      sold_to + ship_to + especie  →  sold_to + ship_to  →  ship_to solo  →  global (todo vacío)
    """
    if contactos is None:
        contactos = _leer_config("contactos_laboratorio.json", [])
    pool = [
        c for c in contactos
        if c.get("tipo") in {"resultado_cliente", "resultado_interno"}
    ]
    st_n = (sold_to or "").strip()
    sh_n = (ship_to or "").strip()
    # Especie: comparación normalizada (sin mayúsculas, tildes ni variantes
    # ortográficas) para que "Cereza"/"CEREZA"/"Cerezas" no rompan el lookup.
    es_n = _clave_esp(especie or "")

    def _esp_cfg(c: dict) -> str:
        return _clave_esp(c.get("especie") or "")

    # 1. Exacto (sold_to + ship_to + especie normalizada)
    exactos = [
        c for c in pool
        if (c.get("sold_to") or "").strip() == st_n
        and (c.get("ship_to") or "").strip() == sh_n
        and _esp_cfg(c) == es_n
    ]
    if exactos:
        return exactos

    # 2. sold_to + ship_to (sin especie)
    if st_n or sh_n:
        sin_esp = [
            c for c in pool
            if (c.get("sold_to") or "").strip() == st_n
            and (c.get("ship_to") or "").strip() == sh_n
            and not _esp_cfg(c)
        ]
        if sin_esp:
            return sin_esp

    # 3. Solo ship_to
    if sh_n:
        solo_ship = [
            c for c in pool
            if not (c.get("sold_to") or "").strip()
            and (c.get("ship_to") or "").strip() == sh_n
            and not _esp_cfg(c)
        ]
        if solo_ship:
            return solo_ship

    # 4. Global (todo vacío) – respaldo histórico
    return [
        c for c in pool
        if not (c.get("sold_to") or "").strip()
        and not (c.get("ship_to") or "").strip()
        and not _esp_cfg(c)
    ]


def _contactos_resultado(
    sold_to: str, ship_to: str, especie: str, contactos: list[dict] | None = None,
    servicio: str = "",
) -> list[dict]:
    """Contactos de resultado de una combinación (sold_to, ship_to, especie).

    Los de cliente salen del nivel que corresponda (ver `_contactos_resultado_nivel`).
    Los internos -comerciales y técnicos- NO dependen de la especie: toda planta
    los trae siempre, aunque la solicitud sea de una especie para la que el
    cliente no tiene correos propios.

    Cada servicio tiene su propia lista: Actimist solo ve contactos con
    `servicio: actimist`; Línea de proceso (`servicio` vacío, el valor por
    defecto) ve los de siempre. Nunca se cruzan, tampoco en los respaldos.
    """
    if contactos is None:
        contactos = _leer_config("contactos_laboratorio.json", [])
    contactos = [c for c in contactos if es_del_servicio(c, servicio)]
    base = _contactos_resultado_nivel(sold_to, ship_to, especie, contactos)
    tienen = {
        str(c.get("email") or "").strip().casefold()
        for c in base
        if c.get("tipo") == "resultado_interno" and c.get("activo", True)
    }
    st_n, sh_n = (sold_to or "").strip(), (ship_to or "").strip()
    internos = [
        c for c in contactos
        if c.get("tipo") == "resultado_interno"
        and (c.get("sold_to") or "").strip() == st_n
        and (c.get("ship_to") or "").strip() == sh_n
    ]
    if not internos and sh_n:
        internos = [
            c for c in contactos
            if c.get("tipo") == "resultado_interno"
            and not (c.get("sold_to") or "").strip()
            and (c.get("ship_to") or "").strip() == sh_n
        ]
    extra: list[dict] = []
    for c in sorted(internos, key=lambda c: c.get("orden", 0)):
        email = str(c.get("email") or "").strip().casefold()
        if c.get("activo", True) and email and email not in tienen:
            tienen.add(email)
            extra.append(c)
    return [*base, *extra]


# Alias de compatibilidad para código que todavía llama con la firma antigua.
def _contactos_resultado_del_ship_to(laboratorio: str, ship_to: str) -> list[dict]:
    return _contactos_resultado("", ship_to, "")


def contactos_de_resultados(
    laboratorio: str,
    ship_to: str | None = None,
    sold_to: str | None = None,
    especie: str | None = None,
) -> list[str]:
    """Correos activos de resultado para una combinación (sold_to, ship_to, especie).

    Informativo en el PDF; no dispara envíos.
    """
    correos: list[str] = []
    vistos: set[str] = set()
    for contacto in sorted(
        _contactos_resultado(sold_to or "", ship_to or "", especie or ""),
        key=lambda c: c.get("orden", 0),
    ):
        email = str(contacto.get("email") or "").strip()
        clave = email.casefold()
        if contacto.get("activo", True) and email and clave not in vistos:
            correos.append(email)
            vistos.add(clave)
    return correos


def destinatarios_resultado_por_tipo(
    laboratorio: str,
    ship_to: str | None = None,
    sold_to: str | None = None,
    especie: str | None = None,
    contactos: list[dict] | None = None,
    servicio: str = "",
    ryd: bool = False,
) -> dict[str, list[str]]:
    """Correos de resultado separados en `to`/`cc`/`bcc`.

    `servicio`: la lista de distribución que rige (vacío = Línea de proceso).

    `contactos`: la configuración ya leída (para llamarla muchas veces sin
    volver a leerla de R2, como hace la descarga de Excel).

    `resultado_cliente` → `to`. `resultado_interno` → `cc` o `bcc` según
    `tipo_copia` del contacto.
    """
    salida: dict[str, list[str]] = {"to": [], "cc": [], "bcc": []}
    vistos: set[str] = set()
    for contacto in sorted(
        _contactos_resultado(sold_to or "", ship_to or "", especie or "", contactos, servicio=servicio),
        key=lambda c: c.get("orden", 0),
    ):
        if not contacto.get("activo", True):
            continue
        email = str(contacto.get("email") or "").strip()
        clave = email.casefold()
        if not email or clave in vistos:
            continue
        vistos.add(clave)
        if contacto.get("tipo") == "resultado_cliente":
            salida["to"].append(email)
        elif contacto.get("tipo") == "resultado_interno":
            destino = "bcc" if contacto.get("tipo_copia") == "bcc" else "cc"
            salida[destino].append(email)
    if not salida["to"]:
        # Sin lista de distribución para este Ship To: Para = Jorge, Claudia y
        # los admin del Report Hub (que con lista van en CCO); los técnicos y
        # comerciales (internos) ya quedaron en copia arriba.
        salida["to"] = _para_sin_lista(_admins_de(
            _contactos_resultado(sold_to or "", ship_to or "", especie or "", contactos, servicio=servicio)
        ), servicio)
        en_para = {d.casefold() for d in salida["to"]}
        salida["cc"] = [e for e in salida["cc"] if e.casefold() not in en_para]
        salida["bcc"] = [e for e in salida["bcc"] if e.casefold() not in en_para]
    if es_servicio_con_listado(servicio):
        salida["cc"] = _con_permanentes_actimist(salida["to"], salida["cc"], salida["bcc"], servicio)
    if ryd:
        admins = _admins_de(_contactos_resultado(sold_to or "", ship_to or "", especie or "", contactos, servicio=servicio))
        salida["to"], salida["cc"], salida["bcc"] = _con_destinatarios_ryd(
            _solo_del_cliente(salida["to"], admins, servicio), salida["cc"], salida["bcc"], admins,
        )
    return salida


def _con_permanentes_actimist(para: list[str], cc: list[str], bcc: list[str], servicio: str) -> list[str]:
    """Los referentes del servicio (Actimist o Ecofog) van en copia de todo
    resultado de ese servicio, salvo que ya estén en otra parte del correo."""
    ya = {e.casefold() for e in (*para, *cc, *bcc)}
    return [*cc, *(e for e in PERMANENTES_SERVICIO[clave_servicio(servicio)] if e.casefold() not in ya)]


class ContactoResultadoOut(BaseModel):
    """Un destinatario de resultados, tal como quedó configurado en
    Laboratorios → Resultado a clientes -de solo lectura: Nueva solicitud lo
    muestra, no lo edita-."""

    nombre: str
    email: str
    tipo: str  # resultado_cliente | resultado_interno
    tipo_copia: str  # cc | bcc -solo tiene sentido si tipo es resultado_interno
    especie: str  # vacío = aplica a todas las especies


@router.get("/config/destinatarios-solicitud")
def destinatarios_para_laboratorio(
    laboratorio: str,
    sold_to: str = "",
    ship_to: str = "",
    especie: str = "",
    tipo_aplicacion: str = "",
    _: Usuario = Depends(usuario_actual),
) -> dict[str, list[str]]:
    """Contactos configurados para recibir solicitudes de un laboratorio.
    Lo usa el formulario antes de crear la solicitud, cuando aún no hay archivo.
    Si el laboratorio no tiene lista, devuelve la de respaldo (ver
    `contactos_de_solicitud_de`), que depende del Ship To y del Tipo Aplicación
    (Actimist tiene su propia lista)."""
    por_envio = contactos_de_solicitud_de(
        laboratorio,
        {
            "sold_to": sold_to, "ship_to": ship_to, "especie": especie,
            "campos_laboratorio": {"Tipo Aplicación": tipo_aplicacion},
        },
    )
    return {"destinatarios": por_envio["to"], "cc": por_envio["cc"], "bcc": por_envio["bcc"]}


@router.get("/config/resultados-ship-to")
def resultados_de_ship_to(
    laboratorio: str,
    ship_to: str = "",
    sold_to: str = "",
    especie: str = "",
    tipo_aplicacion: str = "",
) -> list[ContactoResultadoOut]:
    """Configuración de "Resultado a clientes" vigente para una combinación
    (sold_to, ship_to, especie) y el servicio del Tipo Aplicación. Nueva
    solicitud la muestra de solo lectura."""
    contactos = _contactos_resultado(sold_to, ship_to, especie, servicio=clave_servicio(tipo_aplicacion))
    return [
        ContactoResultadoOut(
            nombre=str(c.get("nombre") or ""),
            email=str(c.get("email") or ""),
            tipo=str(c.get("tipo") or ""),
            tipo_copia=str(c.get("tipo_copia") or "cc"),
            especie=str(c.get("especie") or ""),
        )
        for c in sorted(contactos, key=lambda c: c.get("orden", 0))
        if c.get("activo", True) and c.get("email")
    ]


_CAMPOS_FECHA = {"fecha_muestreo", "fecha_solicitud"}


def _iso_a_ddmmyyyy(valor: object) -> object:
    """Convierte 'YYYY-MM-DD' → 'DD-MM-YYYY'. Si no coincide el patrón, devuelve el valor intacto."""
    import re as _re
    if isinstance(valor, str):
        m = _re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", valor.strip())
        if m:
            return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return valor


_CAMPOS_INTERNOS = {
    "archivo", "enviada", "enviado_en", "creado_en", "sin_lista_distribucion", "pdf_solo_analisis",
    "mixto_desde_2", "respaldo_ryd",
}


def _sample_identification(datos: dict) -> str:
    """Texto para el campo «Sample Identification (IN)» del informe del laboratorio:
    `N° solicitud - Posición muestreo - Fecha muestreo`. Siempre las tres partes,
    en ese orden, para que el PDF de vuelta se lea con un patrón fijo. Una parte
    vacía queda como «—» (igual que en `campos_laboratorio`), nunca se omite."""
    partes = mail_templates.rotulacion_partes(datos)
    return " - ".join(partes[k] for k in ("numero_solicitud", "posicion_muestreo", "fecha_muestreo_dmy"))


def _generar_json_solicitud(datos: dict) -> bytes:
    """JSON adjunto para el laboratorio: datos de la solicitud + destinatarios de resultado."""
    import json as _json
    lab = str(datos.get("laboratorio") or "")
    ship_to = str(datos.get("ship_to") or "")
    sold_to = str(datos.get("sold_to") or "")
    especie = str(datos.get("especie") or "")
    correos_resultado = destinatarios_resultado_por_tipo(
        lab, ship_to, sold_to, especie, servicio=servicio_de_datos(datos), ryd=usa_respaldo_ryd(datos)
    )
    email_muestreador = _normalizar_correo(datos.get("email_solicitante"))
    datos_limpios = {
        k: (_iso_a_ddmmyyyy(v) if k in _CAMPOS_FECHA else v)
        for k, v in datos.items()
        if k not in _CAMPOS_INTERNOS
    }
    salida = {
        **datos_limpios,
        # Solo ALS: es quien lo copia a «Sample Identification (IN)» de su informe.
        **({"sample_identification": _sample_identification(datos)} if lab.strip().casefold() == "als" else {}),
        "correos": {
            "resultado_cliente": {"to": correos_resultado.get("to", [])},
            "resultado_interno": {
                "cc": correos_resultado.get("cc", []),
                "bcc": correos_resultado.get("bcc", []),
            },
            "solicitante_bcc": {"bcc": [email_muestreador] if email_muestreador else []},
        },
    }
    return _json.dumps(salida, ensure_ascii=False, indent=2).encode("utf-8")


def _datos_pdf_con_destinatarios_resultados(datos: dict) -> dict:
    """Añade al PDF la configuración vigente sin modificar la solicitud."""
    datos_pdf = dict(datos)
    sold_to = str(datos.get("sold_to") or "")
    ship_to = str(datos.get("ship_to") or "")
    especie = str(datos.get("especie") or "")
    servicio = servicio_de_datos(datos)
    contactos = _contactos_resultado(sold_to, ship_to, especie, servicio=servicio)
    activos = [c for c in sorted(contactos, key=lambda c: c.get("orden", 0)) if c.get("activo", True) and c.get("email")]
    # Lista plana legacy (se conserva por si alguien la usa)
    vistos: set[str] = set()
    plana: list[str] = []
    for c in activos:
        e = str(c["email"]).strip()
        if e.casefold() not in vistos:
            plana.append(e)
            vistos.add(e.casefold())
    datos_pdf["destinatarios_resultados"] = plana
    # Detalle agrupado por rol: para, cc, bcc
    para: list[str] = []
    cc: list[str] = []
    bcc: list[str] = []
    vistos_det: set[str] = set()
    for c in activos:
        e = str(c["email"]).strip()
        if e.casefold() in vistos_det:
            continue
        vistos_det.add(e.casefold())
        if c.get("tipo") == "resultado_cliente":
            para.append(e)
        elif c.get("tipo_copia") == "bcc":
            bcc.append(e)
        else:
            cc.append(e)
    if not para:
        # Misma regla de respaldo que `destinatarios_resultado_por_tipo`.
        para = _para_sin_lista(_admins_de(activos), servicio)
        respaldo = {d.casefold() for d in para}
        cc = [e for e in cc if e.casefold() not in respaldo]
        bcc = [e for e in bcc if e.casefold() not in respaldo]
    if es_servicio_con_listado(servicio):
        cc = _con_permanentes_actimist(para, cc, bcc, servicio)
    if usa_respaldo_ryd(datos):
        admins = _admins_de(activos)
        para, cc, bcc = _con_destinatarios_ryd(_solo_del_cliente(para, admins, servicio), cc, bcc, admins)
    datos_pdf["destinatarios_resultados_detalle"] = {"para": para, "cc": cc, "bcc": bcc}
    return datos_pdf


@router.get("/solicitudes/{archivo}/destinatarios")
def destinatarios_de_solicitud(archivo: str, usuario: Usuario = Depends(usuario_actual)) -> dict[str, Any]:
    """A quién se le enviaría esta solicitud. El frontend lo muestra antes de
    enviar para que nadie dispare un correo sin ver a dónde va."""
    if r2.disponible():
        data, ext = _descargar_solicitud_r2(archivo)
        datos = _leer_solicitud_bytes(data, ext)
    else:
        datos = _leer_solicitud_archivo(_ruta_archivo(archivo))
    _exigir_acceso(usuario, datos)
    laboratorio = datos.get("laboratorio", "")
    por_envio = contactos_de_solicitud_de(laboratorio, datos)
    return {
        "laboratorio": laboratorio,
        "destinatarios": por_envio["to"],
        "cc": por_envio["cc"],
        "bcc": por_envio["bcc"],
    }


class EnvioAutomaticoOut(BaseModel):
    # `activo` = regla general (tipos sin regla propia y solicitudes sin tipo).
    activo: bool
    # Regla propia por tipo de aplicación: {"Actimist": true, "Línea de proceso": false}
    por_tipo: dict[str, bool] = Field(default_factory=dict)


class EnvioAutomaticoIn(BaseModel):
    activo: bool
    password: str
    # Sin `tipo` se cambia la regla general; con `tipo`, solo la de ese tipo.
    tipo: str | None = None
    # Con `tipo`, True quita la regla propia y vuelve a regir la general.
    heredar: bool = False


def _config_envio_automatico() -> EnvioAutomaticoOut:
    cfg = _leer_config("envio_automatico.json", {"activo": True})
    por_tipo = cfg.get("por_tipo") or {}
    return EnvioAutomaticoOut(
        activo=bool(cfg.get("activo", True)),
        por_tipo={str(k): bool(v) for k, v in por_tipo.items()},
    )


@router.get("/config/envio-automatico")
def obtener_envio_automatico(usuario: Usuario = Depends(usuario_actual)) -> EnvioAutomaticoOut:
    """Si las solicitudes se envían por correo automáticamente al guardar:
    una regla general y, opcionalmente, una por tipo de aplicación."""
    return _config_envio_automatico()


@router.put("/config/envio-automatico")
def actualizar_envio_automatico(
    body: EnvioAutomaticoIn, usuario: Usuario = Depends(usuario_actual)
) -> EnvioAutomaticoOut:
    """Cambia el modo de envío. Solo admin_general, requiere contraseña."""
    if usuario.tipoAcceso != "admin_general":
        raise HTTPException(403, "Solo el administrador general puede cambiar esta configuración.")
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT password_hash FROM usuario WHERE id = %s", (usuario.id,))
        fila = cur.fetchone()
    if not fila or not seguridad.verificar_password(body.password, fila.get("password_hash")):
        raise HTTPException(401, "Contraseña incorrecta.")
    actual = _config_envio_automatico()
    tipo = (body.tipo or "").strip()
    if tipo:
        if body.heredar:
            actual.por_tipo.pop(tipo, None)
        else:
            actual.por_tipo[tipo] = body.activo
    else:
        actual.activo = body.activo
    _escribir_config(
        "envio_automatico.json", {"activo": actual.activo, "por_tipo": actual.por_tipo}
    )
    return actual


def _registrar_envio_solicitud(
    *,
    archivo: str,
    numero: str,
    laboratorio: str,
    usuario: Usuario,
    to: list[str],
    cc: list[str],
    bcc: list[str],
    exitoso: bool,
    mensaje_id: str | None,
    error: str | None,
) -> None:
    """Deja constancia del intento de envío, exitoso o no, en
    `envio_solicitud_log` (migración 0023). Es la trazabilidad que faltaba:
    antes esto solo quedaba -si acaso- en el log de la consola de Windows del
    backend, que se pierde apenas alguien la cierra (pendiente #1 de
    CLAUDE.md).

    Best-effort a propósito: si la auditoría falla, NO debe tumbar un envío
    que salió bien, ni ocultar uno que salió mal -en ambos casos ya se
    resolvió lo que importa antes de llegar acá-. Un problema de base en ese
    momento puntual queda en el log de proceso, que es peor que la tabla pero
    mejor que perder también eso.
    """
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                """
                INSERT INTO envio_solicitud_log
                    (archivo, numero_solicitud, laboratorio, usuario_email, usuario_nombre,
                     destinatarios_to, destinatarios_cc, destinatarios_bcc,
                     exitoso, mensaje_id, error)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    archivo, numero, laboratorio, usuario.email, usuario.nombre,
                    json.dumps(to), json.dumps(cc), json.dumps(bcc),
                    exitoso, mensaje_id, error,
                ),
            )
    except Exception:
        logger.exception(
            "No se pudo registrar el envío de %s en envio_solicitud_log (to=%s cc=%s bcc=%s exitoso=%s)",
            archivo, to, cc, bcc, exitoso,
        )


@router.post("/solicitudes/{archivo}/enviar")
def enviar_solicitud_por_correo(
    archivo: str, body: EnvioSolicitudIn, usuario: Usuario = Depends(usuario_actual)
) -> dict[str, str]:
    """Genera el PDF y Excel de la solicitud y los envía como adjuntos."""
    if r2.disponible():
        data, ext = _descargar_solicitud_r2(archivo)
        datos = _leer_solicitud_bytes(data, ext)
        numero = os.path.splitext(os.path.basename(archivo))[0]
    else:
        ruta = _ruta_archivo(archivo)
        numero = os.path.splitext(os.path.basename(ruta))[0]
        datos = _leer_solicitud_archivo(ruta)
    _exigir_acceso(usuario, datos)

    lab = datos.get("laboratorio", "")
    _exigir_lab_activo(lab)

    analitos_config = _leer_config("analitos.json", ANALITOS_DEFECTO)
    analisis_config = _leer_config("analisis_laboratorio.json", [])
    datos_pdf = _datos_pdf_con_destinatarios_resultados(datos)
    pdf_bytes = generar_pdf_solicitud(datos_pdf, analitos_config, analisis_config)
    solicitante = datos.get("solicitante", "")
    sold_to = datos.get("sold_to", "")
    fecha = datos.get("fecha_solicitud", "")

    # Siempre parten los contactos configurados. Los invitados escritos en el
    # cuadro de envío se agregan sólo a este correo y no alteran el mantenedor.
    solo_a_estos = body.solo_a_estos
    if solo_a_estos and not datos.get("es_prueba"):
        raise HTTPException(400, "Enviar solo a destinatarios elegidos es únicamente para solicitudes de prueba.")
    por_envio = (
        {"to": [], "cc": [], "bcc": []} if solo_a_estos
        else contactos_de_solicitud_de(lab, datos)
    )
    # Toda solicitud Actimist real lleva a sus dos referentes de producto
    # (Carlos Jiménez y Cristian Valenzuela): ya vienen en Para desde
    # `contactos_de_solicitud_de`. Las de prueba no, para no llenarles la
    # bandeja con correos de ensayo.
    candidatos = list(por_envio["to"])
    if body.destinatario and body.destinatario.strip():
        candidatos.append(body.destinatario.strip())
    candidatos.extend(body.destinatarios_adicionales)
    if solo_a_estos and not any(str(c or "").strip() for c in candidatos):
        candidatos.append(usuario.email)
    destinatarios: list[str] = []
    vistos: set[str] = set()
    for candidato in candidatos:
        email = str(candidato or "").strip()
        clave = _normalizar_correo(email)
        if email and clave not in vistos:
            destinatarios.append(email)
            vistos.add(clave)
    if not destinatarios:
        raise HTTPException(
            400,
            f"{lab} no tiene contactos de solicitud configurados. "
            "Agrégalos en Administración → Laboratorios → Contactos, o escribe un correo.",
        )

    es_reanalisis = datos.get("tipo_solicitud") == "REANALISIS"
    if es_reanalisis:
        asunto, texto, html, imagenes_inline = mail_templates.renderizar_reanalisis(lab, datos)
    else:
        asunto, texto, html, imagenes_inline = mail_templates.renderizar(lab, datos)
    if datos.get("es_prueba"):
        asunto = f"(PRUEBA) {asunto}"

    labs_cfg = _leer_config("laboratorios.json", LABORATORIOS_DEFECTO)
    lab_cfg = next((l for l in labs_cfg if l.get("codigo", "").upper() == lab.upper()), {})
    adjuntos: list[correo.Adjunto] = [
        correo.Adjunto(f"{numero}.pdf", pdf_bytes, "application/pdf"),
    ]
    if lab_cfg.get("adjuntos_excel", True):
        wb = construir_workbook(datos, analitos_config)
        buf_excel = io.BytesIO()
        wb.save(buf_excel)
        adjuntos.append(correo.Adjunto(
            f"{numero}.xlsx",
            buf_excel.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ))
    if lab_cfg.get("adjuntos_json", False):
        adjuntos.append(correo.Adjunto(
            f"{numero}.json",
            _generar_json_solicitud(datos),
            "application/json",
        ))

    # El muestreador que creó la solicitud SIEMPRE recibe una copia oculta de
    # su propio envío -es el correo guardado en la solicitud (forzado por el
    # backend al crearla, ver crear_solicitud), no el de quien aprieta
    # "enviar" ahora-, aparte de los destinatarios normales de arriba y sin
    # reemplazarlos. Si esa misma dirección ya está en los destinatarios
    # normales, no se repite en BCC: recibiría el correo dos veces por nada.
    email_muestreador = _normalizar_correo(datos.get("email_solicitante"))

    # Copias configuradas en Contacto laboratorio (Copia / Copia oculta) y la
    # copia oculta del muestreador. Nadie va dos veces: quien ya está en el
    # Para no se repite en copia, y quien está en Copia no se repite en oculta.
    def _sin_repetir(lista: list[str]) -> list[str]:
        salida: list[str] = []
        for candidato in lista:
            email = str(candidato or "").strip()
            clave = _normalizar_correo(email)
            if email and clave not in vistos:
                salida.append(email)
                vistos.add(clave)
        return salida

    cc = _sin_repetir(por_envio["cc"])
    bcc = [] if solo_a_estos else _sin_repetir([*por_envio["bcc"], email_muestreador])

    try:
        resultado = correo.enviar(
            ", ".join(destinatarios), asunto, html, texto, adjuntos, cc=cc, bcc=bcc,
            imagenes_inline=imagenes_inline,
        )
    except HTTPException as exc:
        _registrar_envio_solicitud(
            archivo=archivo, numero=numero, laboratorio=lab, usuario=usuario,
            to=destinatarios, cc=cc, bcc=bcc,
            exitoso=False, mensaje_id=None, error=str(exc.detail),
        )
        raise

    _registrar_envio_solicitud(
        archivo=archivo, numero=numero, laboratorio=lab, usuario=usuario,
        to=resultado.to, cc=resultado.cc, bcc=resultado.bcc,
        exitoso=True, mensaje_id=resultado.mensaje_id, error=None,
    )

    # Recién ahora, con el correo ya afuera: si se marcara antes y el envío
    # fallara, la solicitud quedaría bloqueada para editar sin haberse
    # enviado realmente a nadie.
    # Un ensayo «solo a estos» no cuenta como envío: la prueba sigue editable y
    # se puede repetir.
    if not solo_a_estos:
        datos_enviada = {**datos, "enviada": True, "enviado_en": datetime.now(timezone.utc).isoformat()}
        _regrabar_datos_solicitud(archivo, datos_enviada)

    return {"ok": f"Solicitud {numero} enviada a {', '.join(destinatarios)}."}


# ---------------------------------------------------------------------------
# Configuración (mantenedores): igual que las solicitudes, se guarda como
# JSON en disco (no hay tabla en base de datos) dentro de
# "solicitudes/_config/". El objetivo es que el administrador pueda
# activar/desactivar y marcar requerido/opcional los campos generales, y
# mantener las listas de tipos de aplicación, líneas de proceso y analitos
# por laboratorio, sin tocar código fuente.
#
# Todos los endpoints de escritura (POST/PUT/DELETE) requieren admin_general.
# ---------------------------------------------------------------------------

# Dependencia de rol reutilizada en todos los endpoints de escritura de config.
_SOLO_ADMIN_CONFIG = [Depends(auth.solo_admin_general)]



# El almacén de mantenedores vive en `config_store` desde que el módulo de
# Laboratorios pasó a usar el mismo mecanismo. Se mantienen estos alias
# porque el resto del archivo los llama en decenas de lugares.
_leer_config = config_store.leer
_escribir_config = config_store.escribir


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
    {"clave": "email_solicitante", "etiqueta": "Email Solicitante", "tipo": "email", "requerido": True, "activo": True, "orden": 2},
    {"clave": "sold_to", "etiqueta": "Sold To", "tipo": "select", "requerido": True, "activo": True, "orden": 3},
    {"clave": "ship_to", "etiqueta": "Ship To", "tipo": "select", "requerido": False, "activo": True, "orden": 4},
    {"clave": "especie", "etiqueta": "Especie", "tipo": "text", "requerido": True, "activo": True, "orden": 6},
    {"clave": "variedad", "etiqueta": "Variedad", "tipo": "text", "requerido": False, "activo": True, "orden": 7},
    {"clave": "linea_proceso", "etiqueta": "Línea Proceso", "tipo": "select", "requerido": True, "activo": True, "orden": 8},
    {"clave": "numero_camara", "etiqueta": "N° Cámara", "tipo": "text", "requerido": True, "activo": True, "orden": 9},
    {"clave": "numero_orden", "etiqueta": "N° Orden", "tipo": "text", "requerido": True, "activo": True, "orden": 10},
    # Posición Muestreo nunca es obligatorio (en Actimist es además
    # texto libre). Ese matiz no cabe en el mantenedor: la regla vive en el formulario (`NUNCA_REQUERIDO` en
    # NuevaSolicitudView) y acá queda en False para que el mantenedor no
    # prometa una obligatoriedad que no aplica siempre. Los códigos CSG
    # (Productor/Packing) nunca son obligatorios y solo se muestran en Línea
    # de proceso -ese filtro también vive en el formulario-.
    {"clave": "csg_productor", "etiqueta": "Código del Productor", "tipo": "text", "requerido": False, "activo": True, "orden": 11},
    {"clave": "csg_packing", "etiqueta": "Código del Packing", "tipo": "text", "requerido": False, "activo": True, "orden": 12},
    {"clave": "lote", "etiqueta": "Lote", "tipo": "text", "requerido": False, "activo": True, "orden": 13},
    {"clave": "kilos_procesados", "etiqueta": "Kilos Procesados (KG)", "tipo": "number", "requerido": False, "activo": True, "orden": 14},
    {"clave": "posicion_muestreo", "etiqueta": "Posición Muestreo", "tipo": "text", "requerido": False, "activo": True, "orden": 15},
    {"clave": "producto_utilizado", "etiqueta": "Producto Utilizado", "tipo": "select", "requerido": False, "activo": True, "orden": 16},
    {"clave": "tipo_muestra", "etiqueta": "Tipo Muestra", "tipo": "select", "requerido": True, "activo": True, "orden": 17},
    {"clave": "fecha_muestreo", "etiqueta": "Fecha Muestreo", "tipo": "date", "requerido": True, "activo": True, "orden": 18},
    {"clave": "hora_muestreo", "etiqueta": "Hora Muestreo", "tipo": "time", "requerido": False, "activo": True, "orden": 19},
    {"clave": "nombre_muestreador", "etiqueta": "Nombre Muestreador", "tipo": "text", "requerido": True, "activo": True, "orden": 20},
    {"clave": "email_laboratorio", "etiqueta": "Email Laboratorio", "tipo": "email", "requerido": False, "activo": True, "orden": 21},
    {"clave": "observacion", "etiqueta": "Observación", "tipo": "textarea", "requerido": False, "activo": True, "orden": 22},
]


def _campos_generales_vigentes() -> list[dict]:
    """Campos generales guardados, reconciliados contra la definición actual.

    Lo guardado manda en lo que el administrador eligió (etiqueta, si es
    obligatorio, si está activo y en qué orden). La definición manda en lo
    estructural: qué campos existen y cómo se editan.

    - Un campo retirado del sistema (`aplicacion`) desaparece aunque siga en
      el archivo guardado: si no se filtrara, seguiría apareciendo en el
      formulario de todas las instalaciones ya en marcha.
    - Un campo nuevo se agrega con sus valores por defecto.
    - `tipo` se toma siempre de la definición: es cómo se dibuja el control
      (Tipo Muestra pasó de texto libre a lista desplegable), no una
      preferencia del mantenedor.
    """
    definicion = {c["clave"]: c for c in _CAMPOS_GENERALES_DEFECTO}
    guardados = {
        c["clave"]: c
        for c in _leer_config("campos_generales.json", _CAMPOS_GENERALES_DEFECTO)
        if c.get("clave") in definicion
    }
    return [
        {**defecto, **guardados.get(clave, {}), "tipo": defecto["tipo"]}
        for clave, defecto in definicion.items()
    ]


@router.get("/config/campos")
def listar_campos_config() -> list[CampoConfig]:
    return [CampoConfig(**c) for c in _campos_generales_vigentes()]


@router.put("/config/campos", dependencies=_SOLO_ADMIN_CONFIG)
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


_siguiente_id = config_store.siguiente_id


def _crud_opciones(nombre_archivo: str, defecto: list[dict], oficiales: tuple[str, ...] = ()):
    """Fábrica de los 4 endpoints CRUD de un mantenedor simple tipo
    OpcionConfig (tipos de aplicación / líneas de proceso comparten
    exactamente la misma forma).

    `oficiales`: nombres que el sistema necesita que existan (p. ej. un tipo de
    servicio nuevo). Si el archivo guardado antes de que existieran no los
    trae, se agregan al listar, para no depender de que alguien los cree a mano."""

    def listar() -> list[OpcionConfig]:
        items = _leer_config(nombre_archivo, defecto)
        existentes = {str(o.get("nombre", "")).strip().casefold() for o in items}
        faltan = [d for d in defecto if d["nombre"] in oficiales and d["nombre"].casefold() not in existentes]
        if faltan:
            for d in faltan:
                nuevo = dict(d)
                nuevo["id"] = _siguiente_id(items)
                items.append(nuevo)
            _escribir_config(nombre_archivo, items)
        return [OpcionConfig(**o) for o in items]

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
    {"id": 1, "nombre": "Actimist", "activo": True, "orden": 1},
    {"id": 2, "nombre": "Línea de proceso", "activo": True, "orden": 2},
    {"id": 3, "nombre": "Ecofog", "activo": True, "orden": 3},
]
_listar_tipos, _crear_tipo, _editar_tipo, _eliminar_tipo = _crud_opciones(
    "tipos_aplicacion.json", _TIPOS_APLICACION_DEFECTO, oficiales=("Ecofog",)
)
router.get("/config/tipos-aplicacion")(_listar_tipos)
router.post("/config/tipos-aplicacion", dependencies=_SOLO_ADMIN_CONFIG)(_crear_tipo)
router.put("/config/tipos-aplicacion/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)(_editar_tipo)
router.delete("/config/tipos-aplicacion/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)(_eliminar_tipo)


_LINEAS_PROCESO_DEFECTO: list[dict] = [
    {"id": 1, "nombre": "Línea 1", "activo": True, "orden": 1},
    {"id": 2, "nombre": "Línea 2", "activo": True, "orden": 2},
]
_listar_lineas, _crear_linea, _editar_linea, _eliminar_linea = _crud_opciones(
    "lineas_proceso.json", _LINEAS_PROCESO_DEFECTO
)
router.get("/config/lineas-proceso")(_listar_lineas)
router.post("/config/lineas-proceso", dependencies=_SOLO_ADMIN_CONFIG)(_crear_linea)
router.put("/config/lineas-proceso/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)(_editar_linea)
router.delete("/config/lineas-proceso/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)(_eliminar_linea)


class CampoTipoAplicacionConfig(BaseModel):
    """Un campo adicional que aparece en el formulario según el Tipo de
    Aplicación elegido (Actimist / Línea de proceso / lo que el
    administrador agregue en el mantenedor de Tipos de aplicación).
    `ambito` = "comun" (aparece siempre que haya un tipo de aplicación
    elegido) o el nombre exacto de un tipo de aplicación (aparece solo con
    ese tipo)."""

    id: int
    ambito: str
    clave: str
    etiqueta: str
    tipo: str = "text"
    requerido: bool = False
    activo: bool = True
    orden: int = 0


class CampoTipoAplicacionIn(BaseModel):
    ambito: str
    clave: str
    etiqueta: str
    tipo: str = "text"
    requerido: bool = False
    activo: bool = True
    orden: int = 0


_CAMPOS_TIPO_APLICACION_DEFECTO: list[dict] = [
    {"id": 4, "ambito": "Actimist", "clave": "gasto", "etiqueta": "Gasto", "tipo": "number", "requerido": False, "activo": True, "orden": 2},
    {"id": 5, "ambito": "Ecofog", "clave": "gasto", "etiqueta": "Gasto", "tipo": "number", "requerido": False, "activo": True, "orden": 2},
]

# Campos que se sembraron alguna vez y que el sistema ya no usa. Se borran del
# archivo guardado, no solo se ocultan: si solo se ocultaran, seguirían
# apareciendo en cualquier instalación que ya los tenga escritos.
_CAMPOS_TIPO_APLICACION_RETIRADOS = {
    # La dosis pasó a manejarse por analito.
    ("comun", "dosis_aplicada"),
    # Presión Actimist no es un dato que se registre en el proceso.
    ("Actimist", "presion_actimist"),
    # Nunca formó parte del formato oficial de solicitud.
    ("Línea de proceso", "velocidad_linea"),
    # Duplicaba a Tipo de Muestra: ambos respondían qué se aplicó.
    ("Actimist", "aplicacion_en"),
}

_CAMPOS_TIPO_APLICACION_OFICIALES = {
    (c["ambito"], c["clave"]): c for c in _CAMPOS_TIPO_APLICACION_DEFECTO
}


@router.get("/config/campos-tipo-aplicacion")
def listar_campos_tipo_aplicacion(ambito: str | None = None) -> list[CampoTipoAplicacionConfig]:
    guardados = _leer_config("campos_tipo_aplicacion.json", _CAMPOS_TIPO_APLICACION_DEFECTO)
    vigentes = [c for c in guardados if (c.get("ambito"), c.get("clave")) not in _CAMPOS_TIPO_APLICACION_RETIRADOS]
    claves_vigentes = {(c.get("ambito"), c.get("clave")) for c in vigentes}
    for clave, campo in _CAMPOS_TIPO_APLICACION_OFICIALES.items():
        if clave not in claves_vigentes:
            nuevo = campo.copy()
            ids_usados = {int(c.get("id", 0)) for c in vigentes}
            if nuevo["id"] in ids_usados:
                nuevo["id"] = max(ids_usados, default=0) + 1
            vigentes.append(nuevo)
    if vigentes != guardados:
        _escribir_config("campos_tipo_aplicacion.json", vigentes)
        guardados = vigentes

    items = [CampoTipoAplicacionConfig(**c) for c in guardados]
    if ambito:
        items = [c for c in items if c.ambito in ("comun", ambito)]
    return sorted(items, key=lambda c: (c.ambito != "comun", c.orden))


@router.post("/config/campos-tipo-aplicacion", dependencies=_SOLO_ADMIN_CONFIG)
def crear_campo_tipo_aplicacion(body: CampoTipoAplicacionIn) -> CampoTipoAplicacionConfig:
    items = _leer_config("campos_tipo_aplicacion.json", _CAMPOS_TIPO_APLICACION_DEFECTO)
    nuevo = CampoTipoAplicacionConfig(id=_siguiente_id(items), **body.model_dump())
    items.append(nuevo.model_dump())
    _escribir_config("campos_tipo_aplicacion.json", items)
    return nuevo


@router.put("/config/campos-tipo-aplicacion/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)
def editar_campo_tipo_aplicacion(item_id: int, body: CampoTipoAplicacionIn) -> CampoTipoAplicacionConfig:
    items = _leer_config("campos_tipo_aplicacion.json", _CAMPOS_TIPO_APLICACION_DEFECTO)
    idx = next((i for i, it in enumerate(items) if it["id"] == item_id), None)
    if idx is None:
        raise HTTPException(404, "No encontrado.")
    actualizado = CampoTipoAplicacionConfig(id=item_id, **body.model_dump())
    items[idx] = actualizado.model_dump()
    _escribir_config("campos_tipo_aplicacion.json", items)
    return actualizado


@router.delete("/config/campos-tipo-aplicacion/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)
def eliminar_campo_tipo_aplicacion(item_id: int) -> dict[str, str]:
    items = _leer_config("campos_tipo_aplicacion.json", _CAMPOS_TIPO_APLICACION_DEFECTO)
    restantes = [i for i in items if i["id"] != item_id]
    if len(restantes) == len(items):
        raise HTTPException(404, "No encontrado.")
    _escribir_config("campos_tipo_aplicacion.json", restantes)
    return {"estado": "eliminado"}


class AnalitoConfig(BaseModel):
    """Un análisis disponible para un laboratorio. `dosis_aplicable`
    distingue los analitos de cromatografía (QUITECA/AGROFRESH), que
    llevan una dosis aplicada asociada, de los analitos de resultado
    directo (DIAGNOFRUIT/ALS). `categoria` agrupa analitos dentro de un
    laboratorio (ej. "Fungicidas", "Metales"); `tipo_aplicacion` acota el
    analito a un Tipo de Aplicación específico -vacío significa que aplica
    a cualquiera-."""

    id: int
    laboratorio: str
    categoria: str = ""
    codigo: str
    nombre: str
    unidad: str | None = None
    tipo: str = "numero"
    dosis_aplicable: bool = False
    requerido: bool = False
    activo: bool = True
    orden: int = 0
    tipo_aplicacion: str = ""


class AnalitoIn(BaseModel):
    laboratorio: str
    categoria: str = ""
    codigo: str
    nombre: str
    unidad: str | None = None
    tipo: str = "numero"
    dosis_aplicable: bool = False
    requerido: bool = False
    activo: bool = True
    orden: int = 0
    tipo_aplicacion: str = ""


ANALITOS_DEFECTO: list[dict] = [
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
def listar_analitos_config(laboratorio: str | None = None, tipo_aplicacion: str | None = None) -> list[AnalitoConfig]:
    items = [AnalitoConfig(**a) for a in _leer_config("analitos.json", ANALITOS_DEFECTO)]
    if laboratorio:
        items = [a for a in items if a.laboratorio == laboratorio]
    if tipo_aplicacion:
        items = [a for a in items if not a.tipo_aplicacion or a.tipo_aplicacion == tipo_aplicacion]
    return sorted(items, key=lambda a: (a.laboratorio, a.categoria, a.orden))


@router.post("/config/analitos", dependencies=_SOLO_ADMIN_CONFIG)
def crear_analito_config(body: AnalitoIn) -> AnalitoConfig:
    items = _leer_config("analitos.json", ANALITOS_DEFECTO)
    nuevo = AnalitoConfig(id=_siguiente_id(items), **body.model_dump())
    items.append(nuevo.model_dump())
    _escribir_config("analitos.json", items)
    return nuevo


@router.put("/config/analitos/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)
def editar_analito_config(item_id: int, body: AnalitoIn) -> AnalitoConfig:
    items = _leer_config("analitos.json", ANALITOS_DEFECTO)
    idx = next((i for i, it in enumerate(items) if it["id"] == item_id), None)
    if idx is None:
        raise HTTPException(404, "No encontrado.")
    actualizado = AnalitoConfig(id=item_id, **body.model_dump())
    items[idx] = actualizado.model_dump()
    _escribir_config("analitos.json", items)
    return actualizado


@router.delete("/config/analitos/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)
def eliminar_analito_config(item_id: int) -> dict[str, str]:
    items = _leer_config("analitos.json", ANALITOS_DEFECTO)
    restantes = [i for i in items if i["id"] != item_id]
    if len(restantes) == len(items):
        raise HTTPException(404, "No encontrado.")
    _escribir_config("analitos.json", restantes)
    return {"estado": "eliminado"}


# ---------------------------------------------------------------------------
# Mantenedor de Laboratorios: fuente de verdad para la lista visible en el
# selector de la solicitud (activo/inactivo/orden/descripción) y para las
# carpetas de `solicitudes/`. Se pueden crear laboratorios nuevos; como el
# código pasa a ser un nombre de carpeta, se valida contra
# `_PAT_CODIGO_LAB` -mayúsculas, dígitos, guiones- en vez de contra una
# lista cerrada.
# ---------------------------------------------------------------------------


def _validar_codigo_lab(codigo: str) -> None:
    if not _PAT_CODIGO_LAB.match(codigo or ""):
        raise HTTPException(
            400,
            "El código debe tener entre 2 y 31 caracteres, solo mayúsculas, dígitos, guion o guion bajo.",
        )


# El prefijo va pegado al correlativo dentro del folio (OT-AGF0001), así que
# se restringe igual de estricto que el código de laboratorio: nada que
# pueda romper ese formato. Vacío es válido -significa "todavía sin
# configurar", y el folio sale como antes, sin prefijo-.
_PAT_PREFIJO_SOLICITUD = re.compile(r"^[A-Z0-9]{0,8}$")


def _validar_prefijo_solicitud(prefijo: str) -> None:
    if not _PAT_PREFIJO_SOLICITUD.match(prefijo or ""):
        raise HTTPException(
            400,
            "El prefijo de solicitud debe tener hasta 8 caracteres, solo mayúsculas y dígitos.",
        )


class LaboratorioConfig(BaseModel):
    id: int
    codigo: str
    nombre: str
    descripcion: str | None = None
    # Va en cada folio de este laboratorio: OT-{prefijo}{correlativo}, ej.
    # OT-AGF0001. Vacío mientras nadie lo configure -el folio sale como antes-.
    prefijo_solicitud: str = ""
    activo: bool = True
    orden: int = 0
    adjuntos_excel: bool = True
    adjuntos_json: bool = False


class LaboratorioIn(BaseModel):
    codigo: str
    nombre: str
    descripcion: str | None = None
    prefijo_solicitud: str = ""
    activo: bool = True
    orden: int = 0
    adjuntos_excel: bool = True
    adjuntos_json: bool = False


LABORATORIOS_DEFECTO: list[dict] = [
    {"id": 1, "codigo": "QUITECA", "nombre": "Quiteca", "descripcion": None, "prefijo_solicitud": "", "activo": True, "orden": 1, "adjuntos_excel": True, "adjuntos_json": False},
    {"id": 2, "codigo": "AGROFRESH", "nombre": "AgroFresh", "descripcion": None, "prefijo_solicitud": "", "activo": True, "orden": 2, "adjuntos_excel": True, "adjuntos_json": False},
    {"id": 3, "codigo": "ALS", "nombre": "ALS", "descripcion": None, "prefijo_solicitud": "", "activo": True, "orden": 3, "adjuntos_excel": True, "adjuntos_json": False},
    {"id": 4, "codigo": "DIAGNOFRUIT", "nombre": "Diagnofruit", "descripcion": None, "prefijo_solicitud": "", "activo": True, "orden": 4, "adjuntos_excel": True, "adjuntos_json": False},
]


@router.get("/config/laboratorios")
def listar_laboratorios_config() -> list[LaboratorioConfig]:
    items = [LaboratorioConfig(**l) for l in _leer_config("laboratorios.json", LABORATORIOS_DEFECTO)]
    return sorted(items, key=lambda l: l.orden)


def _validar_prefijo_unico(items: list[dict], prefijo: str, item_id: int | None) -> None:
    """Dos laboratorios con el mismo prefijo generarían folios idénticos
    -cada uno numera aparte, así que "AGF" en dos laboratorios repetiría
    OT-AGF0001 en ambos-. Vacío no se valida: puede haber varios laboratorios
    todavía sin prefijo configurado."""
    if not prefijo:
        return
    if any(
        (l.get("prefijo_solicitud") or "").strip().upper() == prefijo and l["id"] != item_id
        for l in items
    ):
        raise HTTPException(400, f'Ya hay otro laboratorio usando el prefijo "{prefijo}".')


@router.post("/config/laboratorios", dependencies=_SOLO_ADMIN_CONFIG)
def crear_laboratorio_config(body: LaboratorioIn) -> LaboratorioConfig:
    _validar_codigo_lab(body.codigo)
    _validar_prefijo_solicitud(body.prefijo_solicitud)
    items = _leer_config("laboratorios.json", LABORATORIOS_DEFECTO)
    if any(l["codigo"] == body.codigo for l in items):
        raise HTTPException(400, f"Ya existe un laboratorio con el código {body.codigo}.")
    _validar_prefijo_unico(items, body.prefijo_solicitud.strip().upper(), None)
    nuevo = LaboratorioConfig(id=_siguiente_id(items), **body.model_dump())
    items.append(nuevo.model_dump())
    _escribir_config("laboratorios.json", items)
    return nuevo


@router.put("/config/laboratorios/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)
def editar_laboratorio_config(item_id: int, body: LaboratorioIn) -> LaboratorioConfig:
    _validar_codigo_lab(body.codigo)
    _validar_prefijo_solicitud(body.prefijo_solicitud)
    items = _leer_config("laboratorios.json", LABORATORIOS_DEFECTO)
    idx = next((i for i, it in enumerate(items) if it["id"] == item_id), None)
    if idx is None:
        raise HTTPException(404, "No encontrado.")
    if any(l["codigo"] == body.codigo and l["id"] != item_id for l in items):
        raise HTTPException(400, f"Ya existe otro laboratorio con el código {body.codigo}.")
    _validar_prefijo_unico(items, body.prefijo_solicitud.strip().upper(), item_id)
    actualizado = LaboratorioConfig(id=item_id, **body.model_dump())
    items[idx] = actualizado.model_dump()
    _escribir_config("laboratorios.json", items)
    return actualizado


@router.delete("/config/laboratorios/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)
def eliminar_laboratorio_config(item_id: int) -> dict[str, str]:
    items = _leer_config("laboratorios.json", LABORATORIOS_DEFECTO)
    restantes = [i for i in items if i["id"] != item_id]
    if len(restantes) == len(items):
        raise HTTPException(404, "No encontrado.")
    _escribir_config("laboratorios.json", restantes)
    return {"estado": "eliminado"}


# ---------------------------------------------------------------------------
# Mantenedor de Categorías analíticas: agrupan los analitos de un
# laboratorio (ej. AGROFRESH → "Fungicidas") para presentarlos ordenados en
# la sección Analitos del formulario y en el mantenedor de Analitos.
# ---------------------------------------------------------------------------


class CategoriaAnaliticaConfig(BaseModel):
    id: int
    laboratorio: str
    nombre: str
    activo: bool = True
    orden: int = 0


class CategoriaAnaliticaIn(BaseModel):
    laboratorio: str
    nombre: str
    activo: bool = True
    orden: int = 0


_CATEGORIAS_ANALITICAS_DEFECTO: list[dict] = [
    {"id": 1, "laboratorio": "QUITECA", "nombre": "Fungicidas", "activo": True, "orden": 1},
    {"id": 2, "laboratorio": "AGROFRESH", "nombre": "Fungicidas", "activo": True, "orden": 1},
    {"id": 3, "laboratorio": "DIAGNOFRUIT", "nombre": "Cuantificación de patógenos", "activo": True, "orden": 1},
    {"id": 4, "laboratorio": "ALS", "nombre": "Microbiología y metales", "activo": True, "orden": 1},
]


@router.get("/config/categorias-analiticas")
def listar_categorias_analiticas(laboratorio: str | None = None) -> list[CategoriaAnaliticaConfig]:
    items = [CategoriaAnaliticaConfig(**c) for c in _leer_config("categorias_analiticas.json", _CATEGORIAS_ANALITICAS_DEFECTO)]
    if laboratorio:
        items = [c for c in items if c.laboratorio == laboratorio]
    return sorted(items, key=lambda c: (c.laboratorio, c.orden))


@router.post("/config/categorias-analiticas", dependencies=_SOLO_ADMIN_CONFIG)
def crear_categoria_analitica(body: CategoriaAnaliticaIn) -> CategoriaAnaliticaConfig:
    items = _leer_config("categorias_analiticas.json", _CATEGORIAS_ANALITICAS_DEFECTO)
    nuevo = CategoriaAnaliticaConfig(id=_siguiente_id(items), **body.model_dump())
    items.append(nuevo.model_dump())
    _escribir_config("categorias_analiticas.json", items)
    return nuevo


@router.put("/config/categorias-analiticas/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)
def editar_categoria_analitica(item_id: int, body: CategoriaAnaliticaIn) -> CategoriaAnaliticaConfig:
    items = _leer_config("categorias_analiticas.json", _CATEGORIAS_ANALITICAS_DEFECTO)
    idx = next((i for i, it in enumerate(items) if it["id"] == item_id), None)
    if idx is None:
        raise HTTPException(404, "No encontrado.")
    actualizado = CategoriaAnaliticaConfig(id=item_id, **body.model_dump())
    items[idx] = actualizado.model_dump()
    _escribir_config("categorias_analiticas.json", items)
    return actualizado


@router.delete("/config/categorias-analiticas/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)
def eliminar_categoria_analitica(item_id: int) -> dict[str, str]:
    items = _leer_config("categorias_analiticas.json", _CATEGORIAS_ANALITICAS_DEFECTO)
    restantes = [i for i in items if i["id"] != item_id]
    if len(restantes) == len(items):
        raise HTTPException(404, "No encontrado.")
    _escribir_config("categorias_analiticas.json", restantes)
    return {"estado": "eliminado"}


# ---------------------------------------------------------------------------
# Mantenedor de Productos: qué "Producto Utilizado" está disponible según el
# Laboratorio + Tipo de Aplicación elegidos en la solicitud.
# ---------------------------------------------------------------------------


class ProductoConfig(BaseModel):
    id: int
    nombre: str
    codigo: str | None = None
    laboratorio: str
    tipo_aplicacion: str = ""
    activo: bool = True
    orden: int = 0


class ProductoIn(BaseModel):
    nombre: str
    codigo: str | None = None
    laboratorio: str
    tipo_aplicacion: str = ""
    activo: bool = True
    orden: int = 0


_PRODUCTOS_DEFECTO: list[dict] = []


@router.get("/config/productos")
def listar_productos_config(laboratorio: str | None = None, tipo_aplicacion: str | None = None) -> list[ProductoConfig]:
    items = [ProductoConfig(**p) for p in _leer_config("productos.json", _PRODUCTOS_DEFECTO)]
    if laboratorio:
        items = [p for p in items if p.laboratorio == laboratorio]
    if tipo_aplicacion:
        items = [p for p in items if not p.tipo_aplicacion or p.tipo_aplicacion == tipo_aplicacion]
    return sorted(items, key=lambda p: (p.laboratorio, p.orden))


@router.post("/config/productos", dependencies=_SOLO_ADMIN_CONFIG)
def crear_producto_config(body: ProductoIn) -> ProductoConfig:
    items = _leer_config("productos.json", _PRODUCTOS_DEFECTO)
    nuevo = ProductoConfig(id=_siguiente_id(items), **body.model_dump())
    items.append(nuevo.model_dump())
    _escribir_config("productos.json", items)
    return nuevo


@router.put("/config/productos/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)
def editar_producto_config(item_id: int, body: ProductoIn) -> ProductoConfig:
    items = _leer_config("productos.json", _PRODUCTOS_DEFECTO)
    idx = next((i for i, it in enumerate(items) if it["id"] == item_id), None)
    if idx is None:
        raise HTTPException(404, "No encontrado.")
    actualizado = ProductoConfig(id=item_id, **body.model_dump())
    items[idx] = actualizado.model_dump()
    _escribir_config("productos.json", items)
    return actualizado


@router.delete("/config/productos/{item_id}", dependencies=_SOLO_ADMIN_CONFIG)
def eliminar_producto_config(item_id: int) -> dict[str, str]:
    items = _leer_config("productos.json", _PRODUCTOS_DEFECTO)
    restantes = [i for i in items if i["id"] != item_id]
    if len(restantes) == len(items):
        raise HTTPException(404, "No encontrado.")
    _escribir_config("productos.json", restantes)
    return {"estado": "eliminado"}
