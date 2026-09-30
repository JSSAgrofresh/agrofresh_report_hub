-- ----------------------------------------------------------------------------
-- 0046 - Codigo de ensayo y N° de ensayo (solicitudes RYD de AgroFresh)
--
-- Las solicitudes de Tipo de Aplicacion RYD de AgroFresh piden dos datos
-- propios: el codigo del ensayo y su numero. Se guardan como columnas para
-- que salgan en la descarga de la base desde Report. Los demas laboratorios
-- las dejan en NULL.
--
-- Es idempotente: se puede ejecutar mas de una vez.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS codigo_ensayo TEXT;
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS nro_ensayo    TEXT;
