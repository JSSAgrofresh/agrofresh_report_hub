-- ----------------------------------------------------------------------------
-- 0021 - El cruce entre una solicitud y su muestra, guardado
--
-- Hasta acá el cruce vivía en la pantalla: se elegía la solicitud, se le
-- asignaba el vial del GC y todo eso desaparecía al recargar. Servía porque
-- las dos cosas pasaban en el mismo rato.
--
-- El flujo real es otro. La muestra llega al laboratorio y ahí mismo se le
-- pega su etiqueta: se escanea la solicitud, se escanea el número de muestra
-- y se cruzan. El GC corre esa noche, y recién al día siguiente se procesan
-- los resultados. Entre una cosa y otra pasan horas y se cierra el navegador,
-- así que el cruce tiene que estar guardado.
--
-- Y como el número de muestra es el MISMO código que después trae el archivo
-- del GC, al subir los resultados ya no hay que volver a emparejar nada: cada
-- vial encuentra su solicitud sola.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

ALTER TABLE solicitud_archivo
    ADD COLUMN IF NOT EXISTS codigo_muestra TEXT,
    ADD COLUMN IF NOT EXISTS cruzado_en     TIMESTAMPTZ;

-- Un vial es un tubo físico: no puede pertenecer a dos solicitudes. Si alguien
-- escanea un número ya usado, esto lo impide en la base y no solo en la
-- pantalla, que es donde de verdad importa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitud_archivo_muestra
    ON solicitud_archivo (codigo_muestra)
    WHERE codigo_muestra IS NOT NULL;
