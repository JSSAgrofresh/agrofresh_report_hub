import { httpClient } from '@/services/http/client'
import type { PedidoBd } from './descargaBd'
import type { Analito, AnalitoInput, FichaInforme, FilaReporte, LimiteAnalito, LimiteAnalitoInput } from './tipos'

export function obtenerDatosReporte(cliente?: string, planta?: string) {
  const params = new URLSearchParams()
  if (cliente) params.set('cliente', cliente)
  if (planta) params.set('planta', planta)
  const query = params.toString() ? `?${params.toString()}` : ''
  return httpClient.get<{ filas: FilaReporte[]; total: number; total_solicitudes: number }>(
    `/reportes/datos${query}`,
  )
}

/** Descarga en Excel todo lo que existe para este cliente/sucursal -mismo
 * filtro exacto que ve el portal de cliente en pantalla-. */
export function descargarDatosExcel(cliente?: string, planta?: string) {
  const params = new URLSearchParams()
  if (cliente) params.set('cliente', cliente)
  if (planta) params.set('planta', planta)
  const query = params.toString() ? `?${params.toString()}` : ''
  return httpClient.getArchivoConNombre(`/reportes/datos/excel${query}`)
}

export function obtenerResumenReporte() {
  return httpClient.get<{ total_solicitudes: number; registros_ultima_semana: number }>('/reportes/resumen')
}

/** Nombres de cliente que ya tienen datos cargados — para el selector al crear un usuario tipo Cliente. */
export function obtenerClientesReporte() {
  return httpClient.get<string[]>('/reportes/clientes')
}

export function listarAnalitos() {
  return httpClient.get<Analito[]>('/reportes/analitos')
}

export function crearAnalito(datos: AnalitoInput) {
  return httpClient.post<Analito>('/reportes/analitos', datos)
}

export function actualizarAnalito(id: number, cambios: Partial<AnalitoInput>) {
  return httpClient.put<Analito>(`/reportes/analitos/${id}`, cambios)
}

export function eliminarAnalito(id: number) {
  return httpClient.delete<{ id: number }>(`/reportes/analitos/${id}`)
}

export function listarLimites() {
  return httpClient.get<LimiteAnalito[]>('/reportes/limites')
}

/** También sirve para editar: el backend hace upsert por (analito_id, especie, tipo_servicio). */
export function guardarLimite(datos: LimiteAnalitoInput) {
  return httpClient.post<LimiteAnalito>('/reportes/limites', datos)
}

export function eliminarLimite(id: number) {
  return httpClient.delete<{ id: number }>(`/reportes/limites/${id}`)
}

/** Descarga la BD de resultados en Excel (formato de Solicitudes, con el resultado
 * de cada analito). `solicitudIds: null` = toda la base; con ids, solo esas. */
export function descargarBdExcel(pedido: PedidoBd) {
  return httpClient.postArchivoConNombre('/reportes/bd/excel', pedido)
}

export function obtenerFichaInforme(solicitudId: number) {
  return httpClient.get<FichaInforme>(`/reportes/informe/${solicitudId}`)
}

/** El PDF del informe (se baja con el token: un <iframe src> directo daría 401). */
export function descargarPdfInforme(solicitudId: number) {
  return httpClient.getArchivoConNombre(`/reportes/informe/${solicitudId}/pdf`)
}
