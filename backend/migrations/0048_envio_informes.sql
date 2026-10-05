-- ----------------------------------------------------------------------------
-- 0048 - Envío de informes a clientes (AgroFresh Lab → Envío de informes)
--
-- Deja constancia de cada envío, exitoso o no: quién, cuándo, en qué modo
-- (prueba o producción), a qué planta, a quién SE PIDIÓ enviar y a quién salió
-- de verdad (en modo prueba, salen solo a Paz y Jorge aunque se pida a clientes).
--
-- Es idempotente: se puede ejecutar mas de una vez.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS envio_informe_log (
    id             BIGSERIAL   PRIMARY KEY,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_email  TEXT,
    usuario_nombre TEXT,
    modo           TEXT        NOT NULL,          -- 'prueba' | 'produccion'
    laboratorio    TEXT,
    sold_to        TEXT,
    ship_to        TEXT,
    especie        TEXT,
    asunto         TEXT,
    para           JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- lo que se pidió
    cc             JSONB       NOT NULL DEFAULT '[]'::jsonb,
    bcc            JSONB       NOT NULL DEFAULT '[]'::jsonb,
    enviado_to     JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- a quién salió de verdad
    enviado_cc     JSONB       NOT NULL DEFAULT '[]'::jsonb,
    enviado_bcc    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    adjuntos       JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- [{nombre, bytes}]
    exitoso        BOOLEAN     NOT NULL,
    mensaje_id     TEXT,
    error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_envio_informe_log_fecha ON envio_informe_log (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_envio_informe_log_usuario ON envio_informe_log (usuario_email, creado_en DESC);
