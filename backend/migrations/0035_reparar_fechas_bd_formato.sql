-- Filas ingresadas desde BD_formato (Quiteca) no traen "Fecha entrada" ni
-- "Fecha de muestreo": fecha_entrada y fecha_muestreo quedaron NULL.
-- fecha_informe sí se guardó correctamente.
-- Este parche las rellena para que el Report agrupe por fecha real.
UPDATE lab.solicitud
SET
    fecha_muestreo = COALESCE(fecha_muestreo, fecha_informe, fecha_analisis),
    fecha_entrada  = COALESCE(fecha_entrada,  fecha_informe, fecha_analisis)
WHERE (fecha_muestreo IS NULL OR fecha_entrada IS NULL)
  AND (fecha_informe IS NOT NULL OR fecha_analisis IS NOT NULL);
