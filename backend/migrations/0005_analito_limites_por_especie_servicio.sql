-- Límites de un analito ya no son un único valor fijo: varían por especie y por
-- tipo de servicio (ej. FDL en Cereza vs. FDL en Manzana-Actimist son distintos).
-- especie = '' significa "aplica a todas las especies"; tipo_servicio = ''
-- significa "aplica a todos los tipos de servicio" (comodín). Usamos '' en vez
-- de NULL para que la UNIQUE constraint funcione sin trucos de COALESCE.
CREATE TABLE IF NOT EXISTS lab.analito_limite (
    id SERIAL PRIMARY KEY,
    analito_id INTEGER NOT NULL REFERENCES lab.analito(id) ON DELETE CASCADE,
    especie TEXT NOT NULL DEFAULT '',
    tipo_servicio TEXT NOT NULL DEFAULT '',
    limite_min NUMERIC(12,6),
    limite_central NUMERIC(12,6),
    limite_max NUMERIC(12,6),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (analito_id, especie, tipo_servicio)
);

-- Límite de cuantificación (LC), junto al límite de detección (LD) que ya existía.
ALTER TABLE lab.analito ADD COLUMN IF NOT EXISTS limite_cuantificacion TEXT;

-- Migra los límites únicos que ya existían en `analito` (sin especie ni tipo de
-- servicio) como límite "aplica a todo", para no perderlos mientras se cargan
-- los límites reales por especie/tipo de servicio.
INSERT INTO lab.analito_limite (analito_id, especie, tipo_servicio, limite_min, limite_central, limite_max)
SELECT id, '', '', limite_min, limite_central, limite_max
FROM lab.analito
WHERE limite_min IS NOT NULL OR limite_central IS NOT NULL OR limite_max IS NOT NULL
ON CONFLICT (analito_id, especie, tipo_servicio) DO NOTHING;

-- Límites reales de Quiteca / AgroFresh por especie y tipo de servicio, según las
-- tablas entregadas: "Linea de Proceso" (tabla blanca, 13 especies) y "Actimist"
-- (tabla amarilla, 6 especies). Sin límite central: para la vista residual solo
-- importan mínimo/máximo.
WITH datos (codigo, especie, tipo_servicio, lmin, lmax) AS (
    VALUES
    -- ── Línea de Proceso ──
    ('FDL', 'Arándano', 'Linea de Proceso', 0.7, 3),
    ('FDL', 'Cerezas', 'Linea de Proceso', 0.7, 5),
    ('FDL', 'Ciruela', 'Linea de Proceso', 0.7, 3),
    ('FDL', 'Clementina', 'Linea de Proceso', 0.7, 3),
    ('FDL', 'Limón', 'Linea de Proceso', 0.7, 3),
    ('FDL', 'Mandarina', 'Linea de Proceso', 0.7, 3),
    ('FDL', 'Naranja', 'Linea de Proceso', 0.7, 3),
    ('FDL', 'Pomelo', 'Linea de Proceso', 0.7, 3),
    ('FDL', 'Manzana', 'Linea de Proceso', 0.7, 3),
    ('FDL', 'Pera', 'Linea de Proceso', 0.7, 3),
    ('FDL', 'Nectarín', 'Linea de Proceso', 0.7, 3),
    ('FDL', 'Durazno', 'Linea de Proceso', 0.7, 3),
    ('FDL', 'Kiwi', 'Linea de Proceso', 0.7, 3),

    ('PYR', 'Cerezas', 'Linea de Proceso', 1, 4),
    ('PYR', 'Ciruela', 'Linea de Proceso', 1, 4),
    ('PYR', 'Clementina', 'Linea de Proceso', 1, 4),
    ('PYR', 'Limón', 'Linea de Proceso', 1, 4),
    ('PYR', 'Mandarina', 'Linea de Proceso', 1, 4),
    ('PYR', 'Naranja', 'Linea de Proceso', 1, 4),
    ('PYR', 'Pomelo', 'Linea de Proceso', 1, 4),
    ('PYR', 'Manzana', 'Linea de Proceso', 1, 4),
    ('PYR', 'Pera', 'Linea de Proceso', 1, 4),
    ('PYR', 'Nectarín', 'Linea de Proceso', 1, 4),
    ('PYR', 'Durazno', 'Linea de Proceso', 1, 4),

    ('IMZ', 'Clementina', 'Linea de Proceso', 1, 5),
    ('IMZ', 'Limón', 'Linea de Proceso', 1, 5),
    ('IMZ', 'Mandarina', 'Linea de Proceso', 1, 5),
    ('IMZ', 'Naranja', 'Linea de Proceso', 1, 5),
    ('IMZ', 'Pomelo', 'Linea de Proceso', 1, 5),

    ('AZOX', 'Clementina', 'Linea de Proceso', 0.7, 4),
    ('AZOX', 'Limón', 'Linea de Proceso', 0.7, 4),
    ('AZOX', 'Mandarina', 'Linea de Proceso', 0.7, 4),
    ('AZOX', 'Naranja', 'Linea de Proceso', 0.7, 4),
    ('AZOX', 'Pomelo', 'Linea de Proceso', 0.7, 4),

    ('TBZ', 'Ciruela', 'Linea de Proceso', 0.6, 1),
    ('TBZ', 'Clementina', 'Linea de Proceso', 1, 4),
    ('TBZ', 'Limón', 'Linea de Proceso', 1, 4),
    ('TBZ', 'Mandarina', 'Linea de Proceso', 1, 4),
    ('TBZ', 'Naranja', 'Linea de Proceso', 1, 4),
    ('TBZ', 'Pomelo', 'Linea de Proceso', 1, 4),
    ('TBZ', 'Manzana', 'Linea de Proceso', 1, 4),
    ('TBZ', 'Pera', 'Linea de Proceso', 1, 4),

    ('TEBU', 'Cerezas', 'Linea de Proceso', 0.5, 4),
    ('TEBU', 'Nectarín', 'Linea de Proceso', 0.5, 0.6),
    ('TEBU', 'Durazno', 'Linea de Proceso', 0.5, 0.6),

    -- ── Actimist ──
    ('FDL', 'Ciruela', 'Actimist', 0.7, 3),
    ('FDL', 'Manzana', 'Actimist', 0.7, 3.5),
    ('FDL', 'Pera', 'Actimist', 0.7, 3.5),
    ('FDL', 'Kiwi', 'Actimist', 0.7, 3),
    ('FDL', 'Zarzaparrilla', 'Actimist', 0.7, 2),
    ('FDL', 'Uva', 'Actimist', 0.7, 2),

    ('PYR', 'Manzana', 'Actimist', 1, 4),
    ('PYR', 'Pera', 'Actimist', 1, 3),

    ('DPA', 'Manzana', 'Actimist', 3.5, 8),
    ('DPA', 'Pera', 'Actimist', 3.5, 8)
)
INSERT INTO lab.analito_limite (analito_id, especie, tipo_servicio, limite_min, limite_max)
SELECT a.id, d.especie, d.tipo_servicio, d.lmin, d.lmax
FROM datos d
JOIN lab.analito a ON a.codigo = d.codigo AND a.laboratorio = 'Quiteca / AgroFresh'
ON CONFLICT (analito_id, especie, tipo_servicio)
DO UPDATE SET limite_min = EXCLUDED.limite_min, limite_max = EXCLUDED.limite_max, actualizado_en = now();
