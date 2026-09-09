-- ----------------------------------------------------------------------------
-- 0026 - Verificaciones diarias del laboratorio (REG-03)
--
-- Reemplaza el libro Excel con macros
-- «REG03_Registro_verificaciones_diarias» por tablas de verdad.
--
-- El Excel tenía una hoja de ingreso, una de parámetros y siete hojas de
-- histórico a las que una macro copiaba los datos del día. Eso se traduce
-- así:
--
--   Hoja «Parámetros»  -> los catálogos de acá abajo. Cada equipo lleva SU
--                         criterio (tolerancia, rango), y los criterios que
--                         en el Excel eran globales -presión de gases,
--                         voltaje de la perla, output- viven en
--                         `verif_parametro`. Se editan desde la aplicación:
--                         cambiar una tolerancia ya no es tocar una celda.
--
--   Hoja «Z_Agua_Ref»  -> `verif_agua_z`. Tabla física, no se calcula.
--
--   Hoja «Ingreso_Diario» + las 7 de histórico -> `verif_registro` (un día)
--                         y una tabla de medición por sección. Ya no hay
--                         "traspaso": el ingreso y el histórico son la misma
--                         fila, así que no se pueden desincronizar.
--
-- Los resultados («Aceptable» / «No aceptable») se guardan calculados, igual
-- que los calculaba la fórmula de la celda. Se recalculan en el backend cada
-- vez que se guarda el día: la pantalla los muestra al tiro, pero quien manda
-- es el servidor.
--
-- Los valores sembrados salen del Excel que hoy usa el laboratorio; no hay
-- ninguno inventado. Si alguno no corresponde, se corrige desde
-- AgroFresh Lab -> Verificaciones diarias -> Criterios.
--
-- Es idempotente: se puede volver a ejecutar sobre una base que ya la tenga.
--
--   cd backend
--   .venv\Scripts\python.exe scripts\migrar.py 0026_verificaciones_diarias.sql
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

-- ---------------------------------------------------------------------------
-- Catálogos: qué se verifica y contra qué criterio
-- ---------------------------------------------------------------------------

-- Una fila por EQUIPO Y VOLUMEN: la Microman E1000 se verifica a 900 y a 500
-- µL, y cada volumen tiene su propia tolerancia. Por eso la clave es el par.
CREATE TABLE IF NOT EXISTS verif_micropipeta (
    id              SERIAL PRIMARY KEY,
    nombre          TEXT          NOT NULL,
    codigo          TEXT          NOT NULL DEFAULT '',
    volumen_nominal NUMERIC(10,2) NOT NULL,
    tolerancia      NUMERIC(10,3) NOT NULL,
    orden           INTEGER       NOT NULL DEFAULT 0,
    activo          BOOLEAN       NOT NULL DEFAULT TRUE,
    UNIQUE (nombre, volumen_nominal)
);

-- `valor_nominal` y `tolerancia` van en GRAMOS aunque la pesa se llame
-- "100 mg": mezclar unidades en una misma columna es la forma más rápida de
-- que una comparación dé cualquier cosa. `nombre` es la etiqueta que se ve.
CREATE TABLE IF NOT EXISTS verif_pesa_patron (
    id            SERIAL PRIMARY KEY,
    nombre        TEXT          NOT NULL UNIQUE,
    codigo        TEXT          NOT NULL DEFAULT '',
    valor_nominal NUMERIC(12,4) NOT NULL,
    tolerancia    NUMERIC(12,4) NOT NULL,
    orden         INTEGER       NOT NULL DEFAULT 0,
    activo        BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS verif_punto_temperatura (
    id      SERIAL PRIMARY KEY,
    nombre  TEXT         NOT NULL UNIQUE,
    codigo  TEXT         NOT NULL DEFAULT '',
    minimo  NUMERIC(6,2) NOT NULL,
    maximo  NUMERIC(6,2) NOT NULL,
    orden   INTEGER      NOT NULL DEFAULT 0,
    activo  BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS verif_gas (
    id      SERIAL PRIMARY KEY,
    nombre  TEXT    NOT NULL UNIQUE,
    codigo  TEXT    NOT NULL DEFAULT '',
    orden   INTEGER NOT NULL DEFAULT 0,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

-- Los criterios que no son de un equipo en particular sino del sistema
-- entero. Clave fija, valor editable.
CREATE TABLE IF NOT EXISTS verif_parametro (
    clave       TEXT          PRIMARY KEY,
    valor       NUMERIC(12,4) NOT NULL,
    descripcion TEXT          NOT NULL DEFAULT '',
    unidad      TEXT          NOT NULL DEFAULT '',
    orden       INTEGER       NOT NULL DEFAULT 0
);

-- Factor Z del agua por temperatura (µL/mg). Es una tabla de referencia
-- publicada, no una fórmula: se guarda tal cual venía en la hoja Z_Agua_Ref.
CREATE TABLE IF NOT EXISTS verif_agua_z (
    temperatura INTEGER       PRIMARY KEY,
    factor      NUMERIC(8,4)  NOT NULL
);

-- ---------------------------------------------------------------------------
-- El día
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS verif_registro (
    id               SERIAL PRIMARY KEY,
    -- Un día, un registro. Volver a guardar el mismo día ACTUALIZA el que ya
    -- está; nunca crea un segundo. En el Excel la macro apendaba y era fácil
    -- terminar con el mismo día dos veces, con datos distintos.
    fecha            DATE          NOT NULL UNIQUE,
    temperatura_agua NUMERIC(6,2),
    -- Se guarda calculado y no solo la temperatura: el factor que se usó ese
    -- día es parte del registro, aunque mañana alguien corrija la tabla Z.
    factor_z         NUMERIC(8,4),
    -- '', 'Sí' o 'No' — la pregunta de fugas de la sección de gases.
    fugas_visibles   TEXT          NOT NULL DEFAULT '',
    resultado        TEXT          NOT NULL DEFAULT 'Sin datos',
    observaciones    TEXT          NOT NULL DEFAULT '',
    revisado_por     TEXT          NOT NULL DEFAULT '',
    creado_por       TEXT          NOT NULL DEFAULT '',
    creado_en        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    actualizado_en   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verif_registro_fecha ON verif_registro (fecha DESC);

-- ON DELETE CASCADE en todas: borrar un día borra sus mediciones. Sin esto
-- quedarían mediciones huérfanas apuntando a un día que ya no existe.
-- ON DELETE RESTRICT hacia los catálogos: un equipo con historia no se borra,
-- se desactiva (`activo = false`), o el histórico quedaría sin poder decir a
-- qué equipo pertenecía.

CREATE TABLE IF NOT EXISTS verif_micropipeta_medicion (
    id             SERIAL PRIMARY KEY,
    registro_id    INTEGER NOT NULL REFERENCES verif_registro (id) ON DELETE CASCADE,
    micropipeta_id INTEGER NOT NULL REFERENCES verif_micropipeta (id) ON DELETE RESTRICT,
    analista       TEXT    NOT NULL DEFAULT '',
    peso_1         NUMERIC(12,4),
    peso_2         NUMERIC(12,4),
    peso_3         NUMERIC(12,4),
    volumen_medio  NUMERIC(12,4),
    desviacion     NUMERIC(12,4),
    error_pct      NUMERIC(12,4),
    resultado      TEXT    NOT NULL DEFAULT '',
    UNIQUE (registro_id, micropipeta_id)
);

CREATE TABLE IF NOT EXISTS verif_balanza_medicion (
    id          SERIAL PRIMARY KEY,
    registro_id INTEGER NOT NULL REFERENCES verif_registro (id) ON DELETE CASCADE,
    pesa_id     INTEGER NOT NULL REFERENCES verif_pesa_patron (id) ON DELETE RESTRICT,
    analista    TEXT    NOT NULL DEFAULT '',
    lectura_1   NUMERIC(12,4),
    lectura_2   NUMERIC(12,4),
    lectura_3   NUMERIC(12,4),
    promedio    NUMERIC(12,4),
    desviacion  NUMERIC(12,4),
    resultado   TEXT    NOT NULL DEFAULT '',
    UNIQUE (registro_id, pesa_id)
);

CREATE TABLE IF NOT EXISTS verif_temperatura_medicion (
    id          SERIAL PRIMARY KEY,
    registro_id INTEGER NOT NULL REFERENCES verif_registro (id) ON DELETE CASCADE,
    punto_id    INTEGER NOT NULL REFERENCES verif_punto_temperatura (id) ON DELETE RESTRICT,
    analista    TEXT    NOT NULL DEFAULT '',
    lectura     NUMERIC(8,2),
    resultado   TEXT    NOT NULL DEFAULT '',
    UNIQUE (registro_id, punto_id)
);

CREATE TABLE IF NOT EXISTS verif_gas_medicion (
    id                 SERIAL PRIMARY KEY,
    registro_id        INTEGER NOT NULL REFERENCES verif_registro (id) ON DELETE CASCADE,
    gas_id             INTEGER NOT NULL REFERENCES verif_gas (id) ON DELETE RESTRICT,
    analista           TEXT    NOT NULL DEFAULT '',
    codigo_cilindro    TEXT    NOT NULL DEFAULT '',
    presion_contenido  NUMERIC(10,2),
    presion_trabajo    NUMERIC(10,2),
    resultado          TEXT    NOT NULL DEFAULT '',
    UNIQUE (registro_id, gas_id)
);

-- Inyector y detector son uno por día, no uno por equipo: la clave primaria
-- ES el registro.
CREATE TABLE IF NOT EXISTS verif_inyector (
    registro_id       INTEGER PRIMARY KEY REFERENCES verif_registro (id) ON DELETE CASCADE,
    analista          TEXT NOT NULL DEFAULT '',
    limpieza_aguja    TEXT NOT NULL DEFAULT '',
    aguja_danada      TEXT NOT NULL DEFAULT '',
    aguja_reemplazada TEXT NOT NULL DEFAULT '',
    cambio_septa      TEXT NOT NULL DEFAULT '',
    observaciones     TEXT NOT NULL DEFAULT '',
    resultado         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS verif_detector (
    registro_id       INTEGER PRIMARY KEY REFERENCES verif_registro (id) ON DELETE CASCADE,
    analista          TEXT NOT NULL DEFAULT '',
    voltaje_perla     NUMERIC(10,4),
    metodo_correcto   TEXT NOT NULL DEFAULT '',
    output_detector   NUMERIC(10,4),
    resultado_voltaje TEXT NOT NULL DEFAULT '',
    resultado_metodo  TEXT NOT NULL DEFAULT '',
    resultado_output  TEXT NOT NULL DEFAULT '',
    resultado         TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------------
-- Siembra: exactamente lo que dice la hoja «Parámetros» del Excel actual
-- ---------------------------------------------------------------------------

INSERT INTO verif_micropipeta (nombre, volumen_nominal, tolerancia, orden) VALUES
    ('Microman E1000',    900,  8,   1),
    ('Microman E1000',    500,  5,   2),
    ('Microman E100',     100,  1,   3),
    ('P200 electrónica',  100,  1.2, 4),
    ('P1000 electrónica', 900,  6,   5),
    ('P1000 electrónica', 500,  5,   6),
    ('P5000 electrónica', 5000, 30,  7),
    ('P5000 Gilson',      5000, 30,  8),
    ('P10000 Gilson',     5000, 30,  9)
ON CONFLICT (nombre, volumen_nominal) DO NOTHING;

INSERT INTO verif_pesa_patron (nombre, valor_nominal, tolerancia, orden) VALUES
    ('100 mg', 0.1, 0.016, 1),
    ('1 g',    1,   0.030, 2),
    ('10 g',   10,  0.060, 3)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO verif_punto_temperatura (nombre, minimo, maximo, orden) VALUES
    ('Sala del laboratorio',      15,  25, 1),
    ('Refrigerador de reactivos',  2,   8, 2),
    ('Congelador de reactivos',  -20, -18, 3)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO verif_gas (nombre, orden) VALUES
    ('Aire extra puro',      1),
    ('Nitrógeno ultrapuro',  2),
    ('Helio BIP',            3),
    ('Hidrógeno ultrapuro',  4)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO verif_parametro (clave, valor, descripcion, unidad, orden) VALUES
    ('gas_presion_contenido_min', 200, 'Presión mínima de contenido del cilindro', 'psi', 1),
    ('gas_presion_trabajo_min',    80, 'Presión de trabajo — mínima',              'psi', 2),
    ('gas_presion_trabajo_max',   120, 'Presión de trabajo — máxima',              'psi', 3),
    ('perla_voltaje_min',           0, 'Voltaje de la perla — mínimo',             'V',   4),
    ('perla_voltaje_max',           1, 'Voltaje de la perla — máximo',             'V',   5),
    ('output_min',                 19, 'Output del detector — mínimo',             '',    6),
    ('output_max',                 22, 'Output del detector — máximo',             '',    7)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO verif_agua_z (temperatura, factor) VALUES
    (15, 1.0018), (16, 1.0019), (17, 1.0021), (18, 1.0022), (19, 1.0024),
    (20, 1.0026), (21, 1.0028), (22, 1.0030), (23, 1.0032), (24, 1.0035),
    (25, 1.0037), (26, 1.0040), (27, 1.0043), (28, 1.0046), (29, 1.0049),
    (30, 1.0053), (31, 1.0057), (32, 1.0061), (33, 1.0065), (34, 1.0069),
    (35, 1.0074)
ON CONFLICT (temperatura) DO NOTHING;
