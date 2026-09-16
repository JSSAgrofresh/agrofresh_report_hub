SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS notificacion (
    id          SERIAL PRIMARY KEY,
    titulo      TEXT NOT NULL,
    resumen     TEXT NOT NULL,
    cuerpo      TEXT NOT NULL DEFAULT '',
    categoria   TEXT NOT NULL
                CHECK (categoria IN ('actualizacion', 'sistema', 'cromatografia')),
    audiencia   TEXT NOT NULL DEFAULT 'todos'
                CHECK (audiencia IN ('todos', 'admin_general', 'cromatografia')),
    publicado   BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    creado_por  TEXT
);

CREATE TABLE IF NOT EXISTS notificacion_leida (
    notificacion_id INTEGER NOT NULL REFERENCES notificacion(id) ON DELETE CASCADE,
    usuario_id      INTEGER NOT NULL REFERENCES usuario(id)      ON DELETE CASCADE,
    leida_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (notificacion_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_publicado
    ON notificacion (publicado, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_notif_leida_u
    ON notificacion_leida (usuario_id);
