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
import os
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from . import config, config_store, correo, indice_solicitudes, mail_templates, r2
from .auth import Usuario, usuario_actual
from .db import conexion, cursor_dict
from .solicitud_excel import construir_workbook, construir_workbook_exportacion, leer_datos_workbook
from .toma_muestras_pdf import generar_pdf_solicitud

router = APIRouter(prefix="/api/toma-muestras", tags=["toma-muestras"])

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


# ---------------------------------------------------------------------------
# Claves R2: mirror de la estructura local de carpetas.
#
# Las solicitudes nuevas se guardan agrupadas por cliente y día:
#
#     solicitudes/<SOLD TO>/<AAAA-MM-DD>/<OT-NNNN>.xlsx
#
# El layout viejo, `solicitudes/<LABORATORIO>/<SOL-NNNN>.xlsx`, se sigue
# leyendo tal cual: las dos formas cuelgan de `solicitudes/`, así que buscar
# por el nombre del archivo bajo ese prefijo encuentra las dos y no hace falta
# mover nada de lo ya guardado.
# ---------------------------------------------------------------------------

# Un Sold To es texto libre escrito por una persona y termina siendo un nombre
# de carpeta: se limpia todo lo que pueda romper una ruta o salirse de ella.
_PAT_SEGMENTO_INVALIDO = re.compile(r'[\\/:*?"<>|]+')


def carpeta_de_cliente(sold_to: str | None) -> str:
    """Nombre de carpeta para un Sold To. Los que vengan vacíos caen en
    SIN_CLIENTE en vez de crear una carpeta con nombre vacío."""
    limpio = _PAT_SEGMENTO_INVALIDO.sub("_", (sold_to or "").strip())
    limpio = limpio.strip(". ").replace("..", "_")
    return limpio or "SIN_CLIENTE"


def _r2_key_sol_nueva(sold_to: str | None, fecha: str, nombre: str) -> str:
    return f"solicitudes/{carpeta_de_cliente(sold_to)}/{fecha}/{nombre}"


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


def _siguiente_numero() -> str:
    """Folio correlativo, único sobre todas las solicitudes guardadas.

    Lo entrega una SEQUENCE de Postgres. Antes se calculaba listando los
    archivos y sumando uno al mayor: dos personas creando una solicitud en el
    mismo momento leían el mismo máximo y recibían EL MISMO FOLIO. Una
    secuencia no puede entregar dos veces el mismo número.

    Mientras el índice esté vacío -o sea, mientras no se haya corrido
    `scripts/indexar_solicitudes.py`- se sigue contando sobre los archivos.
    Sin eso, un sistema actualizado a medias repartiría folios desde OT-0001
    y pisaría las solicitudes que ya existen.
    """
    if not indice_solicitudes.esta_poblado():
        return f"{PREFIJO_FOLIO}-{_mayor_folio_en_archivos() + 1:04d}"

    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT nextval('folio_solicitud') AS n")
        numero = cur.fetchone()["n"]
        # Red de seguridad: si la secuencia quedara atrasada respecto de lo ya
        # indexado -alguien la reinició a mano, se restauró un respaldo viejo-
        # se la adelanta al máximo real en vez de entregar un folio usado.
        cur.execute(
            "SELECT max(substring(numero_solicitud from '[0-9]+$')::bigint) AS tope"
            " FROM solicitud_archivo WHERE numero_solicitud ~ '[0-9]+$'"
        )
        tope = cur.fetchone()["tope"] or 0
        if numero <= tope:
            cur.execute("SELECT setval('folio_solicitud', %s) + 1 AS n", (tope,))
            numero = cur.fetchone()["n"]
        return f"{PREFIJO_FOLIO}-{numero:04d}"


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
    # Códigos de los analitos marcados como solicitados (ej. ["FDL", "PYR"]),
    # aparte de `campos_laboratorio` -permite identificar qué se pidió de
    # forma estructural (para cruzar con resultados de cromatografía) sin
    # tener que parsear las etiquetas humanas de `campos_laboratorio`.
    analitos_solicitados: list[str] = []


class Solicitud(SolicitudIn):
    archivo: str
    numero_solicitud: str
    fecha_solicitud: str
    creado_en: str
    # Con qué muestra física quedó cruzada. Es el mismo código que después
    # trae el archivo del GC, así que al subir los resultados cada vial
    # encuentra su solicitud sin volver a emparejar nada.
    codigo_muestra: str | None = None


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
    for nombre, datos in leer_todas_las_solicitudes():
        if not _es_propia(usuario, datos):
            continue
        try:
            solicitudes.append(Solicitud(archivo=nombre, **datos))
        except (ValueError, KeyError):
            continue
    solicitudes.sort(key=lambda s: s.creado_en, reverse=True)
    return solicitudes


@router.post("/solicitudes/organizar-r2")
def organizar_solicitudes_r2() -> dict[str, int]:
    """Migra solicitudes del layout antiguo por laboratorio al layout
    cliente/fecha. Copia y verifica el destino antes de borrar el original;
    por eso es seguro repetir la operación."""
    if not r2.disponible():
        raise HTTPException(503, "R2 no está configurado en este servidor.")

    movidas = 0
    omitidas = 0
    for key in r2.listar_keys("solicitudes/"):
        partes = key.split("/")
        if len(partes) != 3 or partes[1] == _CARPETA_CONFIG:
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
            destino = _r2_key_sol_nueva(datos.get("sold_to"), datos.get("fecha_solicitud") or "SIN_FECHA", nombre)
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
def exportar_todas_las_solicitudes(archivo: list[str] | None = None) -> StreamingResponse:
    """Un único Excel "ancho" (una fila por solicitud) con toda la
    información general + de muestra + una columna por cada analito activo
    configurado -refleja la configuración vigente, no una plantilla fija."""
    seleccion = set(archivo or [])
    solicitudes_dict = [
        datos for nombre, datos in leer_todas_las_solicitudes()
        if not seleccion or nombre in seleccion
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


@router.post("/solicitudes")
def crear_solicitud(body: SolicitudIn, usuario: Usuario = Depends(usuario_actual)) -> Solicitud:
    numero = _siguiente_numero()
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
    )
    nombre_archivo = f"{numero}.xlsx"
    fecha = datos["fecha_solicitud"]
    analitos_config = _leer_config("analitos.json", ANALITOS_DEFECTO)
    wb = construir_workbook(datos, analitos_config)
    r2_key = None
    if r2.disponible():
        buf = io.BytesIO()
        wb.save(buf)
        r2_key = _r2_key_sol_nueva(body.sold_to, fecha, nombre_archivo)
        r2.subir(
            r2_key,
            buf.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    else:
        # El laboratorio se valida igual aunque ya no dé el nombre de la
        # carpeta: sigue siendo un campo con lista cerrada.
        _carpeta_laboratorio(body.laboratorio)
        carpeta = os.path.join(_carpeta_raiz(), carpeta_de_cliente(body.sold_to), fecha)
        os.makedirs(carpeta, exist_ok=True)
        wb.save(os.path.join(carpeta, nombre_archivo))

    # Al índice DESPUÉS de que el archivo quedó guardado: si se anotara antes
    # y la subida fallara, el listado mostraría una solicitud cuyo Excel no
    # existe. Al revés es recuperable — un archivo sin indexar se arregla
    # volviendo a correr scripts/indexar_solicitudes.py.
    indice_solicitudes.anotar(nombre_archivo, datos, r2_key)
    return Solicitud(archivo=nombre_archivo, **datos)


@router.put("/solicitudes/{archivo}/muestra", response_model=Solicitud)
def cruzar_con_muestra(archivo: str, body: CruceIn) -> Any:
    """Cruza una solicitud con el número de la muestra que llegó al laboratorio.

    Se hace al recibir la muestra, no al procesar los resultados: entre una
    cosa y otra corre el GC y pasa la noche.
    """
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


@router.delete("/solicitudes/{archivo}")
def eliminar_solicitud(archivo: str) -> dict[str, str]:
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
    return {"estado": "eliminado"}


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
    datos_pdf = _datos_pdf_con_destinatarios_resultados(datos)
    pdf_bytes = generar_pdf_solicitud(datos_pdf, analitos_config)
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


def contactos_de_solicitud(laboratorio: str) -> list[str]:
    """Correos activos que reciben las solicitudes de análisis de este
    laboratorio, según el mantenedor de Laboratorios."""
    contactos = _leer_config("contactos_laboratorio.json", [])
    return [
        c["email"]
        for c in sorted(contactos, key=lambda c: c.get("orden", 0))
        if c.get("laboratorio") == laboratorio
        and c.get("tipo") == "solicitud"
        and c.get("activo", True)
        and c.get("email")
    ]


def _contactos_resultado_del_ship_to(laboratorio: str, ship_to: str) -> list[dict]:
    """Los contactos de resultado (cliente + interno) de un Ship To puntual.

    Cada Ship To tiene su propia configuración (ver Laboratorios → Resultado
    a clientes). Si ese Ship To todavía no tiene nada configurado, se cae a
    los contactos "globales" -los que no tienen Ship To asignado-, que son la
    configuración previa a este cambio: así ninguna cuenta ya cargada quedó
    huérfana al pasar la configuración a ser por Ship To.
    """
    contactos = _leer_config("contactos_laboratorio.json", [])
    del_lab = [
        c for c in contactos
        if c.get("laboratorio") == laboratorio and c.get("tipo") in {"resultado_cliente", "resultado_interno"}
    ]
    ship_to_norm = (ship_to or "").strip()
    especificos = [c for c in del_lab if (c.get("ship_to") or "").strip() == ship_to_norm]
    if ship_to_norm and especificos:
        return especificos
    return [c for c in del_lab if not (c.get("ship_to") or "").strip()]


def contactos_de_resultados(laboratorio: str, ship_to: str | None = None) -> list[str]:
    """Correos activos que el laboratorio debe usar al entregar resultados de
    este Ship To (destinatarios del cliente + copias internas AgroFresh).

    Esta lista es informativa en el PDF y no dispara ningún envío.
    """
    correos: list[str] = []
    vistos: set[str] = set()
    for contacto in sorted(_contactos_resultado_del_ship_to(laboratorio, ship_to or ""), key=lambda c: c.get("orden", 0)):
        email = str(contacto.get("email") or "").strip()
        clave = email.casefold()
        if contacto.get("activo", True) and email and clave not in vistos:
            correos.append(email)
            vistos.add(clave)
    return correos


def destinatarios_resultado_por_tipo(laboratorio: str, ship_to: str | None = None) -> dict[str, list[str]]:
    """Los correos de resultado de un Ship To, separados en `to`/`cc`/`bcc`.

    `resultado_cliente` siempre va en `to`. `resultado_interno` va en `cc` o
    en `bcc` según lo que se haya elegido para ese contacto -es la pieza que
    permite que una copia interna salga oculta y otra no-.
    """
    salida: dict[str, list[str]] = {"to": [], "cc": [], "bcc": []}
    vistos: set[str] = set()
    for contacto in sorted(_contactos_resultado_del_ship_to(laboratorio, ship_to or ""), key=lambda c: c.get("orden", 0)):
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
    return salida


class ContactoResultadoOut(BaseModel):
    """Un destinatario de resultados, tal como quedó configurado en
    Laboratorios → Resultado a clientes -de solo lectura: Nueva solicitud lo
    muestra, no lo edita-."""

    nombre: str
    email: str
    tipo: str  # resultado_cliente | resultado_interno
    tipo_copia: str  # cc | bcc -solo tiene sentido si tipo es resultado_interno


@router.get("/config/resultados-ship-to")
def resultados_de_ship_to(laboratorio: str, ship_to: str = "") -> list[ContactoResultadoOut]:
    """La configuración de "Resultado a clientes" vigente para un Ship To de
    ese laboratorio. La usa Nueva solicitud para mostrarla, de solo lectura,
    apenas se elige un Sold To/Ship To que ya la tiene configurada -sin que
    nadie tenga que ir a Laboratorios a revisarla a mano."""
    contactos = _contactos_resultado_del_ship_to(laboratorio, ship_to)
    return [
        ContactoResultadoOut(
            nombre=str(c.get("nombre") or ""),
            email=str(c.get("email") or ""),
            tipo=str(c.get("tipo") or ""),
            tipo_copia=str(c.get("tipo_copia") or "cc"),
        )
        for c in sorted(contactos, key=lambda c: c.get("orden", 0))
        if c.get("activo", True) and c.get("email")
    ]


def _datos_pdf_con_destinatarios_resultados(datos: dict) -> dict:
    """Añade al PDF la configuración vigente sin modificar la solicitud."""
    datos_pdf = dict(datos)
    datos_pdf["destinatarios_resultados"] = contactos_de_resultados(
        str(datos.get("laboratorio") or ""), str(datos.get("ship_to") or "")
    )
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
    return {"laboratorio": laboratorio, "destinatarios": contactos_de_solicitud(laboratorio)}


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

    analitos_config = _leer_config("analitos.json", ANALITOS_DEFECTO)
    datos_pdf = _datos_pdf_con_destinatarios_resultados(datos)
    pdf_bytes = generar_pdf_solicitud(datos_pdf, analitos_config)

    wb = construir_workbook(datos, analitos_config)
    buf_excel = io.BytesIO()
    wb.save(buf_excel)
    excel_bytes = buf_excel.getvalue()

    lab = datos.get("laboratorio", "")
    solicitante = datos.get("solicitante", "")
    sold_to = datos.get("sold_to", "")
    fecha = datos.get("fecha_solicitud", "")

    # Siempre parten los contactos configurados. Los invitados escritos en el
    # cuadro de envío se agregan sólo a este correo y no alteran el mantenedor.
    candidatos = contactos_de_solicitud(lab)
    if body.destinatario and body.destinatario.strip():
        candidatos.append(body.destinatario.strip())
    candidatos.extend(body.destinatarios_adicionales)
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

    asunto, texto, html = mail_templates.renderizar(lab, datos)

    adjuntos = [
        correo.Adjunto(f"{numero}.pdf", pdf_bytes, "application/pdf"),
        correo.Adjunto(
            f"{numero}.xlsx",
            excel_bytes,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
    ]

    # El muestreador que creó la solicitud SIEMPRE recibe una copia oculta de
    # su propio envío -es el correo guardado en la solicitud (forzado por el
    # backend al crearla, ver crear_solicitud), no el de quien aprieta
    # "enviar" ahora-, aparte de los destinatarios normales de arriba y sin
    # reemplazarlos. Si esa misma dirección ya está en los destinatarios
    # normales, no se repite en BCC: recibiría el correo dos veces por nada.
    email_muestreador = _normalizar_correo(datos.get("email_solicitante"))
    bcc = [email_muestreador] if email_muestreador and email_muestreador not in vistos else []

    correo.enviar(", ".join(destinatarios), asunto, html, texto, adjuntos, bcc=bcc)
    return {"ok": f"Solicitud {numero} enviada a {', '.join(destinatarios)}."}


# ---------------------------------------------------------------------------
# Configuración (mantenedores): igual que las solicitudes, se guarda como
# JSON en disco (no hay tabla en base de datos) dentro de
# "solicitudes/_config/". El objetivo es que el administrador pueda
# activar/desactivar y marcar requerido/opcional los campos generales, y
# mantener las listas de tipos de aplicación, líneas de proceso y analitos
# por laboratorio, sin tocar código fuente.
# ---------------------------------------------------------------------------



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
    # CSG y Posición Muestreo son obligatorios solo en un Tipo de Aplicación
    # (Línea de proceso y Actimist respectivamente). Ese matiz no cabe en el
    # mantenedor, que solo tiene un sí/no: la regla vive en el formulario
    # (`REQUERIDO_SOLO_EN` en NuevaSolicitudView) y acá quedan en False para
    # que el mantenedor no prometa una obligatoriedad que no aplica siempre.
    {"clave": "csg", "etiqueta": "CSG (Código Productor)", "tipo": "text", "requerido": False, "activo": True, "orden": 11},
    {"clave": "lote", "etiqueta": "Lote", "tipo": "text", "requerido": False, "activo": True, "orden": 12},
    {"clave": "kilos_procesados", "etiqueta": "Kilos Procesados (KG)", "tipo": "number", "requerido": False, "activo": True, "orden": 13},
    {"clave": "posicion_muestreo", "etiqueta": "Posición Muestreo", "tipo": "text", "requerido": False, "activo": True, "orden": 14},
    {"clave": "producto_utilizado", "etiqueta": "Producto Utilizado", "tipo": "select", "requerido": False, "activo": True, "orden": 15},
    {"clave": "tipo_muestra", "etiqueta": "Tipo Muestra", "tipo": "select", "requerido": True, "activo": True, "orden": 16},
    {"clave": "fecha_muestreo", "etiqueta": "Fecha Muestreo", "tipo": "date", "requerido": True, "activo": True, "orden": 17},
    {"clave": "hora_muestreo", "etiqueta": "Hora Muestreo", "tipo": "time", "requerido": False, "activo": True, "orden": 18},
    {"clave": "nombre_muestreador", "etiqueta": "Nombre Muestreador", "tipo": "text", "requerido": True, "activo": True, "orden": 19},
    {"clave": "email_laboratorio", "etiqueta": "Email Laboratorio", "tipo": "email", "requerido": False, "activo": True, "orden": 20},
    {"clave": "observacion", "etiqueta": "Observación", "tipo": "textarea", "requerido": False, "activo": True, "orden": 21},
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


_siguiente_id = config_store.siguiente_id


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
    {"id": 1, "nombre": "Actimist", "activo": True, "orden": 1},
    {"id": 2, "nombre": "Línea de proceso", "activo": True, "orden": 2},
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


@router.post("/config/campos-tipo-aplicacion")
def crear_campo_tipo_aplicacion(body: CampoTipoAplicacionIn) -> CampoTipoAplicacionConfig:
    items = _leer_config("campos_tipo_aplicacion.json", _CAMPOS_TIPO_APLICACION_DEFECTO)
    nuevo = CampoTipoAplicacionConfig(id=_siguiente_id(items), **body.model_dump())
    items.append(nuevo.model_dump())
    _escribir_config("campos_tipo_aplicacion.json", items)
    return nuevo


@router.put("/config/campos-tipo-aplicacion/{item_id}")
def editar_campo_tipo_aplicacion(item_id: int, body: CampoTipoAplicacionIn) -> CampoTipoAplicacionConfig:
    items = _leer_config("campos_tipo_aplicacion.json", _CAMPOS_TIPO_APLICACION_DEFECTO)
    idx = next((i for i, it in enumerate(items) if it["id"] == item_id), None)
    if idx is None:
        raise HTTPException(404, "No encontrado.")
    actualizado = CampoTipoAplicacionConfig(id=item_id, **body.model_dump())
    items[idx] = actualizado.model_dump()
    _escribir_config("campos_tipo_aplicacion.json", items)
    return actualizado


@router.delete("/config/campos-tipo-aplicacion/{item_id}")
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


@router.post("/config/analitos")
def crear_analito_config(body: AnalitoIn) -> AnalitoConfig:
    items = _leer_config("analitos.json", ANALITOS_DEFECTO)
    nuevo = AnalitoConfig(id=_siguiente_id(items), **body.model_dump())
    items.append(nuevo.model_dump())
    _escribir_config("analitos.json", items)
    return nuevo


@router.put("/config/analitos/{item_id}")
def editar_analito_config(item_id: int, body: AnalitoIn) -> AnalitoConfig:
    items = _leer_config("analitos.json", ANALITOS_DEFECTO)
    idx = next((i for i, it in enumerate(items) if it["id"] == item_id), None)
    if idx is None:
        raise HTTPException(404, "No encontrado.")
    actualizado = AnalitoConfig(id=item_id, **body.model_dump())
    items[idx] = actualizado.model_dump()
    _escribir_config("analitos.json", items)
    return actualizado


@router.delete("/config/analitos/{item_id}")
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


class LaboratorioConfig(BaseModel):
    id: int
    codigo: str
    nombre: str
    descripcion: str | None = None
    activo: bool = True
    orden: int = 0


class LaboratorioIn(BaseModel):
    codigo: str
    nombre: str
    descripcion: str | None = None
    activo: bool = True
    orden: int = 0


LABORATORIOS_DEFECTO: list[dict] = [
    {"id": 1, "codigo": "QUITECA", "nombre": "Quiteca", "descripcion": None, "activo": True, "orden": 1},
    {"id": 2, "codigo": "AGROFRESH", "nombre": "AgroFresh", "descripcion": None, "activo": True, "orden": 2},
    {"id": 3, "codigo": "ALS", "nombre": "ALS", "descripcion": None, "activo": True, "orden": 3},
    {"id": 4, "codigo": "DIAGNOFRUIT", "nombre": "Diagnofruit", "descripcion": None, "activo": True, "orden": 4},
]


@router.get("/config/laboratorios")
def listar_laboratorios_config() -> list[LaboratorioConfig]:
    items = [LaboratorioConfig(**l) for l in _leer_config("laboratorios.json", LABORATORIOS_DEFECTO)]
    return sorted(items, key=lambda l: l.orden)


@router.post("/config/laboratorios")
def crear_laboratorio_config(body: LaboratorioIn) -> LaboratorioConfig:
    _validar_codigo_lab(body.codigo)
    items = _leer_config("laboratorios.json", LABORATORIOS_DEFECTO)
    if any(l["codigo"] == body.codigo for l in items):
        raise HTTPException(400, f"Ya existe un laboratorio con el código {body.codigo}.")
    nuevo = LaboratorioConfig(id=_siguiente_id(items), **body.model_dump())
    items.append(nuevo.model_dump())
    _escribir_config("laboratorios.json", items)
    return nuevo


@router.put("/config/laboratorios/{item_id}")
def editar_laboratorio_config(item_id: int, body: LaboratorioIn) -> LaboratorioConfig:
    _validar_codigo_lab(body.codigo)
    items = _leer_config("laboratorios.json", LABORATORIOS_DEFECTO)
    idx = next((i for i, it in enumerate(items) if it["id"] == item_id), None)
    if idx is None:
        raise HTTPException(404, "No encontrado.")
    if any(l["codigo"] == body.codigo and l["id"] != item_id for l in items):
        raise HTTPException(400, f"Ya existe otro laboratorio con el código {body.codigo}.")
    actualizado = LaboratorioConfig(id=item_id, **body.model_dump())
    items[idx] = actualizado.model_dump()
    _escribir_config("laboratorios.json", items)
    return actualizado


@router.delete("/config/laboratorios/{item_id}")
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


@router.post("/config/categorias-analiticas")
def crear_categoria_analitica(body: CategoriaAnaliticaIn) -> CategoriaAnaliticaConfig:
    items = _leer_config("categorias_analiticas.json", _CATEGORIAS_ANALITICAS_DEFECTO)
    nuevo = CategoriaAnaliticaConfig(id=_siguiente_id(items), **body.model_dump())
    items.append(nuevo.model_dump())
    _escribir_config("categorias_analiticas.json", items)
    return nuevo


@router.put("/config/categorias-analiticas/{item_id}")
def editar_categoria_analitica(item_id: int, body: CategoriaAnaliticaIn) -> CategoriaAnaliticaConfig:
    items = _leer_config("categorias_analiticas.json", _CATEGORIAS_ANALITICAS_DEFECTO)
    idx = next((i for i, it in enumerate(items) if it["id"] == item_id), None)
    if idx is None:
        raise HTTPException(404, "No encontrado.")
    actualizado = CategoriaAnaliticaConfig(id=item_id, **body.model_dump())
    items[idx] = actualizado.model_dump()
    _escribir_config("categorias_analiticas.json", items)
    return actualizado


@router.delete("/config/categorias-analiticas/{item_id}")
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


@router.post("/config/productos")
def crear_producto_config(body: ProductoIn) -> ProductoConfig:
    items = _leer_config("productos.json", _PRODUCTOS_DEFECTO)
    nuevo = ProductoConfig(id=_siguiente_id(items), **body.model_dump())
    items.append(nuevo.model_dump())
    _escribir_config("productos.json", items)
    return nuevo


@router.put("/config/productos/{item_id}")
def editar_producto_config(item_id: int, body: ProductoIn) -> ProductoConfig:
    items = _leer_config("productos.json", _PRODUCTOS_DEFECTO)
    idx = next((i for i, it in enumerate(items) if it["id"] == item_id), None)
    if idx is None:
        raise HTTPException(404, "No encontrado.")
    actualizado = ProductoConfig(id=item_id, **body.model_dump())
    items[idx] = actualizado.model_dump()
    _escribir_config("productos.json", items)
    return actualizado


@router.delete("/config/productos/{item_id}")
def eliminar_producto_config(item_id: int) -> dict[str, str]:
    items = _leer_config("productos.json", _PRODUCTOS_DEFECTO)
    restantes = [i for i in items if i["id"] != item_id]
    if len(restantes) == len(items):
        raise HTTPException(404, "No encontrado.")
    _escribir_config("productos.json", restantes)
    return {"estado": "eliminado"}
