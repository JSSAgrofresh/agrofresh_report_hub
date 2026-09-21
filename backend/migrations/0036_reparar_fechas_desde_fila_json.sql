-- Segunda pasada de reparación de fechas para filas del formato BD (Quiteca).
-- La migración 0035 no actualizó nada porque fecha_informe/fecha_analisis
-- también estaban NULL: el mapeo original no reconocía los nombres de columna
-- del BD ("Fecha Informe" sí, pero no siempre se guardó bien).
--
-- Este parche extrae la fecha directamente del JSON fila guardado en
-- pendiente_revision (que tiene los datos originales del Excel) y la copia
-- a lab.solicitud donde todavía falte.
UPDATE lab.solicitud s
SET
    fecha_muestreo = COALESCE(
        s.fecha_muestreo,
        (pr.fila->>'Fecha Informe')::date,
        (pr.fila->>'Fecha Análisis')::date,
        (pr.fila->>'Fecha análisis')::date,
        (pr.fila->>'Fecha de Muestreo')::date,
        (pr.fila->>'Fecha Muestreo')::date,
        (pr.fila->>'Fecha de muestreo')::date
    ),
    fecha_entrada = COALESCE(
        s.fecha_entrada,
        (pr.fila->>'Fecha Informe')::date,
        (pr.fila->>'Fecha Análisis')::date,
        (pr.fila->>'Fecha análisis')::date,
        (pr.fila->>'Fecha de Entrada')::date,
        (pr.fila->>'Fecha entrada')::date
    ),
    fecha_informe = COALESCE(
        s.fecha_informe,
        (pr.fila->>'Fecha Informe')::date
    ),
    fecha_analisis = COALESCE(
        s.fecha_analisis,
        (pr.fila->>'Fecha Análisis')::date,
        (pr.fila->>'Fecha análisis')::date
    )
FROM (
    SELECT DISTINCT ON (fila->>'Informe')
        fila->>'Informe' AS nro_solicitud,
        fila
    FROM lab.pendiente_revision
    WHERE fila->>'Informe' IS NOT NULL
) pr
WHERE pr.nro_solicitud = s.nro_solicitud
  AND (s.fecha_muestreo IS NULL OR s.fecha_entrada IS NULL);
