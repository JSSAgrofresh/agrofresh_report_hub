-- Plan de entregables 2026-27 (archivo «Entregables_cerezas_26-27»): ahora se carga con su detalle (código SAP del Sold To, planta,
-- línea, semana, tipo de cliente, tipo de servicio y peak) y con las DOS cantidades que trae cada fila: la Original (lo que había
-- entregado el comercial) y la Propuesta. `cantidad` se mantiene (= la propuesta) para lo que ya la lee. Idempotente.
ALTER TABLE plan_entregable ADD COLUMN IF NOT EXISTS sold_to_sap  TEXT;
ALTER TABLE plan_entregable ADD COLUMN IF NOT EXISTS linea        INTEGER;
ALTER TABLE plan_entregable ADD COLUMN IF NOT EXISTS semana       TEXT;
ALTER TABLE plan_entregable ADD COLUMN IF NOT EXISTS tipo_cliente TEXT;
ALTER TABLE plan_entregable ADD COLUMN IF NOT EXISTS tipo_servicio TEXT;
ALTER TABLE plan_entregable ADD COLUMN IF NOT EXISTS peak         TEXT;
ALTER TABLE plan_entregable ADD COLUMN IF NOT EXISTS original     INTEGER CHECK (original IS NULL OR original >= 0);
ALTER TABLE plan_entregable ADD COLUMN IF NOT EXISTS propuesta    INTEGER CHECK (propuesta IS NULL OR propuesta >= 0);
CREATE INDEX IF NOT EXISTS plan_entregable_semana_idx ON plan_entregable (temporada, semana);
