-- Migración 0038: soporte para solicitudes de reanálisis
-- Agrega tipo_solicitud, vínculo a la original y motivo en solicitud_archivo.

ALTER TABLE solicitud_archivo
  ADD COLUMN IF NOT EXISTS tipo_solicitud   TEXT    NOT NULL DEFAULT 'CONVENCIONAL'
                                            CHECK (tipo_solicitud IN ('CONVENCIONAL', 'REANALISIS')),
  ADD COLUMN IF NOT EXISTS solicitud_original_archivo TEXT REFERENCES solicitud_archivo(archivo),
  ADD COLUMN IF NOT EXISTS motivo_reanalisis TEXT;

-- Índice para buscar el reanálisis de una solicitud original
CREATE UNIQUE INDEX IF NOT EXISTS uq_reanalisis_por_original
  ON solicitud_archivo (solicitud_original_archivo)
  WHERE solicitud_original_archivo IS NOT NULL;

-- Índice de búsqueda rápida por tipo
CREATE INDEX IF NOT EXISTS idx_solicitud_archivo_tipo
  ON solicitud_archivo (tipo_solicitud);
