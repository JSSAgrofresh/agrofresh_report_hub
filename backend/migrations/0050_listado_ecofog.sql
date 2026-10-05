-- ----------------------------------------------------------------------------
-- 0050 - Listado propio de Ecofog (Sold To / Ship To)
--
-- Ecofog es una copia de Actimist: misma forma de listado, en tablas aparte.
-- Parte como una COPIA del listado de Actimist de hoy (cliente por cliente y
-- planta por planta); desde ahi cada servicio se edita por separado, con el
-- selector «Tipo de servicio» de Listados.
--
-- Solo crea tablas nuevas y copia datos hacia ellas: no toca `cliente`,
-- `planta` ni las de Actimist. Es idempotente (volver a correrla no duplica).
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS cliente_ecofog (
    id          SERIAL  PRIMARY KEY,
    nombre      TEXT    NOT NULL,
    codigo_sap  TEXT,
    rut         TEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (nombre)
);

CREATE TABLE IF NOT EXISTS planta_ecofog (
    id          SERIAL  PRIMARY KEY,
    cliente_id  INTEGER NOT NULL REFERENCES cliente_ecofog(id) ON DELETE CASCADE,
    nombre      TEXT    NOT NULL,
    codigo_sap  TEXT,
    ciudad      TEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (cliente_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_cliente_ecofog_codigo ON cliente_ecofog (codigo_sap);
CREATE INDEX IF NOT EXISTS idx_planta_ecofog_cliente ON planta_ecofog (cliente_id);

INSERT INTO cliente_ecofog (nombre, codigo_sap, rut, activo)
SELECT nombre, codigo_sap, rut, activo FROM cliente_actimist
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO planta_ecofog (cliente_id, nombre, codigo_sap, ciudad, activo)
SELECT ce.id, pa.nombre, pa.codigo_sap, pa.ciudad, pa.activo
FROM planta_actimist pa
JOIN cliente_actimist ca ON ca.id = pa.cliente_id
JOIN cliente_ecofog ce ON ce.nombre = ca.nombre
ON CONFLICT (cliente_id, nombre) DO NOTHING;
