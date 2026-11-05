-- Inventario del laboratorio de AgroFresh (AgroFresh Lab → Inventario).
-- Un registro por frasco / caja / lote físico. El CÓDIGO (INS-01…, el de la etiqueta que se pistolea) NO es único:
-- dos cosas pueden compartir código, sean o no idénticas; al escanearlo salen todas sus tarjetas.
-- El stock cambia solo por movimientos (ingreso / salida / ajuste), que quedan en inventario_lab_movimiento.
CREATE TABLE IF NOT EXISTS inventario_lab_item (
    id              BIGSERIAL PRIMARY KEY,
    codigo          TEXT        NOT NULL,
    categoria       TEXT        NOT NULL DEFAULT 'Insumo',   -- Estándar certificado / Estándar analítico / Insumo
    ubicacion       TEXT,                                    -- Congelador, Refrigerador, Laboratorio…
    descripcion     TEXT        NOT NULL,                    -- qué es (sustancia o insumo)
    detalle         TEXT,                                    -- texto complementario (p. ej. la certificación)
    almacenamiento  TEXT,                                    -- condición: 2-8°C, (-18°C o inferior)…
    presentacion    TEXT,                                    -- formato del envase: 3x10ml, 100mg…
    lote            TEXT,
    vencimiento     DATE,
    referencia      TEXT,                                    -- Ref del proveedor
    stock           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (stock >= 0),
    activo          BOOLEAN     NOT NULL DEFAULT TRUE,
    creado_por      TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventario_lab_item_codigo_idx ON inventario_lab_item (upper(btrim(codigo)));
CREATE INDEX IF NOT EXISTS inventario_lab_item_venc_idx   ON inventario_lab_item (vencimiento) WHERE activo;

CREATE TABLE IF NOT EXISTS inventario_lab_movimiento (
    id               BIGSERIAL PRIMARY KEY,
    item_id          BIGINT      NOT NULL REFERENCES inventario_lab_item(id) ON DELETE CASCADE,
    tipo             TEXT        NOT NULL CHECK (tipo IN ('alta', 'ingreso', 'salida', 'ajuste')),
    cantidad         NUMERIC(14,2) NOT NULL,                 -- lo que se movió (ajuste: el stock nuevo)
    stock_antes      NUMERIC(14,2) NOT NULL,
    stock_despues    NUMERIC(14,2) NOT NULL,
    nota             TEXT,
    usuario          TEXT,
    usuario_email    TEXT,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventario_lab_mov_item_idx ON inventario_lab_movimiento (item_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS inventario_lab_mov_fecha_idx ON inventario_lab_movimiento (creado_en DESC);
