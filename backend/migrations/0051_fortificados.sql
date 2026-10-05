-- ----------------------------------------------------------------------------
-- 0051 - Ingreso de fortificados (AgroFresh Lab → Ingreso al laboratorio)
--
-- Un fortificado no tiene solicitud: se anota su número, el peso de la muestra
-- extraída (g) y cuándo ingresó. Sale en la segunda hoja de la descarga
-- «Descargar base» de Ingreso al laboratorio.
--
-- Es idempotente: se puede ejecutar mas de una vez.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS fortificado (
    id              BIGSERIAL     PRIMARY KEY,
    numero          TEXT          NOT NULL,
    peso_extraido   NUMERIC(10,4) NOT NULL CHECK (peso_extraido > 0),
    ingresado_en    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    ingresado_por   TEXT,
    ingresado_email TEXT,
    editado_en      TIMESTAMPTZ
);

-- Un número de fortificado no se repite (sin importar mayúsculas).
CREATE UNIQUE INDEX IF NOT EXISTS uq_fortificado_numero ON fortificado (upper(numero));
CREATE INDEX IF NOT EXISTS idx_fortificado_fecha ON fortificado (ingresado_en DESC);
