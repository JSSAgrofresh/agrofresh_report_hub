-- ----------------------------------------------------------------------------
-- 0016 — Columnas faltantes en producto_aplicado + constraint único
-- Ejecutar en Neon si la tabla fue creada con el schema anterior (sin estas cols)
-- ----------------------------------------------------------------------------
ALTER TABLE producto_aplicado ADD COLUMN IF NOT EXISTS analito_raw   TEXT;
ALTER TABLE producto_aplicado ADD COLUMN IF NOT EXISTS producto_raw  TEXT;
ALTER TABLE producto_aplicado ADD COLUMN IF NOT EXISTS dosis         NUMERIC(12, 4);
ALTER TABLE producto_aplicado ADD COLUMN IF NOT EXISTS linea_proceso TEXT;

-- Agrega la restricción única solo si no existe todavía
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'lab.producto_aplicado'::regclass
          AND contype = 'u'
          AND conname LIKE '%solicitud_id%analito_id%'
    ) THEN
        ALTER TABLE producto_aplicado
            ADD CONSTRAINT producto_aplicado_solicitud_id_analito_id_key
            UNIQUE (solicitud_id, analito_id);
    END IF;
END $$;
