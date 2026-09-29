-- ----------------------------------------------------------------------------
-- 0045 - Historial de correcciones del Converter
--
-- Cuando un informe trae un Sold To, Ship To, Especie o Variedad que no calza
-- con Listados, la persona elige a mano el valor oficial. Esa elección se guarda
-- acá para que, si el mismo texto vuelve a llegar, el Converter lo corrija solo.
-- Es a la vez la memoria del sistema y el historial que se revisa en Auditoría
-- interna (quién lo enseñó, cuándo, cuántas veces se aplicó sola).
--
--   contexto   lo que da sentido al valor: el Sold To para un Ship To (la misma
--              planta puede existir bajo clientes distintos) y la Especie para
--              una Variedad. Vacío para Sold To y Especie.
--   usos       cuántas veces el Converter la aplicó automáticamente.
--   revisiones cuántas veces alguien cambió a qué valor apunta.
--
-- Idempotente. Aplicar con:
--   cd backend
--   .venv\Scripts\python.exe scripts\migrar.py 0045_correcciones_converter.sql
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS correccion_converter (
    id                    SERIAL PRIMARY KEY,
    campo                 TEXT        NOT NULL CHECK (campo IN ('sold_to', 'ship_to', 'especie', 'variedad')),
    contexto              TEXT        NOT NULL DEFAULT '',
    contexto_norm         TEXT        NOT NULL DEFAULT '',
    valor_crudo           TEXT        NOT NULL,
    valor_crudo_norm      TEXT        NOT NULL,
    valor_oficial         TEXT        NOT NULL,
    archivo_origen        TEXT,
    creado_por_email      TEXT,
    creado_por_nombre     TEXT,
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_por_nombre TEXT,
    actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    usos                  INTEGER     NOT NULL DEFAULT 0,
    ultimo_uso            TIMESTAMPTZ,
    revisiones            INTEGER     NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_correccion_converter_clave
    ON correccion_converter (campo, contexto_norm, valor_crudo_norm);
