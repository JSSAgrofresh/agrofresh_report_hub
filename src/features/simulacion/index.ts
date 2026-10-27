import { useSyncExternalStore } from 'react'
import { generarAccutabSimulado } from '@/features/postventa/lib/simulacion'
import type { AccutabSimulado } from '@/features/postventa/lib/simulacion'
import { generarDatosSimulados } from '@/features/reportes/lib/simulacion'
import type { DatosSimulados } from '@/features/reportes/lib/simulacion'

/** Cantidad de resultados que genera «Simular datos» (residuos, FSMA y fitopatología repartidos 60/20/20). */
export const RESULTADOS_SIMULADOS = 300

export interface EstadoSimulacion {
  reporte: DatosSimulados | null
  accutab: AccutabSimulado | null
}

/**
 * La simulación vive en un solo lugar para que Report y los informes Accu-Tab simulen a la vez, aunque se cambie de
 * pantalla. Solo está en memoria: recargar la página la apaga. Solo la prende el administrador desde Report.
 */
let estado: EstadoSimulacion = { reporte: null, accutab: null }
const oyentes = new Set<() => void>()

function avisar() {
  oyentes.forEach((o) => o())
}

export function activarSimulacion() {
  const semilla = Math.floor(Math.random() * 1e9)
  estado = { reporte: generarDatosSimulados(RESULTADOS_SIMULADOS, semilla), accutab: generarAccutabSimulado(30, semilla) }
  avisar()
}

export function desactivarSimulacion() {
  estado = { reporte: null, accutab: null }
  avisar()
}

export function useSimulacion(): EstadoSimulacion {
  return useSyncExternalStore(
    (cb) => {
      oyentes.add(cb)
      return () => oyentes.delete(cb)
    },
    () => estado,
  )
}
