-- BUG encontrado al probar la homogenización con datos reales: las
-- migraciones 0003 y 0007 insertan Sold To/Ship To sin especificar `activo`
-- (INSERT INTO cliente (nombre) VALUES ... / INSERT INTO cliente (nombre,
-- codigo_sap, rut) VALUES ...), y la columna no tenía DEFAULT -así que
-- quedaron con activo = NULL, no true-.
--
-- Todas las consultas que filtran "WHERE activo" (el resolver de
-- Ingest/Converter en ingest.py, los selects del formulario de Nueva
-- Solicitud) tratan NULL como "no calza" -en SQL, WHERE activo con NULL no
-- es verdadero-, así que básicamente TODO el catálogo de Sold To/Ship To
-- era invisible para la homogenización. Por eso casi todo caía en
-- pendientes: no es que el matching sea muy exigente, es que no tenía
-- catálogo real contra qué comparar.
--
-- Ejecutar una sola vez:
--   psql -U postgres -d tu_base -f migrations/0015_fix_activo_cliente_planta.sql

SET search_path = lab, public;

UPDATE cliente SET activo = true WHERE activo IS NULL;
UPDATE planta SET activo = true WHERE activo IS NULL;

ALTER TABLE cliente ALTER COLUMN activo SET DEFAULT true;
ALTER TABLE planta ALTER COLUMN activo SET DEFAULT true;
ALTER TABLE cliente ALTER COLUMN activo SET NOT NULL;
ALTER TABLE planta ALTER COLUMN activo SET NOT NULL;
