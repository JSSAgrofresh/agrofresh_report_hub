-- Memoria de mapeos confirmados para Sold To / Ship To: cuando un texto
-- crudo que llega por Ingest/Converter no calza exacto contra cliente/planta
-- pero un administrador confirma a mano a qué cliente/planta corresponde
-- (desde Data Core → Pendientes), esa relación queda guardada acá para no
-- volver a pedir revisión la próxima vez que llegue el mismo texto.
--
-- Especie/Variedad NO necesitan esta tabla: ya tienen su propio mecanismo de
-- memoria en valor_lista (fila cruda + fusionado_en_id apuntando al valor
-- estándar -ver listados.py-). Esta tabla es solo para sold_to/ship_to,
-- que no tenían ningún mecanismo de alias todavía.
--
-- Ejecutar una sola vez:
--   psql -U postgres -d tu_base -f migrations/0014_mapeo_confirmado.sql

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS mapeo_confirmado (
    id SERIAL PRIMARY KEY,
    entidad TEXT NOT NULL CHECK (entidad IN ('sold_to', 'ship_to')),
    -- Para ship_to, el cliente_id al que pertenece esa sucursal -mismo
    -- Ship To "PLANTA X" puede existir bajo Sold To distintos-. Para
    -- sold_to siempre NULL.
    cliente_id INTEGER REFERENCES cliente(id),
    valor_crudo TEXT NOT NULL,
    valor_crudo_normalizado TEXT NOT NULL,
    -- Apunta a cliente.id o planta.id según `entidad`. No es una FK
    -- declarada -shared entre dos tablas distintas-, se valida en la app.
    destino_id INTEGER NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entidad, cliente_id, valor_crudo_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_mapeo_confirmado_busqueda ON mapeo_confirmado (entidad, cliente_id, valor_crudo_normalizado);
