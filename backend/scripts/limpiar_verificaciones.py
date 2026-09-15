"""Elimina todos los registros diarios de verificaciones.

La configuración (micropipetas, pesas, criterios, parámetros) queda intacta.
Las mediciones se borran en cascada desde verif_registro.

Uso:
    python scripts/limpiar_verificaciones.py           # muestra cuántos hay
    python scripts/limpiar_verificaciones.py --aplicar # borra de verdad
"""

import sys
from pathlib import Path

# Permite correrlo tanto desde la raíz del backend como desde scripts/
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db import get_connection  # noqa: E402

aplicar = '--aplicar' in sys.argv

with get_connection() as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM verif_registro')
        total = cur.fetchone()[0]
        print(f'Registros diarios encontrados: {total}')

        if not aplicar:
            print('Modo simulación — pasa --aplicar para borrar de verdad.')
            sys.exit(0)

        cur.execute('DELETE FROM verif_registro')
        print(f'Registros eliminados: {cur.rowcount}')

    conn.commit()

print('Listo.')
