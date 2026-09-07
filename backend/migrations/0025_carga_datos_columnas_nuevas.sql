-- ----------------------------------------------------------------------------
-- 0025 - Columnas nuevas para la plantilla de "Cargar Datos" (69 columnas) +
--         UNIQUE en N° Informe.
--
-- La plantilla nueva trae varios campos que el Excel nativo antiguo no traía
-- (Fecha Informe, Hora Muestreo, Generado Por, Email Solicitante, Email
-- Laboratorio, Tipo Muestra, Producto Utilizado, Gasto por aplicación). Se
-- agregan como columnas nuevas -nunca se reemplaza una columna existente-,
-- así que un Excel del formato antiguo sigue funcionando exactamente igual.
--
-- La UNIQUE en nro_solicitud (N° Informe) solo se agrega si hoy no hay
-- ningún informe duplicado: si los hay, la migración se detiene con un
-- mensaje claro en vez de fallar a mitad de camino. Corre primero
-- scripts/revisar_duplicados_informe.py para verlos y decidir qué hacer con
-- cada uno antes de reintentar esta migración.
--
-- Es idempotente: se puede correr de nuevo sobre una base que ya la tenga.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS fecha_informe       DATE;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS hora_muestreo       TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS generado_por        TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS email_solicitante   TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS email_laboratorio   TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS tipo_muestra        TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS producto_utilizado  TEXT;

ALTER TABLE producto_aplicado ADD COLUMN IF NOT EXISTS gasto NUMERIC(12, 4);

-- UNIQUE en N° Informe: Postgres permite múltiples NULL en una columna con
-- UNIQUE (una fila sin N° Informe todavía no debería existir en `solicitud`
-- -ver ingest.py, esas filas quedan en pendiente_revision-, pero si alguna
-- vez la hay, no rompe esta restricción). Lo único que bloquea es un N°
-- Informe real repetido dos veces.
DO $$
DECLARE
    duplicados INTEGER;
BEGIN
    SELECT count(*) INTO duplicados FROM (
        SELECT nro_solicitud FROM solicitud
        WHERE nro_solicitud IS NOT NULL
        GROUP BY nro_solicitud
        HAVING count(*) > 1
    ) t;

    IF duplicados > 0 THEN
        RAISE EXCEPTION
            'No se agregó la restricción UNIQUE en solicitud.nro_solicitud: hay % N° Informe repetidos en la base. '
            'Corre scripts/revisar_duplicados_informe.py para verlos, corrígelos (fusiona o renombra), y vuelve a '
            'correr esta migración.', duplicados;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'lab.solicitud'::regclass
          AND contype = 'u'
          AND conname = 'solicitud_nro_solicitud_unico'
    ) THEN
        ALTER TABLE solicitud ADD CONSTRAINT solicitud_nro_solicitud_unico UNIQUE (nro_solicitud);
    END IF;
END $$;
