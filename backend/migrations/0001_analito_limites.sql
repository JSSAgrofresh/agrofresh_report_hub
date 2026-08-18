-- Agrega los límites residuales editables por analito (módulo Report).
-- Los límites de CONTROL (superior/inferior) no se guardan en ninguna parte:
-- se calculan en tiempo real como promedio ± N desviaciones estándar sobre
-- los datos filtrados, así que no necesitan columnas.
--
-- Ejecutar una sola vez contra tu base real:
--   psql -U postgres -d tu_base -f migrations/0001_analito_limites.sql

SET search_path = lab, public;

ALTER TABLE analito ADD COLUMN IF NOT EXISTS limite_min NUMERIC(12, 6);
ALTER TABLE analito ADD COLUMN IF NOT EXISTS limite_central NUMERIC(12, 6);
ALTER TABLE analito ADD COLUMN IF NOT EXISTS limite_max NUMERIC(12, 6);
