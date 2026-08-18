-- Bandeja de revisión: filas de Ingest o Converter que traen un valor fuera
-- del catálogo real (no coincide EXACTO con ningún valor ya cargado en
-- especie/variedad/tipo_servicio/laboratorio/sold_to_raw/ship_to_raw) ya no
-- se insertan directo en solicitud -antes se auto-creaban cliente/planta
-- nuevos sin avisar-: quedan acá para aprobar, corregir o descartar a mano
-- desde DataCore. Se guarda la fila cruda tal como llegó para poder re-
-- procesarla con el mismo mapeo.py una vez resuelta.
CREATE TABLE IF NOT EXISTS lab.pendiente_revision (
    id SERIAL PRIMARY KEY,
    origen TEXT NOT NULL CHECK (origen IN ('ingest', 'converter')),
    fila JSONB NOT NULL,
    motivos JSONB NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- De dónde vino cada solicitud (para poder filtrar/marcar en DataCore).
-- Nulo para todo lo cargado antes de esta migración -no se sabe su origen-.
ALTER TABLE lab.solicitud ADD COLUMN IF NOT EXISTS origen TEXT;
