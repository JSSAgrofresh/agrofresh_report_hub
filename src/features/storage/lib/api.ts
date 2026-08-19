import { httpClient } from '@/services/http/client'
import type { EntradaStorage, ListadoStorage } from './tipos'

export function listar(ruta = '') {
  const query = ruta ? `?ruta=${encodeURIComponent(ruta)}` : ''
  return httpClient.get<ListadoStorage>(`/storage/listar${query}`)
}

export function crearCarpeta(rutaPadre: string, nombre: string) {
  return httpClient.post<EntradaStorage>('/storage/carpetas', { ruta_padre: rutaPadre, nombre })
}

export function subirArchivos(ruta: string, archivos: File[]) {
  const formData = new FormData()
  formData.append('ruta', ruta)
  archivos.forEach((a) => formData.append('archivos', a))
  return httpClient.upload<EntradaStorage[]>('/storage/subir', formData)
}

export function renombrar(ruta: string, nombreNuevo: string) {
  return httpClient.put<EntradaStorage>('/storage/renombrar', { ruta, nombre_nuevo: nombreNuevo })
}

export function mover(ruta: string, rutaDestino: string) {
  return httpClient.put<EntradaStorage>('/storage/mover', { ruta, ruta_destino: rutaDestino })
}

export function eliminar(ruta: string) {
  return httpClient.delete<{ estado: string }>(`/storage/eliminar?ruta=${encodeURIComponent(ruta)}`)
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export function urlDescarga(ruta: string) {
  return `${API_BASE_URL}/storage/descargar?ruta=${encodeURIComponent(ruta)}`
}
