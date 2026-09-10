-- Catálogo de métodos analíticos del cromatógrafo.
-- Reemplaza el campo de texto libre "Nombre del método" en inyector y detector
-- por una lista gestionada desde Criterios.

CREATE TABLE IF NOT EXISTS verif_metodo (
    id     SERIAL PRIMARY KEY,
    nombre TEXT    NOT NULL,
    orden  INTEGER NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

-- Métodos por defecto del laboratorio AgroFresh Lab
INSERT INTO verif_metodo (nombre, orden) VALUES
    ('ECD_Pes', 1),
    ('FID_Pes', 2);
