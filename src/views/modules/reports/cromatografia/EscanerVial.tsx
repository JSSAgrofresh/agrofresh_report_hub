import { buscarPorCodigoVial } from '@/features/emitir'
import type { MuestraGC } from '@/features/emitir'
import { Escaner } from './Escaner'
import { FichaEscaneada } from './FichaEscaneada'

interface EscanerVialProps {
  muestras: MuestraGC[] | null
  elegida: MuestraGC | null
  onElegir: (muestra: MuestraGC | null) => void
  /** Verde: el otro lado también está resuelto y el cruce se puede hacer. */
  listo: boolean
  reinicio: number
}

/**
 * Lee el vial con la misma pistola que la solicitud.
 *
 * Solo encuentra códigos del archivo del GC ya cargado: sin ese archivo no
 * hay resultados contra los cuales buscar, y el campo queda apagado en vez de
 * dejar escanear al vacío.
 */
export function EscanerVial({ muestras, elegida, onElegir, listo, reinicio }: EscanerVialProps) {
  const medidos = (elegida?.resultados ?? []).filter((r) => r.codigo)

  return (
    <>
      <Escaner
        buscar={(texto) => buscarPorCodigoVial(muestras ?? [], texto)}
        onEncontrado={onElegir}
        onLimpiar={() => onElegir(null)}
        placeholder="Escanea el código del vial"
        mensajeNoEncontrado={(c) => `El vial “${c}” no está en el archivo del GC cargado.`}
        resuelto={Boolean(elegida)}
        deshabilitado={!muestras?.length}
        motivoDeshabilitado="Carga primero el reporte del GC"
        reinicio={reinicio}
      />

      {elegida && (
        <FichaEscaneada
          titulo={elegida.codigo}
          listo={listo}
          estado={listo ? 'listo para cruzar' : 'falta escanear la solicitud'}
          datos={[
            ['Fecha inyección', elegida.fecha_inyeccion ?? '—'],
            ['Analitos medidos', String(medidos.length)],
          ]}
          chips={medidos.map((r) => `${r.codigo}: ${r.amount ?? '—'}`)}
          onQuitar={() => onElegir(null)}
        />
      )}
    </>
  )
}
