-- 0023 - Folio de solicitud, correlativo por laboratorio
--
-- Hasta acá el folio de una solicitud (OT-NNNN) salía de una única SEQUENCE
-- global, compartida entre todos los laboratorios: si QUITECA creaba una
-- solicitud entre dos de AGROFRESH, el correlativo de AGROFRESH quedaba con
-- un salto. Ahora cada laboratorio puede tener su propio prefijo (ej. "AGF"
-- para AGROFRESH → OT-AGF0001), configurado en Toma de muestras →
-- Laboratorios, y necesita su propio correlativo para que sus folios salgan
-- seguidos.
--
-- Mismo patrón que `informe_folio_anual` (migración 0010): una fila por
-- laboratorio, incrementada de forma atómica (INSERT+UPDATE en la misma
-- transacción) desde `_siguiente_numero` en toma_muestras.py.
--
-- No reemplaza ni borra la SEQUENCE `folio_solicitud` (migración 0020): esa
-- sigue como respaldo mientras esta migración no esté aplicada, y no hace
-- falta migrar los folios ya emitidos -esta tabla se auto-siembra la primera
-- vez que cada laboratorio pide un folio nuevo, adelantándose al máximo que
-- ya tenga indexado-.
--
-- Es idempotente: se puede ejecutar sobre una base que ya la tenga.

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS folio_solicitud_laboratorio (
    laboratorio TEXT PRIMARY KEY,
    siguiente   INTEGER NOT NULL DEFAULT 1
);
