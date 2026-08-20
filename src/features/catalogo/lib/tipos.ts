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
