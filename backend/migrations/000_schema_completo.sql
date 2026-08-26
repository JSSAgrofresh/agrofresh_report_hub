-- =============================================================================
-- SCHEMA COMPLETO — AgroFresh Report Hub
-- Ejecutar UNA SOLA VEZ en una base de datos vacía (ej. Neon, Supabase).
-- Incluye el schema base + todas las migraciones (0001–0015) en orden.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 0. Crear schema
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS lab;
SET search_path = lab, public;

-- ----------------------------------------------------------------------------
-- 1. Tablas base (schema original, antes de las migraciones numeradas)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cliente (
    id          SERIAL PRIMARY KEY,
    nombre      TEXT NOT NULL,
    codigo_sap  TEXT,
    activo      BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (nombre)
);

CREATE TABLE IF NOT EXISTS planta (
    id          SERIAL PRIMARY KEY,
    cliente_id  INTEGER NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
    nombre      TEXT NOT NULL,
    codigo_sap  TEXT,
    activo      BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (cliente_id, nombre)
);

CREATE TABLE IF NOT EXISTS analito (
    id                    SERIAL PRIMARY KEY,
    codigo                TEXT,
    nombre                TEXT NOT NULL,
    categoria             TEXT,
    laboratorio           TEXT,
    unidad                TEXT,
    limite_deteccion      TEXT,
    matriz                TEXT,
    activo                BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (codigo, laboratorio)
);

CREATE TABLE IF NOT EXISTS solicitud (
    id               SERIAL PRIMARY KEY,
    nro_solicitud    TEXT,
    laboratorio      TEXT,
    fecha_muestreo   DATE,
    fecha_entrada    DATE,
    especie          TEXT,
    variedad         TEXT,
    semana_muestreo  INTEGER,
    mes              INTEGER,
    temporada        TEXT,
    tipo_servicio    TEXT,
    planta_id        INTEGER REFERENCES planta(id),
    sold_to_raw      TEXT,
    ship_to_raw      TEXT,
    vigente          BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS resultado (
    id           SERIAL PRIMARY KEY,
    solicitud_id INTEGER NOT NULL REFERENCES solicitud(id) ON DELETE CASCADE,
    analito_id   INTEGER REFERENCES analito(id),
    analito_raw  TEXT,
    valor_num    NUMERIC(18, 6),
    valor_texto  TEXT
);

CREATE TABLE IF NOT EXISTS producto_aplicado (
    id               SERIAL PRIMARY KEY,
    solicitud_id     INTEGER NOT NULL REFERENCES solicitud(id) ON DELETE CASCADE,
    analito_id       INTEGER REFERENCES analito(id),
    analito_raw      TEXT,
    producto_raw     TEXT,
    dosis            NUMERIC(12, 4),
    tipo_aplicacion  TEXT,
    linea_proceso    TEXT,
    UNIQUE (solicitud_id, analito_id)
);

-- ----------------------------------------------------------------------------
-- 0001 — Columnas de límites en analito
-- ----------------------------------------------------------------------------
ALTER TABLE analito ADD COLUMN IF NOT EXISTS limite_min      NUMERIC(12, 6);
ALTER TABLE analito ADD COLUMN IF NOT EXISTS limite_central  NUMERIC(12, 6);
ALTER TABLE analito ADD COLUMN IF NOT EXISTS limite_max      NUMERIC(12, 6);

-- ----------------------------------------------------------------------------
-- 0002 — (solo recalcula semana_muestreo en datos existentes, sin DDL)
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 0003 — Catálogo inicial de clientes (datos de referencia AgroFresh)
--         Se omite aquí: son cientos de INSERT que se pueden cargar después
--         con el script importar_listados_excel.py. La estructura ya existe.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 0004 — Reset de datos transaccionales (solo para desarrollo, no aplica aquí)
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 0005 — analito_limite + limite_cuantificacion
-- ----------------------------------------------------------------------------
ALTER TABLE analito ADD COLUMN IF NOT EXISTS limite_cuantificacion TEXT;

CREATE TABLE IF NOT EXISTS analito_limite (
    id               SERIAL PRIMARY KEY,
    analito_id       INTEGER NOT NULL REFERENCES analito(id) ON DELETE CASCADE,
    especie          TEXT NOT NULL DEFAULT '',
    tipo_servicio    TEXT NOT NULL DEFAULT '',
    limite_min       NUMERIC(12, 6),
    limite_central   NUMERIC(12, 6),
    limite_max       NUMERIC(12, 6),
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (analito_id, especie, tipo_servicio)
);

-- ----------------------------------------------------------------------------
-- 0006 — pendiente_revision + columna origen en solicitud
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pendiente_revision (
    id          SERIAL PRIMARY KEY,
    origen      TEXT NOT NULL CHECK (origen IN ('ingest', 'converter')),
    fila        JSONB NOT NULL,
    motivos     JSONB NOT NULL,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS origen TEXT;

-- ----------------------------------------------------------------------------
-- 0007 — columnas extra en cliente/planta (rut, ciudad)
--         Los INSERT masivos de Sold To/Ship To se omiten (van aparte).
-- ----------------------------------------------------------------------------
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS rut TEXT;
ALTER TABLE planta  ADD COLUMN IF NOT EXISTS ciudad TEXT;

-- ----------------------------------------------------------------------------
-- 0008 — informe_config + informe_folio
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS informe_config (
    id                    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    analizado_por_nombre  TEXT NOT NULL DEFAULT '',
    analizado_por_cargo   TEXT NOT NULL DEFAULT 'Analista de Laboratorio',
    aprobado_por_nombre   TEXT NOT NULL DEFAULT '',
    aprobado_por_cargo    TEXT NOT NULL DEFAULT 'Jefe(a) Laboratorio de Cromatografía',
    actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO informe_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS informe_folio (
    fecha     DATE PRIMARY KEY,
    siguiente INTEGER NOT NULL DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- 0009 — fecha_recepcion en solicitud
-- ----------------------------------------------------------------------------
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS fecha_recepcion DATE;

-- ----------------------------------------------------------------------------
-- 0010 — informe_folio_anual (reemplaza informe_folio)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS informe_folio_anual (
    anio      INTEGER PRIMARY KEY,
    siguiente INTEGER NOT NULL DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- 0011 — valor_lista (Especie y Variedad)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS valor_lista (
    id                SERIAL PRIMARY KEY,
    tipo              TEXT NOT NULL CHECK (tipo IN ('especie', 'variedad')),
    valor             TEXT NOT NULL,
    valor_normalizado TEXT NOT NULL,
    activo            BOOLEAN NOT NULL DEFAULT true,
    fusionado_en_id   INTEGER REFERENCES valor_lista(id),
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tipo, valor_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_valor_lista_tipo_activo ON valor_lista (tipo, activo);

-- ----------------------------------------------------------------------------
-- 0012 — es_estandar en valor_lista
-- ----------------------------------------------------------------------------
ALTER TABLE valor_lista ADD COLUMN IF NOT EXISTS es_estandar BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_valor_lista_estandar ON valor_lista (tipo, es_estandar);

-- ----------------------------------------------------------------------------
-- 0013 — especie_id en valor_lista (variedad ligada a especie)
-- ----------------------------------------------------------------------------
ALTER TABLE valor_lista ADD COLUMN IF NOT EXISTS especie_id INTEGER REFERENCES valor_lista(id);

CREATE INDEX IF NOT EXISTS idx_valor_lista_especie_id ON valor_lista (especie_id);

ALTER TABLE valor_lista DROP CONSTRAINT IF EXISTS valor_lista_tipo_valor_normalizado_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_valor_lista_especie_unica
    ON valor_lista (valor_normalizado) WHERE tipo = 'especie';

CREATE UNIQUE INDEX IF NOT EXISTS idx_valor_lista_variedad_unica
    ON valor_lista (especie_id, valor_normalizado) WHERE tipo = 'variedad';

-- ----------------------------------------------------------------------------
-- 0014 — mapeo_confirmado (memoria de Sold To / Ship To)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mapeo_confirmado (
    id                      SERIAL PRIMARY KEY,
    entidad                 TEXT NOT NULL CHECK (entidad IN ('sold_to', 'ship_to')),
    cliente_id              INTEGER REFERENCES cliente(id),
    valor_crudo             TEXT NOT NULL,
    valor_crudo_normalizado TEXT NOT NULL,
    destino_id              INTEGER NOT NULL,
    creado_en               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entidad, cliente_id, valor_crudo_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_mapeo_confirmado_busqueda
    ON mapeo_confirmado (entidad, cliente_id, valor_crudo_normalizado);

-- ----------------------------------------------------------------------------
-- 0015 — Fix activo NULL → true en cliente y planta
-- ----------------------------------------------------------------------------
UPDATE cliente SET activo = true WHERE activo IS NULL;
UPDATE planta  SET activo = true WHERE activo IS NULL;

ALTER TABLE cliente ALTER COLUMN activo SET DEFAULT true;
ALTER TABLE planta  ALTER COLUMN activo SET DEFAULT true;
ALTER TABLE cliente ALTER COLUMN activo SET NOT NULL;
ALTER TABLE planta  ALTER COLUMN activo SET NOT NULL;

-- ----------------------------------------------------------------------------
-- 0016 — Columnas faltantes en producto_aplicado + constraint único
-- ----------------------------------------------------------------------------
ALTER TABLE producto_aplicado ADD COLUMN IF NOT EXISTS analito_raw   TEXT;
ALTER TABLE producto_aplicado ADD COLUMN IF NOT EXISTS producto_raw  TEXT;
ALTER TABLE producto_aplicado ADD COLUMN IF NOT EXISTS dosis         NUMERIC(12, 4);
ALTER TABLE producto_aplicado ADD COLUMN IF NOT EXISTS linea_proceso TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'lab.producto_aplicado'::regclass
          AND contype = 'u'
          AND conname LIKE '%solicitud_id%analito_id%'
    ) THEN
        ALTER TABLE producto_aplicado
            ADD CONSTRAINT producto_aplicado_solicitud_id_analito_id_key
            UNIQUE (solicitud_id, analito_id);
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 0017 — Columnas de solicitud que el código inserta y la tabla no tenía
--
-- mapeo.mapear_solicitud() arma 28 campos y la tabla solo tenía 16: el mapeo
-- fue creciendo con cada formato nuevo de Excel y la migración nunca se
-- escribió. Sin esto, todo INSERT real falla con "no existe la columna
-- fecha_solicitud".
-- ----------------------------------------------------------------------------
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS fecha_solicitud     DATE;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS fecha_analisis      DATE;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS lote                TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS nro_camara          TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS nro_linea           TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS posicion_muestreo   TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS kg_procesados       NUMERIC(14, 2);
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS csg                 TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS solicitante         TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS nombre_muestreador  TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS nro_orden           TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS referencia          TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS referencia_proceso  TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS observacion         TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS observacion_2       TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS semana_entrada      INTEGER;

-- ----------------------------------------------------------------------------
-- 0018 — Restricción única en resultado (solicitud_id, analito_id)
--
-- ingest.py inserta con ON CONFLICT (solicitud_id, analito_id) DO NOTHING,
-- pero resultado nunca tuvo esa restricción y PostgreSQL rechazaba el INSERT
-- entero. producto_aplicado sí la traía desde su CREATE TABLE.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'lab.resultado'::regclass
          AND contype = 'u'
          AND conname = 'resultado_solicitud_id_analito_id_key'
    ) THEN
        ALTER TABLE resultado
            ADD CONSTRAINT resultado_solicitud_id_analito_id_key
            UNIQUE (solicitud_id, analito_id);
    END IF;
END $$;
