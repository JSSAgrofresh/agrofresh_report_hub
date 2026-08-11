import { Header } from '@/components/layout/Header'
import { SamplesList, useSamples } from '@/features/samples'

export function SamplesView() {
  const { samples, status } = useSamples()

  return (
    <div>
      <Header title="Muestras" description="Seguimiento de muestras recibidas en laboratorio." />
      {status === 'loading' ? <p>Cargando muestras…</p> : <SamplesList samples={samples} />}
    </div>
  )
}
