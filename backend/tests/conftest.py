"""
Las pruebas NUNCA tocan los servicios reales.

`app/config.py` carga el `.env` del backend. En el servidor de la oficina ese
`.env` apunta a la base de PRODUCCIÓN, a R2 y a Gmail, y varias pruebas parten
con `DELETE FROM solicitud_archivo`, reinician los contadores de folio o
escriben `contactos_laboratorio.json` con datos inventados. Correr `pytest` ahí
borraría el índice de solicitudes y pisaría las listas de distribución reales.

Este archivo se carga ANTES que cualquier prueba (y por lo tanto antes que
`app.config`). `load_dotenv` no reemplaza variables que ya existen, así que lo
que se fija acá gana sobre el `.env`:

- R2, Gmail, Resend y SMTP quedan vacíos: los archivos van a una carpeta
  temporal y ningún correo puede salir.
- La base queda APAGADA (un puerto donde no escucha nadie): las pruebas que la
  necesitan se saltan solas (`utiles_bd.hay_base`).

Para correr también las pruebas con base, hay que pedirlo y nombrar una base
de PRUEBAS, que tiene que llevar «prueba» o «test» en el nombre:

    $env:AGROFRESH_BD_PRUEBAS = "agrofresh_pruebas"   # PowerShell
    AGROFRESH_BD_PRUEBAS=agrofresh_pruebas pytest tests   # bash

Esa base se crea vacía y se le corren las migraciones; nunca la de producción.
"""
from __future__ import annotations

import os
import tempfile

_SERVICIOS_EXTERNOS = (
    "R2_ENDPOINT_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
    "R2_AUDITORIA_BUCKET", "R2_AUDITORIA_ENDPOINT_URL", "R2_AUDITORIA_ACCESS_KEY_ID",
    "R2_AUDITORIA_SECRET_ACCESS_KEY",
    "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_APP_PASSWORD",
    "RESEND_API_KEY", "MAIL_USER", "MAIL_PASSWORD",
)
for _clave in _SERVICIOS_EXTERNOS:
    os.environ[_clave] = ""

os.environ["STORAGE_DIR"] = tempfile.mkdtemp(prefix="agrofresh_pruebas_")
# La URL completa se ignora siempre: el nombre de la base se fija abajo.
os.environ["DATABASE_URL"] = ""

_BASE_PEDIDA = os.environ.get("AGROFRESH_BD_PRUEBAS", "").strip()


def nombre_de_base_segura(nombre: str) -> bool:
    """Solo una base que se llame de prueba: nunca la de producción."""
    n = nombre.casefold()
    return bool(n) and ("prueba" in n or "test" in n)


if _BASE_PEDIDA and nombre_de_base_segura(_BASE_PEDIDA):
    os.environ["DB_NAME"] = _BASE_PEDIDA
else:
    if _BASE_PEDIDA:
        print(
            f"\n[pruebas] AGROFRESH_BD_PRUEBAS={_BASE_PEDIDA!r} no parece una base de pruebas "
            "(debe llevar «prueba» o «test» en el nombre). Las pruebas con base se saltan.\n"
        )
    # Sin base pedida: ninguna conexión llega a ninguna parte.
    os.environ["DB_HOST"] = "127.0.0.1"
    os.environ["DB_PORT"] = "1"
    os.environ["DB_NAME"] = "sin_base_de_pruebas"
