-- Fecha en que la muestra física llegó al laboratorio: no viene en la
-- solicitud de muestreo ni en el resultado del GC, así que se elige a mano
-- en la zona de cruce de "Reporte → Crear reporte de cromatografía" (un
-- selector de fecha por cada solicitud que se cruza con su vial).
--
-- Ejecutar una sola vez:
--   psql -U postgres -d tu_base -f migrations/0009_solicitud_fecha_recepcion.sql

SET search_path = lab, public;

ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS fecha_recepcion DATE;
