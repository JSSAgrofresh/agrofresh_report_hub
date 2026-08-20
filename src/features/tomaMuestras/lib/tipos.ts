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
