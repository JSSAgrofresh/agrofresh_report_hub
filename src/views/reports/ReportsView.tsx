import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { ReportsTable, useReports } from '@/features/reports'

export function ReportsView() {
  const { reports, status } = useReports()

  return (
    <div>
      <Header
        title="Reportes"
        description="Resultados de análisis de residuos de pesticidas por lote."
      />
      <Card>
        {status === 'loading' ? <p>Cargando reportes…</p> : <ReportsTable reports={reports} />}
      </Card>
    </div>
  )
}
