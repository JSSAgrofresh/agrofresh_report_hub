import { Header } from '@/components/layout/Header'
import { OpcionCard } from '@/components/ui/OpcionCard'
import { IconEmitir, IconReports, IconTrendingUp } from '@/components/ui/icons'
import { ROUTES } from '@/constants/routes'
import styles from '@/components/ui/OpcionCard.module.css'

export function ReportesHubView() {
  return (
    <div>
      <Header
        title="Report"
        description="Elige qué tipo de reporte quieres ver o emitir."
      />
      <div className={styles.grilla}>
        <OpcionCard
          icono={<IconReports />}
          titulo="Reportes de Laboratorio"
          descripcion="Control de residuos: límites residuales y de control en tiempo real desde la base de datos."
          ruta={ROUTES.reportsLaboratorio}
        />
        <OpcionCard
          icono={<IconTrendingUp />}
          titulo="Reportes de Post Venta"
          descripcion="Seguimiento post venta de los despachos."
          disponible={false}
          etiquetaNoDisponible="En proceso de creación"
        />
        <OpcionCard
          icono={<IconEmitir />}
          titulo="Emitir reporte"
          descripcion="Genera un reporte nuevo a partir de resultados de laboratorio, cruzándolos con las solicitudes de muestreo."
          ruta={ROUTES.reportsEmitir}
        />
      </div>
    </div>
  )
}
