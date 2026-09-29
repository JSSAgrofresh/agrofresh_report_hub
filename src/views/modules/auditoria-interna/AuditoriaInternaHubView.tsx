import { Header } from '@/components/layout/Header'
import { OpcionCard } from '@/components/ui/OpcionCard'
import { IconAuditoria, IconCarpeta, IconTrendingUp } from '@/components/ui/icons'
import { ROUTES } from '@/constants/routes'
import styles from '@/components/ui/OpcionCard.module.css'

/**
 * Puerta de entrada de Auditoría interna. Un solo permiso (`auditoria_interna`)
 * para las tres tarjetas, igual que el hub de AgroFresh Lab.
 */
export function AuditoriaInternaHubView() {
  return (
    <div>
      <Header
        title="Auditoría Interna"
        description="Panel analítico para auditar lo que emitimos y lo que recibimos de los laboratorios."
      />
      <div className={styles.grilla}>
        <OpcionCard
          icono={<IconAuditoria />}
          titulo="Solicitudes e informes"
          descripcion="Qué solicitudes emitimos, cuáles ya tienen su informe y están en Report, y los gráficos del total."
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
