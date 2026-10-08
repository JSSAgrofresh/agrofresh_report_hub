import { httpClient } from '@/services/http/client'

export type ClaveServicioReport = 'linea_proceso' | 'actimist' | 'ecofog' | 'ryd'

export interface ServicioReport {
  clave: ClaveServicioReport
  etiqueta: string
  activo: boolean
}

export interface EstadoFunciones {
  report: {
    servicios: ServicioReport[]
    cambiado_por: string | null
    cambiado_en: string | null
  }
  /** Falta correr la migración 0055 en el servidor: Report muestra todo hasta entonces. */
  migracion_pendiente: boolean
}

export function obtenerFunciones() {
  return httpClient.get<EstadoFunciones>('/funciones')
}

/** Solo el administrador principal, con su contraseña, para encender o apagar. */
export function cambiarServicioReport(servicio: ClaveServicioReport, activo: boolean, password: string) {
  return httpClient.put<EstadoFunciones>('/funciones/report', { servicio, activo, password })
}
