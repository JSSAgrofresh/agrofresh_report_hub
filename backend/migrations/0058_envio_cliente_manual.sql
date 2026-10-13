-- «Informe enviado al cliente» marcado a mano (Converter al subir el informe, o Solicitudes e
-- informes para los cruces antiguos). Una fila por solicitud (solicitud_archivo.archivo).
-- Alimenta el hito «cliente» de Auditoría interna junto a los envíos reales de «Envío de informes».
CREATE TABLE IF NOT EXISTS envio_cliente_manual (
    archivo      TEXT        PRIMARY KEY,
    enviado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    marcado_por  TEXT,
    origen       TEXT        NOT NULL DEFAULT 'solicitudes'
);
