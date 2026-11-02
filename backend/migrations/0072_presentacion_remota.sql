-- Presentación del sistema con control remoto (Administración General → Funciones).
-- Una fila por cuenta de administrador general. El computador (donde se ve la presentación) y el
-- teléfono (el control remoto) no se hablan directo: pasan por esta fila.
--   pc_visto_en       = última señal del computador (si pasaron más de 8 s, la presentación se da por cerrada)
--   control_visto_en  = última señal del teléfono
--   estado            = lo que muestra la presentación ahora (diapositiva, simulación, ecosistema…)
--   comandos / seq    = las órdenes del teléfono que el computador aún tiene que ejecutar (las últimas 40)
--   notas             = notas por diapositiva; solo se muestran en el teléfono
CREATE TABLE IF NOT EXISTS presentacion_remota (
    email             TEXT        PRIMARY KEY,
    pc_visto_en       TIMESTAMPTZ,
    control_visto_en  TIMESTAMPTZ,
    estado            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    comandos          JSONB       NOT NULL DEFAULT '[]'::jsonb,
    seq               BIGINT      NOT NULL DEFAULT 0,
    notas             JSONB       NOT NULL DEFAULT '{}'::jsonb,
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
