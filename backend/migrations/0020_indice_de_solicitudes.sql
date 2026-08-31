-- ----------------------------------------------------------------------------
-- 0020 - Indice de solicitudes, y el folio desde una SEQUENCE
--
-- Hasta acá, para responder "cuántas solicitudes hay de Agricom" el backend
-- bajaba de R2 TODOS los Excel guardados y los parseaba, en cada request
-- (leer_todas_las_solicitudes, toma_muestras.py). Con 10 archivos no se nota;
-- con 5.000 son 5.000 descargas por internet más 5.000 parseos, cada vez que
-- alguien abre la pantalla. Y como el parseo es CPU, el proceso entero queda
-- ocupado: una sola persona deja al resto esperando.
--
-- R2 sigue guardando el archivo. Esta tabla lo INDEXA:
--
--   `datos` trae la solicitud completa, tal cual la devuelve hoy el parser.
--   Con eso, listar deja de tocar R2 por completo. Se baja el archivo solo
--   cuando alguien pide ese documento en particular.
--
--   Las demás columnas salen de `datos` y existen para poder filtrar y
--   ordenar con un índice, que es lo que un jsonb no da gratis.
--
-- El folio pasa a una SEQUENCE. Antes se calculaba listando R2 y sumando uno
-- al mayor: dos personas creando una solicitud en el mismo momento leían el
-- mismo máximo y recibían EL MISMO FOLIO. Una secuencia no puede entregar dos
-- veces el mismo número, ni aunque lleguen mil pedidos a la vez.
--
-- La secuencia arranca en 1 y la deja en su lugar `scripts/indexar_solicitudes.py`,
-- que es quien sabe cuál es el folio más alto que ya existe.
--
-- Es idempotente: se puede ejecutar sobre una base que ya la tenga.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS solicitud_archivo (
    id                SERIAL PRIMARY KEY,
    -- Nombre del archivo. Es la clave con la que la API identifica una
    -- solicitud hoy (/api/toma-muestras/solicitudes/{archivo}), así que se
    -- mantiene tal cual para no cambiar ninguna URL.
    archivo           TEXT        NOT NULL,
    -- Ruta completa dentro de R2. NULL cuando el sistema guarda en disco.
    r2_key            TEXT,

    numero_solicitud  TEXT,
    laboratorio       TEXT,
    sold_to           TEXT,
    ship_to           TEXT,
    especie           TEXT,
    fecha_solicitud   DATE,
    fecha_muestreo    DATE,
    creado_en         TEXT,

    -- La solicitud entera. Es lo que evita volver a R2 para listar.
    datos             JSONB       NOT NULL,

    indexado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un archivo, una fila. Además es lo que permite que reindexar sea idempotente
-- (ON CONFLICT (archivo) DO UPDATE) en vez de duplicar todo en cada corrida.
CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitud_archivo_archivo
    ON solicitud_archivo (archivo);

-- Los tres filtros que usa el sistema: por laboratorio (Emitir informe), por
-- folio (buscar una solicitud, escanear su código de barras) y por fecha
-- (el listado sale ordenado por lo más reciente).
CREATE INDEX IF NOT EXISTS idx_solicitud_archivo_laboratorio
    ON solicitud_archivo (laboratorio);
CREATE INDEX IF NOT EXISTS idx_solicitud_archivo_numero
    ON solicitud_archivo (numero_solicitud);
CREATE INDEX IF NOT EXISTS idx_solicitud_archivo_creado
    ON solicitud_archivo (creado_en DESC);

-- El correlativo del folio. Vale para OT- y para los SOL- antiguos: es un
-- único contador, así que migrar unos u otros no puede repetir un número.
CREATE SEQUENCE IF NOT EXISTS folio_solicitud AS BIGINT START WITH 1;
