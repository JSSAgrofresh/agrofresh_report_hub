import { useState } from 'react'
import { Header } from '@/components/layout/Header'
import { IframeModule } from '@/features/modules'
import { SubirCostoKilo } from './SubirCostoKilo'
import styles from './SubirCostoKilo.module.css'

// trace.html es un archivo estático: no pasa por el build, así que no puede
// leer VITE_API_BASE_URL. Se le entrega por la URL del iframe para que
// "Guardar en el servidor" apunte al mismo backend que el resto de la app,
// sea cual sea el origen donde esté publicada.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const SRC_TRACE = `/modules/trace.html?api=${encodeURIComponent(API_BASE_URL)}`

type Pestana = 'accutab' | 'costo'

export function TraceView() {
  const [pestana, setPestana] = useState<Pestana>('accutab')
  return (
    <div>
      <Header
        title="Trace"
        description="Trazabilidad de registros pH/ORP e informes PDF, y carga a mano del costo por kilo. Al terminar, usa «Guardar en el servidor» para que la carga quede en Reportes de Post Venta."
      />
      <div className={styles.pestanas} role="tablist" aria-label="Qué subir">
        <button type="button" role="tab" aria-selected={pestana === 'accutab'} className={`${styles.pestana} ${pestana === 'accutab' ? styles.pestanaActiva : ''}`} onClick={() => setPestana('accutab')}>
          Accu-Tab · pH y ORP
        </button>
        <button type="button" role="tab" aria-selected={pestana === 'costo'} className={`${styles.pestana} ${pestana === 'costo' ? styles.pestanaActiva : ''}`} onClick={() => setPestana('costo')}>
          Costo por kilo
        </button>
      </div>
      {pestana === 'accutab' ? <IframeModule src={SRC_TRACE} titulo="Trace" /> : <SubirCostoKilo />}
    </div>
  )
}
