import { Header } from '@/components/layout/Header'
import { IframeModule } from '@/features/modules'

export function TraceView() {
  return (
    <div>
      <Header title="Trace" description="Trazabilidad de registros pH/ORP e informes PDF." />
      <IframeModule src="/modules/trace.html" titulo="Trace" />
    </div>
  )
}
