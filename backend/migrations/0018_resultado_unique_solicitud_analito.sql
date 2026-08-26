-- ----------------------------------------------------------------------------
-- 0018 - Restriccion unica en resultado (solicitud_id, analito_id)
--
-- ingest.py inserta los resultados con
--     ON CONFLICT (solicitud_id, analito_id) DO NOTHING
-- pero la tabla nunca tuvo esa restriccion, asi que PostgreSQL rechaza el
-- INSERT entero con "no hay restriccion unica o de exclusion que coincida con
-- la especificacion ON CONFLICT". producto_aplicado si la tenia desde el
-- CREATE TABLE; resultado quedo sin ella.
--
-- Igual que la 0017, el problema estaba desde antes y no se veia: con el
-- catalogo incompleto las filas se desviaban a pendiente_revision antes de
-- llegar al INSERT. Aparecio al aprobar esos pendientes.
--
-- Es idempotente y se puede correr sobre una base con datos.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

DO $$
DECLARE
    duplicados INTEGER;
BEGIN
    -- Un par repetido impediria crear la restriccion. Como el codigo siempre
    -- quiso un solo resultado por analito y solicitud (de ahi el DO NOTHING),
    -- las copias extra son residuo de cargas anteriores: se deja la primera.
    -- Los analito_id NULL no cuentan como repetidos -PostgreSQL los trata como
    -- distintos entre si-, igual que en producto_aplicado.
    WITH sobrantes AS (
        SELECT id
        FROM (
            SELECT id, row_number() OVER (
                       PARTITION BY solicitud_id, analito_id ORDER BY id
                   ) AS n
            FROM resultado
            WHERE analito_id IS NOT NULL
        ) t
        WHERE n > 1
    )
    DELETE FROM resultado WHERE id IN (SELECT id FROM sobrantes);

    GET DIAGNOSTICS duplicados = ROW_COUNT;
    IF duplicados > 0 THEN
        RAISE NOTICE 'Se eliminaron % filas repetidas de resultado antes de crear la restriccion.', duplicados;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'lab.resultado'::regclass
          AND contype = 'u'
          AND conname = 'resultado_solicitud_id_analito_id_key'
    ) THEN
        ALTER TABLE resultado
            ADD CONSTRAINT resultado_solicitud_id_analito_id_key
            UNIQUE (solicitud_id, analito_id);
        RAISE NOTICE 'Restriccion unica creada en resultado.';
    ELSE
        RAISE NOTICE 'La restriccion unica de resultado ya existia.';
    END IF;
END $$;

-- Lo mismo para producto_aplicado: la trae el CREATE TABLE original, pero una
-- base creada con un esquema viejo -o restaurada sin ella- se quedaria igual
-- de trabada, y aca no cuesta nada asegurarlo.
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
        RAISE NOTICE 'Restriccion unica creada en producto_aplicado.';
    END IF;
END $$;
