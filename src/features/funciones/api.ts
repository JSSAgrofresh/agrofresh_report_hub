import { httpClient } from '@/services/http/client'

export type ClaveServicioReport = 'linea_proceso' | 'actimist' | 'ecofog' | 'ryd'

export interface ServicioReport {
  clave: ClaveServicioReport
  etiqueta: string
  activo: boolean
}

export interface GraficosInformes {
  /** Report muestra la línea de tiempo y la serie de tiempo de ALS y Diagnofruit; apagado, solo la tabla. */
  activo: boolean
  cambiado_por: string | null
  cambiado_en: string | null
}

export interface EstadoFunciones {
  graficos_informes?: GraficosInformes
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

/** Los gráficos de ALS y Diagnofruit en Report. Solo el administrador principal, con su contraseña. */
export function cambiarGraficosInformes(activo: boolean, password: string) {
  return httpClient.put<EstadoFunciones>('/funciones/graficos-informes', { activo, password })
}
