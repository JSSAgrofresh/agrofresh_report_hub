import { httpClient } from '@/services/http/client'
import type { RespuestaDetalle, RespuestaRendimiento } from './tipos'

/** Cuántos informes cumplen y cuántos no, por cliente, planta, semana y análisis (el resto se agrupa en la pantalla). */
export function leerRendimientoCalidad() {
  return httpClient.get<RespuestaRendimiento>('/auditoria-interna/rendimiento-calidad')
}

/** Los informes de una planta en el período (lo que se abre al hacer clic en una fila), con cada analito contra su límite. */
export function leerDetallePlanta(soldTo: string, shipTo: string, desde: string, hasta: string) {
  const q = new URLSearchParams({ sold_to: soldTo, ship_to: shipTo })
  if (desde) q.set('desde', desde)
  if (hasta) q.set('hasta', hasta)
  return httpClient.get<RespuestaDetalle>(`/auditoria-interna/rendimiento-calidad/detalle?${q.toString()}`)
}
