-- Rediseño de la homogenización: un grupo de valores parecidos NO es
-- automáticamente "una variedad" -puede contener más de una variedad real
-- con nombres parecidos (ej. "Packham" vs "Packham's Triumph"). El grupo de
-- similitud pasa a ser solo una ayuda de revisión; quien decide en qué
-- variedad(es) estandarizada(s) se separa es el administrador, a mano, desde
-- el mantenedor.
--
-- Ejecutar una sola vez:
--   psql -U postgres -d tu_base -f migrations/0012_listados_estandares.sql

SET search_path = lab, public;

ALTER TABLE valor_lista ADD COLUMN IF NOT EXISTS es_estandar BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_valor_lista_estandar ON valor_lista (tipo, es_estandar);
