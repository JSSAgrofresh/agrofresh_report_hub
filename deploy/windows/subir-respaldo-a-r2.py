"""Sube un respaldo a Cloudflare R2 y borra los que ya pasaron la ventana.

Lo llama respaldar.ps1 después de generar el .dump. Reutiliza la configuración
de R2 que el backend ya tiene en su .env, así que no hay credenciales nuevas
que administrar.

Uso:
    python subir-respaldo-a-r2.py C:\\AgroFresh\\respaldos\\agrofresh-20260825.dump
"""

import os
import sys
from datetime import datetime, timedelta, timezone

# El backend vive dos niveles más arriba (deploy/windows/ -> raíz -> backend/).
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

from app import config, r2  # noqa: E402

# Los respaldos en la nube se conservan más tiempo que los locales: ocupan poco
# y son la última línea de defensa si este equipo deja de existir.
DIAS_EN_LA_NUBE = 90
PREFIJO = "respaldos/base/"


def main() -> int:
    if len(sys.argv) < 2:
        print("Falta la ruta del archivo a subir.")
        return 2

    archivo = sys.argv[1]
    if not os.path.isfile(archivo):
        print(f"No existe el archivo {archivo}")
        return 2

    if not r2.disponible():
        print("R2 no está configurado en backend/.env — se omite la copia en la nube.")
        return 0

    key = PREFIJO + os.path.basename(archivo)
    tamano_mb = os.path.getsize(archivo) / (1024 * 1024)
    print(f"Subiendo {key} ({tamano_mb:.1f} MB)...")

    with open(archivo, "rb") as fh:
        r2.subir(key, fh.read(), "application/octet-stream")
    print("Subido.")

    _limpiar_antiguos()
    return 0


def _limpiar_antiguos() -> None:
    """Borra de R2 los respaldos que pasaron la ventana, para que el bucket no
    crezca sin control (el plan gratuito son 10 GB)."""
    limite = datetime.now(timezone.utc) - timedelta(days=DIAS_EN_LA_NUBE)
    cliente = r2._get_client()
    borrados = 0

    paginador = cliente.get_paginator("list_objects_v2")
    for pagina in paginador.paginate(Bucket=config.R2_BUCKET, Prefix=PREFIJO):
        for obj in pagina.get("Contents", []):
            if obj["LastModified"] < limite:
                r2.eliminar(obj["Key"])
                borrados += 1

    if borrados:
        print(f"Borrados {borrados} respaldos de más de {DIAS_EN_LA_NUBE} días.")


if __name__ == "__main__":
    sys.exit(main())
