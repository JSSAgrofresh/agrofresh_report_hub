-- ----------------------------------------------------------------------------
-- 0053 - N° de muestra del laboratorio externo en la solicitud (resultados)
--
-- Quiteca imprime en su informe «Identificación de la Muestra N° 85930». Se
-- guarda para que salga en «N° Muestra» de la BD de Report. Sin esta migración
-- la carga y la descarga siguen funcionando, solo sin ese dato.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS codigo_muestra TEXT;
