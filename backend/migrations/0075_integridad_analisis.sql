-- Integridad de datos (Administración General): cada análisis que compara las solicitudes con los informes de los laboratorios.
-- Guarda el resultado completo (resumen, laboratorios y hallazgos) para poder verlo, compararlo en el tiempo y emitir el informe de errores.
CREATE TABLE IF NOT EXISTS integridad_analisis (
    id            BIGSERIAL PRIMARY KEY,
    iniciado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    terminado_en  TIMESTAMPTZ,
    origen        TEXT        NOT NULL DEFAULT 'manual',     -- manual | nocturno
    usuario       TEXT,
    con_pdf       BOOLEAN     NOT NULL DEFAULT FALSE,        -- ¿se volvieron a leer los PDF?
    estado        TEXT        NOT NULL DEFAULT 'en_curso',   -- en_curso | listo | error
    avance        TEXT,
    error         TEXT,
    resumen       JSONB,
    laboratorios  JSONB,
    hallazgos     JSONB
);
CREATE INDEX IF NOT EXISTS idx_integridad_analisis_iniciado ON integridad_analisis (iniciado_en DESC);
