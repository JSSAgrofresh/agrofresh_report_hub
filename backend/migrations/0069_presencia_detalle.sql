-- Monitoreo: más detalle de cada conexión. Todo opcional: sin esta migración el latido sigue funcionando
-- con lo de siempre (quién, módulo, desde cuándo) y la pantalla no muestra estas piezas.
--   ruta_desde          = desde cuándo está en la pantalla actual
--   ultima_interaccion  = último toque, tecla o movimiento real de la persona (no solo la pestaña abierta)
--   visible             = false si la pestaña está en segundo plano
--   dispositivo         = «Móvil · Chrome · app», «Escritorio · Edge»
--   version             = commit de la pantalla que tiene cargada (sirve para ver quién quedó con una versión vieja)
ALTER TABLE presencia ADD COLUMN IF NOT EXISTS ruta_desde         TIMESTAMPTZ;
ALTER TABLE presencia ADD COLUMN IF NOT EXISTS ultima_interaccion TIMESTAMPTZ;
ALTER TABLE presencia ADD COLUMN IF NOT EXISTS visible            BOOLEAN;
ALTER TABLE presencia ADD COLUMN IF NOT EXISTS dispositivo        TEXT;
ALTER TABLE presencia ADD COLUMN IF NOT EXISTS version            TEXT;
