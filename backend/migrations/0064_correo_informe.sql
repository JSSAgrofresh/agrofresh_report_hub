-- Ingesta de Datos → Correo: los informes que los laboratorios mandan al buzón del Report Hub.
--
-- Una fila por PDF de informe que llegó por correo, ya leído y revisado contra su solicitud (OT):
-- el laboratorio, el N° de informe, a quién debía llegar y a quién llegó. Etapa 1: solo se lee y
-- se clasifica; nada de esto se carga a la base de resultados hasta que alguien lo acepte.
CREATE TABLE IF NOT EXISTS correo_informe (
    id                 SERIAL PRIMARY KEY,
    buzon              TEXT        NOT NULL,
    message_id         TEXT        NOT NULL,
    pdf_nombre         TEXT        NOT NULL,
    pdf_sha256         TEXT        NOT NULL,
    r2_key             TEXT,
    -- El correo
    asunto             TEXT,
    remitente          TEXT,
    llegada_en         TIMESTAMPTZ,          -- cuándo lo recibió el buzón
    enviado_en         TIMESTAMPTZ,          -- la fecha que trae el correo
    para               JSONB       NOT NULL DEFAULT '[]',
    cc                 JSONB       NOT NULL DEFAULT '[]',
    bcc                JSONB       NOT NULL DEFAULT '[]',
    -- El informe
    laboratorio        TEXT,
    soportado          BOOLEAN     NOT NULL DEFAULT TRUE,   -- ¿hay lector para ese laboratorio?
    nro_informe        TEXT,
    ot                 TEXT,
    sold_to            TEXT,
    ship_to            TEXT,
    especie            TEXT,
    fecha_muestreo     DATE,
    archivo_solicitud  TEXT,                 -- la solicitud que encontró por la OT
    -- La revisión
    esperado           JSONB       NOT NULL DEFAULT '{}',   -- {to, cc, bcc} según la solicitud
    hallazgos          JSONB       NOT NULL DEFAULT '[]',   -- [{nivel, codigo, texto}]
    estado             TEXT        NOT NULL DEFAULT 'ok',   -- ok | amarillo | rojo
    ya_cargado         BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Revisión humana (etapas siguientes)
    revisado_en        TIMESTAMPTZ,
    revisado_por       TEXT,
    resuelto_en        TIMESTAMPTZ,
    resuelto_por       TEXT,
    nota               TEXT,
    creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un correo con el mismo PDF no se registra dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS idx_correo_informe_unico ON correo_informe (message_id, pdf_sha256);
CREATE INDEX IF NOT EXISTS idx_correo_informe_llegada ON correo_informe (llegada_en DESC);
CREATE INDEX IF NOT EXISTS idx_correo_informe_ot ON correo_informe (ot);

-- Los correos ya examinados (también los que no traían un informe: respuestas, imágenes, otros PDF)
-- para no bajarlos de nuevo en cada revisión. El buzón NUNCA se toca: no se marca ni se mueve nada.
CREATE TABLE IF NOT EXISTS correo_informe_visto (
    buzon       TEXT        NOT NULL,
    message_id  TEXT        NOT NULL,
    motivo      TEXT        NOT NULL,
    visto_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (buzon, message_id)
);

-- Cada revisión del buzón (a mano con «Revisar ahora» o programada).
CREATE TABLE IF NOT EXISTS correo_informe_sondeo (
    id          SERIAL PRIMARY KEY,
    iniciado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    terminado_en TIMESTAMPTZ,
    disparado_por TEXT,
    dias        INTEGER,
    examinados  INTEGER     NOT NULL DEFAULT 0,
    nuevos      INTEGER     NOT NULL DEFAULT 0,
    error       TEXT
);
