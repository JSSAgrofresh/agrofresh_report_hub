-- Recalcula semana_muestreo para las solicitudes ya cargadas, usando la misma
-- fórmula que el ingest corregido: NUM.DE.SEMANA(fecha_entrada) — semanas de
-- domingo a sábado, semana 1 = la que contiene el 1 de enero. Antes se guardaba
-- tal cual venía la columna "SEMANA" del Excel, que no es confiable (traía el
-- mismo número para filas de meses distintos).
--
-- Ejecutar una sola vez, después de haber actualizado el código del backend:
--   psql -U postgres -d tu_base -f migrations/0002_recalcular_semana.sql

SET search_path = lab, public;

UPDATE solicitud
SET semana_muestreo = (
    (fecha_entrada - make_date(EXTRACT(YEAR FROM fecha_entrada)::int, 1, 1))
    + (EXTRACT(DOW FROM make_date(EXTRACT(YEAR FROM fecha_entrada)::int, 1, 1))::int + 1)
) / 7 + 1
WHERE fecha_entrada IS NOT NULL;
