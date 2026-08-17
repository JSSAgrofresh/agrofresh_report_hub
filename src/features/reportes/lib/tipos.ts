/** Una fila del backend: formato largo, un registro por analito medido dentro de una solicitud. */
export interface FilaReporte {
  solicitud_id: number
  nro_solicitud: string
  laboratorio: string | null
  fecha_muestreo: string | null
  fecha_entrada: string | null
  especie: string | null
  variedad: string | null
  semana_muestreo: number | null
  mes: number | null
  temporada: number | null
  cliente: string | null
  planta: string | null
  tipo_aplicacion: string | null
  ingrediente: string
  valor_num: number | string | null
  valor_texto: string | null
}

export interface Analito {
  id: number
  codigo: string
  nombre: string
  categoria: string
  laboratorio: string
  unidad: string
  limite_deteccion: string | null
  matriz: string | null
  activo: boolean
  limite_min: number | string | null
  limite_central: number | string | null
  limite_max: number | string | null
}

export interface AnalitoInput {
  codigo: string
  nombre: string
  categoria: string
  laboratorio: string
  unidad: string
  limite_deteccion?: string | null
  matriz?: string | null
  activo?: boolean
  limite_min?: number | null
  limite_central?: number | null
  limite_max?: number | null
}

/** Una observación numérica lista para graficar: una fila con ppm real. */
export interface Observacion {
  ingrediente: string
  ppm: number
  fecha: string | null
  cliente: string | null
  planta: string | null
  tipoAplicacion: string | null
  laboratorio: string | null
  crop: string | null
  semana: number | null
  mes: number | null
}
