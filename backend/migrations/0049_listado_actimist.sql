-- ----------------------------------------------------------------------------
-- 0049 - Listado propio de Actimist (Sold To / Ship To)
--
-- Las tablas `cliente` y `planta` pasan a ser el listado de LINEA DE PROCESO,
-- sin ningun cambio: Ingesta, Converter, Report y todo lo demas las siguen
-- leyendo igual. Actimist tiene su listado aparte, con la misma forma, para
-- que el formulario de la solicitud use uno u otro segun el Tipo Aplicacion.
--
-- Un cliente que esta en los dos servicios existe en las dos tablas, sin
-- choque. Nada referencia estas tablas todavia (la solicitud de Report sigue
-- apuntando solo a `planta`).
--
-- Solo crea tablas nuevas: no toca datos existentes. Es idempotente.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS cliente_actimist (
    id          SERIAL  PRIMARY KEY,
    nombre      TEXT    NOT NULL,
    codigo_sap  TEXT,
    rut         TEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (nombre)
);

CREATE TABLE IF NOT EXISTS planta_actimist (
    id          SERIAL  PRIMARY KEY,
    cliente_id  INTEGER NOT NULL REFERENCES cliente_actimist(id) ON DELETE CASCADE,
    nombre      TEXT    NOT NULL,
    codigo_sap  TEXT,
    ciudad      TEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (cliente_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_cliente_actimist_codigo ON cliente_actimist (codigo_sap);
CREATE INDEX IF NOT EXISTS idx_planta_actimist_cliente ON planta_actimist (cliente_id);
