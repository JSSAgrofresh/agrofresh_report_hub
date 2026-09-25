-- ----------------------------------------------------------------------------
-- 0041 - Verificaciones: el output del detector pasa a ser SOLO REGISTRO
--
-- Decisión del laboratorio (25-09-2026): el output del detector se sigue
-- anotando -para ver su tendencia en el histórico-, pero ya no tiene rango
-- ni decide si la sección o el día son aceptables. Aplica a TODOS los días,
-- también a los anteriores.
--
-- Se borra su rango del catálogo y se ponen al día los resultados guardados
-- del detector. El veredicto del día se recalcula al leer, así que la
-- pantalla queda bien apenas se reinicia el backend; la columna
-- `verif_registro.resultado` se pone al día sola la próxima vez que se guarde
-- cada día.
--
--   cd backend
--   .venv\Scripts\python.exe scripts\migrar.py 0041_verificaciones_output_solo_registro.sql
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

DELETE FROM verif_parametro WHERE clave IN ('output_min', 'output_max');

UPDATE verif_detector
   SET resultado_output = CASE WHEN output_detector IS NULL THEN '' ELSE 'Registrado' END,
       resultado = CASE
           WHEN 'No aceptable' IN (resultado_voltaje, resultado_metodo) THEN 'No aceptable'
           WHEN 'Aceptable'    IN (resultado_voltaje, resultado_metodo) THEN 'Aceptable'
           ELSE ''
       END;
