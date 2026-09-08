import { Header } from '@/components/layout/Header'
import { IframeModule } from '@/features/modules'

// converter.html es un archivo estático: no pasa por el build, así que no
// puede leer VITE_API_BASE_URL. Se le entrega por la URL del iframe (mismo
// patrón que TraceView.tsx con trace.html) para que "Subir a la base de
// datos" apunte al backend real y no a http://localhost:8000 fijo, que es lo
// único que existía antes y por eso fallaba con "Failed to fetch" fuera de
// esa misma máquina.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const SRC_CONVERTER = `/modules/converter.html?api=${encodeURIComponent(API_BASE_URL)}`

export function ConverterView() {
  return (
    <div>
      <Header title="Converter" description="Conversión y homogenización de informes de laboratorio." />
      <IframeModule src={SRC_CONVERTER} titulo="Converter" />
    </div>
  )
}
