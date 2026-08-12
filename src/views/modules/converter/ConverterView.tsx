import { Header } from '@/components/layout/Header'
import { IframeModule } from '@/features/modules'

export function ConverterView() {
  return (
    <div>
      <Header title="Converter" description="Conversión y homogenización de informes de laboratorio." />
      <IframeModule src="/modules/converter.html" titulo="Converter" />
    </div>
  )
}
