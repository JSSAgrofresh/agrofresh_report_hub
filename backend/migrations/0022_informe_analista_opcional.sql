-- ----------------------------------------------------------------------------
-- 0022 - La firma del analista pasa a ser opcional
--
-- El informe siempre salía con dos firmas: quien analiza y quien aprueba. En
-- la práctica no siempre hay analista que firmar -turnos, reemplazos, o
-- corridas que revisa directamente la jefatura- y dejar el bloque en blanco
-- con una raya y un guión se ve peor que no ponerlo.
--
-- Ahora es una decisión guardada, no una que haya que recordar en cada
-- informe: si está apagada, abajo a la derecha queda solo jefe(a) de
-- laboratorio. Por defecto queda encendida, que es como venía funcionando.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

ALTER TABLE informe_config
    ADD COLUMN IF NOT EXISTS incluir_analista BOOLEAN NOT NULL DEFAULT TRUE;
