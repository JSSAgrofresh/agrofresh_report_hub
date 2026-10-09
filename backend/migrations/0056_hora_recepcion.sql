-- Hora en que el laboratorio recibió la muestra (el informe de Quiteca la trae junto a la fecha).
-- La fecha ya existe (fecha_recepcion, migración 0009).
ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS hora_recepcion TEXT;
