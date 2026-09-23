import { Header } from '@/components/layout/Header'
import { HomogenizadorIngestPanel } from '@/views/modules/datacore/HomogenizadorIngestPanel'

export function IngestaView() {
  return (
    <div>
      <Header
        title="Ingesta de Datos"
        description="Carga, homogeneiza y confirma resultados de laboratorio en la base de datos."
      />
      <HomogenizadorIngestPanel />
    </div>
  )
}
