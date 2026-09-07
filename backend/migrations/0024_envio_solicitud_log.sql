-- ----------------------------------------------------------------------------
-- 0024 - Trazabilidad del envío de solicitudes por correo
--
-- Detectamos en una inducción que varias personas crearon y "enviaron" su
-- solicitud sin que les llegara la copia. La causa: nadie agregaba
-- automáticamente al creador ni a quien aprieta "Enviar" como copia del
-- correo — solo salía a los contactos configurados del laboratorio y a los
-- invitados que alguien tipeara a mano en el cuadro de envío.
--
-- Esta tabla no arregla eso (el arreglo está en toma_muestras.py, que ahora
-- agrega en Cc a el/la solicitante y a quien envía). Es el registro que
-- faltaba para poder responder, sin adivinar, "¿a quién se le mandó esta
-- solicitud, cuándo, y funcionó?" — incluyendo los envíos que fallan, que
-- antes solo quedaban en el log de la consola de Windows (y esa consola se
-- pierde apenas alguien la cierra).
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS envio_solicitud_log (
    id                SERIAL PRIMARY KEY,

    -- Igual que solicitud_archivo.archivo: la clave con la que la API
    -- identifica la solicitud.
    archivo           TEXT        NOT NULL,
    numero_solicitud  TEXT,
    laboratorio       TEXT,

    -- Quién apretó "Enviar" (no quién creó la solicitud — eso es
    -- destinatarios_cc si corresponde, o simplemente el mismo dato).
    usuario_email     TEXT,
    usuario_nombre    TEXT,

    destinatarios_to  JSONB       NOT NULL DEFAULT '[]',
    destinatarios_cc  JSONB       NOT NULL DEFAULT '[]',
    destinatarios_bcc JSONB       NOT NULL DEFAULT '[]',

    exitoso           BOOLEAN     NOT NULL,
    mensaje_id        TEXT,
    error             TEXT,

    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_envio_solicitud_log_archivo
    ON envio_solicitud_log (archivo);
CREATE INDEX IF NOT EXISTS idx_envio_solicitud_log_creado
    ON envio_solicitud_log (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_envio_solicitud_log_exitoso
    ON envio_solicitud_log (exitoso);
