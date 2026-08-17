import { httpClient } from '@/services/http/client'
import type { Analito, AnalitoInput, FilaReporte } from './tipos'

export function obtenerDatosReporte() {
  return httpClient.get<{ filas: FilaReporte[]; total: number; total_solicitudes: number }>('/reportes/datos')
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
