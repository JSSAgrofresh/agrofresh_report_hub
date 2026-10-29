-- Muestra interna (Toma de muestras): Ship To "MUESTRA INTERNA" bajo el Sold To AGROFRESH, en el listado de
-- Línea de proceso (cliente/planta). Idempotente: si AGROFRESH ya existe (con cualquier mayúscula) se usa ese;
-- si el Ship To ya existe no se toca.
INSERT INTO cliente (nombre)
SELECT 'AGROFRESH'
WHERE NOT EXISTS (SELECT 1 FROM cliente WHERE upper(btrim(nombre)) = 'AGROFRESH');

INSERT INTO planta (cliente_id, nombre)
SELECT c.id, 'MUESTRA INTERNA'
FROM cliente c
WHERE upper(btrim(c.nombre)) = 'AGROFRESH'
  AND NOT EXISTS (
      SELECT 1 FROM planta p WHERE p.cliente_id = c.id AND upper(btrim(p.nombre)) = 'MUESTRA INTERNA'
  );
