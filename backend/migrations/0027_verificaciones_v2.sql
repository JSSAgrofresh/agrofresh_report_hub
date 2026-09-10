-- ----------------------------------------------------------------------------
-- 0027 - Verificaciones v2: nuevos campos solicitados por el laboratorio
--
-- Resumen de cambios:
--   · analista, termometro_1, termometro_2  en verif_registro (antes era por sección)
--   · observacion por fila de medición (micropipetas, balanza, temperatura, gases,
--     inyector, detector)
--   · metodo_nombre en inyector y detector (texto libre en vez de Sí/No)
--   · editado_por / editado_en / observacion_edicion en verif_registro
--     (rastrea quién modificó una verificación ya guardada y por qué)
--   · Balanza a mg: valor_nominal y tolerancia pasan de gramos a miligramos
--     (×1000). Las filas sembradas pasan de 0.1/1/10 g a 100/1000/10000 mg.
--
--   cd backend
--   .venv\Scripts\python.exe scripts\migrar.py 0027_verificaciones_v2.sql
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

-- ---------------------------------------------------------------------------
-- verif_registro: analista global + termómetros + trazabilidad de ediciones
-- ---------------------------------------------------------------------------
ALTER TABLE verif_registro
    ADD COLUMN IF NOT EXISTS analista           TEXT        NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS termometro_1       NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS termometro_2       NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS editado_por        TEXT,
    ADD COLUMN IF NOT EXISTS editado_en         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS observacion_edicion TEXT       NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- Observación por fila de medición
-- ---------------------------------------------------------------------------
ALTER TABLE verif_micropipeta_medicion
    ADD COLUMN IF NOT EXISTS observacion TEXT NOT NULL DEFAULT '';

ALTER TABLE verif_balanza_medicion
    ADD COLUMN IF NOT EXISTS observacion TEXT NOT NULL DEFAULT '';

ALTER TABLE verif_temperatura_medicion
    ADD COLUMN IF NOT EXISTS observacion TEXT NOT NULL DEFAULT '';

ALTER TABLE verif_gas_medicion
    ADD COLUMN IF NOT EXISTS observacion TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- Inyector: método con nombre libre + observación propia
-- ---------------------------------------------------------------------------
ALTER TABLE verif_inyector
    ADD COLUMN IF NOT EXISTS metodo_nombre TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS observacion   TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- Detector: método con nombre libre + observación propia
-- ---------------------------------------------------------------------------
ALTER TABLE verif_detector
    ADD COLUMN IF NOT EXISTS metodo_nombre TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS observacion   TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- Balanza de gramos a miligramos
--
-- Las tres pesas sembradas tenían: 0.1 g / 0.016 g → 1 g / 0.030 g → 10 g / 0.060 g
-- Después:                       100 mg / 16 mg   → 1000 mg / 30 mg → 10000 mg / 60 mg
--
-- Solo se convierte si los valores son < 100 (signo de que todavía están en
-- gramos). Si la migración se vuelve a correr no hace nada de más.
-- ---------------------------------------------------------------------------
UPDATE verif_pesa_patron
   SET valor_nominal = valor_nominal * 1000,
       tolerancia    = tolerancia    * 1000
 WHERE valor_nominal < 100;

-- Las lecturas existentes en verif_balanza_medicion también estaban en gramos.
-- Se multiplican de la misma forma. Si no hay datos todavía, es un no-op.
UPDATE verif_balanza_medicion
   SET lectura_1 = lectura_1 * 1000,
       lectura_2 = lectura_2 * 1000,
       lectura_3 = lectura_3 * 1000,
       promedio  = CASE WHEN promedio  IS NOT NULL THEN promedio  * 1000 ELSE NULL END,
       desviacion= CASE WHEN desviacion IS NOT NULL THEN desviacion * 1000 ELSE NULL END
 WHERE lectura_1 < 100 OR lectura_2 < 100 OR lectura_3 < 100;
