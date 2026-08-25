import { Header } from '@/components/layout/Header'
import { IframeModule } from '@/features/modules'

// trace.html es un archivo estático: no pasa por el build, así que no puede
// leer VITE_API_BASE_URL. Se le entrega por la URL del iframe para que
// "Guardar en el servidor" apunte al mismo backend que el resto de la app,
// sea cual sea el origen donde esté publicada.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const SRC_TRACE = `/modules/trace.html?api=${encodeURIComponent(API_BASE_URL)}`

export function TraceView() {
  return (
    <div>
      <Header
        title="Trace"
        description="Trazabilidad de registros pH/ORP e informes PDF. Al terminar, usa «Guardar en el servidor» para que la carga quede en Reportes de Post Venta."
      />
      <IframeModule src={SRC_TRACE} titulo="Trace" />
    </div>
  )
}
