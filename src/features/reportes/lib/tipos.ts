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
  tipo_servicio: string | null
  cliente: string | null
  planta: string | null
  tipo_aplicacion: string | null
  // Null cuando la solicitud todavía no tiene ningún resultado cargado.
  ingrediente: string | null
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
  limite_cuantificacion: string | null
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
  limite_cuantificacion?: string | null
  matriz?: string | null
  activo?: boolean
  limite_min?: number | null
  limite_central?: number | null
  limite_max?: number | null
}

/** Límite de un analito para una especie y tipo de servicio concretos.
 * especie === '' significa "aplica a todas las especies"; tipo_servicio === ''
 * significa "aplica a todos los tipos de servicio". */
export interface LimiteAnalito {
  id: number
  analito_id: number
  especie: string
  tipo_servicio: string
  limite_min: number | string | null
  limite_central: number | string | null
  limite_max: number | string | null
}

export interface LimiteAnalitoInput {
  analito_id: number
  especie: string
  tipo_servicio: string
  limite_min?: number | null
  limite_central?: number | null
  limite_max?: number | null
}

/** Una fila lista para filtrar/mostrar: toda solicitud de la base tiene una,
 * tenga o no un resultado numérico. `ppm` es null cuando no hay valor numérico
 * (sin resultado todavía, o un resultado cualitativo como "ND"); en ese caso
 * `valorTexto` puede traer el valor real reportado por el laboratorio. */
export interface Observacion {
  solicitudId: number
  nroSolicitud: string
  ingrediente: string | null
  ppm: number | null
  valorTexto: string | null
  fecha: string | null
  cliente: string | null
  planta: string | null
  tipoAplicacion: string | null
  tipoServicio: string | null
  laboratorio: string | null
  crop: string | null
  semana: number | null
  mes: number | null
}
