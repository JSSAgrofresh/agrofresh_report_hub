-- ----------------------------------------------------------------------------
-- 0040 - Verificaciones: los criterios quedan congelados en cada día
--
-- Hasta ahora el veredicto de cada día se recalculaba al leer con los
-- criterios VIGENTES. Consecuencia: cuando se cambió el rango del output del
-- detector (19–22), los días anteriores -que se hicieron y aprobaron con el
-- rango viejo- pasaron a "No aceptable". Eso es reescribir un registro de
-- calidad: un día se juzga con los criterios que regían ese día.
--
-- `criterios` guarda, por sección, los criterios con que se verificó:
--
--   {"micropipetas": {"micropipetas": [{id, volumen_nominal, tolerancia}],
--                     "tabla_z": [{temperatura, factor}]},
--    "balanza":      {"pesas": [{id, valor_nominal, tolerancia}]},
--    "temperatura":  {"puntos_temperatura": [{id, minimo, maximo}]},
--    "gases":        {"parametros": {"gas_presion_contenido_min": 200, ...}},
--    "detector":     {"parametros": {"output_min": 19, ...}},
--    "inyector":     {}}
--
-- Se llena la primera vez que se guarda cada sección y ya no cambia (limpiar
-- la sección la suelta). Una sección sin congelar usa los criterios vigentes.
--
-- Los días que ya existen quedan con NULL: se congelan con
-- `scripts/congelar_criterios_verificaciones.py`, indicando los valores que
-- regían antes del cambio.
--
--   cd backend
--   .venv\Scripts\python.exe scripts\migrar.py 0040_verificaciones_criterios_congelados.sql
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

ALTER TABLE verif_registro
    ADD COLUMN IF NOT EXISTS criterios JSONB;
