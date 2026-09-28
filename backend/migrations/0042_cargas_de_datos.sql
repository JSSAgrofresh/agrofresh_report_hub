-- ----------------------------------------------------------------------------
-- 0042 - Cargas de datos: cada carga queda registrada y se puede deshacer
--
-- Cada vez que la Ingesta de Datos o el Converter cargan a la base, se anota
-- una fila en `carga_datos` (quién, cuándo, de dónde, qué archivo) y todo lo
-- que esa carga insertó lleva su `carga_id`: solicitudes, resultados,
-- productos aplicados y filas pendientes. Así Ingesta de Datos puede mostrar
-- las últimas cargas y deshacer una exactamente, sin tocar las demás.
--
-- Lo cargado antes de esta migración queda con carga_id NULL: no aparece en
-- el historial y no se puede deshacer desde la pantalla.
--
-- No borra ni cambia datos. Hasta que se corra, el backend sigue cargando
-- igual que antes, solo que sin registrar la carga.
--
--   cd backend
--   .venv\Scripts\python.exe scripts\migrar.py 0042_cargas_de_datos.sql
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS carga_datos (
    id            SERIAL PRIMARY KEY,
    origen        TEXT NOT NULL,              -- 'ingest' (Excel) | 'converter' (PDF)
    archivo       TEXT,                       -- nombre del Excel o de los PDF
    filas         INTEGER NOT NULL DEFAULT 0, -- filas que se mandaron a cargar
    creado_por    TEXT,
    creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deshecha_en   TIMESTAMPTZ,
    deshecha_por  TEXT
);

ALTER TABLE solicitud          ADD COLUMN IF NOT EXISTS carga_id INTEGER REFERENCES carga_datos(id) ON DELETE SET NULL;
ALTER TABLE resultado          ADD COLUMN IF NOT EXISTS carga_id INTEGER REFERENCES carga_datos(id) ON DELETE SET NULL;
ALTER TABLE producto_aplicado  ADD COLUMN IF NOT EXISTS carga_id INTEGER REFERENCES carga_datos(id) ON DELETE SET NULL;
ALTER TABLE pendiente_revision ADD COLUMN IF NOT EXISTS carga_id INTEGER REFERENCES carga_datos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_solicitud_carga          ON solicitud (carga_id);
CREATE INDEX IF NOT EXISTS idx_resultado_carga          ON resultado (carga_id);
CREATE INDEX IF NOT EXISTS idx_producto_aplicado_carga  ON producto_aplicado (carga_id);
CREATE INDEX IF NOT EXISTS idx_pendiente_revision_carga ON pendiente_revision (carga_id);
