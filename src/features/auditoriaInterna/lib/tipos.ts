export interface InformeAuditoria {
  id: number
  /** N° del informe según el laboratorio (= N° de solicitud en Report) */
  nro_informe: string | null
  nombre_archivo: string
  ruta: string
  /** cuándo se subió a la base y al bucket (lo pone el sistema) */
  cargado_en: string | null
  /** cuándo se envió el informe (lo ingresa una persona; puede estar vacío) */
  fecha_envio: string | null
}

export interface SolicitudAuditoria {
  archivo: string
  numero_solicitud: string | null
  laboratorio: string | null
  sold_to: string | null
  ship_to: string | null
  especie: string | null
  fecha_solicitud: string | null
  fecha_muestreo: string | null
  /** cuándo se emitió la solicitud en el sistema (ISO) */
  emitida_en: string | null
  informe: InformeAuditoria | null
  /** ¿ya se ven sus resultados en Report? */
  en_report: boolean
  /** PDF guardado Y resultados en Report */
  concretada: boolean
}

export type EstadoSolicitud = 'concretada' | 'sin_report' | 'pendiente'

export interface CarpetaEntrada {
  nombre: string
  ruta: string
}

export interface ArchivoEntrada {
  nombre: string
  ruta: string
  tamano_bytes: number
  modificado: string
  informe_id: number | null
  numero_solicitud: string | null
  nro_informe: string | null
  fecha_envio: string | null
}

export interface ContenidoCarpeta {
  ruta: string
  carpetas: CarpetaEntrada[]
  archivos: ArchivoEntrada[]
}
