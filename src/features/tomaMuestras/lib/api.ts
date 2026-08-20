import { httpClient } from '@/services/http/client'
import type { Solicitud, SolicitudInput } from './tipos'

export function listarSolicitudes() {
  return httpClient.get<Solicitud[]>('/toma-muestras/solicitudes')
}

export function obtenerSolicitud(archivo: string) {
  return httpClient.get<Solicitud>(`/toma-muestras/solicitudes/${encodeURIComponent(archivo)}`)
}

export function crearSolicitud(datos: SolicitudInput) {
  return httpClient.post<Solicitud>('/toma-muestras/solicitudes', datos)
}

export function eliminarSolicitud(archivo: string) {
  return httpClient.delete<{ estado: string }>(`/toma-muestras/solicitudes/${encodeURIComponent(archivo)}`)
}
