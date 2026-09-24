-- Qué tipos de notificación recibe cada usuario.
--
-- Hasta ahora lo decidía solo la `audiencia` de cada notificación, y como las
-- solicitudes y los reanálisis salen con audiencia='todos', le llegaban a
-- todo el mundo (clientes incluidos). Desde acá lo decide el mantenedor de
-- Notificaciones, usuario por usuario.
--
-- Sin fila = el usuario recibe lo predeterminado para su perfil (ver
-- `tipos_predeterminados` en app/notificaciones.py). `tipos` vacío = no recibe
-- nada y la campana desaparece de su menú.
--
-- Es idempotente.

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS notificacion_suscripcion (
    usuario_id      INTEGER     PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
    tipos           TEXT[]      NOT NULL DEFAULT '{}',
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_por TEXT
);

-- La carga de datos (Data Core) se notificaba sin `tipo`: se le pone uno para
-- poder filtrarla. Lo que siga sin tipo son los avisos escritos a mano.
UPDATE notificacion
SET    metadata = COALESCE(metadata, '{}'::jsonb) || '{"tipo": "carga_datos"}'::jsonb
WHERE  (metadata IS NULL OR metadata->>'tipo' IS NULL)
  AND  titulo LIKE '%Carga de datos completada%';
