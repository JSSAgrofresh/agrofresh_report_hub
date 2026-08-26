-- recuperar_schema.sql
-- Asegura que todas las tablas criticas existan con el schema correcto.
-- Ejecutar despues de aplicar las migraciones en recuperar-todo.ps1

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS lab.valor_lista (
    id                SERIAL PRIMARY KEY,
    tipo              TEXT NOT NULL,
    valor             TEXT NOT NULL,
    valor_normalizado TEXT NOT NULL,
    activo            BOOLEAN NOT NULL DEFAULT true,
    fusionado_en_id   INTEGER REFERENCES lab.valor_lista(id),
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lab.valor_lista ADD COLUMN IF NOT EXISTS es_estandar BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE lab.valor_lista ADD COLUMN IF NOT EXISTS especie_id  INTEGER REFERENCES lab.valor_lista(id);

CREATE INDEX IF NOT EXISTS idx_valor_lista_tipo_activo ON lab.valor_lista (tipo, activo);
CREATE INDEX IF NOT EXISTS idx_valor_lista_estandar    ON lab.valor_lista (tipo, es_estandar);
CREATE INDEX IF NOT EXISTS idx_valor_lista_especie_id  ON lab.valor_lista (especie_id);

ALTER TABLE lab.producto_aplicado ADD COLUMN IF NOT EXISTS tipo_aplicacion text;
ALTER TABLE lab.producto_aplicado ADD COLUMN IF NOT EXISTS dosis           text;
ALTER TABLE lab.producto_aplicado ADD COLUMN IF NOT EXISTS unidad_dosis    text;
ALTER TABLE lab.producto_aplicado ADD COLUMN IF NOT EXISTS fecha_aplicacion date;
