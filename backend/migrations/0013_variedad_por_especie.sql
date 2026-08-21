-- Variedad pasa a estar ligada a una Especie (antes era una lista única
-- compartida por todas). Es necesario porque hay nombres de variedad
-- reales que se repiten en especies distintas (ej. "June Gold" existe
-- tanto en Durazno como en Manzana, "Murcott" en Clementina y en
-- Mandarina) -con la lista plana esos pares se fusionaban en un solo
-- valor, lo cual es incorrecto-.
--
-- Ejecutar una sola vez:
--   psql -U postgres -d tu_base -f migrations/0013_variedad_por_especie.sql

SET search_path = lab, public;

ALTER TABLE valor_lista ADD COLUMN IF NOT EXISTS especie_id INTEGER REFERENCES valor_lista(id);
CREATE INDEX IF NOT EXISTS idx_valor_lista_especie_id ON valor_lista (especie_id);

-- La restricción única original (tipo, valor_normalizado) ya no sirve para
-- variedad -el mismo texto puede existir bajo dos especies distintas-. Se
-- reemplaza por dos índices únicos parciales: uno para especie (global,
-- como antes) y otro para variedad (único DENTRO de cada especie).
ALTER TABLE valor_lista DROP CONSTRAINT IF EXISTS valor_lista_tipo_valor_normalizado_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_valor_lista_especie_unica
    ON valor_lista (valor_normalizado) WHERE tipo = 'especie';

CREATE UNIQUE INDEX IF NOT EXISTS idx_valor_lista_variedad_unica
    ON valor_lista (especie_id, valor_normalizado) WHERE tipo = 'variedad';
