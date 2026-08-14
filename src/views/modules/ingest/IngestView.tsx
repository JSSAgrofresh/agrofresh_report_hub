import { Header } from '@/components/layout/Header'
import { IframeModule } from '@/features/modules'

export function IngestView() {
  return (
    <div>
      <Header
        title="Ingest"
        description="Homogenización y validación de la base de datos antes de cargarla a producción."
      />
      <IframeModule src="/modules/ingest.html" titulo="Ingest" />
    </div>
  )
}
