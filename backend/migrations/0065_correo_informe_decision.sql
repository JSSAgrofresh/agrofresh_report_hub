-- Ingreso de informes: qué se decidió con cada informe que llegó por correo.
--   pendiente  → todavía nadie lo revisó
--   aceptado   → se aceptó (se cargó a la base, o ya estaba cargado y solo se marcó revisado)
--   rechazado  → se descartó (con su motivo en `nota`)
ALTER TABLE correo_informe ADD COLUMN IF NOT EXISTS decision TEXT NOT NULL DEFAULT 'pendiente';
ALTER TABLE correo_informe ADD COLUMN IF NOT EXISTS decidido_en TIMESTAMPTZ;
ALTER TABLE correo_informe ADD COLUMN IF NOT EXISTS decidido_por TEXT;
-- La carga a la base que hizo «Aceptar» (carga_datos.id), para poder deshacerla.
ALTER TABLE correo_informe ADD COLUMN IF NOT EXISTS carga_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_correo_informe_decision ON correo_informe (decision);
