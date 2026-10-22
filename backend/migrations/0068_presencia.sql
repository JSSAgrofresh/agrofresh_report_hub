-- Monitoreo: quién está conectado AHORA. Cada pestaña abierta manda un «latido» cada minuto
-- (POST /api/monitoreo/latido) y deja aquí su última señal. Una fila por cuenta.
--   desde  = cuándo empezó esta conexión (si pasaron más de 10 min sin latido, se reinicia)
CREATE TABLE IF NOT EXISTS presencia (
    email          TEXT        PRIMARY KEY,
    nombre         TEXT,
    tipo_acceso    TEXT,
    area           TEXT,
    ruta           TEXT,
    modulo         TEXT,
    desde          TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_latido  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presencia_latido ON presencia (ultimo_latido DESC);
