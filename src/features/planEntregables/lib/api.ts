import { httpClient } from '@/services/http/client'

/** Las dos versiones del entregable que trae el plan: lo que había entregado el comercial (original) y la propuesta. */
export type VersionPlan = 'original' | 'propuesta'

export interface PlantaPlan {
  planta: string
  servicio: 'residuales' | 'fsma' | 'fito' | 'otro'
  original: number
  propuesta: number
}

/** Lo prometido a una planta del plan en una semana de la temporada (W41…W52, W01, W02). */
export interface SemanaPlan {
  planta: string
  servicio: 'residuales' | 'fsma' | 'fito'
  semana: string
  /** Quién lleva el cliente y qué tipo de cliente es (Estratégico, Preferente, Estándar), como vienen en el Excel. */
  comercial?: string | null
  tipo_cliente?: string | null
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
  /** Lo prometido semana a semana (solo con la migración 0073; sin ella viene vacío). */
  semanas?: SemanaPlan[]
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

/** Una fila del plan tal como quedó guardada: Sold To × planta × servicio × línea × semana, con sus dos cantidades. */
export interface FilaDetallePlan {
  sold_to: string
  sold_to_sap: string | null
  planta_plan: string | null
  comercial: string | null
  tipo_cliente: string | null
  tipo_servicio: string | null
  servicio: 'residuales' | 'fsma' | 'fito' | 'otro'
  linea: number | null
  semana: string | null
  peak: string | null
  original: number | null
  propuesta: number | null
}

export interface RespuestaDetallePlan {
  temporada: string
  filas: FilaDetallePlan[]
  cargado_en: string | null
  migracion_pendiente: boolean
  /** Falta correr la migración 0073: solo se ven Sold To, planta, servicio y la cantidad antigua. */
  detalle_completo: boolean
}

/** TODAS las filas del plan cargado (solo admin general), para revisar que se leyó bien el Excel. */
export function leerDetallePlanEntregables() {
  return httpClient.get<RespuestaDetallePlan>('/plan-entregables/detalle')
}
