-- Agrega campo de observación a la pregunta de fugas visibles.
-- Solo aparece cuando fugas_visibles = 'Sí'.
ALTER TABLE verif_registro
    ADD COLUMN IF NOT EXISTS fugas_observacion TEXT NOT NULL DEFAULT '';
