-- Plan de entregables de los comerciales: cuántos análisis se prometieron por cliente (Sold To) y servicio
-- en la temporada. Alimenta las columnas «Entregables» de «Análisis por cliente» (Auditoría interna).
-- Una carga reemplaza el plan de su temporada. `planta_plan` es el nombre tal como lo escribió el comercial
-- (no es un Ship To oficial: no se adivina).
CREATE TABLE IF NOT EXISTS plan_entregable (
    id          SERIAL      PRIMARY KEY,
    temporada   TEXT        NOT NULL DEFAULT '2026-27',
    sold_to     TEXT        NOT NULL,
    planta_plan TEXT,
    comercial   TEXT,
    servicio    TEXT        NOT NULL,
    cantidad    INTEGER     NOT NULL CHECK (cantidad >= 0),
    cargado_por TEXT,
    cargado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_entregable_sold_to_idx ON plan_entregable (temporada, lower(sold_to));
