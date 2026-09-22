-- Corrige las notificaciones que quedaron con audiencia='todos' por el default
-- incorrecto del commit inicial (95c93d2). Las que no son de tipo 'solicitud'
-- (nueva solicitud de análisis) deben ser visibles solo para cromatografía.
--
-- Regla:
--   tipo='solicitud'   → audiencia='todos'   (intencionado: avisa a todos)
--   todo lo demás      → audiencia='cromatografia'

UPDATE notificacion
SET    audiencia = 'cromatografia'
WHERE  audiencia = 'todos'
  AND  (metadata IS NULL OR metadata->>'tipo' <> 'solicitud');
