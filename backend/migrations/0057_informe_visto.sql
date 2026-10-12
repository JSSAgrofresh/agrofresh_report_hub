-- «Reporte observado» (Auditoría interna): la primera vez que una cuenta de cliente vio
-- los resultados de una solicitud en Report. Una fila por solicitud y por cuenta; la
-- primera vista queda fija (no se pisa).
CREATE TABLE IF NOT EXISTS informe_visto (
    solicitud_id  BIGINT      NOT NULL REFERENCES solicitud(id) ON DELETE CASCADE,
    usuario_email TEXT        NOT NULL,
    cliente       TEXT,
    planta        TEXT,
    primera_vez   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (solicitud_id, usuario_email)
);
CREATE INDEX IF NOT EXISTS informe_visto_solicitud_idx ON informe_visto (solicitud_id);
