-- Monitoreo: historial de conexiones. `presencia` solo guarda la última señal de cada cuenta; aquí queda cada
-- visita: una fila por conexión (si pasan más de 10 min sin latido, la siguiente señal abre una nueva).
--   segundos_activos = tiempo en que de verdad usó el sistema (pestaña a la vista y tocando algo)
--   duración conectado = ultimo_latido - inicio
CREATE TABLE IF NOT EXISTS presencia_sesion (
    id               BIGSERIAL   PRIMARY KEY,
    email            TEXT        NOT NULL,
    nombre           TEXT,
    tipo_acceso      TEXT,
    cliente          TEXT,
    planta           TEXT,
    dispositivo      TEXT,
    version          TEXT,
    inicio           TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_latido    TIMESTAMPTZ NOT NULL DEFAULT now(),
    segundos_activos INTEGER     NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_presencia_sesion_email ON presencia_sesion (email, ultimo_latido DESC);
CREATE INDEX IF NOT EXISTS idx_presencia_sesion_latido ON presencia_sesion (ultimo_latido DESC);
