-- Marca como «enviado al cliente» toda solicitud real cuyo informe ya tiene «Fecha y hora de envío»
-- (informe_auditoria.fecha_envio): es la fecha que una persona anotó al subir el informe, y vale como
-- el envío. Guarda la marca en envio_cliente_manual con esa misma fecha.
-- Solo AGREGA: si la solicitud ya tiene marca, no se toca. No marca las de prueba ni los informes sin fecha.
-- Se puede correr más de una vez: la segunda no cambia nada.
INSERT INTO envio_cliente_manual (archivo, enviado_en, marcado_por, origen)
SELECT sa.archivo, min(ia.fecha_envio), 'migración 0059', 'migracion'
FROM informe_auditoria ia
JOIN solicitud_archivo sa ON sa.archivo = ia.archivo_solicitud
WHERE ia.fecha_envio IS NOT NULL
  AND coalesce(sa.datos->>'es_prueba', '') <> 'true'
GROUP BY sa.archivo
ON CONFLICT (archivo) DO NOTHING;
