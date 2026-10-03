"""
Borra los duplicados que dejo la ingesta de correos AccuTab cuando Gmail no
sacaba los correos de ACCUTAB_PENDIENTE y cada corrida los volvia a subir.

Limpia dos lugares:

  1. Storage/Accutab/ (lo que muestra Post Venta): reportes creados desde
     correo (`origen: "email"`) con EXACTAMENTE las mismas filas. Se deja el
     mas antiguo de cada grupo. Los reportes guardados a mano desde Trace no
     se tocan nunca.
  2. R2 accutab/mail/: carpetas "Asunto", "Asunto (2)", "Asunto (3)"... con
     EXACTAMENTE los mismos archivos (mismo nombre y mismo contenido, por ETag).
     Se deja la de numero mas bajo de cada grupo.

Solo se borra lo que tiene un gemelo identico que se queda: no se pierde
ningun dato. La lista de lo borrado queda en logs/.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\limpiar_duplicados_accutab.py            # solo mira
    .venv\\Scripts\\python.exe scripts\\limpiar_duplicados_accutab.py --aplicar  # borra
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app import config  # noqa: E402
from app import r2 as _r2  # noqa: E402

R2_PREFIX = "accutab/mail/"
_PATRON_CARPETA = re.compile(r"^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$")
_SUFIJO = re.compile(r"^(.*) \((\d+)\)$")


# ---------------------------------------------------------------------------
# Logica pura (probada en tests/test_limpiar_duplicados_accutab.py)
# ---------------------------------------------------------------------------

def base_y_numero(carpeta: str) -> tuple[str, int]:
    """"AGROFRESH_DEMO (583)" -> ("AGROFRESH_DEMO", 583); sin sufijo = 1."""
    m = _SUFIJO.match(carpeta)
    if m:
        return m.group(1), int(m.group(2))
    return carpeta, 1


def duplicados_r2(objetos: list[tuple[str, str]]) -> list[str]:
    """Recibe (key, etag) de todo accutab/mail/ y devuelve las CARPETAS que
    sobran: las que tienen una gemela con el mismo nombre base y los mismos
    archivos (ruta interna + contenido). Se queda la de numero mas bajo."""
    contenido: dict[str, list[tuple[str, str]]] = {}
    for key, etag in objetos:
        relativo = key[len(R2_PREFIX):] if key.startswith(R2_PREFIX) else key
        carpeta, _, resto = relativo.partition("/")
        if not carpeta:
            continue
        contenido.setdefault(carpeta, []).append((resto, etag))

    grupos: dict[tuple[str, tuple], list[str]] = {}
    for carpeta, archivos in contenido.items():
        archivos_reales = tuple(sorted(a for a in archivos if a[0]))
        if not archivos_reales:
            continue  # carpeta vacia: no hay con que comparar
        base, _ = base_y_numero(carpeta)
        grupos.setdefault((base, archivos_reales), []).append(carpeta)

    sobran: list[str] = []
    for carpetas in grupos.values():
        carpetas.sort(key=lambda c: base_y_numero(c)[1])
        sobran.extend(carpetas[1:])
    return sorted(sobran, key=lambda c: base_y_numero(c))


def huella_registro(registro: dict) -> str | None:
    """Huella de un reporte creado desde correo; None si no es de correo."""
    if registro.get("origen") != "email":
        return None
    datos = json.dumps(
        [registro.get("equipo"), registro.get("filas")],
        sort_keys=True, ensure_ascii=False,
    )
    return hashlib.sha256(datos.encode("utf-8")).hexdigest()


def duplicados_locales(registros: dict[str, dict]) -> list[str]:
    """Recibe {carpeta: registro} y devuelve las carpetas que sobran: reportes
    de correo con las mismas filas que otro mas antiguo."""
    vistos: set[str] = set()
    sobran: list[str] = []
    for carpeta in sorted(registros):  # el nombre es la fecha: orden = antiguedad
        huella = huella_registro(registros[carpeta])
        if huella is None:
            continue
        if huella in vistos:
            sobran.append(carpeta)
        else:
            vistos.add(huella)
    return sobran


# ---------------------------------------------------------------------------
# Lectura y borrado
# ---------------------------------------------------------------------------

def _leer_registros_locales(raiz: str) -> dict[str, dict]:
    registros: dict[str, dict] = {}
    if not os.path.isdir(raiz):
        return registros
    for nombre in os.listdir(raiz):
        if not _PATRON_CARPETA.match(nombre):
            continue
        ruta = os.path.join(raiz, nombre, "registro.json")
        try:
            with open(ruta, encoding="utf-8") as f:
                registros[nombre] = json.load(f)
        except (OSError, ValueError):
            continue
    return registros


def _listar_r2_con_etag() -> list[tuple[str, str]]:
    cliente = _r2._get_client()
    salida: list[tuple[str, str]] = []
    for page in cliente.get_paginator("list_objects_v2").paginate(Bucket=config.R2_BUCKET, Prefix=R2_PREFIX):
        for obj in page.get("Contents", []):
            salida.append((obj["Key"], obj.get("ETag", "")))
    return salida


def _borrar_r2(keys: list[str]) -> None:
    cliente = _r2._get_client()
    for i in range(0, len(keys), 1000):
        lote = [{"Key": k} for k in keys[i:i + 1000]]
        resp = cliente.delete_objects(Bucket=config.R2_BUCKET, Delete={"Objects": lote, "Quiet": True})
        errores = resp.get("Errors") or []
        if errores:
            raise RuntimeError(f"R2 no borro {len(errores)} objeto(s): {errores[:3]}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true", help="Borrar de verdad. Sin esto solo muestra.")
    args = ap.parse_args(argv)

    # 1. Storage/Accutab (Post Venta)
    raiz = os.path.normpath(os.path.join(config.STORAGE_DIR, "Accutab"))
    registros = _leer_registros_locales(raiz)
    de_correo = sum(1 for r in registros.values() if r.get("origen") == "email")
    sobran_locales = duplicados_locales(registros)
    print(f"\nStorage/Accutab ({raiz})")
    print(f"  Reportes: {len(registros)} ({de_correo} desde correo)")
    print(f"  Duplicados a borrar: {len(sobran_locales)}  -> quedan {len(registros) - len(sobran_locales)}")

    # 2. R2 accutab/mail/
    objetos: list[tuple[str, str]] = []
    sobran_r2: list[str] = []
    if _r2.disponible():
        objetos = _listar_r2_con_etag()
        sobran_r2 = duplicados_r2(objetos)
        carpetas = {k[len(R2_PREFIX):].split("/", 1)[0] for k, _ in objetos} - {""}
        print(f"\nR2 {R2_PREFIX}")
        print(f"  Carpetas: {len(carpetas)}")
        print(f"  Duplicadas a borrar: {len(sobran_r2)}  -> quedan {len(carpetas) - len(sobran_r2)}")
        for c in sobran_r2[:5]:
            print(f"    {c}")
        if len(sobran_r2) > 5:
            print(f"    ... y {len(sobran_r2) - 5} mas")
    else:
        print("\nR2 no esta configurado: se salta accutab/mail/.")

    if not args.aplicar:
        print("\nNo se borro nada. Para hacerlo, repite con --aplicar.\n")
        return 0

    marca = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    logs = _BACKEND.parent / "logs"
    logs.mkdir(exist_ok=True)
    bitacora = logs / f"limpieza_accutab_{marca}.json"
    with open(bitacora, "w", encoding="utf-8") as f:
        json.dump({"storage_accutab": sobran_locales, "r2_accutab_mail": sobran_r2}, f, ensure_ascii=False, indent=2)
    print(f"\nLista de lo borrado: {bitacora}")

    for carpeta in sobran_locales:
        shutil.rmtree(os.path.join(raiz, carpeta))
    print(f"Borrados {len(sobran_locales)} reportes duplicados de Storage/Accutab.")

    if sobran_r2:
        prefijos = tuple(f"{R2_PREFIX}{c}/" for c in sobran_r2)
        keys = [k for k, _ in objetos if k.startswith(prefijos)]
        _borrar_r2(keys)
        print(f"Borradas {len(sobran_r2)} carpetas duplicadas de R2 ({len(keys)} objetos).")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
