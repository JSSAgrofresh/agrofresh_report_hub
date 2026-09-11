-- Configuración personalizada de columnas por sección de criterios.
-- Permite cambiar la etiqueta, la unidad y activar/desactivar cada columna
-- sin tocar el código. NULL en etiqueta o unidad = usar el valor por defecto.

CREATE TABLE IF NOT EXISTS verif_columna_config (
    seccion  TEXT NOT NULL,
    clave    TEXT NOT NULL,
    etiqueta TEXT,
    unidad   TEXT,
    visible  BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (seccion, clave)
);
