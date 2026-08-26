-- ----------------------------------------------------------------------------
-- 0017 - Columnas de solicitud que el codigo inserta y la tabla no tenia
--
-- mapeo.mapear_solicitud() arma 28 campos, pero la tabla solo tenia 16: el
-- mapeo fue creciendo con cada formato nuevo de Excel y la migracion
-- correspondiente nunca se escribio. Cualquier INSERT real fallaba con
-- "no existe la columna fecha_solicitud".
--
-- El error no se veia porque, con el catalogo todavia incompleto, todas las
-- filas se desviaban a pendiente_revision antes de llegar al INSERT. Recien
-- al aprobar esos pendientes -que si inserta- aparecio.
--
-- Es idempotente: se puede ejecutar sobre una base que ya tenga algunas.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

-- Fechas del ciclo de la muestra (parse_fecha entrega ISO yyyy-mm-dd).
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS fecha_solicitud     DATE;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS fecha_analisis      DATE;

-- Identificacion de la muestra dentro de la planta.
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS lote                TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS nro_camara          TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS nro_linea           TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS posicion_muestreo   TEXT;

-- Kilos procesados: NUMERIC y no INTEGER porque el Excel trae decimales.
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS kg_procesados       NUMERIC(14, 2);

-- Codigo de productor y personas involucradas.
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS csg                 TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS solicitante         TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS nombre_muestreador  TEXT;

-- Referencias cruzadas con los sistemas del cliente.
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS nro_orden           TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS referencia          TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS referencia_proceso  TEXT;

-- Texto libre. observacion_2 concatena Dosis + Observacion adicional.
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS observacion         TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS observacion_2       TEXT;

-- Semana de entrada del Excel; semana_muestreo ya existia y se calcula.
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS semana_entrada      INTEGER;
