-- Cuentas de tipo «comercial»: ven (solo lectura) únicamente las plantas que el administrador general les asigna.
-- Cada elemento es {"clienteNombre": "...", "plantaNombre": "..."}; sin plantaNombre = todas las plantas de ese Sold To.
-- Una cuenta que no es comercial la deja en [] y no se mira.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS plantas_asignadas JSONB NOT NULL DEFAULT '[]'::jsonb;
