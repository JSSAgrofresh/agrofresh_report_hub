-- ----------------------------------------------------------------------------
-- 0055 - Tipo de servicio de cada solicitud cargada (Ingesta / Converter)
--
-- Línea de proceso, Actimist, Ecofog y RYD tienen cada uno su propio listado
-- de Sold To / Ship To (RYD comparte el de Línea de proceso). Las plantas de
-- Actimist y Ecofog no están en la tabla `planta`, así que sus resultados se
-- guardan con el nombre como texto (`sold_to_raw` / `ship_to_raw`, `planta_id`
-- NULL) y esta columna dice de qué servicio son.
--
--   NULL o ''   Línea de proceso (todo lo cargado hasta hoy)
--   'actimist'  |  'ecofog'  |  'ryd'
--
-- Report solo muestra los servicios que se activen en Administración General →
-- Funciones (de fábrica, solo Línea de proceso).
--
-- No borra ni cambia datos. Es idempotente.
--
--   .venv\Scripts\python.exe scripts\migrar.py 0055_solicitud_servicio.sql
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS servicio TEXT;

CREATE INDEX IF NOT EXISTS idx_solicitud_servicio
    ON solicitud (servicio) WHERE servicio IS NOT NULL;
