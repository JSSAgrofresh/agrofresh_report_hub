-- ----------------------------------------------------------------------------
-- 0044 - Auditoría interna: PDF de los informes de laboratorio
--
-- Cuando Converter sube un informe a la base, además guarda el PDF original en
-- el bucket "auditoria" de R2 (<laboratorio>/<ship to>/<archivo>.pdf) y anota
-- acá quién es, a qué solicitud emitida (OT) corresponde y cuándo se envió.
--
--   archivo_solicitud   solicitud_archivo.archivo de la OT a la que se amarró
--                       (la confirma quien sube; NULL si no se amarró).
--   nro_informe         el N° del informe del laboratorio = solicitud.nro_solicitud
--                       en Report. Con eso se sabe si ya se ve en Report.
--   fecha_envio         cuándo se envió el informe. La ingresa una persona a
--                       mano, al subirlo o después. Puede quedar vacía.
--
-- Una solicitud está "concretada" cuando tiene PDF acá Y sus resultados ya se
-- ven en Report.
--
-- Idempotente. Aplicar con:
--   cd backend
--   .venv\Scripts\python.exe scripts\migrar.py 0044_auditoria_interna.sql
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS informe_auditoria (
    id                 SERIAL PRIMARY KEY,
    archivo_solicitud  TEXT,
    numero_solicitud   TEXT,
    nro_informe        TEXT,
    laboratorio        TEXT        NOT NULL,
    sold_to            TEXT,
    ship_to            TEXT,
    nombre_archivo     TEXT        NOT NULL,
    r2_key             TEXT        NOT NULL,
    tamano_bytes       BIGINT,
    fecha_envio        TIMESTAMPTZ,
    subido_por_email   TEXT,
    subido_por_nombre  TEXT,
    subido_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_informe_auditoria_key
    ON informe_auditoria (r2_key);

-- Volver a subir el mismo informe del mismo laboratorio lo reemplaza, no lo duplica.
CREATE UNIQUE INDEX IF NOT EXISTS idx_informe_auditoria_informe
    ON informe_auditoria (laboratorio, nro_informe)
    WHERE nro_informe IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_informe_auditoria_solicitud
    ON informe_auditoria (archivo_solicitud);
