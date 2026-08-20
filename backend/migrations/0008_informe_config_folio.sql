-- Datos del informe de cromatografía que NO vienen del cruce de la solicitud
-- con el resultado del GC (quién analizó, quién aprueba) y el correlativo
-- interno con el que se identifica cada informe emitido.
--
-- Ejecutar una sola vez:
--   psql -U postgres -d tu_base -f migrations/0008_informe_config_folio.sql

SET search_path = lab, public;

-- Fila única (id = 1): los nombres/cargos que van en el bloque de firma del
-- PDF. Quedan seteados hasta que alguien los edite desde la app -así, si la
-- jefa de Cromatografía sale de vacaciones y firma otra persona, se cambia
-- acá una vez y todos los informes nuevos salen con el nombre correcto-.
CREATE TABLE IF NOT EXISTS informe_config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    analizado_por_nombre TEXT NOT NULL DEFAULT '',
    analizado_por_cargo TEXT NOT NULL DEFAULT 'Analista de Laboratorio',
    aprobado_por_nombre TEXT NOT NULL DEFAULT '',
    aprobado_por_cargo TEXT NOT NULL DEFAULT 'Jefe(a) Laboratorio de Cromatografía',
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO informe_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Correlativo diario para el folio LAB-YYYYMMDD-NNN de cada informe emitido
-- (Excel y PDF del mismo cruce comparten folio). Reinicia solo al cambiar de
-- fecha porque "siguiente" se guarda por fecha, no de forma global.
CREATE TABLE IF NOT EXISTS informe_folio (
    fecha DATE PRIMARY KEY,
    siguiente INTEGER NOT NULL DEFAULT 1
);
