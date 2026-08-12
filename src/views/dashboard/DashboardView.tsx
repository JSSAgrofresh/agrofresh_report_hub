import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { useReports } from '@/features/reports'
import { useSamples } from '@/features/samples'
import styles from './DashboardView.module.css'

export function DashboardView() {
  const { reports } = useReports()
  const { samples } = useSamples()

  const pendingReports = reports.filter((report) => report.status === 'pending').length
  const samplesInAnalysis = samples.filter((sample) => sample.stage === 'in_analysis').length

  return (
    <div>
      <Header
        title="Panel general"
        description="Resumen del estado de reportes y muestras de residuos de pesticidas."
      />
      <div className={styles.grid}>
        <Card>
          <p className={styles.metricLabel}>Reportes totales</p>
          <p className={styles.metricValue}>{reports.length}</p>
        </Card>
        <Card>
          <p className={styles.metricLabel}>Reportes pendientes</p>
          <p className={styles.metricValue}>{pendingReports}</p>
        </Card>
        <Card>
          <p className={styles.metricLabel}>Muestras totales</p>
          <p className={styles.metricValue}>{samples.length}</p>
        </Card>
        <Card>
          <p className={styles.metricLabel}>Muestras en análisis</p>
          <p className={styles.metricValue}>{samplesInAnalysis}</p>
        </Card>
      </div>
    </div>
  )
}
