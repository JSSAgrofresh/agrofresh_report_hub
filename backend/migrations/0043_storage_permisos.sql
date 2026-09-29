-- ----------------------------------------------------------------------------
-- 0043 - Permisos por carpeta en Storage
--
-- Hasta ahora Storage se abría entero o no se abría: quien tenía el módulo veía
-- TODAS las carpetas. Desde acá una carpeta puede "restringirse" a ciertas
-- cuentas.
--
-- Reglas (las aplica app/storage_permisos.py):
--
--   * Una carpeta SIN filas aquí es abierta: la ve todo el que tenga el módulo.
--     Así nada de lo que ya existe cambia el día que se aplica la migración.
--   * Una carpeta CON filas es restringida: solo la ven esas cuentas, más el
--     admin general y gerencia (que ven todo).
--   * Las subcarpetas heredan la regla de la carpeta restringida más cercana
--     hacia arriba. Una subcarpeta puede restringirse más, nunca ampliar.
--
-- `espacio` es 'local' (disco del servidor) o 'r2' (bucket). `ruta` va sin "/"
-- al principio ni al final: 'Clientes/DOLE' o 'solicitudes/DOLE CHILE S.A'.
--
-- Es idempotente.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS storage_permiso (
    id          SERIAL      PRIMARY KEY,
    espacio     TEXT        NOT NULL CHECK (espacio IN ('local', 'r2')),
    ruta        TEXT        NOT NULL,
    usuario_id  INTEGER     NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    creado_por  TEXT,
    UNIQUE (espacio, ruta, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_storage_permiso_usuario ON storage_permiso (usuario_id);
