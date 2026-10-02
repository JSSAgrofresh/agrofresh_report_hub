-- ----------------------------------------------------------------------------
-- 0047 - Registro de actividad de usuarios (Administración General)
--
-- Guarda lo que no queda anotado en ninguna otra tabla: inicios de sesión (y
-- los fallidos), visitas a cada módulo y los cambios sensibles (permisos,
-- cuentas, borrados, cargas deshechas). Lo demás que hace cada persona (enviar
-- solicitudes, cargar datos, cruzar muestras, verificaciones) ya está en sus
-- propias tablas y el panel lo une desde ahí.
--
-- Es idempotente: se puede ejecutar mas de una vez.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS actividad_usuario (
    id         BIGSERIAL   PRIMARY KEY,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    email      TEXT,                          -- quien hizo la accion (minusculas)
    nombre     TEXT,
    categoria  TEXT        NOT NULL,          -- 'acceso' | 'visita' | 'sensible'
    accion     TEXT        NOT NULL,          -- 'login', 'login_fallido', 'visita', 'permisos', ...
    modulo     TEXT,                          -- solo en visitas
    detalle    TEXT,
    sensible   BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_actividad_usuario_fecha ON actividad_usuario (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_actividad_usuario_email ON actividad_usuario (email, creado_en DESC);
