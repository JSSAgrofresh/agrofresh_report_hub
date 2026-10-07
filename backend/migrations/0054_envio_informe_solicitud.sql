-- ----------------------------------------------------------------------------
-- 0054 - Cada envío de informe a un cliente queda amarrado a su solicitud
--
-- Auditoría interna mide el lead time y el cumplimiento del entregable hasta el
-- momento en que el informe sale al cliente. Para eso el envío tiene que saber
-- a qué solicitud (OT) corresponde. Hasta ahora `envio_informe_log` solo
-- guardaba laboratorio, Sold To, Ship To y especie: no alcanzaba para saber de
-- QUÉ solicitud era el informe, y adivinarlo por parecido no se defiende.
--
-- Lo enviado antes de esta migración queda sin amarre (NULL) y no entra a ese
-- cálculo; desde ahora, cada envío desde «Envío de informes» lleva la solicitud
-- que se leyó del PDF.
--
-- No borra ni cambia datos. Es idempotente.
--
--   .venv\Scripts\python.exe scripts\migrar.py 0054_envio_informe_solicitud.sql
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

-- Misma clave que `solicitud_archivo.archivo`.
ALTER TABLE envio_informe_log ADD COLUMN IF NOT EXISTS archivo_solicitud TEXT;

CREATE INDEX IF NOT EXISTS idx_envio_informe_log_solicitud
    ON envio_informe_log (archivo_solicitud) WHERE archivo_solicitud IS NOT NULL;
