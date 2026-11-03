import { httpClient } from '@/services/http/client'

/** Las dos versiones del entregable que trae el plan: lo que había entregado el comercial (original) y la propuesta. */
export type VersionPlan = 'original' | 'propuesta'

export interface PlantaPlan {
  planta: string
  servicio: 'residuales' | 'fsma' | 'fito' | 'otro'
  original: number
  propuesta: number
}

export interface CantidadesPlan {
  residuales: number
  fsma: number
  fito: number
}

/** Lo prometido a un Sold To en la temporada, por fila del gráfico, en sus dos versiones (original y propuesta). */
export interface ClientePlan {
  sold_to: string
  comercial?: string | null
  original: CantidadesPlan
  propuesta: CantidadesPlan
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
  /** Filas repetidas que se fusionaron (no cuentan doble). */
  filas_fusionadas?: number
  /** Filas sin Original ni Propuesta: se saltan. */
  filas_sin_cantidad?: number
  clientes: number
  plantas?: number
  por_servicio: Record<string, { original: number; propuesta: number }>
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
