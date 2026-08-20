-- Nuevo formato del identificador de informe de laboratorio: AGF{año}-{n}
-- (ej. AGF2026-1, AGF2026-2...), correlativo por año -no por día como el
-- anterior LAB-YYYYMMDD-NNN-. La tabla vieja `informe_folio` se deja tal
-- cual (no se borra ni se migra): simplemente deja de usarse.
--
-- Ejecutar una sola vez:
--   psql -U postgres -d tu_base -f migrations/0010_informe_folio_anual.sql

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS informe_folio_anual (
    anio INTEGER PRIMARY KEY,
    siguiente INTEGER NOT NULL DEFAULT 1
);
