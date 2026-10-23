export interface InformeAuditoria {
  /** null = informe propio de AgroFresh: no pasó por Converter, sus resultados están en Report con el OT */
  id: number | null
  /** N° del informe según el laboratorio (= N° de solicitud en Report) */
  nro_informe: string | null
  nombre_archivo: string | null
  ruta: string | null
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
  variedad: string | null
  /** Actimist o Línea de proceso (el «Tipo Aplicación» de la solicitud) */
  tipo_servicio: string | null
  /** códigos de los analitos que se pidieron (ej. FDL, PYR) */
  analitos: string[]
  /** los Análisis que pidió (FSMA, residuos en fruta, patógenos…), según el catálogo de su laboratorio */
  analisis?: string[]
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
