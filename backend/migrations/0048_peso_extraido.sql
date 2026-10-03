-- ----------------------------------------------------------------------------
-- 0048 - Segundo peso (peso de la muestra extraída, en gramos) en la solicitud
--
-- Antes se digitaba recién al soltar el resultado del GC y no se guardaba. Ahora
-- se anota en Ingreso al laboratorio, después del cruce, y queda en la solicitud
-- (sale en la descarga «con muestra», en la BD y en el informe).
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

ALTER TABLE solicitud_archivo
    ADD COLUMN IF NOT EXISTS peso_extraido            NUMERIC(10, 4),
    ADD COLUMN IF NOT EXISTS peso_extraido_en         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS peso_extraido_por_nombre TEXT;
