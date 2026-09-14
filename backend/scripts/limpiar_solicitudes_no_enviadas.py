"""
Lista (y opcionalmente elimina) todas las solicitudes que todavía NO fueron
enviadas por correo.

Las solicitudes no enviadas solo se pueden mandar si alguien abre su
formulario de edición y presiona "Guardar y enviar" manualmente. Este script
sirve para eliminarlas de forma preventiva.

Uso - solo lectura por defecto:
    cd backend
    .venv/Scripts/python.exe scripts/limpiar_solicitudes_no_enviadas.py

Para eliminar de verdad:
    .venv/Scripts/python.exe scripts/limpiar_solicitudes_no_enviadas.py --aplicar
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import indice_solicitudes, r2


def _eliminar_solicitud(archivo: str) -> None:
    """Borra el archivo de la solicitud (R2 o disco) y la saca del índice."""
    if r2.disponible():
        from app.toma_muestras import _buscar_key_solicitud  # noqa: PLC0415
        key = _buscar_key_solicitud(archivo)
        if key:
            r2.eliminar(key)
    else:
        from app.toma_muestras import _ruta_archivo  # noqa: PLC0415
        try:
            ruta = _ruta_archivo(archivo)
            os.remove(ruta)
        except (FileNotFoundError, Exception) as exc:
            print(f"    [!] No se pudo eliminar el archivo: {exc}")
            return
    indice_solicitudes.olvidar_archivo(os.path.basename(archivo))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aplicar", action="store_true", help="Eliminar de verdad")
    args = parser.parse_args()

    print("Consultando el índice de solicitudes…")
    todas = indice_solicitudes.listar()

    no_enviadas = [
        (archivo, datos)
        for archivo, datos in todas
        if not datos.get("enviada")
    ]

    if not no_enviadas:
        print("No hay solicitudes sin enviar. Nada que hacer.")
        return

    print(f"\nSolicitudes NO enviadas ({len(no_enviadas)}):")
    print(f"{'N°':>8}  {'Laboratorio':<18}  {'Solicitante':<30}  {'Fecha':>12}  Archivo")
    print("-" * 90)
    for archivo, datos in no_enviadas:
        num = datos.get("numero_solicitud", "—")
        lab = datos.get("laboratorio", "—")
        sol = datos.get("generado_por") or datos.get("solicitante") or "—"
        fecha = datos.get("fecha_solicitud", "—")
        print(f"  {str(num):>6}  {lab:<18}  {sol:<30}  {fecha:>12}  {archivo}")

    if not args.aplicar:
        print(
            f"\n[SIMULACIÓN] Se eliminarían {len(no_enviadas)} solicitud(es)."
            "\nAgrega --aplicar para eliminarlas de verdad."
        )
        return

    print(f"\nEliminando {len(no_enviadas)} solicitud(es)…")
    ok = 0
    for archivo, datos in no_enviadas:
        num = datos.get("numero_solicitud", archivo)
        try:
            _eliminar_solicitud(archivo)
            print(f"  ✓ Solicitud {num} eliminada.")
            ok += 1
        except Exception as exc:
            print(f"  ✗ Error al eliminar solicitud {num}: {exc}")

    print(f"\nListo. {ok} de {len(no_enviadas)} eliminadas.")


if __name__ == "__main__":
    main()
