-- ----------------------------------------------------------------------------
-- 0060 - Peso hueso (en gramos) en la solicitud
--
-- Tercer peso de la muestra cruzada, igual que el peso extraído (0048): se anota
-- en Ingreso al laboratorio, después del cruce, y queda en la solicitud.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

ALTER TABLE solicitud_archivo
    ADD COLUMN IF NOT EXISTS peso_hueso            NUMERIC(10, 4),
    ADD COLUMN IF NOT EXISTS peso_hueso_en         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS peso_hueso_por_nombre TEXT;
