"""
Elimina el laboratorio de prueba (nombre o código contiene 'test')
del archivo laboratorios.json.

Uso:
  .venv\\Scripts\\python.exe scripts\\borrar_lab_test.py
  .venv\\Scripts\\python.exe scripts\\borrar_lab_test.py --aplicar
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app import config_store

labs = config_store.leer("laboratorios.json", [])

tests = [l for l in labs if "test" in (l.get("codigo") or "").lower() or "test" in (l.get("nombre") or "").lower()]
resto = [l for l in labs if l not in tests]

if not tests:
    print("No se encontró ningún laboratorio con 'test' en el código o nombre.")
    sys.exit(0)

print("Laboratorios a eliminar:")
for l in tests:
    print(f"  código={l.get('codigo')}  nombre={l.get('nombre')}")

print()
if "--aplicar" not in sys.argv:
    print(">> DRY RUN — no se escribió nada. Agrega --aplicar para borrar.")
    sys.exit(0)

config_store.escribir("laboratorios.json", resto)
print(f"✓ Eliminado. Quedan {len(resto)} laboratorios.")
