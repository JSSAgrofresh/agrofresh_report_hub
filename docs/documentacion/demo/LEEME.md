# Entorno de demostración para las capturas

Levanta una base PostgreSQL aparte con datos ficticios («DEMO»), el backend y el frontend, y saca las capturas del manual
de usuario con Playwright. **Nunca apuntar a la base de producción.**

1. Crear la base y correr `000_schema_completo.sql` y cada migración (`scripts/migrar.py`).
2. `DEMO_CLAVE=<una clave de prueba> python demo/sembrar_demo.py` (desde `backend/`) carga cuentas, clientes, analitos e informes ficticios.
3. Levantar el backend (`uvicorn app.main:app`) y el frontend (`VITE_API_BASE_URL=http://localhost:8000/api npx vite`).
4. `DEMO_CLAVE=<la misma clave> node demo/capturas.js` deja las imágenes en `docs/documentacion/capturas/`; se convierten a JPEG en `capturas_doc/`.

La captura de Listados no se incluye en el documento porque muestra nombres de clientes reales del catálogo.
