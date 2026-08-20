import { httpClient } from '@/services/http/client'
import type { AnalitoConfig, AnalitoInput, CampoConfig, OpcionConfig, OpcionInput, Solicitud, SolicitudInput } from './tipos'

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

// --- Configuración: campos generales -------------------------------------

export function listarCamposConfig() {
  return httpClient.get<CampoConfig[]>('/toma-muestras/config/campos')
}

export function guardarCamposConfig(campos: CampoConfig[]) {
  return httpClient.put<CampoConfig[]>('/toma-muestras/config/campos', campos)
}

// --- Configuración: tipos de aplicación -----------------------------------

export function listarTiposAplicacion() {
  return httpClient.get<OpcionConfig[]>('/toma-muestras/config/tipos-aplicacion')
}

export function crearTipoAplicacion(datos: OpcionInput) {
  return httpClient.post<OpcionConfig>('/toma-muestras/config/tipos-aplicacion', datos)
}

export function actualizarTipoAplicacion(id: number, datos: OpcionInput) {
  return httpClient.put<OpcionConfig>(`/toma-muestras/config/tipos-aplicacion/${id}`, datos)
}

export function eliminarTipoAplicacion(id: number) {
  return httpClient.delete<{ estado: string }>(`/toma-muestras/config/tipos-aplicacion/${id}`)
}

// --- Configuración: líneas de proceso --------------------------------------

export function listarLineasProceso() {
  return httpClient.get<OpcionConfig[]>('/toma-muestras/config/lineas-proceso')
}

export function crearLineaProceso(datos: OpcionInput) {
  return httpClient.post<OpcionConfig>('/toma-muestras/config/lineas-proceso', datos)
}

export function actualizarLineaProceso(id: number, datos: OpcionInput) {
  return httpClient.put<OpcionConfig>(`/toma-muestras/config/lineas-proceso/${id}`, datos)
}

export function eliminarLineaProceso(id: number) {
  return httpClient.delete<{ estado: string }>(`/toma-muestras/config/lineas-proceso/${id}`)
}

// --- Configuración: analitos por laboratorio -------------------------------

export function listarAnalitosConfig(laboratorio?: string) {
  const query = laboratorio ? `?laboratorio=${encodeURIComponent(laboratorio)}` : ''
  return httpClient.get<AnalitoConfig[]>(`/toma-muestras/config/analitos${query}`)
}

export function crearAnalitoConfig(datos: AnalitoInput) {
  return httpClient.post<AnalitoConfig>('/toma-muestras/config/analitos', datos)
}

export function actualizarAnalitoConfig(id: number, datos: AnalitoInput) {
  return httpClient.put<AnalitoConfig>(`/toma-muestras/config/analitos/${id}`, datos)
}

export function eliminarAnalitoConfig(id: number) {
  return httpClient.delete<{ estado: string }>(`/toma-muestras/config/analitos/${id}`)
}
