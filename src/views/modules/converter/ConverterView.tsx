import { Header } from '@/components/layout/Header'
import { IframeModule } from '@/features/modules'

// converter.html es un archivo estático: no pasa por el build, así que no
// puede leer VITE_API_BASE_URL. Se le entrega por la URL del iframe, igual
// que TraceView.tsx hace con trace.html, para que apunte al mismo backend que
// el resto de la app sea cual sea el origen donde esté publicada.
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
