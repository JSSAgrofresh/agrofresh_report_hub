"""
Almacén de configuración de los mantenedores (Toma de muestras y
Laboratorios). No hay tabla en base de datos: cada mantenedor es un archivo
JSON dentro de `solicitudes/_config/`, en R2 o en disco según cómo esté
levantado el sistema.

Esta lógica vivía dentro de `toma_muestras.py`. Se extrajo acá cuando el
módulo de Laboratorios pasó a necesitar exactamente el mismo mecanismo: dos
copias del mismo `_leer_config` se habrían desincronizado a la primera
corrección.

`crud_router` arma los cuatro endpoints (listar/crear/editar/eliminar) de un
mantenedor a partir de su modelo Pydantic. Casi todos los mantenedores son
la misma tabla con distintas columnas, así que declararlos cuesta cinco
líneas en vez de sesenta.
"""
import json
import os
from typing import Any, Callable, TypeVar

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import config, r2

CARPETA_RAIZ = "solicitudes"
CARPETA_CONFIG = "_config"


def _ruta_config(nombre_archivo: str) -> str:
    carpeta = os.path.join(config.STORAGE_DIR, CARPETA_RAIZ, CARPETA_CONFIG)
    os.makedirs(carpeta, exist_ok=True)
    return os.path.join(carpeta, nombre_archivo)


def _r2_key_cfg(nombre_archivo: str) -> str:
    return f"{CARPETA_RAIZ}/{CARPETA_CONFIG}/{nombre_archivo}"


def leer(nombre_archivo: str, valores_defecto: list[dict]) -> list[dict]:
    """Lee un mantenedor. La primera vez siembra los valores por defecto para
    que el sistema arranque usable y no con listas vacías.

    Solo se siembra si hay valores por defecto que sembrar. Un mantenedor que
    nace vacío (contactos, análisis) devuelve `[]` sin crear el archivo, y así
    un lector que consulte de paso -pasando `[]` porque no le corresponde
    definir los defaults- no puede dejar sembrado un archivo vacío que después
    tape los valores reales del mantenedor dueño.
    """
    if r2.disponible():
        datos = r2.leer_json(_r2_key_cfg(nombre_archivo), None)
        if datos is None:
            if valores_defecto:
                r2.escribir_json(_r2_key_cfg(nombre_archivo), valores_defecto)
            return valores_defecto
        return datos
    ruta = _ruta_config(nombre_archivo)
    if not os.path.isfile(ruta):
        if valores_defecto:
            escribir(nombre_archivo, valores_defecto)
        return valores_defecto
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def escribir(nombre_archivo: str, datos: list[dict]) -> None:
    if r2.disponible():
        r2.escribir_json(_r2_key_cfg(nombre_archivo), datos)
        return
    with open(_ruta_config(nombre_archivo), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)


def siguiente_id(items: list[dict]) -> int:
    return (max((i["id"] for i in items), default=0)) + 1


TModelo = TypeVar("TModelo", bound=BaseModel)
TEntrada = TypeVar("TEntrada", bound=BaseModel)


def crud_router(
    router: APIRouter,
    ruta: str,
    nombre_archivo: str,
    modelo: type[TModelo],
    modelo_in: type[TEntrada],
    defecto: list[dict] | None = None,
    orden: Callable[[dict], Any] | None = None,
    al_eliminar: Callable[[int], None] | None = None,
) -> None:
    """Registra GET/POST/PUT/DELETE para un mantenedor sobre `ruta`.

    - `orden`: clave de ordenamiento del listado (por defecto, campo `orden`).
    - `al_eliminar`: gancho para limpiar referencias en otros mantenedores
      antes de borrar (ej. al borrar un análisis, soltar sus analitos).

    El listado filtra por cualquier campo del modelo que se pase como query
    param: `?laboratorio=QUITECA` funciona sin declararlo acá.
    """
    valores_defecto = defecto or []
    campos = set(modelo.model_fields.keys())

    def _cargar() -> list[dict]:
        return leer(nombre_archivo, valores_defecto)

    def _clave(item: dict) -> Any:
        if orden is not None:
            return orden(item)
        return item.get("orden", 0)

    @router.get(ruta, response_model=list[modelo], name=f"listar_{nombre_archivo}")
    def listar(laboratorio: str | None = None, activo: bool | None = None) -> list[Any]:
        items = _cargar()
        if laboratorio is not None and "laboratorio" in campos:
            items = [i for i in items if i.get("laboratorio") == laboratorio]
        if activo is not None and "activo" in campos:
            items = [i for i in items if bool(i.get("activo", True)) is activo]
        return [modelo(**i) for i in sorted(items, key=_clave)]

    @router.post(ruta, response_model=modelo, name=f"crear_{nombre_archivo}")
    def crear(body: modelo_in) -> Any:  # type: ignore[valid-type]
        items = _cargar()
        nuevo = modelo(id=siguiente_id(items), **body.model_dump())
        items.append(nuevo.model_dump())
        escribir(nombre_archivo, items)
        return nuevo

    @router.put(f"{ruta}/{{item_id}}", response_model=modelo, name=f"editar_{nombre_archivo}")
    def editar(item_id: int, body: modelo_in) -> Any:  # type: ignore[valid-type]
        items = _cargar()
        idx = next((i for i, it in enumerate(items) if it["id"] == item_id), None)
        if idx is None:
            raise HTTPException(404, "No encontrado.")
        actualizado = modelo(id=item_id, **body.model_dump())
        items[idx] = actualizado.model_dump()
        escribir(nombre_archivo, items)
        return actualizado

    @router.delete(f"{ruta}/{{item_id}}", name=f"eliminar_{nombre_archivo}")
    def eliminar(item_id: int) -> dict[str, str]:
        items = _cargar()
        restantes = [i for i in items if i["id"] != item_id]
        if len(restantes) == len(items):
            raise HTTPException(404, "No encontrado.")
        escribir(nombre_archivo, restantes)
        if al_eliminar is not None:
            al_eliminar(item_id)
        return {"estado": "eliminado"}
