import { httpClient } from '@/services/http/client'
import type { Analito, AnalitoInput, FilaReporte, LimiteAnalito, LimiteAnalitoInput } from './tipos'

export function obtenerDatosReporte(cliente?: string) {
  const query = cliente ? `?cliente=${encodeURIComponent(cliente)}` : ''
  return httpClient.get<{ filas: FilaReporte[]; total: number; total_solicitudes: number }>(
    `/reportes/datos${query}`,
  )
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
