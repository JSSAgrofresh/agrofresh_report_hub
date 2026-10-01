import os
import re
import shutil
from datetime import datetime, timezone

import psycopg2.errors

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import config
from . import storage_permisos as permisos
from . import storage_r2 as sr2
from .auth import Usuario, solo_admin_general, solo_escribiente, usuario_actual
from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/storage", tags=["storage"])

_NOMBRE_INVALIDO = re.compile(r'[\\/:*?"<>|]')


def _carpeta_raiz() -> str:
    os.makedirs(config.STORAGE_DIR, exist_ok=True)
    return os.path.normpath(config.STORAGE_DIR)


def _nombre_seguro(nombre: str) -> str:
    """Solo el nombre, sin ruta ni caracteres que Windows rechace."""
    base = os.path.basename(nombre).strip()
    base = _NOMBRE_INVALIDO.sub("_", base)
    if not base or base in (".", ".."):
        raise HTTPException(400, "Nombre inválido.")
    return base


def _segmentos(ruta: str) -> list[str]:
    partes = [p for p in ruta.replace("\\", "/").split("/") if p not in ("", ".")]
    if any(p == ".." for p in partes):
        raise HTTPException(400, "Ruta inválida.")
    return [_nombre_seguro(p) for p in partes]


def _resolver(ruta: str) -> str:
    """Ruta relativa (con "/" como separador) -> ruta absoluta dentro de Storage.
    Nunca deja salir de la carpeta raíz, así una ruta con ".." o similar no
    puede escribir/leer/borrar fuera de Storage."""
    raiz = _carpeta_raiz()
    absoluto = os.path.normpath(os.path.join(raiz, *_segmentos(ruta)))
    if absoluto != raiz and not absoluto.startswith(raiz + os.sep):
        raise HTTPException(400, "Ruta inválida.")
    return absoluto


def _ruta_relativa(raiz: str, absoluto: str) -> str:
    return os.path.relpath(absoluto, raiz).replace(os.sep, "/")


def _nombre_disponible(carpeta: str, nombre: str) -> str:
    """Si el nombre ya existe (archivo o carpeta), agrega " (2)", " (3)", etc."""
    ruta = os.path.join(carpeta, nombre)
    if not os.path.exists(ruta):
        return nombre
    raiz, ext = os.path.splitext(nombre)
    n = 2
    while os.path.exists(os.path.join(carpeta, f"{raiz} ({n}){ext}")):
        n += 1
    return f"{raiz} ({n}){ext}"


def _info(raiz: str, absoluto: str) -> "EntradaStorage":
    stat = os.stat(absoluto)
    return EntradaStorage(
        nombre=os.path.basename(absoluto),
        ruta=_ruta_relativa(raiz, absoluto),
        tipo="carpeta" if os.path.isdir(absoluto) else "archivo",
        tamano_bytes=None if os.path.isdir(absoluto) else stat.st_size,
        modificado=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
    )


class EntradaStorage(BaseModel):
    nombre: str
    ruta: str
    tipo: str
    tamano_bytes: int | None
    modificado: str
    # La carpeta tiene su propia regla de acceso (ver storage_permisos.py).
    restringida: bool = False
    # Cuántas cuentas la ven. Solo se informa a quien administra los permisos.
    n_usuarios: int | None = None


def _visibles(
    entradas: list[EntradaStorage], reglas: permisos.Reglas, usuario: Usuario
) -> list[EntradaStorage]:
    """Deja solo lo que `usuario` puede ver y marca las carpetas con regla propia."""
    admin = usuario.tipoAcceso == "admin_general"
    salida = []
    for e in entradas:
        if not permisos.puede_ver(reglas, e.ruta, usuario):
            continue
        propia = permisos.normalizar(e.ruta) in reglas and e.tipo == "carpeta"
        e.restringida = propia
        if propia and admin:
            e.n_usuarios = len(reglas[permisos.normalizar(e.ruta)])
        salida.append(e)
    return salida


class ListadoStorage(BaseModel):
    ruta: str
    entradas: list[EntradaStorage]


class CrearCarpetaIn(BaseModel):
    ruta_padre: str = ""
    nombre: str


class RenombrarIn(BaseModel):
    ruta: str
    nombre_nuevo: str


class MoverIn(BaseModel):
    ruta: str
    ruta_destino: str = ""


@router.get("/listar")
def listar(ruta: str = "", usuario: Usuario = Depends(usuario_actual)) -> ListadoStorage:
    raiz = _carpeta_raiz()
    carpeta_abs = _resolver(ruta)
    if not os.path.isdir(carpeta_abs):
        raise HTTPException(404, "Carpeta no encontrada.")
    reglas = permisos.cargar_reglas("local")
    permisos.exigir_ver(reglas, _ruta_relativa(raiz, carpeta_abs) if carpeta_abs != raiz else "", usuario)
    entradas = [_info(raiz, os.path.join(carpeta_abs, n)) for n in os.listdir(carpeta_abs)]
    entradas = _visibles(entradas, reglas, usuario)
    entradas.sort(key=lambda e: (e.tipo != "carpeta", e.nombre.lower()))
    return ListadoStorage(ruta=_ruta_relativa(raiz, carpeta_abs) if carpeta_abs != raiz else "", entradas=entradas)


def _exigir_local(usuario: Usuario, *rutas: str) -> None:
    """403 si alguna de estas rutas locales no es para `usuario`."""
    reglas = permisos.cargar_reglas("local")
    for r in rutas:
        permisos.exigir_ver(reglas, r, usuario)


@router.post("/carpetas")
def crear_carpeta(datos: CrearCarpetaIn, usuario: Usuario = Depends(solo_escribiente)) -> EntradaStorage:
    raiz = _carpeta_raiz()
    padre_abs = _resolver(datos.ruta_padre)
    if not os.path.isdir(padre_abs):
        raise HTTPException(404, "Carpeta no encontrada.")
    _exigir_local(usuario, datos.ruta_padre)
    nombre = _nombre_disponible(padre_abs, _nombre_seguro(datos.nombre))
    absoluto = os.path.join(padre_abs, nombre)
    os.makedirs(absoluto)
    return _info(raiz, absoluto)


@router.post("/subir")
async def subir_archivos(
    ruta: str = Form(""),
    archivos: list[UploadFile] = File(...),
    usuario: Usuario = Depends(solo_escribiente),
) -> list[EntradaStorage]:
    raiz = _carpeta_raiz()
    carpeta_abs = _resolver(ruta)
    if not os.path.isdir(carpeta_abs):
        raise HTTPException(404, "Carpeta no encontrada.")
    _exigir_local(usuario, ruta)
    subidos = []
    for archivo in archivos:
        if not archivo.filename:
            continue
        nombre = _nombre_disponible(carpeta_abs, _nombre_seguro(archivo.filename))
        absoluto = os.path.join(carpeta_abs, nombre)
        contenido = await archivo.read()
        with open(absoluto, "wb") as f:
            f.write(contenido)
        subidos.append(_info(raiz, absoluto))
    return subidos


@router.put("/renombrar")
def renombrar(datos: RenombrarIn, usuario: Usuario = Depends(solo_escribiente)) -> EntradaStorage:
    raiz = _carpeta_raiz()
    origen_abs = _resolver(datos.ruta)
    if origen_abs == raiz:
        raise HTTPException(400, "No puedes renombrar la carpeta raíz.")
    if not os.path.exists(origen_abs):
        raise HTTPException(404, "No encontrado.")
    _exigir_local(usuario, datos.ruta)
    padre_abs = os.path.dirname(origen_abs)
    nombre_nuevo = _nombre_seguro(datos.nombre_nuevo)
    destino_abs = os.path.join(padre_abs, nombre_nuevo)
    if destino_abs != origen_abs and os.path.exists(destino_abs):
        raise HTTPException(409, "Ya existe un archivo o carpeta con ese nombre.")
    os.rename(origen_abs, destino_abs)
    if os.path.isdir(destino_abs):
        permisos.reubicar("local", _ruta_relativa(raiz, origen_abs), _ruta_relativa(raiz, destino_abs))
    return _info(raiz, destino_abs)


@router.put("/mover")
def mover(datos: MoverIn, usuario: Usuario = Depends(solo_escribiente)) -> EntradaStorage:
    raiz = _carpeta_raiz()
    origen_abs = _resolver(datos.ruta)
    destino_carpeta_abs = _resolver(datos.ruta_destino)
    if origen_abs == raiz:
        raise HTTPException(400, "No puedes mover la carpeta raíz.")
    if not os.path.exists(origen_abs):
        raise HTTPException(404, "No encontrado.")
    _exigir_local(usuario, datos.ruta, datos.ruta_destino)
    if not os.path.isdir(destino_carpeta_abs):
        raise HTTPException(404, "Carpeta de destino no encontrada.")
    if destino_carpeta_abs == os.path.dirname(origen_abs):
        return _info(raiz, origen_abs)  # ya está ahí, no hace nada
    if os.path.isdir(origen_abs) and (
        destino_carpeta_abs == origen_abs or destino_carpeta_abs.startswith(origen_abs + os.sep)
    ):
        raise HTTPException(400, "No puedes mover una carpeta dentro de sí misma.")
    nombre = _nombre_disponible(destino_carpeta_abs, os.path.basename(origen_abs))
    destino_abs = os.path.join(destino_carpeta_abs, nombre)
    shutil.move(origen_abs, destino_abs)
    if os.path.isdir(destino_abs):
        permisos.reubicar("local", _ruta_relativa(raiz, origen_abs), _ruta_relativa(raiz, destino_abs))
    return _info(raiz, destino_abs)


@router.get("/descargar")
def descargar_archivo(ruta: str, usuario: Usuario = Depends(usuario_actual)) -> FileResponse:
    absoluto = _resolver(ruta)
    if not os.path.isfile(absoluto):
        raise HTTPException(404, "Archivo no encontrado.")
    _exigir_local(usuario, ruta)
    return FileResponse(absoluto, filename=os.path.basename(absoluto))


@router.delete("/eliminar")
def eliminar(ruta: str, usuario: Usuario = Depends(solo_escribiente)) -> dict[str, str]:
    absoluto = _resolver(ruta)
    if absoluto == _carpeta_raiz():
        raise HTTPException(400, "No puedes eliminar la carpeta raíz.")
    _exigir_local(usuario, ruta)
    if os.path.isdir(absoluto):
        rel = _ruta_relativa(_carpeta_raiz(), absoluto)
        shutil.rmtree(absoluto)
        permisos.reubicar("local", rel, None)
    elif os.path.isfile(absoluto):
        os.remove(absoluto)
    else:
        raise HTTPException(404, "No encontrado.")
    return {"estado": "eliminado"}


# ---------------------------------------------------------------------------
# Navegación de R2 (solo lectura — AccuTab y otros prefijos)
# ---------------------------------------------------------------------------

from . import r2 as _r2  # noqa: E402


@router.get("/r2/listar")
def r2_listar(prefijo: str = "", usuario: Usuario = Depends(usuario_actual)) -> ListadoStorage:
    """
    Lista el contenido de R2 como si fuera un explorador de carpetas.
    'prefijo' es la ruta relativa dentro del bucket (ej. "" para raíz, "accutab/mail/" para AccuTab).
    Devuelve el mismo formato que /listar para que el frontend lo reutilice.
    """
    if not _r2.disponible():
        raise HTTPException(503, "R2 no está configurado en este servidor.")

    # Normalizar: siempre termina en "/" salvo si es raíz
    base = prefijo.strip("/")
    prefijo_r2 = (base + "/") if base else ""
    reglas = permisos.cargar_reglas("r2")
    permisos.exigir_ver(reglas, base, usuario)

    try:
        paginator = _r2._get_client().get_paginator("list_objects_v2")
        page_iter = paginator.paginate(
            Bucket=_r2.config.R2_BUCKET,
            Prefix=prefijo_r2,
            Delimiter="/",
        )

        carpetas: list[EntradaStorage] = []
        archivos: list[EntradaStorage] = []

        for page in page_iter:
            for cp in page.get("CommonPrefixes", []):
                nombre = cp["Prefix"].rstrip("/").split("/")[-1]
                carpetas.append(EntradaStorage(
                    nombre=nombre,
                    ruta=cp["Prefix"].rstrip("/"),
                    tipo="carpeta",
                    tamano_bytes=None,
                    modificado="",
                ))
            for obj in page.get("Contents", []):
                key: str = obj["Key"]
                if key == prefijo_r2:
                    continue  # entrada de "carpeta vacía", no listar
                nombre = key.split("/")[-1]
                if not nombre:
                    continue
                archivos.append(EntradaStorage(
                    nombre=nombre,
                    ruta=key,
                    tipo="archivo",
                    tamano_bytes=obj.get("Size"),
                    modificado=obj["LastModified"].isoformat() if obj.get("LastModified") else "",
                ))

        entradas = sorted(carpetas, key=lambda e: e.nombre.lower()) + sorted(archivos, key=lambda e: e.nombre.lower())
        return ListadoStorage(ruta=prefijo_r2, entradas=_visibles(entradas, reglas, usuario))

    except Exception as exc:
        raise HTTPException(502, f"Error al listar R2: {exc}")


from fastapi.responses import StreamingResponse  # noqa: E402


@router.get("/r2/descargar")
def r2_descargar(key: str, usuario: Usuario = Depends(usuario_actual)):
    """Descarga un archivo de R2 directamente (proxy streaming)."""
    if not _r2.disponible():
        raise HTTPException(503, "R2 no está configurado en este servidor.")
    if not key or ".." in key:
        raise HTTPException(400, "Key inválida.")
    permisos.exigir_ver(permisos.cargar_reglas("r2"), key, usuario)

    try:
        resp = _r2._get_client().get_object(Bucket=_r2.config.R2_BUCKET, Key=key)
    except Exception as exc:
        raise HTTPException(404, f"No encontrado en R2: {exc}")

    filename = key.split("/")[-1] or "archivo"
    content_type = resp.get("ContentType", "application/octet-stream")

    def _iter():
        for chunk in resp["Body"].iter_chunks(chunk_size=65536):
            yield chunk

    return StreamingResponse(
        _iter(),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Permisos por carpeta (solo admin general)
# ---------------------------------------------------------------------------

class PermisoIn(BaseModel):
    espacio: str
    ruta: str
    usuario_ids: list[int]


class PermisoOut(BaseModel):
    espacio: str
    ruta: str
    restringida: bool
    usuario_ids: list[int]
    # Si la carpeta no tiene regla propia pero una que la contiene sí.
    heredada_de: str | None = None
    heredados_ids: list[int] = []
    # Con la carpeta contenedora restringida, solo esas cuentas se pueden elegir.
    elegibles_ids: list[int] | None = None


class UsuarioConAcceso(BaseModel):
    id: int
    nombre: str
    email: str


class ResumenPermiso(BaseModel):
    espacio: str
    ruta: str
    usuarios: list[UsuarioConAcceso]


def _validar_carpeta_permiso(espacio: str, ruta: str) -> str:
    if espacio not in permisos.ESPACIOS:
        raise HTTPException(400, "Espacio inválido.")
    ruta = permisos.normalizar(ruta)
    if not ruta:
        raise HTTPException(400, "Elige una carpeta: la raíz no se restringe.")
    if espacio == "local":
        if not os.path.isdir(_resolver(ruta)):
            raise HTTPException(404, "Carpeta no encontrada.")
    elif not _r2.disponible():
        raise HTTPException(503, "R2 no está configurado en este servidor.")
    return ruta


@router.get("/permisos")
def ver_permisos(espacio: str, ruta: str, _: Usuario = Depends(solo_admin_general)) -> PermisoOut:
    ruta = _validar_carpeta_permiso(espacio, ruta)
    reglas = permisos.cargar_reglas(espacio)
    propia = reglas.get(ruta)
    padre = None
    for anc in list(permisos._ancestros(ruta))[1:]:
        if anc in reglas:
            padre = (anc, reglas[anc])
            break
    return PermisoOut(
        espacio=espacio,
        ruta=ruta,
        restringida=propia is not None,
        usuario_ids=sorted(propia or []),
        heredada_de=padre[0] if padre and propia is None else None,
        heredados_ids=sorted(padre[1]) if padre and propia is None else [],
        elegibles_ids=sorted(padre[1]) if padre else None,
    )


@router.put("/permisos")
def guardar_permisos(datos: PermisoIn, quien: Usuario = Depends(solo_admin_general)) -> PermisoOut:
    ruta = _validar_carpeta_permiso(datos.espacio, datos.ruta)
    permisos.guardar(datos.espacio, ruta, datos.usuario_ids, quien.email)
    return ver_permisos(datos.espacio, ruta, quien)


@router.get("/permisos/resumen")
def resumen_permisos(_: Usuario = Depends(solo_admin_general)) -> list[ResumenPermiso]:
    """Todas las carpetas restringidas y quién entra a cada una."""
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(
                """
                SELECT p.espacio, p.ruta, u.id, u.nombre, u.email
                FROM storage_permiso p JOIN usuario u ON u.id = p.usuario_id
                ORDER BY p.espacio, p.ruta, u.nombre
                """
            )
            filas = cur.fetchall()
    except psycopg2.errors.UndefinedTable:
        return []
    por_carpeta: dict[tuple[str, str], list[UsuarioConAcceso]] = {}
    for f in filas:
        por_carpeta.setdefault((f["espacio"], f["ruta"]), []).append(
            UsuarioConAcceso(id=f["id"], nombre=f["nombre"], email=f["email"])
        )
    return [ResumenPermiso(espacio=e, ruta=r, usuarios=u) for (e, r), u in por_carpeta.items()]


# ---------------------------------------------------------------------------
# R2: crear, subir, renombrar, mover y eliminar (con la política de storage_r2)
# ---------------------------------------------------------------------------

def _exigir_r2(usuario: Usuario, *rutas: str) -> None:
    reglas = permisos.cargar_reglas("r2")
    for r in rutas:
        permisos.exigir_ver(reglas, r, usuario)


def _entrada_r2(ruta: str, tipo: str, tamano: int | None = None) -> EntradaStorage:
    return EntradaStorage(
        nombre=ruta.rsplit("/", 1)[-1], ruta=ruta, tipo=tipo, tamano_bytes=tamano, modificado=""
    )


@router.post("/r2/carpetas")
def r2_crear_carpeta(datos: CrearCarpetaIn, usuario: Usuario = Depends(solo_escribiente)) -> EntradaStorage:
    sr2.puede_llamar_r2()
    padre = sr2.normalizar(datos.ruta_padre)
    sr2.exigir("crear", padre)
    _exigir_r2(usuario, padre)
    ruta = sr2.crear_carpeta(padre, _nombre_seguro(datos.nombre))
    return _entrada_r2(ruta, "carpeta")


@router.post("/r2/subir")
async def r2_subir(
    ruta: str = Form(""),
    archivos: list[UploadFile] = File(...),
    usuario: Usuario = Depends(solo_escribiente),
) -> list[EntradaStorage]:
    sr2.puede_llamar_r2()
    carpeta = sr2.normalizar(ruta)
    sr2.exigir("subir", carpeta)
    _exigir_r2(usuario, carpeta)
    subidos = []
    for archivo in archivos:
        if not archivo.filename:
            continue
        datos = await archivo.read()
        destino = sr2.subir_archivo(carpeta, _nombre_seguro(archivo.filename), datos)
        subidos.append(_entrada_r2(destino, "archivo", len(datos)))
    return subidos


@router.put("/r2/renombrar")
def r2_renombrar(datos: RenombrarIn, usuario: Usuario = Depends(solo_escribiente)) -> EntradaStorage:
    sr2.puede_llamar_r2()
    ruta = sr2.normalizar(datos.ruta)
    tipo = sr2.tipo_de(ruta)
    if tipo is None:
        raise HTTPException(404, "No encontrado.")
    sr2.exigir("renombrar", ruta, tipo == "carpeta")
    _exigir_r2(usuario, ruta)
    nuevo = sr2.renombrar(ruta, _nombre_seguro(datos.nombre_nuevo))
    if tipo == "carpeta" and nuevo != ruta:
        permisos.reubicar("r2", ruta, nuevo)
    return _entrada_r2(nuevo, tipo)


@router.put("/r2/mover")
def r2_mover(datos: MoverIn, usuario: Usuario = Depends(solo_escribiente)) -> EntradaStorage:
    sr2.puede_llamar_r2()
    ruta = sr2.normalizar(datos.ruta)
    destino = sr2.normalizar(datos.ruta_destino)
    tipo = sr2.tipo_de(ruta)
    if tipo is None:
        raise HTTPException(404, "No encontrado.")
    sr2.exigir("mover", ruta, tipo == "carpeta")
    sr2.exigir("crear", destino)
    if sr2.zona(ruta) != sr2.zona(destino):
        raise HTTPException(403, "No se puede mover entre Solicitudes y Accutab.")
    _exigir_r2(usuario, ruta, destino)
    nuevo = sr2.mover(ruta, destino)
    if tipo == "carpeta" and nuevo != ruta:
        permisos.reubicar("r2", ruta, nuevo)
    return _entrada_r2(nuevo, tipo)


@router.delete("/r2/eliminar")
def r2_eliminar(ruta: str, usuario: Usuario = Depends(solo_escribiente)) -> dict[str, str]:
    sr2.puede_llamar_r2()
    ruta = sr2.normalizar(ruta)
    tipo = sr2.tipo_de(ruta)
    if tipo is None:
        raise HTTPException(404, "No encontrado.")
    sr2.exigir("eliminar", ruta, tipo == "carpeta")
    _exigir_r2(usuario, ruta)
    sr2.eliminar(ruta)
    if tipo == "carpeta":
        permisos.reubicar("r2", ruta, None)
    return {"estado": "eliminado"}


# ---------------------------------------------------------------------------
# Búsqueda global
# ---------------------------------------------------------------------------

@router.get("/buscar")
def buscar(
    q: str,
    espacio: str = "local",
    limite: int = 80,
    usuario: Usuario = Depends(usuario_actual),
) -> list[EntradaStorage]:
    """Archivos y carpetas cuyo nombre contiene TODAS las palabras de `q`
    (sin importar mayúsculas ni tildes), en cualquier subcarpeta. Solo devuelve
    lo que `usuario` puede ver."""
    palabras = [p for p in sr2.sin_tildes(q).split() if p]
    if not palabras:
        return []
    limite = max(1, min(limite, 200))
    if espacio == "local":
        raiz = _carpeta_raiz()
        encontrados: list[dict] = []
        for carpeta, subcarpetas, archivos in os.walk(raiz):
            for nombre in subcarpetas + archivos:
                if not sr2.coincide(nombre, palabras):
                    continue
                e = _info(raiz, os.path.join(carpeta, nombre))
                encontrados.append(e.model_dump())
        encontrados.sort(key=lambda e: (e["tipo"] != "carpeta", not sr2.sin_tildes(e["nombre"]).startswith(palabras[0]), e["nombre"].lower()))
        resultado = [EntradaStorage(**e) for e in encontrados]
        reglas = permisos.cargar_reglas("local")
    elif espacio == "r2":
        sr2.puede_llamar_r2()
        claves = (
            sr2.claves_de(sr2.RAIZ_ACCUTAB) + sr2.claves_de(sr2.RAIZ_SOLICITUDES) + sr2.claves_de(sr2.RAIZ_INFORMES)
        )
        resultado = [EntradaStorage(**e) for e in sr2.buscar_en_claves(claves, palabras, 10_000)]
        reglas = permisos.cargar_reglas("r2")
    else:
        raise HTTPException(400, "Espacio inválido.")
    return _visibles(resultado, reglas, usuario)[:limite]
