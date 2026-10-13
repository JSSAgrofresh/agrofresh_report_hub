-- Fecha y hora de envío anotada a mano para informes que NO pasan por Converter (los propios de
-- AgroFresh: su informe llega a Report con el OT en `referencia` y no tiene fila en
-- informe_auditoria, que es donde Converter guarda la «Fecha y hora de envío»).
-- Una fila por solicitud (solicitud_archivo.archivo). Auditoría interna la usa como fecha del informe
-- y del envío cuando el informe no trae una propia.
CREATE TABLE IF NOT EXISTS informe_fecha_manual (
    archivo      TEXT        PRIMARY KEY,
    fecha_envio  TIMESTAMPTZ NOT NULL,
    nota         TEXT,
    creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OT-AGF0050 (AgroFresh): el informe se envió el 30-09-2026 a las 08:06 (hora de Chile). No se cargó
-- en el sistema el mismo día, por eso se anota a mano.
INSERT INTO informe_fecha_manual (archivo, fecha_envio, nota)
SELECT archivo, TIMESTAMP '2026-09-30 08:06:00' AT TIME ZONE 'America/Santiago',
       'Envío real del informe, anotado a mano (no se cargó el mismo día).'
FROM solicitud_archivo
WHERE numero_solicitud = 'OT-AGF0050'
ON CONFLICT (archivo) DO UPDATE SET fecha_envio = EXCLUDED.fecha_envio, nota = EXCLUDED.nota;
