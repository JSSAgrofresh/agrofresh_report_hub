export interface Cliente {
  id: number
  nombre: string
  codigo_sap: string | null
  rut: string | null
  activo: boolean
  total_plantas: number
}

export interface Planta {
  id: number
  cliente_id: number
  cliente_nombre: string
  nombre: string
  codigo_sap: string | null
  ciudad: string | null
  activo: boolean
}

export interface ClienteInput {
  nombre: string
  codigo_sap: string | null
  rut: string | null
  activo: boolean
}

export interface PlantaInput {
  cliente_id: number
  nombre: string
  codigo_sap: string | null
  ciudad: string | null
  activo: boolean
}

export interface AvisoImportacion {
  fila: number
  sold_to: string
  ship_to: string
  motivo: string
  /** true = esa fila no se carga */
  omitida: boolean
}

/** Lo que haría (o hizo) la carga del listado de Actimist. */
export interface PlanImportacionActimist {
  filas: number
  clientes_nuevos: { nombre: string; codigo_sap: string | null }[]
  plantas_nuevas: { sold_to: string; nombre: string; codigo_sap: string | null }[]
  clientes_existentes: number
  plantas_existentes: number
  avisos: AvisoImportacion[]
  aplicado: boolean
  creados: { clientes: number; plantas: number } | null
}
