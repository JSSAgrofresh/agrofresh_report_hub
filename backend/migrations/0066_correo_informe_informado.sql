-- Un envío incorrecto (informe que salió a quien no correspondía) pasa por tres momentos:
--   por informar → se detectó y nadie ha avisado al laboratorio
--   informado    → ya se le avisó al laboratorio (`informado_en`); se espera el reenvío correcto
--   cerrado      → un reenvío llegó a la lista correcta, o se marcó como resuelto (`resuelto_en`)
-- La nota del incidente (a quién se avisó, qué se hizo) va aparte de la nota del rechazo.
ALTER TABLE correo_informe ADD COLUMN IF NOT EXISTS informado_en TIMESTAMPTZ;
ALTER TABLE correo_informe ADD COLUMN IF NOT EXISTS informado_por TEXT;
ALTER TABLE correo_informe ADD COLUMN IF NOT EXISTS nota_incidente TEXT;
