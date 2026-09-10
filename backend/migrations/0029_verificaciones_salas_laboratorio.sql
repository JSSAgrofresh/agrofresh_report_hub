-- Los dos termómetros de referencia se reemplazan por dos salas de laboratorio
-- configurables. Se conserva el identificador de la sala existente para que
-- sus mediciones históricas sigan asociadas al mismo punto de control.

UPDATE verif_punto_temperatura
   SET nombre = 'Sala de laboratorio 1'
 WHERE nombre = 'Sala del laboratorio';

INSERT INTO verif_punto_temperatura (nombre, minimo, maximo, orden)
VALUES ('Sala de laboratorio 2', 15, 25, 2)
ON CONFLICT (nombre) DO NOTHING;

UPDATE verif_punto_temperatura
   SET orden = CASE nombre
       WHEN 'Sala de laboratorio 1' THEN 1
       WHEN 'Sala de laboratorio 2' THEN 2
       WHEN 'Refrigerador de reactivos' THEN 3
       WHEN 'Congelador de reactivos' THEN 4
       ELSE orden
   END
 WHERE nombre IN (
    'Sala de laboratorio 1',
    'Sala de laboratorio 2',
    'Refrigerador de reactivos',
    'Congelador de reactivos'
 );
