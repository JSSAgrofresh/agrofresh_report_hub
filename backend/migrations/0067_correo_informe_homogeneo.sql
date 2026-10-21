-- Ingreso de Informes: ¿los datos que trae el informe (Sold To, Ship To, Especie, Variedad) calzan con Listados
-- (lo mismo que revisa el Converter)? NULL = no se ha revisado o no aplica; TRUE = se puede cargar tal cual;
-- FALSE = hay que homogeneizar a mano antes de aceptarlo (motivos en `homogeneo_motivos`).
ALTER TABLE correo_informe ADD COLUMN IF NOT EXISTS homogeneo BOOLEAN;
ALTER TABLE correo_informe ADD COLUMN IF NOT EXISTS homogeneo_motivos JSONB;
