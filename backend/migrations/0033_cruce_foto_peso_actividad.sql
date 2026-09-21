-- ----------------------------------------------------------------------------
-- 0033 - Foto y peso obligatorios en el cruce + historial de actividad del lab
--
-- Hasta acá el cruce solo guardaba el código de la muestra y cuándo se hizo.
-- Este cambio agrega:
--
--   1. Peso de la muestra (obligatorio al cruzar).
--   2. Foto del cruce (obligatoria): queda en R2 bajo
--      cruces/<fecha>/<folio>/cruce_<timestamp>.<ext>
--   3. Quién hizo el cruce (usuario autenticado).
--   4. Tabla cruce_foto: un cruce puede tener exactamente una foto activa.
--   5. Tabla lab_actividad: historial permanente de todas las operaciones
--      del módulo de ingreso (ingresos, cruces, fotos, anulaciones, etc.).
--   6. Nuevos tipos de muestra F-AGF y D-AGF: son solo valores de texto,
--      no necesitan tabla separada. El mantenedor de tipos de muestra
--      los puede registrar como opciones normales.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

-- 1. Columnas adicionales en solicitud_archivo para el cruce completo
ALTER TABLE solicitud_archivo
    ADD COLUMN IF NOT EXISTS peso_muestra       NUMERIC(10, 3),
    ADD COLUMN IF NOT EXISTS unidad_peso        TEXT DEFAULT 'kg',
    ADD COLUMN IF NOT EXISTS cruzado_por        TEXT,       -- email del usuario
    ADD COLUMN IF NOT EXISTS cruzado_por_nombre TEXT;       -- nombre visible

-- 2. Foto del cruce (una por solicitud; la que esté en esta tabla es la activa)
CREATE TABLE IF NOT EXISTS cruce_foto (
    id              BIGSERIAL PRIMARY KEY,
    archivo         TEXT        NOT NULL,     -- FK lógica a solicitud_archivo.archivo
    r2_key          TEXT        NOT NULL,     -- clave completa en R2
    content_type    TEXT        NOT NULL DEFAULT 'image/jpeg',
    usuario_email   TEXT        NOT NULL,
    usuario_nombre  TEXT        NOT NULL,
    subida_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Si se reemplaza la foto (retoma), la anterior queda acá con activa=false.
    -- Solo la activa se muestra en la interfaz.
    activa          BOOLEAN     NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_cruce_foto_archivo
    ON cruce_foto (archivo) WHERE activa;

-- 3. Historial permanente de actividad del módulo Lab/Ingreso
CREATE TABLE IF NOT EXISTS lab_actividad (
    id              BIGSERIAL   PRIMARY KEY,
    -- Qué ocurrió: 'cruce', 'anulacion_cruce', 'foto_cruce', 'ingreso_solicitud'
    accion          TEXT        NOT NULL,
    -- Solicitud involucrada (puede ser NULL para acciones de setup)
    archivo         TEXT,
    numero_solicitud TEXT,
    -- Datos de la muestra en el momento de la acción
    codigo_muestra  TEXT,
    tipo_muestra    TEXT,       -- 'normal', 'F-AGF', 'D-AGF' u otro
    peso_muestra    NUMERIC(10, 3),
    unidad_peso     TEXT,
    -- Foto asociada (r2_key de R2)
    r2_key_foto     TEXT,
    -- Usuario autenticado que ejecutó la acción (del token, nunca ingresado)
    usuario_email   TEXT        NOT NULL,
    usuario_nombre  TEXT        NOT NULL,
    -- Datos adicionales como JSON (cliente, planta, especie, etc.)
    detalle         JSONB       NOT NULL DEFAULT '{}',
    -- Resultado de la operación
    resultado       TEXT        NOT NULL DEFAULT 'ok',   -- 'ok' | 'error'
    mensaje         TEXT,                                -- texto de error si aplica
    -- Timestamp del servidor (nunca del dispositivo del cliente)
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_actividad_archivo
    ON lab_actividad (archivo);
CREATE INDEX IF NOT EXISTS idx_lab_actividad_usuario
    ON lab_actividad (usuario_email);
CREATE INDEX IF NOT EXISTS idx_lab_actividad_creado
    ON lab_actividad (creado_en DESC);
