SET search_path = lab, public;

-- Enlace entre una notificación y el objeto que la originó
-- (ej. {"tipo": "verificacion", "fecha": "2026-09-15"})
ALTER TABLE notificacion
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Cuándo y quién confirmó la revisión del día
ALTER TABLE verif_registro
  ADD COLUMN IF NOT EXISTS revisado_en TIMESTAMPTZ;
