export const LABORATORIOS = ['QUITECA', 'AGROFRESH', 'ALS', 'DIAGNOFRUIT'] as const
export type Laboratorio = (typeof LABORATORIOS)[number]

export interface Solicitud {
  archivo: string
  numero_solicitud: string
  fecha_solicitud: string
  laboratorio: string
  solicitante: string
  sold_to: string
  ship_to: string | null
  especie: string | null
  variedad: string | null
  linea_proceso: string | null
  csg: string | null
  lote: string | null
  posicion_muestreo: string | null
  numero_camara: string | null
  numero_orden: string | null
  kilos_procesados: number | null
  producto_utilizado: string | null
  tipo_muestra: string | null
  fecha_muestreo: string | null
  hora_muestreo: string | null
  nombre_muestreador: string | null
  generado_por: string
  email_solicitante: string | null
  email_laboratorio: string | null
  observacion: string | null
  /** Campos propios del laboratorio elegido (etiqueta -> valor). */
  campos_laboratorio: Record<string, string>
  creado_en: string
}

export type SolicitudInput = Omit<Solicitud, 'archivo' | 'numero_solicitud' | 'fecha_solicitud' | 'creado_en'>

/** Metadatos de un campo general del formulario (§3): el conjunto de
 * claves es fijo, pero etiqueta/tipo/requerido/activo/orden los define el
 * administrador desde el mantenedor de Toma de muestras. */
export interface CampoConfig {
  clave: string
  etiqueta: string
  tipo: 'text' | 'number' | 'date' | 'time' | 'email' | 'textarea' | 'select'
  requerido: boolean
  activo: boolean
  orden: number
}

/** Opción simple de un mantenedor (tipos de aplicación, líneas de proceso). */
export interface OpcionConfig {
  id: number
  nombre: string
  activo: boolean
  orden: number
}

export type OpcionInput = Omit<OpcionConfig, 'id'>

/** Un análisis disponible para un laboratorio. `dosis_aplicable` distingue
 * los analitos de cromatografía (QUITECA/AGROFRESH), que llevan una dosis
 * aplicada asociada, de los de resultado directo (DIAGNOFRUIT/ALS). */
export interface AnalitoConfig {
  id: number
  laboratorio: string
  codigo: string
  nombre: string
  unidad: string | null
  tipo: 'numero' | 'texto'
  dosis_aplicable: boolean
  requerido: boolean
  activo: boolean
  orden: number
}

export type AnalitoInput = Omit<AnalitoConfig, 'id'>
