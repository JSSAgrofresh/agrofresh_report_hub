"""
Migra las solicitudes con folio SOL-NNNN al folio OT-NNNN.

El folio no es solo el nombre del archivo: también vive dentro del Excel, en
la hoja visible y en la hoja oculta "_data". Por eso cada solicitud se lee, se
le cambia el número y se reconstruye el workbook con `construir_workbook` —
regenerarlo es más seguro que editar celdas a mano, porque el documento queda
idéntico a uno recién creado.

El número se conserva: SOL-0007 pasa a OT-0007. Así el correlativo no se mueve
y cualquier referencia al número (informes ya emitidos, correos, planillas del
laboratorio) sigue apuntando a la misma solicitud.

Las solicitudes migradas se reubican, de paso, en la estructura nueva por
cliente y fecha: `solicitudes/<SOLD TO>/<AAAA-MM-DD>/OT-NNNN.xlsx`.

Por defecto SIMULA y no escribe nada. Para aplicar de verdad hay que pasar
--aplicar de forma explícita:

    python -m scripts.migrar_folios_ot              # simulacion, no toca nada
    python -m scripts.migrar_folios_ot --aplicar    # migra

Antes de --aplicar conviene respaldar el bucket: el script borra el archivo
viejo después de escribir el nuevo.
"""
import argparse
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import config, r2  # noqa: E402
from app.solicitud_excel import construir_workbook  # noqa: E402
from app.toma_muestras import (  # noqa: E402
    _CARPETA_CONFIG,
    _carpeta_raiz,
    _leer_solicitud_archivo,
    _leer_solicitud_bytes,
    _r2_key_sol_nueva,
    carpeta_de_cliente,
)

TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _nuevo_folio(folio: str) -> str | None:
    """OT-NNNN a partir de SOL-NNNN. Devuelve None si ya está migrado o si el
    folio no tiene la forma esperada -en cuyo caso no se toca."""
    if not folio or not folio.startswith("SOL-"):
        return None
    sufijo = folio[4:]
    return f"OT-{sufijo}" if sufijo.isdigit() else None


def _migrar_r2(aplicar: bool) -> tuple[int, int]:
    migradas = omitidas = 0
    for key in r2.listar_keys("solicitudes/"):
        partes = key.split("/")
        nombre = partes[-1]
        if _CARPETA_CONFIG in partes or not nombre.endswith((".xlsx", ".json")):
            continue

        data = r2.descargar(key)
        if data is None:
            continue
        try:
            datos = _leer_solicitud_bytes(data, os.path.splitext(nombre)[1])
        except Exception as exc:
            print(f"  ! no se pudo leer {key}: {exc}")
            omitidas += 1
            continue

        nuevo = _nuevo_folio(datos.get("numero_solicitud", ""))
        if nuevo is None:
            omitidas += 1
            continue

        datos["numero_solicitud"] = nuevo
        key_nueva = _r2_key_sol_nueva(datos.get("sold_to"), datos.get("fecha_solicitud") or "sin-fecha", f"{nuevo}.xlsx")
        print(f"  {key}\n    -> {key_nueva}")
        if aplicar:
            buf = io.BytesIO()
            construir_workbook(datos).save(buf)
            r2.subir(key_nueva, buf.getvalue(), TIPO_XLSX)
            # Solo se borra el original una vez escrito el nuevo, y nunca si
            # ambos resolvieran a la misma clave.
            if key_nueva != key:
                r2.eliminar(key)
        migradas += 1
    return migradas, omitidas


def _migrar_disco(aplicar: bool) -> tuple[int, int]:
    migradas = omitidas = 0
    raiz = _carpeta_raiz()
    for actual, _dirs, archivos in os.walk(raiz):
        if _CARPETA_CONFIG in os.path.relpath(actual, raiz).split(os.sep):
            continue
        for nombre in sorted(archivos):
            if not nombre.endswith((".xlsx", ".json")):
                continue
            ruta = os.path.join(actual, nombre)
            try:
                datos = _leer_solicitud_archivo(ruta)
            except Exception as exc:
                print(f"  ! no se pudo leer {ruta}: {exc}")
                omitidas += 1
                continue

            nuevo = _nuevo_folio(datos.get("numero_solicitud", ""))
            if nuevo is None:
                omitidas += 1
                continue

            datos["numero_solicitud"] = nuevo
            destino_dir = os.path.join(
                raiz, carpeta_de_cliente(datos.get("sold_to")), datos.get("fecha_solicitud") or "sin-fecha"
            )
            destino = os.path.join(destino_dir, f"{nuevo}.xlsx")
            print(f"  {os.path.relpath(ruta, raiz)}\n    -> {os.path.relpath(destino, raiz)}")
            if aplicar:
                os.makedirs(destino_dir, exist_ok=True)
                construir_workbook(datos).save(destino)
                if os.path.abspath(destino) != os.path.abspath(ruta):
                    os.remove(ruta)
            migradas += 1
    return migradas, omitidas


def main() -> None:
    parser = argparse.ArgumentParser(description="Migra folios SOL-NNNN a OT-NNNN.")
    parser.add_argument(
        "--aplicar",
        action="store_true",
        help="Escribe los cambios. Sin este flag solo se simula y no se toca nada.",
    )
    args = parser.parse_args()

    destino = "R2" if r2.disponible() else f"disco ({config.STORAGE_DIR})"
    print(f"Almacenamiento: {destino}")
    print("Modo: APLICAR (se escribirá)" if args.aplicar else "Modo: SIMULACIÓN (no se escribe nada)")
    print()

    migradas, omitidas = (_migrar_r2 if r2.disponible() else _migrar_disco)(args.aplicar)

    print()
    print(f"Solicitudes a migrar: {migradas}")
    print(f"Sin cambios (ya migradas o folio distinto): {omitidas}")
    if migradas and not args.aplicar:
        print()
        print("Nada se escribió. Para aplicar de verdad:")
        print("    python -m scripts.migrar_folios_ot --aplicar")


if __name__ == "__main__":
    main()
