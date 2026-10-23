import { httpClient } from '@/services/http/client'
import type { RespuestaRendimiento } from './tipos'

/** Cuántos informes cumplen y cuántos no, por cliente, planta, semana y análisis (el resto se agrupa en la pantalla). */
export function leerRendimientoCalidad() {
  return httpClient.get<RespuestaRendimiento>('/auditoria-interna/rendimiento-calidad')
}
