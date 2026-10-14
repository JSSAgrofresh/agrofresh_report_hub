import { httpClient } from '@/services/http/client'

export interface PlantaPlan {
  planta: string
  servicio: 'residuales' | 'fsma' | 'fito' | 'otro'
  cantidad: number
}

/** Lo prometido a un Sold To en la temporada, por fila del gráfico. */
export interface ClientePlan {
  sold_to: string
  residuales: number
  fsma: number
  fito: number
  plantas: PlantaPlan[]
}

export interface RespuestaPlan {
  temporada: string
  clientes: ClientePlan[]
  cargado_en: string | null
  /** Falta correr la migración 0062 en el servidor. */
  migracion_pendiente: boolean
}

export interface ResumenCargaPlan {
  temporada: string
  filas_leidas: number
  filas_validas: number
  clientes: number
  por_servicio: Record<string, number>
  descartados: { sold_to: string; motivo: string; filas: number }[]
}

export function leerPlanEntregables() {
  return httpClient.get<RespuestaPlan>('/plan-entregables/resumen')
}

function formulario(archivo: File) {
  const datos = new FormData()
  datos.append('archivo', archivo)
  return datos
}

/** Solo lee y cuenta: no escribe nada. Solo admin general. */
export function analizarPlanEntregables(archivo: File) {
  return httpClient.upload<ResumenCargaPlan>('/plan-entregables/analizar', formulario(archivo))
}

/** Reemplaza el plan de la temporada. Solo admin general. */
export function confirmarPlanEntregables(archivo: File) {
  return httpClient.upload<ResumenCargaPlan>('/plan-entregables/confirmar', formulario(archivo))
}
