-- Registro de qué analista guardó cada sección del día.
-- Una vez guardada una sección, otro usuario no puede sobreescribirla.
-- El superadministrador puede siempre.

CREATE TABLE IF NOT EXISTS verif_seccion_lock (
    fecha       DATE NOT NULL,
    seccion     TEXT NOT NULL,
    analista    TEXT NOT NULL,
    email       TEXT NOT NULL,
    guardado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (fecha, seccion)
);
