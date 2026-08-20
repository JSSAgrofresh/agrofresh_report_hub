export interface Solicitud {
  archivo: string
  numero_solicitud: string
  fecha_solicitud: string
  generado_por: string
  laboratorio: string
  tipo_aplicacion: string
  creado_en: string
}

export interface SolicitudInput {
  generado_por: string
  laboratorio: string
  tipo_aplicacion: string
}
