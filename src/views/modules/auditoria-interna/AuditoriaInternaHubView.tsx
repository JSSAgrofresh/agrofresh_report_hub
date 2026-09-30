import { Header } from '@/components/layout/Header'
import { OpcionCard } from '@/components/ui/OpcionCard'
import { IconAuditoria, IconCarpeta, IconTrendingUp } from '@/components/ui/icons'
import { ROUTES } from '@/constants/routes'
import tarjetas from '@/components/ui/OpcionCard.module.css'

/** Puerta de entrada de Auditoría interna. Un solo permiso para las tres
 * tarjetas, igual que el hub de AgroFresh Lab. */
export function AuditoriaInternaHubView() {
  return (
    <div>
      <Header
        title="Auditoría Interna"
        description="Panel analítico para auditar lo que emitimos y lo que recibimos de los laboratorios."
      />

      <div className={tarjetas.grilla}>
        <OpcionCard
          icono={<IconAuditoria />}
          titulo="Solicitudes e informes"
          descripcion="Cuánto se ha concretado, y los análisis por mes y por semana de Quiteca y Agrofresh, con gráficos por tipo de servicio y por cliente."
          ruta={ROUTES.auditoriaInternaSolicitudes}
        />
        <OpcionCard
          icono={<IconCarpeta />}
          titulo="Carpetas de auditoría"
          descripcion="Los PDF de los informes, ordenados por laboratorio y ship to."
          ruta={ROUTES.auditoriaInternaCarpetas}
        />
        <OpcionCard
          icono={<IconTrendingUp />}
          titulo="Vista por límite de control"
          descripcion="Límites dinámicos (promedio ± N desviaciones) sobre los resultados de la base."
          ruta={ROUTES.auditoriaInternaLimiteControl}
        />
      </div>
    </div>
  )
}
