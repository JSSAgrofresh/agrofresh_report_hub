-- "Listados" pasa a ser la fuente de verdad para Especie y Variedad (antes
-- eran texto libre en el formulario de Toma de muestras). Sold To / Ship To
-- ya vivían en cliente/planta (ver 0007) y se siguen usando tal cual -esta
-- migración solo agrega las dos listas que faltaban.
--
-- Ejecutar una sola vez:
--   psql -U postgres -d tu_base -f migrations/0011_listados_especie_variedad.sql

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS valor_lista (
    id SERIAL PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('especie', 'variedad')),
    valor TEXT NOT NULL,
    valor_normalizado TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    -- Si esta fila fue "fusionada" hacia otra durante una homogenización,
    -- apunta al id del valor estándar que la reemplazó (trazabilidad; no se
    -- borra el valor original ni se reescriben solicitudes históricas).
    fusionado_en_id INTEGER REFERENCES valor_lista(id),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tipo, valor_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_valor_lista_tipo_activo ON valor_lista (tipo, activo);
